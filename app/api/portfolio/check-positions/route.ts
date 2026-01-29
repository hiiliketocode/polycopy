import { NextResponse } from 'next/server';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client';

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

interface TradeToCheck {
  order_id: string;
  market_id: string;
  outcome: string;
  side: string;
  price_when_copied?: number;
  current_price?: number;
  entry_size?: number;
  source: 'database' | 'clob';
}

/**
 * POST /api/portfolio/check-positions
 * Check user's actual Polymarket positions and auto-close trades for:
 * - Positions that no longer exist
 * - Dust positions (< $0.10 value)
 * - Duplicate SELL orders
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

    console.log(`[check-positions] ===== START CHECK-POSITIONS =====`);
    console.log(`[check-positions] User ID: ${user.id}`);
    console.log(`[check-positions] Wallet Address: ${walletAddress}`);

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const now = new Date().toISOString();

    // Fetch manual trades from database (using the same view as the UI)
    // Note: Get ALL trades, then filter on client side like the UI does
    console.log(`[check-positions] Querying orders_copy_enriched view for user: ${user.id}`);
    const { data: manualTrades, error: tradesError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id, copied_trade_id, market_id, outcome, entry_price, current_price, side, copy_user_id, trade_method, user_closed_at, market_resolved')
      .eq('copy_user_id', user.id);

    if (tradesError) {
      console.error(`[check-positions] Database query error:`, tradesError);
    }
    
    console.log(`[check-positions] Database returned ${manualTrades?.length || 0} total trades (before filtering)`);
    if (manualTrades && manualTrades.length > 0) {
      const openTrades = manualTrades.filter(t => !t.user_closed_at && !t.market_resolved);
      console.log(`[check-positions] ${openTrades.length} open trades after filtering`);
      console.log(`[check-positions] Sample trade:`, JSON.stringify(manualTrades[0], null, 2));
    }

    // Fetch quick trades (auto-copied) directly from CLOB
    const clobTrades: TradeToCheck[] = [];
    console.log(`[check-positions] Attempting to fetch CLOB orders for user: ${user.id}`);
    try {
      const { client } = await getAuthedClobClientForUser(user.id);
      const openOrders = await client.getOpenOrders({}, true);
      
      console.log(`[check-positions] CLOB returned ${openOrders?.length || 0} open orders`);
      
      if (Array.isArray(openOrders)) {
        console.log(`[check-positions] Processing ${openOrders.length} CLOB orders`);
        for (const order of openOrders) {
          if (!order.id || !order.asset_id) {
            console.log(`[check-positions] Skipping order - missing id or asset_id`);
            continue;
          }
          
          // Extract market_id from tokenId
          const tokenId = order.asset_id || '';
          const marketId = tokenId.length >= 66 ? tokenId.slice(0, 66) : tokenId;
          
          if (marketId && order.outcome) {
            clobTrades.push({
              order_id: order.id,
              market_id: marketId,
              outcome: order.outcome,
              side: order.side || 'BUY',
              price_when_copied: parseFloat(String(order.price || 0)),
              current_price: parseFloat(String(order.price || 0)),
              entry_size: parseFloat(String(order.size_matched || order.original_size || 0)),
              source: 'clob',
            });
          }
        }
        console.log(`[check-positions] Added ${clobTrades.length} CLOB trades to check`);
      }
    } catch (err: any) {
      console.error('[check-positions] Failed to fetch CLOB orders:', err?.message || err);
    }

    // Combine all trades to check
    const allTrades: TradeToCheck[] = [];

    // Add manual trades (filter to open trades only, matching UI logic)
    if (manualTrades) {
      for (const trade of manualTrades) {
        // Only include trades that are actually open (not closed by user and market not resolved)
        if (trade.market_id && trade.outcome && !trade.user_closed_at && !trade.market_resolved) {
          allTrades.push({
            order_id: trade.order_id,
            market_id: trade.market_id,
            outcome: trade.outcome,
            side: trade.side || 'BUY',
            price_when_copied: trade.entry_price, // View uses entry_price
            current_price: trade.current_price,
            entry_size: 0, // Not needed for position checking
            source: 'database',
          });
        }
      }
    }

    // Add CLOB trades
    allTrades.push(...clobTrades);

    console.log(`[check-positions] Total trades to check: ${allTrades.length} (${manualTrades?.length || 0} manual + ${clobTrades.length} CLOB)`);

    if (allTrades.length === 0) {
      console.log('[check-positions] ===== END CHECK-POSITIONS (No trades) =====');
      return NextResponse.json({ 
        message: 'No open trades to check',
        checked: 0,
        closed: 0,
        hidden: 0,
      });
    }

    // First, hide SELL orders that are duplicates of BUY orders
    // When you click "Sell" on a position, it creates a SELL order that shows as a new entry
    const sellOrders = allTrades.filter(t => t.side?.toUpperCase() === 'SELL');
    const sellOrdersToHide: string[] = [];

    console.log(`[check-positions] Found ${sellOrders.length} SELL orders to check for duplicates`);

    for (const sellOrder of sellOrders) {
      // Find matching BUY order for the same market/outcome
      const matchingBuyOrder = allTrades.find(t => 
        t.market_id === sellOrder.market_id &&
        t.outcome === sellOrder.outcome &&
        t.side?.toUpperCase() === 'BUY' &&
        t.order_id !== sellOrder.order_id
      );

      console.log(`[check-positions] SELL order ${sellOrder.order_id?.slice(0, 8)}: market=${sellOrder.market_id?.slice(0, 10)}, outcome=${sellOrder.outcome}, has BUY match=${!!matchingBuyOrder}`);

      if (matchingBuyOrder) {
        // This SELL order is closing a BUY position - hide it
        if (sellOrder.source === 'database') {
          // Update database entry
          await supabase
            .from('orders')
            .update({
              user_closed_at: now,
              user_exit_price: sellOrder.price_when_copied,
            })
            .eq('order_id', sellOrder.order_id)
            .eq('copy_user_id', user.id);

          console.log(`🧹 Hid duplicate SELL order from database: ${sellOrder.order_id}`);
        }
        
        sellOrdersToHide.push(sellOrder.order_id);
      }
    }

    // Now check actual positions for remaining trades (excluding hidden SELLs and only BUY orders)
    const tradesToCheck = allTrades.filter(t => 
      t.side?.toUpperCase() === 'BUY' && // Only check BUY orders
      !sellOrdersToHide.includes(t.order_id)
    );

    console.log(`[check-positions] Checking ${tradesToCheck.length} BUY positions against Polymarket`);

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
    const tradesToClose: Array<{ id: string; reason: string; source: string }> = [];

    for (const trade of tradesToCheck) {
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
        // Only update database for trades from database source
        if (trade.source === 'database') {
          await supabase
            .from('orders')
            .update({
              user_closed_at: now,
              user_exit_price: currentPrice,
            })
            .eq('order_id', trade.order_id)
            .eq('copy_user_id', user.id);

          console.log(`✅ Auto-closed database trade ${trade.order_id}: ${reason}, size: ${currentSize}, value: $${positionValue.toFixed(4)}`);
        } else {
          console.log(`ℹ️ Would auto-close CLOB trade ${trade.order_id}: ${reason}, size: ${currentSize}, value: $${positionValue.toFixed(4)} (CLOB trades auto-sync)`);
        }
        
        tradesToClose.push({ id: trade.order_id, reason, source: trade.source });
      }
    }

    return NextResponse.json({
      message: `Checked ${allTrades.length} trades, hidden ${sellOrdersToHide.length} duplicate SELLs, auto-closed ${tradesToClose.length}`,
      checked: allTrades.length,
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
