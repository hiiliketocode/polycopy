/**
 * GET /api/lt/live-prices?strategy={id}
 * Fetch current market prices for all open positions in a strategy
 * Returns live pricing data for unrealized P&L calculations
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const strategyId = url.searchParams.get('strategy');

  if (!strategyId) {
    return NextResponse.json({ error: 'strategy parameter required' }, { status: 400 });
  }

  const supabase = createAdminServiceClient();

  try {
    // Get open positions for this strategy
    const { data: openOrders, error } = await supabase
      .from('lt_orders')
      .select('lt_order_id, condition_id, token_label, executed_price, executed_size')
      .eq('strategy_id', strategyId)
      .eq('outcome', 'OPEN')
      .in('status', ['FILLED', 'PARTIAL']);

    if (error) {
      console.error('[live-prices] Error fetching orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!openOrders || openOrders.length === 0) {
      return NextResponse.json({
        success: true,
        prices: {},
        timestamp: new Date().toISOString()
      });
    }

    // Get unique condition IDs
    const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];
    
    // Fetch current prices from markets table
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, outcome_prices, outcomes')
      .in('condition_id', conditionIds);

    // Build price map: condition_id -> { YES: price, NO: price }
    const priceMap: Record<string, Record<string, number>> = {};
    
    if (markets) {
      markets.forEach((market: any) => {
        let prices = market.outcome_prices;
        let outcomes = market.outcomes;

        // Parse if stringified
        if (typeof prices === 'string') {
          try { prices = JSON.parse(prices); } catch { prices = null; }
        }
        if (typeof outcomes === 'string') {
          try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
        }

        if (Array.isArray(prices) && Array.isArray(outcomes)) {
          priceMap[market.condition_id] = {};
          outcomes.forEach((outcome: string, idx: number) => {
            priceMap[market.condition_id][outcome.toUpperCase()] = prices[idx] || 0.5;
          });
        }
      });
    }

    // Build response: lt_order_id -> current_price
    const result: Record<string, { current_price: number; entry_price: number; unrealized_pnl: number }> = {};
    
    openOrders.forEach(order => {
      if (!order.condition_id) return;
      
      const tokenLabel = (order.token_label || 'YES').toUpperCase();
      const currentPrice = priceMap[order.condition_id]?.[tokenLabel] || null;
      
      if (currentPrice !== null) {
        const unrealizedPnl = (currentPrice - order.executed_price) * order.executed_size;
        
        result[order.lt_order_id] = {
          current_price: currentPrice,
          entry_price: order.executed_price,
          unrealized_pnl: unrealizedPnl
        };
      }
    });

    return NextResponse.json({
      success: true,
      prices: result,
      timestamp: new Date().toISOString(),
      positions_checked: openOrders.length,
      prices_found: Object.keys(result).length
    });
  } catch (error: any) {
    console.error('[live-prices] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch live prices',
        details: error.message
      },
      { status: 500 }
    );
  }
}
