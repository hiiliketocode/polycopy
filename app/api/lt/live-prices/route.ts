/**
 * GET /api/lt/live-prices?strategy={id}
 * Fetch current market prices for all open positions in a strategy
 * Returns live pricing data for unrealized P&L calculations
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

export async function GET(request: Request) {
  const authError = await requireAdmin();
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
      .select('lt_order_id, condition_id, token_label, executed_price, shares_bought')
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
    
    // Build price map: condition_id -> { YES: price, NO: price }
    const priceMap: Record<string, Record<string, number>> = {};
    
    // Try fetching from markets table first
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, outcome_prices, outcomes')
      .in('condition_id', conditionIds);

    if (markets) {
      markets.forEach((market: any) => {
        const op = market.outcome_prices;
        if (!op || typeof op !== 'object') return;

        // Handle structured format: { outcomes: [...], outcomePrices: [...] }
        let outcomes = op.outcomes ?? op.labels ?? op.choices ?? market.outcomes;
        let prices = op.outcomePrices ?? op.prices ?? op.probabilities;

        // Fallback: plain arrays (legacy format)
        if (!Array.isArray(outcomes) && typeof outcomes === 'string') {
          try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
        }
        if (!Array.isArray(prices) && typeof prices === 'string') {
          try { prices = JSON.parse(prices); } catch { prices = null; }
        }

        if (!Array.isArray(outcomes) || !Array.isArray(prices) || outcomes.length === 0) return;

        priceMap[market.condition_id] = {};
        outcomes.forEach((outcome: string, idx: number) => {
          const p = Number(prices[idx]);
          priceMap[market.condition_id][String(outcome).toUpperCase()] = Number.isFinite(p) ? p : 0;
        });
        // Normalize 0-100 → 0-1 (some markets store prices as percentages)
        const maxVal = Math.max(...Object.values(priceMap[market.condition_id]));
        if (maxVal > 1) {
          for (const key of Object.keys(priceMap[market.condition_id])) {
            priceMap[market.condition_id][key] = priceMap[market.condition_id][key] / 100;
          }
        }
      });
    }

    // FALLBACK: Fetch from CLOB API for missing markets (CLOB always returns correct data)
    const missingConditionIds = conditionIds.filter(cid => !priceMap[cid]);
    
    if (missingConditionIds.length > 0) {
      console.log(`[live-prices] Fetching ${missingConditionIds.length} markets from CLOB API`);
      
      await Promise.all(missingConditionIds.map(async (conditionId) => {
        try {
          const resp = await fetch(
            `https://clob.polymarket.com/markets/${conditionId}`,
            { cache: 'no-store', signal: AbortSignal.timeout(3000) }
          );
          
          if (resp.ok) {
            const clob = await resp.json();
            const tokens = Array.isArray(clob?.tokens) ? clob.tokens : [];
            if (tokens.length > 0) {
              priceMap[conditionId] = {};
              tokens.forEach((t: any) => {
                const outcome = String(t?.outcome ?? '').toUpperCase();
                const p = typeof t?.price === 'number' ? t.price : parseFloat(t?.price);
                if (outcome && Number.isFinite(p)) priceMap[conditionId][outcome] = p;
              });
            }
          }
        } catch (error: any) {
          console.error(`[live-prices] Failed to fetch ${conditionId} from CLOB:`, error.message);
        }
      }));
    }

    // Build response: lt_order_id -> current_price
    const result: Record<string, { current_price: number; entry_price: number; unrealized_pnl: number }> = {};
    
    openOrders.forEach(order => {
      if (!order.condition_id) return;
      
      const tokenLabel = (order.token_label || 'YES').toUpperCase();
      const currentPrice = priceMap[order.condition_id]?.[tokenLabel] || null;
      
      if (currentPrice !== null) {
        const shares = Number(order.shares_bought) || 0;
        const unrealizedPnl = (currentPrice - order.executed_price) * shares;
        
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
