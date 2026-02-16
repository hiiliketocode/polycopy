import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculatePolySignalScore } from '@/lib/polysignal/calculate';
import { verifyAdminAuth } from '@/lib/auth/verify-admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_TRADERS = 100;
const TRADES_PER_WALLET = 10;
const BATCH_SIZE = 20;
const FIRE_WIN_RATE_THRESHOLD = 0.55;
const FIRE_ROI_THRESHOLD = 0.15;
const FIRE_CONVICTION_MULTIPLIER_THRESHOLD = 2.5;

function normalizeWinRate(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v > 1.01) return v / 100;
  if (v < 0) return null;
  return v;
}

function normalizeRoi(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) > 1) return v / 100;
  return v;
}

function pickNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function fetchTradesForWallet(wallet: string): Promise<any[]> {
  const url = `https://data-api.polymarket.com/trades?user=${wallet}&limit=${TRADES_PER_WALLET}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function GET() {
  const debug: Record<string, unknown> = {
    tradersQueried: 0,
    tradersWithTrades: 0,
    totalTradesFetched: 0,
    tradesScored: 0,
    polySignalStrongBuy: 0,
    polySignalBuy: 0,
    polySignalNeutral: 0,
    polySignalAvoid: 0,
    polySignalToxic: 0,
    tradesPassed: 0,
    errors: [] as string[],
    rejectedSamples: [] as unknown[],
  };

  try {
    const authResult = await verifyAdminAuth();
    if (!authResult.isAdmin) {
      return NextResponse.json(
        { error: authResult.error || 'Admin access required' },
        { status: 401 }
      );
    }
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing');
    }

    console.log('[fire-feed] Starting — fetching tracked traders with stats...');

    // ── 1. Get tracked wallets with decent stats (WR >= 52%, active recently) ──
    const { data: globalRows, error: globalErr } = await supabase
      .from('trader_global_stats')
      .select('wallet_address, l_win_rate, d30_win_rate, d30_total_roi_pct, l_total_roi_pct, d30_avg_trade_size_usd, l_avg_trade_size_usd, l_avg_pos_size_usd, d30_count, l_count')
      .gte('d30_win_rate', 0.52)
      .gte('d30_count', 10)
      .order('d30_win_rate', { ascending: false, nullsFirst: false })
      .limit(MAX_TRADERS);

    if (globalErr) {
      console.error('[fire-feed] trader_global_stats query error:', globalErr);
      throw new Error(`Stats query failed: ${globalErr.message}`);
    }

    const traderStats = globalRows || [];
    debug.tradersQueried = traderStats.length;
    console.log(`[fire-feed] Found ${traderStats.length} traders with stats`);

    if (traderStats.length === 0) {
      return NextResponse.json({ trades: [], traders: {}, debug });
    }

    // Build stats map keyed by wallet
    const statsMap = new Map<string, any>();
    const wallets: string[] = [];
    for (const row of traderStats) {
      const w = (row.wallet_address || '').toLowerCase();
      if (!w) continue;
      wallets.push(w);
      statsMap.set(w, {
        globalWinRate: normalizeWinRate(row.d30_win_rate) ?? normalizeWinRate(row.l_win_rate),
        globalRoiPct: normalizeRoi(row.d30_total_roi_pct) ?? normalizeRoi(row.l_total_roi_pct),
        globalTrades: pickNum(row.d30_count, row.l_count) ?? 0,
        avgBetSizeUsd: pickNum(row.d30_avg_trade_size_usd, row.l_avg_trade_size_usd, row.l_avg_pos_size_usd),
      });
    }

    // Fetch profile stats for niche win rates
    const { data: profileRows } = await supabase
      .from('trader_profile_stats')
      .select('wallet_address, final_niche, d30_win_rate, l_win_rate, d30_count, l_count, trade_count, d30_avg_trade_size_usd, l_avg_trade_size_usd')
      .in('wallet_address', wallets);

    const profilesByWallet = new Map<string, any[]>();
    for (const p of profileRows || []) {
      const w = (p.wallet_address || '').toLowerCase();
      if (!w) continue;
      const list = profilesByWallet.get(w) ?? [];
      list.push(p);
      profilesByWallet.set(w, list);
    }
    for (const [w, stats] of statsMap) {
      stats.profiles = profilesByWallet.get(w) || [];
    }

    // ── 2. Fetch recent trades per wallet from Polymarket (in parallel batches) ──
    let allTrades: any[] = [];
    for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
      const batch = wallets.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (wallet) => {
          const trades = await fetchTradesForWallet(wallet);
          return trades
            .filter((t: any) => t.side === 'BUY')
            .map((t: any) => ({ ...t, _wallet: wallet }));
        })
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          (debug.tradersWithTrades as number)++;
          allTrades.push(...result.value);
        }
      }
    }

    debug.totalTradesFetched = allTrades.length;
    console.log(`[fire-feed] Fetched ${allTrades.length} BUY trades from ${wallets.length} wallets`);

    // ── 3. Score each trade with PolySignal, keep BUY / STRONG_BUY only ──
    const fireTrades: any[] = [];
    const rejectedSamples: any[] = [];
    const traderNames: Record<string, string> = {};

    for (const trade of allTrades) {
      const wallet = trade._wallet;
      const stats = statsMap.get(wallet);
      if (!stats) continue;

      (debug.tradesScored as number)++;

      // Derive category for niche matching
      const category = (trade.category || trade.market_category || trade.marketCategory || '').toLowerCase() || undefined;

      // Aggregate matching niche profiles
      const MIN_RELIABLE_TRADES = 10;
      let nicheWinRate: number | null = null;
      let nicheTradeCount = 0;
      let nicheAvgTradeSize: number | null = null;

      if (category && stats.profiles?.length > 0) {
        const matching = stats.profiles.filter((p: any) => {
          const niche = (p.final_niche || '').toLowerCase();
          return niche && (niche === category || niche.includes(category) || category.includes(niche));
        });
        if (matching.length > 0) {
          let totalTrades = 0, winWeighted = 0, sizeWeighted = 0;
          for (const p of matching) {
            const count = pickNum(p.d30_count, p.l_count, p.trade_count) ?? 0;
            const wr = normalizeWinRate(p.d30_win_rate) ?? normalizeWinRate(p.l_win_rate) ?? 0.5;
            const sz = pickNum(p.d30_avg_trade_size_usd, p.l_avg_trade_size_usd) ?? 0;
            totalTrades += count;
            winWeighted += wr * count;
            sizeWeighted += sz * count;
          }
          if (totalTrades > 0) {
            nicheTradeCount = totalTrades;
            nicheWinRate = winWeighted / totalTrades;
            nicheAvgTradeSize = sizeWeighted / totalTrades;
          }
        }
      }

      const useNiche = nicheTradeCount >= MIN_RELIABLE_TRADES;

      const polySignalStats = {
        profileWinRate: useNiche ? nicheWinRate : (stats.globalWinRate ?? null),
        globalWinRate: stats.globalWinRate ?? null,
        profileTrades: useNiche ? nicheTradeCount : (stats.globalTrades ?? 20),
        globalTrades: stats.globalTrades ?? 20,
        avgBetSizeUsd: (useNiche ? nicheAvgTradeSize : null) ?? stats.avgBetSizeUsd ?? null,
        isHedging: false,
      };

      const polySignal = calculatePolySignalScore(trade, polySignalStats);

      // Track distribution
      const rec = polySignal.recommendation;
      if (rec === 'STRONG_BUY') (debug.polySignalStrongBuy as number)++;
      else if (rec === 'BUY') (debug.polySignalBuy as number)++;
      else if (rec === 'NEUTRAL') (debug.polySignalNeutral as number)++;
      else if (rec === 'AVOID') (debug.polySignalAvoid as number)++;
      else (debug.polySignalToxic as number)++;

      if (rec !== 'BUY' && rec !== 'STRONG_BUY') {
        if (rejectedSamples.length < 5) {
          rejectedSamples.push({
            wallet: wallet.slice(0, 10),
            score: polySignal.score,
            rec,
            factors: polySignal.factors,
          });
        }
        continue;
      }

      // ── Build output trade ──
      (debug.tradesPassed as number)++;

      let ts = typeof trade.timestamp === 'string' ? parseInt(trade.timestamp) : Number(trade.timestamp);
      if (ts < 10000000000) ts *= 1000;

      const winRate = useNiche ? nicheWinRate : stats.globalWinRate;
      const roiPct = stats.globalRoiPct;
      const size = Number(trade.size || 0);
      const price = Number(trade.price || 0);
      const tradeValue = size * price;
      const avgBet = polySignalStats.avgBetSizeUsd;
      const conviction = avgBet && avgBet > 0 ? tradeValue / avgBet : null;

      const fireReasons: string[] = [];
      if (winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD) fireReasons.push('win_rate');
      if (roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD) fireReasons.push('roi');
      if (conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD) fireReasons.push('conviction');

      // Use Polymarket display name if available
      if (!traderNames[wallet]) {
        const rawName = trade.name || trade.pseudonym;
        traderNames[wallet] = rawName && rawName.length < 40 ? rawName : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
      }

      fireTrades.push({
        id: trade.id || trade.transactionHash || `${wallet}-${ts}`,
        timestamp: Math.floor(ts / 1000),
        side: 'BUY',
        size,
        amount: size,
        price,
        outcome: trade.outcome || 'YES',
        option: trade.outcome || 'YES',
        conditionId: trade.conditionId || trade.condition_id,
        condition_id: trade.conditionId || trade.condition_id,
        market_slug: trade.marketSlug || trade.slug,
        slug: trade.marketSlug || trade.slug,
        title: trade.title || trade.question || trade.market,
        question: trade.title || trade.question || trade.market,
        tx_hash: trade.transactionHash || trade.tx_hash,
        transactionHash: trade.transactionHash || trade.tx_hash,
        token_id: trade.asset || trade.tokenId || trade.token_id,
        tokenId: trade.asset || trade.tokenId || trade.token_id,
        asset: trade.asset,
        user: wallet,
        wallet,
        _followedWallet: wallet,
        _fireReasons: fireReasons,
        _fireScore: fireReasons.length,
        _fireWinRate: winRate,
        _fireRoi: roiPct,
        _fireConviction: conviction,
        _polySignalScore: polySignal.score,
        _polySignalRecommendation: polySignal.recommendation,
        _polySignalFactors: polySignal.factors,
        _polySignalIndicators: polySignal.indicators,
        raw: trade,
      });
    }

    fireTrades.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    debug.rejectedSamples = rejectedSamples;
    console.log(`[fire-feed] Done: ${fireTrades.length} BUY/STRONG_BUY from ${debug.tradesScored} scored trades`);
    console.log(`[fire-feed] Distribution: ${debug.polySignalStrongBuy} STRONG_BUY, ${debug.polySignalBuy} BUY, ${debug.polySignalNeutral} NEUTRAL, ${debug.polySignalAvoid} AVOID, ${debug.polySignalToxic} TOXIC`);

    return NextResponse.json({
      trades: fireTrades,
      traders: traderNames,
      stats: Object.fromEntries(statsMap),
      debug,
    });
  } catch (error: any) {
    console.error('[fire-feed] Error:', error);
    (debug.errors as string[]).push(error.message || 'Unknown error');
    return NextResponse.json({
      trades: [],
      traders: {},
      stats: {},
      debug,
      error: error.message || 'Failed to fetch fire feed',
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
