import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Thresholds
const FIRE_TOP_TRADERS_LIMIT = 100;
const FIRE_TRADES_PER_TRADER = 15;
const FIRE_WIN_RATE_THRESHOLD = 0.55;
const FIRE_ROI_THRESHOLD = 0.15;
const FIRE_CONVICTION_MULTIPLIER_THRESHOLD = 2.5;

// PolySignal scoring thresholds for BUY/STRONG_BUY
const POLYSIGNAL_BUY_THRESHOLD = 60;
const POLYSIGNAL_STRONG_BUY_THRESHOLD = 75;

type PolySignalRecommendation = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' | 'TOXIC';

/**
 * Calculate PolySignal score for a trade
 * Simplified version of the client-side scoring for server-side filtering
 * 
 * Weights: Edge (50%) + Conviction (25%) + Skill (15%) + Context (10%)
 */
function calculatePolySignalScore(
  trade: any,
  stats: any,
  aiWinProb?: number
): { score: number; recommendation: PolySignalRecommendation; factors: any } {
  const price = Number(trade.price || 0);
  const size = Number(trade.size || trade.shares_normalized || 0);
  const tradeValue = price * size;
  
  // Use AI win prob if provided, otherwise estimate from price (conservative)
  const winProb = aiWinProb ?? price; // If no AI prob, assume fair market
  
  // Extract stats
  const nicheWinRate = stats?.profileWinRate ?? stats?.globalWinRate ?? 0.5;
  const totalTrades = stats?.profileTrades ?? stats?.globalTrades ?? 0;
  const avgBetSize = stats?.avgBetSizeUsd ?? tradeValue;
  const convictionMult = avgBetSize > 0 ? tradeValue / avgBetSize : 1;
  const isHot = stats?.isHot ?? false;
  const isHedging = stats?.isHedging ?? false;
  
  // ============================================================================
  // FACTOR 1: EDGE (50% weight)
  // ============================================================================
  const rawEdge = (winProb - price) * 100;
  const edgeContribution = Math.max(-25, Math.min(25, rawEdge * (25 / 15)));
  
  // ============================================================================
  // FACTOR 2: CONVICTION (25% weight)
  // ============================================================================
  let convictionContribution = 0;
  if (convictionMult >= 2.5) {
    convictionContribution = 20;
  } else if (convictionMult >= 2) {
    convictionContribution = 15;
  } else if (convictionMult >= 1.5) {
    convictionContribution = 10;
  } else if (convictionMult >= 1.2) {
    convictionContribution = 5;
  } else if (convictionMult < 0.5) {
    convictionContribution = -12;
  } else if (convictionMult < 0.7) {
    convictionContribution = -6;
  }
  
  // ============================================================================
  // FACTOR 3: SKILL (15% weight)
  // ============================================================================
  const skillDelta = (nicheWinRate - 0.50) * 100;
  let skillContribution = Math.max(-10, Math.min(15, skillDelta * 1.5));
  if (totalTrades < 5) {
    skillContribution = Math.min(skillContribution, 0); // Cap unproven traders
  }
  
  // ============================================================================
  // FACTOR 4: CONTEXT (10% weight)
  // ============================================================================
  let contextContribution = 0;
  if (isHot) contextContribution += 5;
  if (isHedging) contextContribution -= 15;
  if (totalTrades >= 30) contextContribution += 3;
  if (totalTrades < 5) contextContribution -= 5;
  contextContribution = Math.max(-10, Math.min(10, contextContribution));
  
  // ============================================================================
  // FINAL SCORE
  // ============================================================================
  const totalContribution = edgeContribution + convictionContribution + skillContribution + contextContribution;
  const finalScore = Math.max(0, Math.min(100, 50 + totalContribution));
  
  // Determine recommendation
  let recommendation: PolySignalRecommendation;
  
  // Hard overrides
  if (isHedging && rawEdge < 0) {
    recommendation = 'TOXIC';
  } else if (rawEdge < -15) {
    recommendation = 'TOXIC';
  } else if (nicheWinRate < 0.40 && totalTrades >= 15) {
    recommendation = 'TOXIC';
  } else if (finalScore >= POLYSIGNAL_STRONG_BUY_THRESHOLD) {
    recommendation = 'STRONG_BUY';
  } else if (finalScore >= POLYSIGNAL_BUY_THRESHOLD) {
    recommendation = 'BUY';
  } else if (finalScore >= 45) {
    recommendation = 'NEUTRAL';
  } else if (finalScore >= 30) {
    recommendation = 'AVOID';
  } else {
    recommendation = 'TOXIC';
  }
  
  return {
    score: Math.round(finalScore),
    recommendation,
    factors: {
      edge: { value: edgeContribution, rawEdge },
      conviction: { value: convictionContribution, multiplier: convictionMult },
      skill: { value: skillContribution, winRate: nicheWinRate, trades: totalTrades },
      context: { value: contextContribution, isHot, isHedging },
    },
  };
}

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
    const matchingProfile = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      return niche === normalizedCategory || niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });
    if (matchingProfile) {
      // Use actual column names: d30_win_rate, l_win_rate
      const profileWinRate = normalizeWinRateValue(matchingProfile?.d30_win_rate) ?? normalizeWinRateValue(matchingProfile?.l_win_rate);
      if (profileWinRate !== null) return profileWinRate;
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
    totalTradesFetched: 0,
    totalTradesAfterTimeFilter: 0,
    tradesChecked: 0,
    tradesPassed: 0,
    passedByWinRate: 0,
    passedByRoi: 0,
    passedByConviction: 0,
    passedByTopPnl: 0,
    tradersWithoutStats: 0,
    topTraderPnlRange: { min: 0, max: 0 },
    errors: [] as string[],
  };

  try {
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing');
    }

    console.log('[fire-feed] Starting...');

    // 1. Get top traders from leaderboard
    const topTraders = await fetchPolymarketLeaderboard({
      timePeriod: 'month',
      orderBy: 'PNL',
      limit: FIRE_TOP_TRADERS_LIMIT,
      category: 'overall',
    });

    debugStats.tradersChecked = topTraders.length;
    console.log(`[fire-feed] Found ${topTraders.length} top traders`);

    if (topTraders.length === 0) {
      return NextResponse.json({ 
        trades: [], 
        traders: {},
        stats: {},
        debug: debugStats,
      });
    }

    const wallets = topTraders.map(t => t.wallet.toLowerCase()).filter(Boolean);
    console.log(`[fire-feed] Processing ${wallets.length} wallets`);

    // 2. Fetch stats (but don't fail if none found)
    // NOTE: Column names must match actual database schema
    const [globalsRes, profilesRes] = await Promise.all([
      supabase.from('trader_global_stats')
        .select('wallet_address, l_win_rate, d30_win_rate, d7_win_rate, l_total_roi_pct, d30_total_roi_pct, d7_total_roi_pct, l_avg_trade_size_usd, d30_avg_trade_size_usd, d7_avg_trade_size_usd, l_avg_pos_size_usd')
        .in('wallet_address', wallets),
      supabase.from('trader_profile_stats')
        .select('wallet_address, final_niche, structure, bracket, l_win_rate, d30_win_rate, d7_win_rate, l_total_roi_pct, d30_total_roi_pct, d7_total_roi_pct')
        .in('wallet_address', wallets),
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
    console.log(`[fire-feed] Sample wallets queried: ${wallets.slice(0, 3).join(', ')}`);
    
    // Log first global stat record to verify data structure
    if (globals.length > 0) {
      console.log(`[fire-feed] First global stat record:`, JSON.stringify(globals[0]));
    }

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
          // Use d30 (30-day) stats first, then lifetime (l_) as fallback
          globalWinRate: normalizeWinRateValue(row.d30_win_rate) ?? normalizeWinRateValue(row.l_win_rate),
          globalRoiPct: normalizeRoiValue(row.d30_total_roi_pct) ?? normalizeRoiValue(row.l_total_roi_pct),
          avgBetSizeUsd: pickNumber(row.d30_avg_trade_size_usd, row.l_avg_trade_size_usd, row.l_avg_pos_size_usd),
          d30_avg_trade_size_usd: pickNumber(row.d30_avg_trade_size_usd),
          l_avg_trade_size_usd: pickNumber(row.l_avg_trade_size_usd),
          l_avg_pos_size_usd: pickNumber(row.l_avg_pos_size_usd),
          profiles: profilesByWallet.get(wallet) || [],
        });
      }
    });

    debugStats.tradersWithStats = statsMap.size;
    console.log(`[fire-feed] Stats available for ${statsMap.size} traders`);

    // 3. Fetch trades from Polymarket API (same as regular feed)
    const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const tradePromises = wallets.map(async (wallet) => {
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?limit=${FIRE_TRADES_PER_TRADER}&user=${wallet}`,
          { cache: 'no-store' }
        );
        
        if (!response.ok) {
          debugStats.errors.push(`Failed to fetch trades for ${wallet.slice(0, 10)}: ${response.status}`);
          return [];
        }
        
        const trades = await response.json();
        if (!Array.isArray(trades)) {
          debugStats.errors.push(`Non-array response for ${wallet.slice(0, 10)}`);
          return [];
        }
        
        debugStats.totalTradesFetched += trades.length;
        
        // Filter to BUY trades from last 30 days
        const filtered = trades.filter((trade: any) => {
          if (trade.side !== 'BUY') return false;
          let timestamp = typeof trade.timestamp === 'string' ? parseInt(trade.timestamp) : trade.timestamp;
          if (timestamp < 10000000000) timestamp = timestamp * 1000;
          return timestamp >= thirtyDaysAgoMs;
        });
        
        debugStats.totalTradesAfterTimeFilter += filtered.length;
        return filtered.map((trade: any) => ({ ...trade, _wallet: wallet }));
      } catch (error: any) {
        debugStats.errors.push(`Error for ${wallet.slice(0, 10)}: ${error.message}`);
        return [];
      }
    });

    const allTradesResults = await Promise.all(tradePromises);
    const allTrades = allTradesResults.flat();
    console.log(`[fire-feed] Fetched ${allTrades.length} trades total`);

    // 4. Process trades - apply PolySignal scoring and only return BUY or STRONG_BUY
    const fireTrades: any[] = [];
    let rejectedSamples: any[] = [];
    
    // Build a map of trader PNL from leaderboard for ranking
    const traderPnlMap = new Map<string, number>();
    let minPnl = Infinity, maxPnl = -Infinity;
    topTraders.forEach((trader) => {
      const pnl = trader.pnl || 0;
      traderPnlMap.set(trader.wallet.toLowerCase(), pnl);
      if (pnl < minPnl) minPnl = pnl;
      if (pnl > maxPnl) maxPnl = pnl;
    });
    debugStats.topTraderPnlRange = { min: Math.round(minPnl), max: Math.round(maxPnl) };
    console.log(`[fire-feed] Top trader PNL range: $${Math.round(minPnl)} to $${Math.round(maxPnl)}`);
    
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
      const polySignalStats = {
        profileWinRate: winRate,
        globalWinRate: stats?.globalWinRate ?? null,
        profileTrades: stats?.profiles?.length > 0 ? 10 : 0, // Estimate
        globalTrades: 20, // Estimate for top traders
        avgBetSizeUsd: stats?.avgBetSizeUsd ?? null,
        isHot: false, // Would need more data
        isHedging: false, // Would need more data
      };
      
      const polySignal = calculatePolySignalScore(trade, polySignalStats);
      
      // Track recommendation distribution
      if (polySignal.recommendation === 'STRONG_BUY') (debugStats as any).polySignalStrongBuy++;
      else if (polySignal.recommendation === 'BUY') (debugStats as any).polySignalBuy++;
      else if (polySignal.recommendation === 'NEUTRAL') (debugStats as any).polySignalNeutral++;
      else if (polySignal.recommendation === 'AVOID') (debugStats as any).polySignalAvoid++;
      else if (polySignal.recommendation === 'TOXIC') (debugStats as any).polySignalToxic++;
      
      // Only pass trades that are BUY or STRONG_BUY
      const passesPolySignal = polySignal.recommendation === 'BUY' || polySignal.recommendation === 'STRONG_BUY';
      
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
          // PolySignal scoring
          _polySignalScore: polySignal.score,
          _polySignalRecommendation: polySignal.recommendation,
          _polySignalFactors: polySignal.factors,
          raw: trade,
        });
      }
    }

    // Sort by timestamp
    fireTrades.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));

    // Build trader names
    const traderNames: Record<string, string> = {};
    topTraders.forEach((trader) => {
      traderNames[trader.wallet.toLowerCase()] = trader.displayName;
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
