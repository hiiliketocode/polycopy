import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

// Minimum position value ($0.10) - positions below this are considered dust
const DUST_THRESHOLD = 0.10;

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

interface PolymarketPosition {
  conditionId: string;
  asset?: string;
  outcome?: string;
  size?: number | string;
  curPrice?: number | string;
  currentPrice?: number | string;
}

/**
 * POST /api/portfolio/check-positions
 * Check user's actual Polymarket positions and auto-close trades for:
 * - Positions that no longer exist
 * - Dust positions (< $0.10 value)
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createAuthClient();
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !userData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = userData.user;
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fetch user's open trades (both auto-copied and manual)
    // For quick trades: trader_id is set (user's own trader_id for their executed orders)
    // For manual trades: copy_user_id is set
    const { data: openTrades, error: tradesError } = await supabase
      .from('orders')
      .select('order_id, copied_trade_id, market_id, outcome, price_when_copied, entry_size, current_price, side, trader_id, copy_user_id, trade_method')
      .or(`copy_user_id.eq.${user.id},trader_id.eq.${user.id}`)
      .is('user_closed_at', null)
      .is('market_resolved', false);

    console.log(`[check-positions] Query for user ${user.id}, found ${openTrades?.length || 0} open trades`);
    
    if (tradesError) {
      console.error('[check-positions] Query error:', tradesError);
    }

    if (tradesError || !openTrades || openTrades.length === 0) {
      console.log('[check-positions] No open trades to check');
      return NextResponse.json({ 
        message: 'No open trades to check',
        checked: 0,
        closed: 0,
        hidden: 0,
      });
    }

    const now = new Date().toISOString();

    // First, hide SELL orders that are duplicates of BUY orders
    // When you click "Sell" on a position, it creates a SELL order that shows as a new entry
    const sellOrders = openTrades.filter(t => t.side === 'SELL');
    const sellOrdersToHide: string[] = [];

    console.log(`[check-positions] Found ${sellOrders.length} SELL orders to check for duplicates`);

    for (const sellOrder of sellOrders) {
      // Find matching BUY order for the same market/outcome (from same user)
      const matchingBuyOrder = openTrades.find(t => 
        t.market_id === sellOrder.market_id &&
        t.outcome === sellOrder.outcome &&
        t.side === 'BUY' &&
        t.order_id !== sellOrder.order_id &&
        (t.trader_id === sellOrder.trader_id || t.copy_user_id === sellOrder.copy_user_id)
      );

      console.log(`[check-positions] SELL order ${sellOrder.order_id?.slice(0, 8)}: market=${sellOrder.market_id?.slice(0, 10)}, outcome=${sellOrder.outcome}, has BUY match=${!!matchingBuyOrder}`);

      if (matchingBuyOrder) {
        // This SELL order is closing a BUY position - hide it by marking as closed
        const identifier = sellOrder.copied_trade_id || sellOrder.order_id;
        const identifierColumn = sellOrder.copied_trade_id ? 'copied_trade_id' : 'order_id';

        await supabase
          .from('orders')
          .update({
            user_closed_at: now,
            user_exit_price: sellOrder.price_when_copied,
          })
          .eq(identifierColumn, identifier)
          .eq('copy_user_id', user.id);

        sellOrdersToHide.push(identifier);
        console.log(`🧹 Hid duplicate SELL order ${identifier} (closes BUY ${matchingBuyOrder.order_id})`);
      }
    }

    // Now check actual positions for remaining trades (excluding hidden SELLs)
    const manualTrades = openTrades.filter(t => 
      t.side !== 'SELL' && // Only check BUY orders
      !sellOrdersToHide.includes(t.copied_trade_id || t.order_id)
    );

    // Fetch ALL user positions from Polymarket
    let allPositions: PolymarketPosition[] = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const positionsUrl = `https://data-api.polymarket.com/positions?user=${walletAddress}&limit=${limit}&offset=${offset}`;
      const response = await fetch(positionsUrl, { cache: 'no-store' });
      
      if (!response.ok) {
        hasMore = false;
        continue;
      }

      const batch: PolymarketPosition[] = await response.json();
      if (batch && batch.length > 0) {
        allPositions = allPositions.concat(batch);
        offset += batch.length;
        hasMore = batch.length === limit;
      } else {
        hasMore = false;
      }
    }

    // Build a map of current positions: marketId:outcome -> size
    const positionMap = new Map<string, number>();
    for (const pos of allPositions) {
      const marketId = pos.conditionId || pos.asset;
      const outcome = pos.outcome?.toUpperCase();
      const size = parseFloat(String(pos.size || 0));
      
      if (marketId && outcome && size > 0) {
        const key = `${marketId}:${outcome}`;
        positionMap.set(key, size);
      }
    }

    // Check each remaining trade for dust/sold positions
    const tradesToClose: Array<{ id: string; reason: string }> = [];

    for (const trade of manualTrades) {
      const marketId = trade.market_id;
      const outcome = trade.outcome?.toUpperCase();
      
      if (!marketId || !outcome) continue;

      const key = `${marketId}:${outcome}`;
      const currentSize = positionMap.get(key) || 0;
      const currentPrice = trade.current_price || trade.price_when_copied || 0;
      const positionValue = currentSize * currentPrice;

      let shouldClose = false;
      let reason = '';

      if (currentSize === 0) {
        shouldClose = true;
        reason = 'position_sold';
      } else if (positionValue < DUST_THRESHOLD) {
        shouldClose = true;
        reason = 'dust_position';
      }

      if (shouldClose) {
        const identifier = trade.copied_trade_id || trade.order_id;
        const identifierColumn = trade.copied_trade_id ? 'copied_trade_id' : 'order_id';

        await supabase
          .from('orders')
          .update({
            user_closed_at: now,
            user_exit_price: currentPrice,
          })
          .eq(identifierColumn, identifier)
          .eq('copy_user_id', user.id);

        tradesToClose.push({ id: identifier, reason });
        
        console.log(`✅ Auto-closed trade ${identifier}: ${reason}, size: ${currentSize}, value: $${positionValue.toFixed(4)}`);
      }
    }

    return NextResponse.json({
      message: `Checked ${openTrades.length} trades, hidden ${sellOrdersToHide.length} duplicate SELLs, auto-closed ${tradesToClose.length}`,
      checked: openTrades.length,
      hidden: sellOrdersToHide.length,
      closed: tradesToClose.length,
      details: tradesToClose,
    });

  } catch (error: any) {
    console.error('Error checking positions:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
