import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getPolyScore } from '@/lib/polyscore/get-polyscore';

/**
 * Fetch market data directly from Polymarket API
 */
async function fetchMarketFromPolymarket(conditionId: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return null;
    const markets = await response.json();
    if (markets && markets.length > 0) {
      const m = markets[0];
      return {
        condition_id: conditionId,
        title: m.question || m.title,
        slug: m.slug,
        outcome_prices: m.outcomePrices || [0.5, 0.5],
        outcomes: m.outcomes || ['Yes', 'No'],
        end_time: m.endDate,
        start_time: m.startDate,
        volume: m.volume,
        tags: m.tags || []
      };
    }
  } catch (err) {
    console.error(`[ft/enrich-ml] Error fetching market ${conditionId} from Polymarket:`, err);
  }
  return null;
}

/**
 * POST /api/ft/enrich-ml
 * 
 * Enriches FT orders with actual ML model predictions from BigQuery.
 * This is separate from sync to avoid slowing down trade capture.
 */
export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const limit = body.limit ?? 50; // Limit how many to process per call
    
    console.log(`[ft/enrich-ml] Starting ML enrichment (limit: ${limit})`);
    
    // 1. Find orders without ML scores (OPEN and resolved - backfill any that slipped through)
    const { data: orders, error: ordersError } = await supabase
      .from('ft_orders')
      .select('order_id, wallet_id, trader_address, condition_id, entry_price, size, side, token_label, order_time')
      .is('model_probability', null)
      .order('order_time', { ascending: false })
      .limit(limit);
    
    if (ordersError) {
      console.error('[ft/enrich-ml] Error fetching orders:', ordersError);
      return NextResponse.json({ success: false, error: ordersError.message }, { status: 500 });
    }
    
    if (!orders || orders.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No orders need ML enrichment',
        enriched: 0 
      });
    }
    
    console.log(`[ft/enrich-ml] Found ${orders.length} orders to enrich`);
    
    // 2. Get market data for these orders - first try Supabase
    const conditionIds = [...new Set(orders.map(o => o.condition_id).filter(Boolean))];
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, title, slug, outcome_prices, outcomes, end_time, start_time, volume, tags')
      .in('condition_id', conditionIds);
    
    const marketMap = new Map(markets?.map(m => [m.condition_id, m]) || []);
    
    // 2b. For missing markets, fetch from Polymarket API directly
    const missingConditionIds = conditionIds.filter(id => !marketMap.has(id));
    if (missingConditionIds.length > 0) {
      console.log(`[ft/enrich-ml] Fetching ${missingConditionIds.length} markets from Polymarket API`);
      for (const conditionId of missingConditionIds) {
        const market = await fetchMarketFromPolymarket(conditionId);
        if (market) {
          marketMap.set(conditionId, market);
        }
      }
    }
    
    // 3. Process each order
    let enriched = 0;
    let errors: string[] = [];
    
    for (const order of orders) {
      try {
        const market = marketMap.get(order.condition_id);
        if (!market) {
          console.log(`[ft/enrich-ml] Market not found for ${order.condition_id}`);
          continue;
        }
        
        // Get current price from outcomes - handle string or array
        let outcomes = market.outcomes || ['Yes', 'No'];
        let outcomePrices = market.outcome_prices || [0.5, 0.5];
        
        // Parse if string
        if (typeof outcomes === 'string') {
          try { outcomes = JSON.parse(outcomes); } catch { outcomes = ['Yes', 'No']; }
        }
        if (typeof outcomePrices === 'string') {
          try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = [0.5, 0.5]; }
        }
        
        // Ensure array
        if (!Array.isArray(outcomes)) outcomes = ['Yes', 'No'];
        if (!Array.isArray(outcomePrices)) outcomePrices = [0.5, 0.5];
        
        const tokenIdx = outcomes.findIndex((o: string) => 
          o?.toLowerCase() === order.token_label?.toLowerCase()
        );
        const currentPrice = Number(outcomePrices[tokenIdx >= 0 ? tokenIdx : 0]) || 0.5;
        
        // Calculate shares
        const shares = order.entry_price > 0 ? order.size / order.entry_price : 0;
        
        // Call ML model - use service role key for server-to-server auth
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const polyScoreResponse = await getPolyScore({
          original_trade: {
            wallet_address: order.trader_address,
            condition_id: order.condition_id,
            side: order.side === 'BUY' ? 'BUY' : 'SELL',
            price: order.entry_price,
            shares_normalized: shares,
            timestamp: (typeof order.order_time === 'object' && order.order_time?.value) 
              ? order.order_time.value 
              : (order.order_time || new Date().toISOString())
          },
          market_context: {
            current_price: currentPrice,
            current_timestamp: new Date().toISOString(),
            market_title: market.title,
            market_tags: market.tags ? JSON.stringify(market.tags) : null,
            market_end_time_unix: market.end_time ? new Date(market.end_time).getTime() / 1000 : null,
            market_start_time_unix: market.start_time ? new Date(market.start_time).getTime() / 1000 : null,
            token_label: order.token_label
          },
          user_slippage: 0.02
        }, serviceRoleKey);
        
        // Extract probability from response - check multiple locations
        let mlProbability: number | null = null;
        let edgePct: number | null = null;
        
        if (polyScoreResponse.success) {
          // Primary: prediction object
          if (polyScoreResponse.prediction?.probability) {
            mlProbability = polyScoreResponse.prediction.probability;
            edgePct = (polyScoreResponse.prediction.edge_percent || 0) / 100;
          }
          // Fallback: valuation object
          else if (polyScoreResponse.valuation?.ai_fair_value) {
            mlProbability = polyScoreResponse.valuation.ai_fair_value;
            edgePct = (polyScoreResponse.valuation.real_edge_pct || 0) / 100;
          }
          // Last fallback: analysis.prediction_stats
          else if (polyScoreResponse.analysis?.prediction_stats?.ai_fair_value) {
            mlProbability = polyScoreResponse.analysis.prediction_stats.ai_fair_value;
            edgePct = (polyScoreResponse.analysis.prediction_stats.model_roi_pct || 0) / 100;
          }
        }
        
        if (mlProbability != null && mlProbability > 0) {
          // Update the order with ML score
          const { error: updateError } = await supabase
            .from('ft_orders')
            .update({ 
              model_probability: mlProbability,
              edge_pct: edgePct
            })
            .eq('order_id', order.order_id);
          
          if (updateError) {
            errors.push(`Update failed for ${order.order_id}: ${updateError.message}`);
          } else {
            enriched++;
            console.log(`[ft/enrich-ml] Enriched ${order.order_id}: ML=${(mlProbability * 100).toFixed(1)}%`);
          }
        } else {
          console.log(`[ft/enrich-ml] No valid probability for ${order.order_id}`);
        }
        
        // Small delay to avoid overwhelming the ML service
        await new Promise(r => setTimeout(r, 100));
        
      } catch (err: any) {
        errors.push(`Error for ${order.order_id}: ${err.message}`);
        console.error(`[ft/enrich-ml] Error:`, err);
      }
    }
    
    console.log(`[ft/enrich-ml] Complete: enriched ${enriched}/${orders.length}`);
    
    return NextResponse.json({
      success: true,
      total_orders: orders.length,
      enriched,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error: any) {
    console.error('[ft/enrich-ml] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
