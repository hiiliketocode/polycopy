/**
 * POST /api/ft/sync-diagnose
 *
 * Runs sync-like logic in read-only mode and returns diagnostic counts
 * for why trades may not be getting through. Admin or cron auth.
 */
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';

const TOP_TRADERS_LIMIT = 20; // Smaller for faster diagnose
const TRADES_PAGE_SIZE = 50;

function parseTimestamp(value: number | string | undefined): Date | null {
  if (value === undefined || value === null) return null;
  let ts = Number(value);
  if (!Number.isFinite(ts)) return null;
  if (ts < 10000000000) ts *= 1000;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getSourceTradeId(trade: { id?: string; transactionHash?: string; traderWallet?: string; conditionId?: string; timestamp?: string | number }): string {
  if (trade.id && String(trade.id).trim()) return String(trade.id).trim();
  if (trade.transactionHash && String(trade.transactionHash).trim()) return String(trade.transactionHash).trim();
  return `${trade.traderWallet || ''}-${trade.conditionId || ''}-${trade.timestamp || ''}`;
}

export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const now = new Date();
  const diagnostic: Record<string, unknown> = {
    run_at: now.toISOString(),
    steps: {} as Record<string, number | string>,
  };

  try {
    const supabase = createAdminServiceClient();

    // 1. Get ML Sharp Shooter wallet
    const { data: mlWallet, error: wErr } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
      .single();

    if (wErr || !mlWallet) {
      return NextResponse.json({
        success: false,
        error: 'FT_ML_SHARP_SHOOTER not found',
        diagnostic,
      });
    }

    const lastSyncTime = mlWallet.last_sync_time ? new Date(mlWallet.last_sync_time) : new Date(mlWallet.start_date);
    diagnostic.steps = {
      ...(diagnostic.steps as object),
      wallet_last_sync: mlWallet.last_sync_time || 'never',
      last_sync_age_min: Math.round((now.getTime() - lastSyncTime.getTime()) / 60000),
    };

    // 2. Fetch leaderboard
    const [tradersByPnl, tradersByVol] = await Promise.all([
      fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'PNL', limit: TOP_TRADERS_LIMIT }),
      fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'VOL', limit: TOP_TRADERS_LIMIT }),
    ]);
    const traderMap = new Map<string, (typeof tradersByPnl)[0]>();
    [...tradersByPnl, ...tradersByVol].forEach((t) => {
      const key = t.wallet.toLowerCase();
      if (!traderMap.has(key)) traderMap.set(key, t);
    });
    const topTraders = Array.from(traderMap.values());
    diagnostic.steps = { ...(diagnostic.steps as object), traders_fetched: topTraders.length };

    // 3. Get trader stats
    const traderWallets = topTraders.map((t) => t.wallet.toLowerCase());
    const { data: traderStats } = await supabase
      .from('trader_global_stats')
      .select('wallet_address, l_win_rate, d30_win_rate, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd')
      .in('wallet_address', traderWallets);

    const statsMap = new Map<string, { winRate: number; tradeCount: number; avgTradeSize: number }>();
    if (traderStats) {
      for (const s of traderStats) {
        const winRate = s.d30_win_rate ?? s.l_win_rate ?? 0.5;
        const tradeCount = s.d30_count ?? s.l_count ?? 0;
        const avgTradeSize = s.d30_avg_trade_size_usd ?? s.l_avg_trade_size_usd ?? 0;
        statsMap.set(s.wallet_address.toLowerCase(), {
          winRate: typeof winRate === 'number' ? winRate : parseFloat(String(winRate)) || 0.5,
          tradeCount: typeof tradeCount === 'number' ? tradeCount : parseInt(String(tradeCount)) || 0,
          avgTradeSize: typeof avgTradeSize === 'number' ? avgTradeSize : parseFloat(String(avgTradeSize)) || 0,
        });
      }
    }

    // 4. Fetch trades from Polymarket (first 3 traders, 1 page each for speed)
    const allTrades: Array<{
      timestamp?: number;
      side?: string;
      conditionId?: string;
      price?: number;
      outcome?: string;
      traderWallet: string;
      traderWinRate: number;
      traderTradeCount: number;
      traderAvgTradeSize: number;
      tradeValue: number;
      conviction: number;
    }> = [];

    for (let i = 0; i < Math.min(5, topTraders.length); i++) {
      const wallet = topTraders[i].wallet.toLowerCase();
      const stats = statsMap.get(wallet) || { winRate: 0.5, tradeCount: 50, avgTradeSize: 100 };
      const effectiveTradeCount = stats.tradeCount > 0 ? stats.tradeCount : 50;
      if (effectiveTradeCount < 30) continue;

      const res = await fetch(
        `https://data-api.polymarket.com/trades?user=${wallet}&limit=${TRADES_PAGE_SIZE}&offset=0`,
        { cache: 'no-store' }
      );
      if (!res.ok) continue;
      const trades: Array<{ timestamp?: number; side?: string; conditionId?: string; price?: number; size?: number; outcome?: string }> = await res.json();
      if (!Array.isArray(trades)) continue;

      const buyTrades = trades.filter((t) => t.side === 'BUY' && t.conditionId);
      for (const t of buyTrades) {
        const size = Number(t.size ?? 0);
        const price = Number(t.price ?? 0);
        const tradeValue = size * price;
        const conviction = stats.avgTradeSize > 0 ? tradeValue / stats.avgTradeSize : 1;
        allTrades.push({
          ...t,
          traderWallet: wallet,
          traderWinRate: stats.winRate,
          traderTradeCount: effectiveTradeCount,
          traderAvgTradeSize: stats.avgTradeSize,
          tradeValue,
          conviction,
        });
      }
    }

    diagnostic.steps = {
      ...(diagnostic.steps as object),
      trades_fetched: allTrades.length,
      newest_trade: allTrades.length > 0 ? (() => {
        const ts = allTrades.map((t) => parseTimestamp(t.timestamp)).filter(Boolean);
        const newest = ts.reduce((a, b) => (a && b && a > b ? a : b), null as Date | null);
        return newest?.toISOString();
      })() : null,
    };

    // 5. Filter: tradeTime > lastSyncTime
    const afterTimeFilter = allTrades.filter((t) => {
      const tt = parseTimestamp(t.timestamp);
      return tt && tt > lastSyncTime;
    });
    diagnostic.steps = {
      ...(diagnostic.steps as object),
      after_time_filter: afterTimeFilter.length,
    };

    if (afterTimeFilter.length === 0) {
      diagnostic.conclusion = 'No trades newer than last_sync_time. Either no new activity from top traders, or last_sync_time is too recent.';
      return NextResponse.json({ success: true, diagnostic });
    }

    // 6. Load alreadySeenIds for ML Sharp Shooter
    const candidateIds = afterTimeFilter.map((t) => getSourceTradeId(t));
    const { data: seen } = await supabase
      .from('ft_seen_trades')
      .select('source_trade_id')
      .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
      .in('source_trade_id', candidateIds);
    const alreadySeenIds = new Set((seen || []).map((r) => r.source_trade_id));

    const afterSeenFilter = afterTimeFilter.filter((t) => !alreadySeenIds.has(getSourceTradeId(t)));
    diagnostic.steps = {
      ...(diagnostic.steps as object),
      already_seen: candidateIds.length - afterSeenFilter.length,
      after_seen_filter: afterSeenFilter.length,
    };

    if (afterSeenFilter.length === 0) {
      diagnostic.conclusion = 'All trades since last_sync have already been evaluated (in ft_seen_trades). No new trades to process.';
      return NextResponse.json({ success: true, diagnostic });
    }

    // 7. Get market info for these trades
    const conditionIds = [...new Set(afterSeenFilter.map((t) => t.conditionId).filter(Boolean))];
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, end_time, closed, resolved_outcome, winning_side')
      .in('condition_id', conditionIds);

    const marketMap = new Map<string, { closed: boolean; resolved: boolean; endTime: Date | null }>();
    if (markets) {
      for (const m of markets) {
        const resolved = m.closed || m.resolved_outcome != null || m.winning_side != null;
        marketMap.set(m.condition_id, {
          closed: m.closed || false,
          resolved,
          endTime: m.end_time ? new Date(m.end_time) : null,
        });
      }
    }

    // 8. Apply ML Sharp Shooter filters (price, conviction, market status)
    const reasons: Record<string, number> = {};
    let passedFilters = 0;

    for (const trade of afterSeenFilter) {
      const price = Number(trade.price ?? 0);
      const market = marketMap.get(trade.conditionId || '');
      if (!market) {
        reasons['market_not_found'] = (reasons['market_not_found'] || 0) + 1;
        continue;
      }
      if (market.resolved || market.closed) {
        reasons['market_resolved'] = (reasons['market_resolved'] || 0) + 1;
        continue;
      }
      if (price < (mlWallet.price_min ?? 0) || price > (mlWallet.price_max ?? 1)) {
        reasons['price_out_of_range'] = (reasons['price_out_of_range'] || 0) + 1;
        continue;
      }
      const minConv = mlWallet.min_conviction ?? 0;
      if (minConv > 0 && trade.conviction < minConv) {
        reasons['low_conviction'] = (reasons['low_conviction'] || 0) + 1;
        continue;
      }
      const minCount = mlWallet.min_trader_resolved_count ?? 30;
      if (trade.traderTradeCount < minCount) {
        reasons['low_trade_count'] = (reasons['low_trade_count'] || 0) + 1;
        continue;
      }
      passedFilters++;
    }

    diagnostic.steps = {
      ...(diagnostic.steps as object),
      filter_reasons: reasons,
      passed_pre_ml_filters: passedFilters,
    };

    diagnostic.conclusion =
      passedFilters > 0
        ? `${passedFilters} trade(s) passed pre-ML filters. ML score check happens at insert time; run full sync to take them.`
        : `No trades passed filters. Main blockers: ${Object.entries(reasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`;

    return NextResponse.json({ success: true, diagnostic });
  } catch (err) {
    console.error('[ft/sync-diagnose] Error:', err);
    return NextResponse.json(
      { success: false, error: String(err), diagnostic },
      { status: 500 }
    );
  }
}
