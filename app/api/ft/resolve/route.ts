import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

/**
 * POST /api/ft/resolve
 * 
 * Checks for resolved markets and updates FT order outcomes.
 * Admin only (or cron with CRON_SECRET).
 * 
 * Flow:
 * 1. Get all OPEN FT orders
 * 2. Check their markets in our database for resolution
 * 3. Update outcomes and PnL for resolved orders
 * 4. Update wallet stats
 */
export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const now = new Date();
    
    console.log('[ft/resolve] Starting resolution check at', now.toISOString());
    
    // 1. Get all OPEN FT orders
    const { data: openOrders, error: ordersError } = await supabase
      .from('ft_orders')
      .select('*')
      .eq('outcome', 'OPEN');
    
    if (ordersError) {
      console.error('[ft/resolve] Error fetching orders:', ordersError);
      return NextResponse.json(
        { success: false, error: ordersError.message },
        { status: 500 }
      );
    }
    
    if (!openOrders || openOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No open orders to check',
        open_orders: 0
      });
    }
    
    console.log(`[ft/resolve] Found ${openOrders.length} open orders to check`);
    
    // 2. Get unique condition_ids
    const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];
    
    // 3. Fetch resolution status directly from Polymarket API
    // Process in batches to avoid URL length limits
    const resolutionMap = new Map<string, string | null>();
    const BATCH_SIZE = 20;
    
    console.log(`[ft/resolve] Checking ${conditionIds.length} unique condition IDs in ${Math.ceil(conditionIds.length / BATCH_SIZE)} batches`);
    
    for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
      const batch = conditionIds.slice(i, i + BATCH_SIZE);
      try {
        // API expects repeated params: ?condition_ids=x&condition_ids=y
        const params = batch.map(id => `condition_ids=${id}`).join('&');
        const url = `https://gamma-api.polymarket.com/markets?${params}`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        
        if (response.ok) {
          const markets = await response.json();
          console.log(`[ft/resolve] Batch ${Math.floor(i/BATCH_SIZE)+1}: Got ${markets.length} markets`);
          
          for (const market of markets) {
            const cid = market.conditionId || market.condition_id;
            const isClosed = market.closed === true || market.resolved === true;
            if (!isClosed) {
              continue;
            }
            
            // Parse outcomes and prices to determine winner
            let outcomes: string[] = [];
            let prices: number[] = [];
            
            try {
              outcomes = typeof market.outcomes === 'string' 
                ? JSON.parse(market.outcomes) 
                : market.outcomes || [];
              const rawPrices = typeof market.outcomePrices === 'string'
                ? JSON.parse(market.outcomePrices)
                : market.outcomePrices || [];
              prices = rawPrices.map((p: any) => parseFloat(p));
            } catch {
              continue;
            }
            
            // Winner has price close to 1, loser has price close to 0
            // Find the outcome with highest price
            if (outcomes.length > 0 && prices.length > 0) {
              const maxPriceIdx = prices.indexOf(Math.max(...prices));
              const maxPrice = prices[maxPriceIdx];
              
              console.log(`[ft/resolve] Closed market: outcomes=${JSON.stringify(outcomes)}, prices=${JSON.stringify(prices)}, maxPrice=${maxPrice}`);
              
              // Only count as resolved if one outcome clearly won (price > 0.9)
              if (maxPrice > 0.9) {
                // Extract the actual label - outcomes can be objects or strings
                let winnerRaw = outcomes[maxPriceIdx];
                let winner: string;
                
                // Handle different outcome formats from Polymarket API
                if (typeof winnerRaw === 'object' && winnerRaw !== null) {
                  // It's an object like {ID: "...", LABEL: "UP"}
                  winner = (winnerRaw.LABEL || winnerRaw.label || String(winnerRaw)).toUpperCase();
                } else if (typeof winnerRaw === 'string') {
                  // Could be a JSON string like '{"ID":"...","LABEL":"UP"}' or plain "Up"
                  try {
                    const parsed = JSON.parse(winnerRaw);
                    winner = (parsed.LABEL || parsed.label || winnerRaw).toUpperCase();
                  } catch {
                    // Plain string like "Up" or "Yes"
                    winner = winnerRaw.toUpperCase();
                  }
                } else {
                  winner = String(winnerRaw).toUpperCase();
                }
                
                if (cid) {
                  resolutionMap.set(cid, winner);
                  console.log(`[ft/resolve] ✓ Market ${cid.slice(0,10)}... resolved: ${winner}`);
                }
              } else {
                console.log(`[ft/resolve] ✗ Market ${cid?.slice(0,10)}... closed but maxPrice ${maxPrice} < 0.9`);
              }
            } else {
              console.log(`[ft/resolve] ✗ Market ${cid?.slice(0,10)}... missing outcomes/prices`);
            }
          }
        }
      } catch (err) {
        console.error(`[ft/resolve] Error fetching batch:`, err);
      }
    }
    
    console.log(`[ft/resolve] Found ${resolutionMap.size} resolved markets`);
    
    // 4. Update resolved orders
    let resolved = 0;
    let won = 0;
    let lost = 0;
    const errors: string[] = [];
    
    for (const order of openOrders) {
      if (!order.condition_id) continue;
      
      const winningLabel = resolutionMap.get(order.condition_id);
      if (winningLabel === undefined) {
        // Market not resolved yet
        continue;
      }
      
      // Determine outcome
      // For BUY: we win if token_label matches winning_label
      // For SELL: we win if token_label does NOT match winning_label
      const tokenLabel = (order.token_label || 'YES').toUpperCase();
      const side = (order.side || 'BUY').toUpperCase();
      
      let outcome: 'WON' | 'LOST';
      let pnl: number;
      
      if (winningLabel === null) {
        // Market voided - return stake
        outcome = 'WON';
        pnl = 0;
      } else if (side === 'BUY') {
        // BUY: we bought token_label, we win if it matches winning_label
        // size = dollars invested, entry_price = price per share. shares = size/entry_price.
        // Payout when win = shares * $1 = size/entry_price. Profit = size/entry_price - size.
        if (tokenLabel === winningLabel) {
          outcome = 'WON';
          pnl = order.entry_price > 0
            ? order.size * (1 - order.entry_price) / order.entry_price
            : 0;
        } else {
          outcome = 'LOST';
          pnl = -order.size;
        }
      } else {
        // SELL: we sold token_label, we win if it does NOT match winning_label
        if (tokenLabel !== winningLabel) {
          outcome = 'WON';
          pnl = order.size * order.entry_price; // Profit from selling
        } else {
          outcome = 'LOST';
          pnl = -order.size * (1 - order.entry_price);
        }
      }
      
      // Update the order
      const { error: updateError } = await supabase
        .from('ft_orders')
        .update({
          outcome,
          winning_label: winningLabel,
          pnl,
          resolved_time: now.toISOString()
        })
        .eq('order_id', order.order_id);
      
      if (updateError) {
        errors.push(`Failed to update order ${order.order_id}: ${updateError.message}`);
      } else {
        resolved++;
        if (outcome === 'WON') won++;
        if (outcome === 'LOST') lost++;
      }
    }
    
    console.log(`[ft/resolve] Resolved ${resolved} orders (${won} won, ${lost} lost)`);
    
    // 5. Update wallet stats
    const walletIds = [...new Set(openOrders.map(o => o.wallet_id))];
    
    for (const walletId of walletIds) {
      // Get updated stats
      const { data: orders } = await supabase
        .from('ft_orders')
        .select('outcome, pnl, size')
        .eq('wallet_id', walletId);
      
      if (!orders) continue;
      
      const totalTrades = orders.length;
      const openPositions = orders.filter(o => o.outcome === 'OPEN').length;
      const totalPnl = orders
        .filter(o => o.outcome !== 'OPEN')
        .reduce((sum, o) => sum + (o.pnl || 0), 0);
      
      const { data: wallet } = await supabase
        .from('ft_wallets')
        .select('starting_balance')
        .eq('wallet_id', walletId)
        .single();
      
      const startingBalance = wallet?.starting_balance || 1000;
      
      await supabase
        .from('ft_wallets')
        .update({
          total_trades: totalTrades,
          open_positions: openPositions,
          total_pnl: totalPnl,
          current_balance: startingBalance + totalPnl,
          updated_at: now.toISOString()
        })
        .eq('wallet_id', walletId);
    }
    
    return NextResponse.json({
      success: true,
      resolved_at: now.toISOString(),
      open_orders_checked: openOrders.length,
      markets_resolved: resolutionMap.size,
      orders_resolved: resolved,
      won,
      lost,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[ft/resolve] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Resolution check failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createAdminServiceClient();
    
    // Get summary of open positions
    const { data: openOrders, error } = await supabase
      .from('ft_orders')
      .select('wallet_id, market_title, market_end_time, entry_price')
      .eq('outcome', 'OPEN')
      .order('market_end_time', { ascending: true })
      .limit(50);
    
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
    
    // Group by wallet
    const byWallet: Record<string, number> = {};
    for (const order of openOrders || []) {
      byWallet[order.wallet_id] = (byWallet[order.wallet_id] || 0) + 1;
    }
    
    return NextResponse.json({
      success: true,
      open_positions: openOrders?.length || 0,
      by_wallet: byWallet,
      upcoming_resolutions: openOrders?.slice(0, 10).map(o => ({
        wallet: o.wallet_id,
        market: o.market_title?.substring(0, 50),
        ends: o.market_end_time,
        price: o.entry_price
      })),
      message: 'POST to check and resolve positions'
    });
    
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
