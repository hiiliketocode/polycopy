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
    
    const walletIds = wallets.map((w: { wallet_id: string }) => w.wallet_id);
    
    // Fetch all orders for all wallets in one query
    const { data: allOrders, error: ordersError } = await supabase
      .from('ft_orders')
      .select('wallet_id, outcome, pnl, size, condition_id, entry_price, token_label, resolved_time')
      .in('wallet_id', walletIds);
    
    // Group orders by wallet
    const ordersByWallet = new Map<string, typeof allOrders>();
    if (!ordersError && allOrders) {
      for (const o of allOrders) {
        const wid = o.wallet_id as string;
        if (!ordersByWallet.has(wid)) ordersByWallet.set(wid, []);
        ordersByWallet.get(wid)!.push(o);
      }
    }
    
    // Collect unique condition_ids from open orders across ALL wallets (dedupe for batched price fetch)
    const allConditionIds = [...new Set(
      (allOrders || [])
        .filter((o: { outcome: string }) => o.outcome === 'OPEN')
        .map((o: { condition_id?: string }) => o.condition_id)
        .filter(Boolean)
    )] as string[];
    
    // Shared price map: fetch once per unique condition_id, reuse across wallets
    const priceMap = new Map<string, { outcomes: string[] | null; outcomePrices: number[] | null }>();
    const STALE_PRICE_MS = 2 * 60 * 1000;
    const PRICE_BATCH_SIZE = 25;
    const MAX_PRICE_FETCHES = 200; // Higher limit since we're now fetching for all wallets combined
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const nowMs = Date.now();
    
    if (allConditionIds.length > 0) {
      const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, outcome_prices, last_price_updated_at')
        .in('condition_id', allConditionIds);
      
      if (markets) {
        for (const market of markets) {
          const outcomes = market.outcome_prices?.outcomes ?? market.outcome_prices?.labels ?? null;
          const outcomePrices = market.outcome_prices?.outcomePrices ?? market.outcome_prices?.prices ?? null;
          const lastUpdated = market.last_price_updated_at ? new Date(market.last_price_updated_at).getTime() : 0;
          const isStale = nowMs - lastUpdated > STALE_PRICE_MS;
          if (outcomes && outcomePrices && !isStale) {
            priceMap.set(market.condition_id, { outcomes, outcomePrices });
          }
        }
      }
      
      const parseOutcomes = (outcomes: unknown): string[] | null => {
        if (Array.isArray(outcomes)) return outcomes.map(o => typeof o === 'string' ? o : (o as { LABEL?: string; label?: string })?.LABEL ?? (o as { label?: string })?.label ?? String(o ?? ''));
        return null;
      };
      const parsePrices = (prices: unknown): number[] | null => {
        if (Array.isArray(prices)) return prices.map(p => { const n = typeof p === 'string' ? parseFloat(p) : Number(p); return Number.isFinite(n) ? n : 0; });
        return null;
      };
      
      const allNeedingPrices = allConditionIds.filter(id => !priceMap.has(id));
      for (let offset = 0; offset < Math.min(allNeedingPrices.length, MAX_PRICE_FETCHES); offset += PRICE_BATCH_SIZE) {
        const batch = allNeedingPrices.slice(offset, offset + PRICE_BATCH_SIZE);
        await Promise.all(batch.map(async (conditionId) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${baseUrl}/api/polymarket/price?conditionId=${conditionId}`, { cache: 'no-store', signal: controller.signal });
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
            const gammaController = new AbortController();
            const gammaTimeout = setTimeout(() => gammaController.abort(), 3000);
            const gammaRes = await fetch(`https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`, { cache: 'no-store', signal: gammaController.signal });
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
    }
    
    const outcomeLabel = (o: unknown): string => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object' && 'LABEL' in o) return String((o as { LABEL?: string }).LABEL ?? '');
      if (o && typeof o === 'object' && 'label' in o) return String((o as { label?: string }).label ?? '');
      return String(o ?? '');
    };

    /** Compute max drawdown (USD and %) and Sharpe ratio from resolved orders */
    function computeRiskMetrics(
      resolvedOrders: { pnl?: number; resolved_time?: string }[],
      startingBalance: number
    ): { max_drawdown_usd: number; max_drawdown_pct: number; sharpe_ratio: number | null } {
      const withTime = resolvedOrders.filter(o => o.resolved_time && o.pnl != null);
      const sorted = [...withTime].sort(
        (a, b) => new Date(a.resolved_time!).getTime() - new Date(b.resolved_time!).getTime()
      );
      let peak = startingBalance;
      let equity = startingBalance;
      let maxDrawdownUsd = 0;
      for (const o of sorted) {
        equity += o.pnl!;
        if (equity > peak) peak = equity;
        const drawdown = peak - equity;
        if (drawdown > maxDrawdownUsd) maxDrawdownUsd = drawdown;
      }
      const maxDrawdownPct = peak > 0 ? (maxDrawdownUsd / peak) * 100 : 0;

      const pnls = resolvedOrders.map(o => o.pnl).filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
      let sharpeRatio: number | null = null;
      if (pnls.length >= 2) {
        const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
        const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / (pnls.length - 1);
        const std = Math.sqrt(variance);
        if (std > 0) sharpeRatio = mean / std;
      }
      return { max_drawdown_usd: maxDrawdownUsd, max_drawdown_pct: maxDrawdownPct, sharpe_ratio: sharpeRatio };
    }
    
    // Build stats for each wallet using shared priceMap
    const walletsWithStats = await Promise.all(wallets.map(async (wallet: { wallet_id: string; start_date: string; end_date: string; starting_balance?: number; trades_seen?: number; trades_skipped?: number; last_sync_time?: string | null }) => {
      const orders = ordersByWallet.get(wallet.wallet_id) || [];
      const openOrders = orders.filter((o: { outcome: string }) => o.outcome === 'OPEN');
      const totalSize = orders.reduce((sum: number, o: { size?: number }) => sum + (Number(o.size) || 0), 0);
      
      let stats = {
        total_trades: orders.length,
        open_positions: openOrders.length,
        won: orders.filter((o: { outcome: string }) => o.outcome === 'WON').length,
        lost: orders.filter((o: { outcome: string }) => o.outcome === 'LOST').length,
        realized_pnl: orders.filter((o: { outcome: string }) => o.outcome !== 'OPEN').reduce((sum: number, o: { pnl?: number }) => sum + (o.pnl || 0), 0),
        unrealized_pnl: 0,
        open_exposure: openOrders.reduce((sum: number, o: { size?: number }) => sum + (o.size || 0), 0),
        avg_trade_size: orders.length > 0 ? totalSize / orders.length : 0
      };
      
      for (const order of openOrders) {
        const market = priceMap.get(order.condition_id);
        if (!market || !market.outcomes || !market.outcomePrices) continue;
        const tokenLabel = (order.token_label || 'YES').toLowerCase().trim();
        let idx = market.outcomes.findIndex((o: unknown) => outcomeLabel(o)?.toLowerCase().trim() === tokenLabel);
        if (idx < 0 && market.outcomes.length === 2) {
          const outcomesLower = market.outcomes.map((o: unknown) => outcomeLabel(o)?.toLowerCase().trim());
          if (tokenLabel === 'yes') {
            idx = outcomesLower.indexOf('yes');
            if (idx < 0) idx = 0;
          } else if (tokenLabel === 'no') {
            idx = outcomesLower.indexOf('no');
            if (idx < 0) idx = 1;
          }
        }
        if (idx >= 0 && market.outcomePrices[idx] != null && order.entry_price && order.size) {
          const rawPrice = market.outcomePrices[idx];
          const currentPrice = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
          if (Number.isFinite(currentPrice)) {
            const shares = order.size / order.entry_price;
            stats.unrealized_pnl += shares * currentPrice - order.size;
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

      // Starting balance: use DB value; self-heal if cash would be negative (mirrors migration 20260325)
      let effectiveStartingBalance = Number(wallet.starting_balance) || 1000;
      const rawCash = effectiveStartingBalance + stats.realized_pnl - stats.open_exposure;
      if (rawCash < 0) {
        const addAmount = Math.ceil(Math.abs(rawCash)) + 10;
        effectiveStartingBalance += addAmount;
        await supabase
          .from('ft_wallets')
          .update({
            starting_balance: effectiveStartingBalance,
            updated_at: new Date().toISOString(),
          })
          .eq('wallet_id', wallet.wallet_id);
      }

      // Cash available = starting balance + realized P&L - open exposure (clamped to 0)
      const cashAvailable = Math.max(0, effectiveStartingBalance + stats.realized_pnl - stats.open_exposure);

      const resolved = orders.filter((o: { outcome: string }) => o.outcome === 'WON' || o.outcome === 'LOST');
      const { max_drawdown_usd, max_drawdown_pct, sharpe_ratio } = computeRiskMetrics(
        resolved,
        effectiveStartingBalance
      );

      return {
        ...wallet,
        starting_balance: effectiveStartingBalance,
        ...stats,
        total_pnl: stats.realized_pnl + stats.unrealized_pnl,
        current_balance: effectiveStartingBalance + stats.realized_pnl + stats.unrealized_pnl,
        cash_available: cashAvailable,
        trades_seen: wallet.trades_seen || 0,
        trades_skipped: wallet.trades_skipped || 0,
        test_status,
        hours_remaining,
        max_drawdown_usd,
        max_drawdown_pct,
        sharpe_ratio,
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
