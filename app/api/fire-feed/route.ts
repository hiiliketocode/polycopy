import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';
import { isTraderExcluded } from '@/lib/ft-excluded-traders';
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

// Thresholds
const FIRE_GLOBAL_TRADES_LIMIT = 1000; // Fetch recent trades from global API
const FIRE_WIN_RATE_THRESHOLD = 0.55;
const FIRE_ROI_THRESHOLD = 0.15;
const FIRE_CONVICTION_MULTIPLIER_THRESHOLD = 2.5;

function normalizeWinRateValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value > 1.01) return value / 100;
  if (value < 0) return null;
  return value;
}

function normalizeRoiValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  // ROI values from the database are stored as percentages (e.g., 13.87 means 13.87%)
  // Convert to decimal form (0.1387) for consistent threshold comparison
  // Values close to 0 (-1 to 1) might already be decimals, so only convert larger values
  if (Math.abs(value) > 1) return value / 100;
  return value;
}

function pickNumber(...values: Array<number | null | undefined | string>): number | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    if (typeof v === 'string') {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  return null;
}

function deriveCategoryFromTrade(trade: any): string | undefined {
  const candidates = [trade.category, trade.market_category, trade.marketCategory, trade.market?.category];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
}

function winRateForTradeType(stats: any, category?: string): number | null {
  if (!stats) return null;
  if (category && stats.profiles?.length > 0) {
    const normalizedCategory = category.toLowerCase();
    // AGGREGATE all matching profiles (same logic as PolySignal/PredictionStats)
    const matchingProfiles = stats.profiles.filter((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      return niche === normalizedCategory || niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });
    
    if (matchingProfiles.length > 0) {
      // Weighted average of win rates
      let totalTrades = 0;
      let winWeighted = 0;
      for (const p of matchingProfiles) {
        const count = Number(p.d30_count ?? p.l_count ?? p.trade_count ?? 0) || 0;
        const winRate = normalizeWinRateValue(p.d30_win_rate) ?? normalizeWinRateValue(p.l_win_rate) ?? 0.5;
        totalTrades += count;
        winWeighted += winRate * count;
      }
      if (totalTrades > 0) {
        return winWeighted / totalTrades;
      }
    }
  }
  return normalizeWinRateValue(stats.globalWinRate);
}

function roiForTradeType(stats: any, category?: string): number | null {
  if (!stats) return null;
  const normalizedCategory = category?.toLowerCase() ?? '';
  if (stats.profiles?.length > 0 && normalizedCategory) {
    const match = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      return niche === normalizedCategory || niche.includes(normalizedCategory);
    });
    // Use actual column names: d30_total_roi_pct, l_total_roi_pct
    const roi = match?.d30_total_roi_pct ?? match?.l_total_roi_pct ?? null;
    if (roi !== null && roi !== undefined) return normalizeRoiValue(roi);
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined) {
    return normalizeRoiValue(stats.globalRoiPct);
  }
  return null;
}

// fetchAiWinProbForTrade removed — calling it per-trade (2 HTTP requests each) caused
// 504 FUNCTION_INVOCATION_TIMEOUT on Vercel. The PolySignal score works fine without it;
// the edge contribution is simply 0 (neutral) when AI win prob is not provided.

function convictionMultiplierForTrade(trade: any, stats: any): number | null {
  const size = Number(trade.size ?? trade.shares_normalized ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price) || size <= 0 || price <= 0) return null;
  const tradeValue = size * price;
  if (tradeValue <= 0) return null;
  
  const avgBetSize = pickNumber(
    stats?.d30_avg_trade_size_usd,
    stats?.l_avg_trade_size_usd,
    stats?.avgBetSizeUsd,
    stats?.l_avg_pos_size_usd
  );
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  // NOTE: Previously we capped averages at 5x current trade size to prevent "artificially low"
  // conviction scores. This was REMOVED because it destroyed data integrity - it made conviction
  // inconsistent with avg_pnl and ROI calculations. A low conviction (e.g., 0.04x) is MEANINGFUL:
  // it means the trader is making a small bet relative to their normal behavior.
  
  const conviction = tradeValue / avgBetSize;
  if (!Number.isFinite(conviction) || conviction <= 0) return null;
  return conviction;
}

export async function GET(request: Request) {
  const debugStats: any = {
    tradersChecked: 0,
    tradersWithStats: 0,
    tradersWithoutStats: 0,
    totalTradesFetched: 0,
    totalTradesAfterTimeFilter: 0,
    tradesChecked: 0,
    tradesPassed: 0,
    passedByWinRate: 0,
    passedByRoi: 0,
    passedByConviction: 0,
    errors: [] as string[],
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

    console.log('[fire-feed] Starting...');

    // 1. Fetch recent trades from the GLOBAL Polymarket trades API (all traders)
    let allTrades: any[] = [];
    try {
      const response = await fetch(
        `https://data-api.polymarket.com/trades?limit=${FIRE_GLOBAL_TRADES_LIMIT}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error(`Global trades API returned ${response.status}`);
      }
      const rawTrades = await response.json();
      if (!Array.isArray(rawTrades)) {
        throw new Error('Global trades API returned non-array');
      }
      debugStats.totalTradesFetched = rawTrades.length;

      // Filter to BUY trades only
      allTrades = rawTrades.filter((trade: any) => {
        if (trade.side !== 'BUY') return false;
        const wallet = (trade.user || '').toLowerCase();
        if (isTraderExcluded(wallet)) return false;
        return true;
      });
      debugStats.totalTradesAfterTimeFilter = allTrades.length;
      console.log(`[fire-feed] Fetched ${rawTrades.length} global trades, ${allTrades.length} BUY trades after filter`);
    } catch (error: any) {
      console.error('[fire-feed] Global trades fetch error:', error);
      debugStats.errors.push(`Global trades error: ${error.message}`);
      // Return empty instead of failing
      return NextResponse.json({
        trades: [],
        traders: {},
        stats: {},
        debug: debugStats,
        error: error.message,
      });
    }

    if (allTrades.length === 0) {
      return NextResponse.json({
        trades: [],
        traders: {},
        stats: {},
        debug: debugStats,
      });
    }

    // 2. Collect unique wallets and attach wallet to each trade
    const uniqueWallets = new Set<string>();
    allTrades = allTrades.map((trade: any) => {
      const wallet = (trade.user || '').toLowerCase();
      uniqueWallets.add(wallet);
      return { ...trade, _wallet: wallet };
    });
    const wallets = Array.from(uniqueWallets).filter(Boolean);
    debugStats.tradersChecked = wallets.length;
    console.log(`[fire-feed] ${wallets.length} unique wallets from ${allTrades.length} trades`);

    // 3. Fetch stats + leaderboard names in parallel
    // Supabase .in() supports up to 1000 items
    const walletsForQuery = wallets.slice(0, 1000);
    const [globalsRes, profilesRes, leaderboard] = await Promise.all([
      supabase.from('trader_global_stats')
        .select('wallet_address, l_win_rate, d30_win_rate, d7_win_rate, l_total_roi_pct, d30_total_roi_pct, d7_total_roi_pct, l_avg_trade_size_usd, d30_avg_trade_size_usd, d7_avg_trade_size_usd, l_avg_pos_size_usd, l_count, d30_count')
        .in('wallet_address', walletsForQuery),
      supabase.from('trader_profile_stats')
        .select('wallet_address, final_niche, l_win_rate, d30_win_rate, d7_win_rate, l_total_roi_pct, d30_total_roi_pct, d7_total_roi_pct, d30_count, l_count, trade_count, d30_avg_trade_size_usd, l_avg_trade_size_usd')
        .in('wallet_address', walletsForQuery),
      // Fetch leaderboard for display names only
      fetchPolymarketLeaderboard({
        timePeriod: 'month',
        orderBy: 'PNL',
        limit: 100,
        category: 'overall',
      }).catch(() => [] as any[]),
    ]);

    // Log query results and any errors
    if (globalsRes.error) {
      console.error('[fire-feed] Global stats query error:', globalsRes.error);
      debugStats.errors.push(`Global stats query error: ${globalsRes.error.message}`);
    }
    if (profilesRes.error) {
      console.error('[fire-feed] Profile stats query error:', profilesRes.error);
      debugStats.errors.push(`Profile stats query error: ${profilesRes.error.message}`);
    }
    
    const globals = globalsRes.error ? [] : globalsRes.data || [];
    const profiles = profilesRes.error ? [] : profilesRes.data || [];
    console.log(`[fire-feed] Stats: ${globals.length} global, ${profiles.length} profile records`);

    // Build stats map
    const statsMap = new Map<string, any>();
    const profilesByWallet = new Map<string, any[]>();
    
    profiles.forEach((row: any) => {
      const wallet = (row.wallet_address || '').toLowerCase();
      if (wallet) {
        const list = profilesByWallet.get(wallet) ?? [];
        list.push(row);
        profilesByWallet.set(wallet, list);
      }
    });

    globals.forEach((row: any) => {
      const wallet = (row.wallet_address || '').toLowerCase();
      if (wallet) {
        statsMap.set(wallet, {
          globalWinRate: normalizeWinRateValue(row.d30_win_rate) ?? normalizeWinRateValue(row.l_win_rate),
          globalRoiPct: normalizeRoiValue(row.d30_total_roi_pct) ?? normalizeRoiValue(row.l_total_roi_pct),
          globalTrades: pickNumber(row.d30_count, row.l_count) ?? 0,
          avgBetSizeUsd: pickNumber(row.d30_avg_trade_size_usd, row.l_avg_trade_size_usd, row.l_avg_pos_size_usd),
          d30_avg_trade_size_usd: pickNumber(row.d30_avg_trade_size_usd),
          l_avg_trade_size_usd: pickNumber(row.l_avg_trade_size_usd),
          l_avg_pos_size_usd: pickNumber(row.l_avg_pos_size_usd),
          profiles: profilesByWallet.get(wallet) || [],
        });
      }
    });

    debugStats.tradersWithStats = statsMap.size;
    console.log(`[fire-feed] Stats available for ${statsMap.size} of ${wallets.length} traders`);

    // Build trader names from leaderboard (for display only)
    const traderPnlMap = new Map<string, number>();
    const traderNames: Record<string, string> = {};
    (leaderboard || []).forEach((trader: any) => {
      const w = trader.wallet?.toLowerCase();
      if (w) {
        traderNames[w] = trader.displayName;
        traderPnlMap.set(w, trader.pnl || 0);
      }
    });

    // 4. Process trades — apply PolySignal scoring, only return BUY or STRONG_BUY
    const fireTrades: any[] = [];
    let rejectedSamples: any[] = [];
    
    // Add PolySignal stats to debug
    (debugStats as any).polySignalPassed = 0;
    (debugStats as any).polySignalStrongBuy = 0;
    (debugStats as any).polySignalBuy = 0;
    (debugStats as any).polySignalNeutral = 0;
    (debugStats as any).polySignalAvoid = 0;
    (debugStats as any).polySignalToxic = 0;
    
    for (const trade of allTrades) {
      const wallet = trade._wallet?.toLowerCase();
      if (!wallet) continue;
      
      debugStats.tradesChecked++;
      
      const stats = statsMap.get(wallet);
      const traderPnl = traderPnlMap.get(wallet) || 0;
      
      // Calculate stats-based metrics for fire indicators
      const category = deriveCategoryFromTrade(trade);
      const winRate = stats ? winRateForTradeType(stats, category) : null;
      const roiPct = stats ? roiForTradeType(stats, category) : null;
      const conviction = stats ? convictionMultiplierForTrade(trade, stats) : null;
      
      // Fire indicator thresholds (for showing 🔥 on specific metrics)
      const meetsWinRate = winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD;
      const meetsRoi = roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD;
      const meetsConviction = conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
      
      if (!stats) {
        debugStats.tradersWithoutStats++;
      }
      
      // Calculate PolySignal score
      // Use niche stats ONLY if they have enough trades to be reliable
      // This ensures consistency between server-side filter and client-side display
      const MIN_RELIABLE_TRADES = 10
      
      // Helper to pick first valid number
      const pickNumber = (...vals: any[]): number | null => {
        for (const v of vals) {
          if (v !== null && v !== undefined && !isNaN(v)) return Number(v)
        }
        return null
      }
      
      // AGGREGATE all matching niche profiles (same logic as PolySignal and PredictionStats)
      const normalizedCategory = category?.toLowerCase() || ''
      const matchingProfiles = (stats?.profiles?.length > 0 && normalizedCategory)
        ? stats.profiles.filter((profile: any) => {
            const niche = (profile.final_niche || '').toLowerCase()
            if (!niche) return false
            return niche === normalizedCategory || niche.includes(normalizedCategory) || normalizedCategory.includes(niche)
          })
        : []
      
      // Aggregate all matching profiles
      let aggregatedStats: any = null
      if (matchingProfiles.length > 0) {
        const agg = matchingProfiles.reduce((acc: any, p: any) => {
          const count = pickNumber(p.d30_count, p.l_count, p.trade_count) ?? 0
          const winRate = normalizeWinRateValue(p.d30_win_rate) ?? normalizeWinRateValue(p.l_win_rate) ?? 0.5
          const avgTradeSize = pickNumber(p.d30_avg_trade_size_usd, p.l_avg_trade_size_usd) ?? 0
          
          acc.totalTrades += count
          acc.winWeighted += winRate * count
          acc.sizeWeighted += avgTradeSize * count
          return acc
        }, { totalTrades: 0, winWeighted: 0, sizeWeighted: 0 })
        
        if (agg.totalTrades > 0) {
          aggregatedStats = {
            tradeCount: agg.totalTrades,
            winRate: agg.winWeighted / agg.totalTrades,
            avgTradeSize: agg.sizeWeighted / agg.totalTrades,
          }
        }
      }
      
      // Get aggregated trade count for niche
      const nicheTradeCount = aggregatedStats?.tradeCount ?? 0
      
      // Only use niche stats if we have enough data
      const useNicheStats = aggregatedStats && nicheTradeCount >= MIN_RELIABLE_TRADES
      
      // Get aggregated niche win rate
      const nicheWinRate = useNicheStats ? aggregatedStats.winRate : null
      
      // Use aggregated profile avg trade size for conviction calculation
      const profileAvgTradeSize = useNicheStats ? aggregatedStats.avgTradeSize : null
      
      const polySignalStats = {
        profileWinRate: useNicheStats ? nicheWinRate : (stats?.globalWinRate ?? null),
        globalWinRate: stats?.globalWinRate ?? null,
        profileTrades: useNicheStats ? nicheTradeCount : (stats?.globalTrades ?? 20),
        globalTrades: stats?.globalTrades ?? 20,
        avgBetSizeUsd: profileAvgTradeSize ?? stats?.avgBetSizeUsd ?? null,  // Prefer profile avg for conviction
        isHot: false, // Would need more data
        isHedging: false, // Would need more data
      };

      // NOTE: We skip the per-trade AI win prob fetch (fetchAiWinProbForTrade) to avoid
      // 504 timeouts. Each call makes 2 sequential HTTP requests (CLOB + PolyScore), and
      // with hundreds of trades this takes minutes. The PolySignal score works fine without
      // it — edge contribution is 0 (neutral) and the other factors (conviction, price band,
      // trader WR, market type) still produce accurate BUY/STRONG_BUY recommendations.
      const polySignal = calculatePolySignalScore(trade, polySignalStats);
      
      // Track recommendation distribution
      if (polySignal.recommendation === 'STRONG_BUY') (debugStats as any).polySignalStrongBuy++;
      else if (polySignal.recommendation === 'BUY') (debugStats as any).polySignalBuy++;
      else if (polySignal.recommendation === 'NEUTRAL') (debugStats as any).polySignalNeutral++;
      else if (polySignal.recommendation === 'AVOID') (debugStats as any).polySignalAvoid++;
      else if (polySignal.recommendation === 'TOXIC') (debugStats as any).polySignalToxic++;
      
      // Only pass trades that are BUY or STRONG_BUY — no exceptions
      const passesPolySignal = 
        polySignal.recommendation === 'BUY' || 
        polySignal.recommendation === 'STRONG_BUY';
      
      // Log first few rejected trades for debugging
      if (!passesPolySignal && rejectedSamples.length < 3) {
        rejectedSamples.push({
          wallet: wallet.slice(0, 10),
          polySignalScore: polySignal.score,
          polySignalRec: polySignal.recommendation,
          factors: polySignal.factors,
          winRate,
          roiPct,
          conviction,
          traderPnl,
        });
      }
      
      if (passesPolySignal) {
        debugStats.tradesPassed++;
        (debugStats as any).polySignalPassed++;
        if (meetsWinRate) debugStats.passedByWinRate++;
        if (meetsRoi) debugStats.passedByRoi++;
        if (meetsConviction) debugStats.passedByConviction++;
        
        let timestamp = typeof trade.timestamp === 'string' ? parseInt(trade.timestamp) : trade.timestamp;
        if (timestamp < 10000000000) timestamp = timestamp * 1000;
        
        // Fire reasons for display (which metrics are exceptional)
        const fireReasons: string[] = [];
        if (meetsWinRate) fireReasons.push('win_rate');
        if (meetsRoi) fireReasons.push('roi');
        if (meetsConviction) fireReasons.push('conviction');
        
        fireTrades.push({
          id: trade.id || `${wallet}-${timestamp}`,
          timestamp: Math.floor(timestamp / 1000),
          side: trade.side || 'BUY',
          size: Number(trade.size || 0),
          amount: Number(trade.size || 0),
          price: Number(trade.price || 0),
          outcome: trade.outcome || 'YES',
          option: trade.outcome || 'YES',
          conditionId: trade.conditionId || trade.condition_id,
          condition_id: trade.conditionId || trade.condition_id,
          market_slug: trade.marketSlug || trade.slug,
          slug: trade.marketSlug || trade.slug,
          title: trade.title || trade.question || trade.market,
          question: trade.title || trade.question || trade.market,
          tx_hash: trade.txHash || trade.tx_hash,
          transactionHash: trade.txHash || trade.tx_hash,
          token_id: trade.asset || trade.tokenId || trade.token_id,
          tokenId: trade.asset || trade.tokenId || trade.token_id,
          asset: trade.asset,
          user: wallet,
          wallet: wallet,
          _followedWallet: wallet,
          // Fire indicators (which metrics are exceptional)
          _fireReasons: fireReasons,
          _fireScore: fireReasons.length,
          _fireWinRate: winRate,
          _fireRoi: roiPct,
          _fireConviction: conviction,
          _traderPnl: traderPnl,
          // PolySignal scoring (FT-learnings based)
          _polySignalScore: polySignal.score,
          _polySignalRecommendation: polySignal.recommendation,
          _polySignalFactors: polySignal.factors,
          _polySignalIndicators: polySignal.indicators,
          raw: trade,
        });
      }
    }

    // Sort by most recent first
    fireTrades.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    // For wallets not on leaderboard, use truncated address as display name
    fireTrades.forEach((t: any) => {
      const w = t.wallet;
      if (w && !traderNames[w]) {
        traderNames[w] = `${w.slice(0, 6)}...${w.slice(-4)}`;
      }
    });

    console.log(`[fire-feed] Returning ${fireTrades.length} filtered trades (BUY/STRONG_BUY only)`);
    console.log(`[fire-feed] PolySignal distribution: ${(debugStats as any).polySignalStrongBuy} STRONG_BUY, ${(debugStats as any).polySignalBuy} BUY, ${(debugStats as any).polySignalNeutral} NEUTRAL, ${(debugStats as any).polySignalAvoid} AVOID, ${(debugStats as any).polySignalToxic} TOXIC`);
    console.log(`[fire-feed] Debug stats:`, JSON.stringify(debugStats, null, 2));
    if (rejectedSamples.length > 0) {
      console.log(`[fire-feed] Sample rejected trades:`, JSON.stringify(rejectedSamples, null, 2));
    }
    if (fireTrades.length > 0) {
      console.log(`[fire-feed] Sample passed trade:`, JSON.stringify({
        wallet: fireTrades[0].wallet?.slice(0, 10),
        polySignalScore: fireTrades[0]._polySignalScore,
        polySignalRec: fireTrades[0]._polySignalRecommendation,
        fireReasons: fireTrades[0]._fireReasons,
        winRate: fireTrades[0]._fireWinRate,
        roi: fireTrades[0]._fireRoi,
        conviction: fireTrades[0]._fireConviction,
      }));
    }

    // Add rejected samples to debug for troubleshooting
    const debugWithSamples = {
      ...debugStats,
      rejectedSamples: rejectedSamples.slice(0, 3),
      samplePassedTrade: fireTrades.length > 0 ? {
        wallet: fireTrades[0].wallet?.slice(0, 10),
        polySignalScore: fireTrades[0]._polySignalScore,
        polySignalRec: fireTrades[0]._polySignalRecommendation,
        fireReasons: fireTrades[0]._fireReasons,
        winRate: fireTrades[0]._fireWinRate,
        roi: fireTrades[0]._fireRoi,
        conviction: fireTrades[0]._fireConviction,
      } : null,
    };

    return NextResponse.json({
      trades: fireTrades,
      traders: traderNames,
      stats: Object.fromEntries(statsMap),
      debug: debugWithSamples,
    });
  } catch (error: any) {
    console.error('[fire-feed] Error:', error);
    debugStats.errors.push(error.message || 'Unknown error');
    return NextResponse.json({
      trades: [],
      traders: {},
      stats: {},
      debug: debugStats,
      error: error.message || 'Failed to fetch FIRE feed',
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
