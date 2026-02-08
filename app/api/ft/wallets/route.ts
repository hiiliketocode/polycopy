import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

const ML_MIX_WALLET_IDS = [
  'FT_ML_SHARP_SHOOTER', 'FT_ML_UNDERDOG', 'FT_ML_FAVORITES', 'FT_ML_HIGH_CONV',
  'FT_ML_EDGE', 'FT_ML_MIDRANGE', 'FT_ML_STRICT', 'FT_ML_LOOSE',
  'FT_ML_CONTRARIAN', 'FT_ML_HEAVY_FAV',
];

const ML_MIX_WALLETS = [
  { wallet_id: 'FT_ML_SHARP_SHOOTER', config_id: 'ML_SHARP_SHOOTER', display_name: 'ML: Sharp Shooter', description: 'ML 55% + 1.5x conviction, elite sniper', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.4, min_bet: 15, max_bet: 75, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_UNDERDOG', config_id: 'ML_UNDERDOG', display_name: 'ML: Underdog Hunter', description: 'ML 55% + underdogs 0-50¢, 5% edge', model_threshold: 0.55, price_min: 0, price_max: 0.5, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_FAVORITES', config_id: 'ML_FAVORITES', display_name: 'ML: Favorite Grinder', description: 'ML 55% + favorites 60-90¢, 3% edge', model_threshold: 0.55, price_min: 0.6, price_max: 0.9, min_edge: 0.03, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_HIGH_CONV', config_id: 'ML_HIGH_CONV', display_name: 'ML: High Conviction', description: 'ML 55% + 2x conviction, double confirmation', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'FIXED', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 5, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_EDGE', config_id: 'ML_EDGE', display_name: 'ML: Model + Edge', description: 'ML 55% + 5% min edge, quantitative combo', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.35, min_bet: 1, max_bet: 15, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_MIDRANGE', config_id: 'ML_MIDRANGE', display_name: 'ML: Mid-Range', description: 'ML 55% + 25-75¢ only, avoid extremes', model_threshold: 0.55, price_min: 0.25, price_max: 0.75, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 10, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_STRICT', config_id: 'ML_STRICT', display_name: 'ML: Strict (65%)', description: 'ML 65% only, highest confidence trades', model_threshold: 0.65, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.35, min_bet: 1, max_bet: 20, min_trader_resolved_count: 10 },
  { wallet_id: 'FT_ML_LOOSE', config_id: 'ML_LOOSE', display_name: 'ML: Loose (50%)', description: 'ML 50% only, more trades, lower bar', model_threshold: 0.5, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 10 },
  { wallet_id: 'FT_ML_CONTRARIAN', config_id: 'ML_CONTRARIAN', display_name: 'ML: Contrarian', description: 'ML 55% + 10-40¢ contrarian, 5% edge', model_threshold: 0.55, price_min: 0.1, price_max: 0.4, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 12, min_trader_resolved_count: 30 },
  { wallet_id: 'FT_ML_HEAVY_FAV', config_id: 'ML_HEAVY_FAV', display_name: 'ML: Heavy Favorites', description: 'ML 55% + 75-95¢ near-certain, 2% edge', model_threshold: 0.55, price_min: 0.75, price_max: 0.95, min_edge: 0.02, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 10, min_trader_resolved_count: 30 },
];

/**
 * GET /api/ft/wallets
 * 
 * Returns all FT wallets with their current status and stats.
 * Admin only.
 * Auto-inserts the 10 ML mix strategies if missing (self-healing for prod).
 */
export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();

    // Ensure 10 ML mix strategies exist (self-healing when migration wasn't run)
    const { data: existing } = await supabase.from('ft_wallets').select('wallet_id').in('wallet_id', ML_MIX_WALLET_IDS);
    const existingIds = new Set((existing || []).map((r: { wallet_id: string }) => r.wallet_id));
    const toInsert = ML_MIX_WALLETS.filter(w => !existingIds.has(w.wallet_id));
    if (toInsert.length > 0) {
      const rows = toInsert.map(w => ({
        ...w,
        starting_balance: 1000,
        current_balance: 1000,
        bet_size: 1.2,
        is_active: true,
      }));
      const { error: insertErr } = await supabase.from('ft_wallets').upsert(rows, { onConflict: 'wallet_id' });
      if (insertErr) {
        console.warn('[ft/wallets] Could not auto-insert ML mix strategies:', insertErr.message);
      } else {
        console.log(`[ft/wallets] Auto-inserted ${toInsert.length} ML mix strategies`);
      }
    }
    
    // Get all wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('ft_wallets')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (walletsError) {
      console.error('[ft/wallets] Error fetching wallets:', walletsError);
      return NextResponse.json(
        { success: false, error: walletsError.message },
        { status: 500 }
      );
    }
    
    if (!wallets || wallets.length === 0) {
      return NextResponse.json({
        success: true,
        wallets: [],
        message: 'No wallets found. Run POST /api/ft/setup to create default wallets.'
      });
    }
    
    // Get stats for each wallet
    const walletsWithStats = await Promise.all(wallets.map(async (wallet) => {
      // Get order stats including condition_id, entry_price, token_label for unrealized calc
      const { data: orders, error: ordersError } = await supabase
        .from('ft_orders')
        .select('outcome, pnl, size, condition_id, entry_price, token_label')
        .eq('wallet_id', wallet.wallet_id);
      
      let stats = {
        total_trades: 0,
        open_positions: 0,
        won: 0,
        lost: 0,
        realized_pnl: 0,
        unrealized_pnl: 0,
        open_exposure: 0,
        avg_trade_size: 0
      };
      
      if (!ordersError && orders) {
        const openOrders = orders.filter(o => o.outcome === 'OPEN');
        const totalSize = orders.reduce((sum, o) => sum + (Number(o.size) || 0), 0);
        
        stats.total_trades = orders.length;
        stats.open_positions = openOrders.length;
        stats.won = orders.filter(o => o.outcome === 'WON').length;
        stats.lost = orders.filter(o => o.outcome === 'LOST').length;
        stats.realized_pnl = orders
          .filter(o => o.outcome !== 'OPEN')
          .reduce((sum, o) => sum + (o.pnl || 0), 0);
        stats.open_exposure = openOrders.reduce((sum, o) => sum + (o.size || 0), 0);
        stats.avg_trade_size = orders.length > 0 ? totalSize / orders.length : 0;
        
        // Fetch current prices for open positions
        if (openOrders.length > 0) {
          const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];
          
          const { data: markets } = await supabase
            .from('markets')
            .select('condition_id, outcome_prices, last_price_updated_at')
            .in('condition_id', conditionIds);
          
          const priceMap = new Map<string, { outcomes: string[] | null; outcomePrices: number[] | null }>();
          
          // Use cached prices whenever available (stale is better than nothing for PnL display)
          if (markets) {
            for (const market of markets) {
              const outcomes = market.outcome_prices?.outcomes ?? 
                              market.outcome_prices?.labels ?? null;
              const outcomePrices = market.outcome_prices?.outcomePrices ?? 
                                   market.outcome_prices?.prices ?? null;
              
              if (outcomes && outcomePrices) {
                priceMap.set(market.condition_id, { outcomes, outcomePrices });
              }
            }
          }
          
          // Fetch fresh prices for markets without cached prices (up to 25 per wallet)
          const marketsNeedingPrices = conditionIds.filter(id => !priceMap.has(id)).slice(0, 25);
          if (marketsNeedingPrices.length > 0) {
            const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            
            const parseOutcomes = (outcomes: unknown): string[] | null => {
              if (Array.isArray(outcomes)) return outcomes.map(o => typeof o === 'string' ? o : (o as { LABEL?: string; label?: string })?.LABEL ?? (o as { label?: string })?.label ?? String(o ?? ''));
              return null;
            };
            const parsePrices = (prices: unknown): number[] | null => {
              if (Array.isArray(prices)) return prices.map(p => { const n = typeof p === 'string' ? parseFloat(p) : Number(p); return Number.isFinite(n) ? n : 0; });
              return null;
            };
            
            await Promise.all(marketsNeedingPrices.map(async (conditionId) => {
              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 4000);
                const res = await fetch(
                  `${baseUrl}/api/polymarket/price?conditionId=${conditionId}`,
                  { signal: controller.signal }
                );
                clearTimeout(timeout);
                
                if (res.ok) {
                  const json = await res.json();
                  const outcomes = json?.market?.outcomes ?? json?.market?.labels;
                  const outcomePrices = json?.market?.outcomePrices ?? json?.market?.prices;
                  const parsedOutcomes = parseOutcomes(outcomes);
                  const parsedPrices = parsePrices(outcomePrices);
                  if (parsedOutcomes && parsedPrices) {
                    supabase.from('markets').upsert({
                      condition_id: conditionId,
                      outcome_prices: { outcomes: parsedOutcomes, outcomePrices: parsedPrices },
                      last_price_updated_at: new Date().toISOString(),
                    }, { onConflict: 'condition_id' }).then(() => {});
                    priceMap.set(conditionId, { outcomes: parsedOutcomes, outcomePrices: parsedPrices });
                    return;
                  }
                }
                
                // Fallback: Gamma API by condition_id when price API fails
                const gammaController = new AbortController();
                const gammaTimeout = setTimeout(() => gammaController.abort(), 3000);
                const gammaRes = await fetch(
                  `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
                  { cache: 'no-store', signal: gammaController.signal }
                );
                clearTimeout(gammaTimeout);
                if (gammaRes.ok) {
                  const gammaData = await gammaRes.json();
                  const m = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null;
                  if (m) {
                    let outcomes = m.outcomes ?? m.labels;
                    let prices = m.outcomePrices ?? m.prices;
                    if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; } }
                    if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = null; } }
                    const parsedOutcomes = parseOutcomes(outcomes);
                    const parsedPrices = parsePrices(prices);
                    if (parsedOutcomes && parsedPrices) {
                      supabase.from('markets').upsert({
                        condition_id: conditionId,
                        outcome_prices: { outcomes: parsedOutcomes, outcomePrices: parsedPrices },
                        last_price_updated_at: new Date().toISOString(),
                      }, { onConflict: 'condition_id' }).then(() => {});
                      priceMap.set(conditionId, { outcomes: parsedOutcomes, outcomePrices: parsedPrices });
                    }
                  }
                }
              } catch {
                // Ignore errors
              }
            }));
          }
          
          // Helper to extract label from outcome (string or object like {LABEL: "X"})
          const outcomeLabel = (o: unknown): string => {
            if (typeof o === 'string') return o;
            if (o && typeof o === 'object' && 'LABEL' in o) return String((o as { LABEL?: string }).LABEL ?? '');
            if (o && typeof o === 'object' && 'label' in o) return String((o as { label?: string }).label ?? '');
            return String(o ?? '');
          };
          // Calculate unrealized P&L
          for (const order of openOrders) {
            const market = priceMap.get(order.condition_id);
            if (!market || !market.outcomes || !market.outcomePrices) continue;
            
            const tokenLabel = (order.token_label || 'YES').toLowerCase().trim();
            let idx = market.outcomes.findIndex(o => outcomeLabel(o)?.toLowerCase().trim() === tokenLabel);
            
            // Fallback: For binary markets, YES is often index 0, NO is index 1
            if (idx < 0 && market.outcomes.length === 2) {
              const outcomesLower = market.outcomes.map(o => outcomeLabel(o)?.toLowerCase().trim());
              if (tokenLabel === 'yes') {
                idx = outcomesLower.indexOf('yes');
                if (idx < 0) idx = 0;
              } else if (tokenLabel === 'no') {
                idx = outcomesLower.indexOf('no');
                if (idx < 0) idx = 1;
              }
            }
            
            if (idx >= 0 && market.outcomePrices[idx] !== undefined && market.outcomePrices[idx] !== null) {
              // Prices might be strings from the API
              const rawPrice = market.outcomePrices[idx];
              const currentPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
              if (Number.isFinite(currentPrice) && order.entry_price && order.size) {
                const shares = order.size / order.entry_price;
                const currentValue = shares * currentPrice;
                stats.unrealized_pnl += currentValue - order.size;
              }
            }
          }
        }
      }
      
      // Calculate test status
      const now = new Date();
      const startDate = new Date(wallet.start_date);
      const endDate = new Date(wallet.end_date);
      
      let test_status: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
      if (endDate < now) {
        test_status = 'ENDED';
      } else if (startDate > now) {
        test_status = 'SCHEDULED';
      } else {
        test_status = 'ACTIVE';
      }
      
      const hours_remaining = Math.max(0, (endDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      // Cash available = starting balance + realized P&L - open exposure
      // Clamp to 0 minimum - we never allow negative cash (migration 20260325 fixes root cause)
      const cashAvailable = Math.max(0, (wallet.starting_balance || 1000) + stats.realized_pnl - stats.open_exposure);
      
      return {
        ...wallet,
        ...stats,
        total_pnl: stats.realized_pnl + stats.unrealized_pnl,
        current_balance: (wallet.starting_balance || 1000) + stats.realized_pnl + stats.unrealized_pnl,
        cash_available: cashAvailable,
        trades_seen: wallet.trades_seen || 0,
        trades_skipped: wallet.trades_skipped || 0,
        test_status,
        hours_remaining,
        start_date: { value: wallet.start_date },
        end_date: { value: wallet.end_date },
        last_sync_time: wallet.last_sync_time ? { value: wallet.last_sync_time } : null
      };
    }));
    
    // Calculate totals
    const totals = {
      total_balance: walletsWithStats.reduce((sum, w) => sum + w.current_balance, 0),
      total_cash_available: walletsWithStats.reduce((sum, w) => sum + (w.cash_available || 0), 0),
      total_realized_pnl: walletsWithStats.reduce((sum, w) => sum + (w.realized_pnl || 0), 0),
      total_unrealized_pnl: walletsWithStats.reduce((sum, w) => sum + (w.unrealized_pnl || 0), 0),
      total_pnl: walletsWithStats.reduce((sum, w) => sum + (w.total_pnl || 0), 0),
      total_trades: walletsWithStats.reduce((sum, w) => sum + w.total_trades, 0),
      total_trades_seen: walletsWithStats.reduce((sum, w) => sum + (w.trades_seen || 0), 0),
      total_trades_skipped: walletsWithStats.reduce((sum, w) => sum + (w.trades_skipped || 0), 0),
      open_positions: walletsWithStats.reduce((sum, w) => sum + w.open_positions, 0),
      total_won: walletsWithStats.reduce((sum, w) => sum + w.won, 0),
      total_lost: walletsWithStats.reduce((sum, w) => sum + w.lost, 0)
    };
    
    return NextResponse.json({
      success: true,
      wallets: walletsWithStats,
      totals,
      fetched_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[ft/wallets] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch wallets' },
      { status: 500 }
    );
  }
}
