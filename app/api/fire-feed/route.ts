import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!serviceKey,
  });
}

const supabase = createClient(supabaseUrl || '', serviceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Thresholds matching feed/page.tsx
const FIRE_TOP_TRADERS_LIMIT = 100;
const FIRE_TRADES_PER_TRADER = 10;
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
  if (Math.abs(value) > 10) return value / 100;
  return value;
}

function pickNumber(...values: Array<number | null | undefined | string>): number | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v) && v > 0) return v;
      continue;
    }
    if (typeof v === 'string') {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) return num;
      continue;
    }
  }
  return null;
}

function deriveCategoryFromTrade(trade: any): string | undefined {
  const candidates = [
    trade.category,
    trade.market_category,
    trade.marketCategory,
    trade.market?.category,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
}

function winRateForTradeType(
  stats: any,
  category?: string
): number | null {
  if (!stats) return null;
  
  if (category && stats.profiles && stats.profiles.length > 0) {
    const normalizedCategory = category.toLowerCase();
    const matchingProfile = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });

    if (matchingProfile) {
      const profileWinRate =
        normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
        normalizeWinRateValue(matchingProfile?.win_rate);
      if (profileWinRate !== null) {
        return profileWinRate;
      }
    }
  }

  const globalWinRate = normalizeWinRateValue(stats.globalWinRate);
  return globalWinRate;
}

function roiForTradeType(
  stats: any,
  category?: string
): number | null {
  if (!stats) return null;
  const normalizedCategory = category?.toLowerCase() ?? '';
  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const match = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });
    const roi =
      match?.d30_roi_pct ??
      match?.roi_pct ??
      null;
    if (roi !== null && roi !== undefined) {
      return normalizeRoiValue(roi);
    }
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined) {
    return normalizeRoiValue(stats.globalRoiPct);
  }
  return null;
}

function convictionMultiplierForTrade(
  trade: any,
  stats: any
): number | null {
  const size = Number(trade.size ?? trade.shares_normalized ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price)) return null;
  const tradeValue = size * price;
  
  const avgBetSize = pickNumber(
    stats?.d30_avg_trade_size_usd,
    stats?.avgBetSizeUsd,
    stats?.l_avg_trade_size_usd
  );
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  const conviction = tradeValue / cappedAvgBetSize;
  
  if (!Number.isFinite(conviction) || conviction <= 0) return null;
  
  return conviction;
}

export async function GET(request: Request) {
  try {
    // Validate Supabase configuration
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    console.log('[fire-feed] Starting fire feed fetch...');

    // 1. Fetch top traders from leaderboard
    console.log(`[fire-feed] Fetching top ${FIRE_TOP_TRADERS_LIMIT} traders from leaderboard...`);
    const topTraders = await fetchPolymarketLeaderboard({
      timePeriod: 'month',
      orderBy: 'PNL',
      limit: FIRE_TOP_TRADERS_LIMIT,
      category: 'overall',
    });

    console.log(`[fire-feed] Found ${topTraders.length} top traders`);

    if (topTraders.length === 0) {
      return NextResponse.json({ 
        trades: [], 
        traders: {},
        stats: {},
        debug: process.env.NODE_ENV === 'development' ? {
          tradersChecked: 0,
          tradesChecked: 0,
          tradesPassed: 0,
        } : undefined,
      });
    }

    const wallets = topTraders.map(t => t.wallet.toLowerCase()).filter(Boolean);
    console.log(`[fire-feed] Processing ${wallets.length} wallets`);

    // 2. Fetch stats for all traders from Supabase
    console.log('[fire-feed] Fetching trader stats from Supabase...');
    const [globalsRes, profilesRes] = await Promise.all([
      supabase
        .from('trader_global_stats')
        .select('wallet_address, l_win_rate, d30_win_rate, l_total_roi_pct, d30_total_roi_pct, l_avg_trade_size_usd, d30_avg_trade_size_usd, l_avg_pos_size_usd, global_win_rate, recent_win_rate, global_roi_pct, avg_bet_size_usdc')
        .in('wallet_address', wallets),
      supabase
        .from('trader_profile_stats')
        .select('wallet_address, final_niche, bet_structure, price_bracket, win_rate, d30_win_rate, roi_pct, d30_roi_pct, d30_count, trade_count')
        .in('wallet_address', wallets),
    ]);

    if (globalsRes.error) {
      console.error('[fire-feed] Error fetching global stats:', globalsRes.error);
    }
    if (profilesRes.error) {
      console.error('[fire-feed] Error fetching profile stats:', profilesRes.error);
    }

    const globals = globalsRes.error ? [] : globalsRes.data || [];
    const profiles = profilesRes.error ? [] : profilesRes.data || [];

    console.log(`[fire-feed] Stats: ${globals.length} global, ${profiles.length} profile records`);

    // Build stats map
    const statsMap = new Map<string, any>();
    const profilesByWallet = new Map<string, any[]>();
    
    profiles.forEach((row: any) => {
      const wallet = (row.wallet_address || '').toLowerCase();
      if (!wallet) return;
      const list = profilesByWallet.get(wallet) ?? [];
      list.push(row);
      profilesByWallet.set(wallet, list);
    });

    globals.forEach((row: any) => {
      const wallet = (row.wallet_address || '').toLowerCase();
      if (!wallet) return;
      statsMap.set(wallet, {
        globalWinRate:
          normalizeWinRateValue(row.d30_win_rate) ??
          normalizeWinRateValue(row.l_win_rate) ??
          normalizeWinRateValue(row.recent_win_rate) ??
          normalizeWinRateValue(row.global_win_rate),
        globalRoiPct:
          normalizeRoiValue(row.d30_total_roi_pct) ??
          normalizeRoiValue(row.l_total_roi_pct) ??
          normalizeRoiValue(row.global_roi_pct),
        avgBetSizeUsd: pickNumber(
          row.avg_bet_size_usdc,
          row.d30_avg_trade_size_usd,
          row.l_avg_trade_size_usd,
          row.l_avg_pos_size_usd
        ),
        d30_avg_trade_size_usd: pickNumber(row.d30_avg_trade_size_usd),
        l_avg_trade_size_usd: pickNumber(row.l_avg_trade_size_usd),
        l_avg_pos_size_usd: pickNumber(row.l_avg_pos_size_usd),
        profiles: profilesByWallet.get(wallet) || [],
      });
    });

    console.log(`[fire-feed] Stats available for ${statsMap.size} traders`);

    // 3. Fetch trades from Polymarket API for each trader
    console.log('[fire-feed] Fetching trades from Polymarket API...');
    const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
    console.log(`[fire-feed] Filtering trades since: ${new Date(thirtyDaysAgoMs).toISOString()}`);
    
    let totalTradesFetched = 0;
    let totalTradesAfterFilter = 0;
    
    const tradePromises = wallets.slice(0, FIRE_TOP_TRADERS_LIMIT).map(async (wallet, index) => {
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?user=${encodeURIComponent(wallet)}&limit=${FIRE_TRADES_PER_TRADER * 2}`, // Fetch more to filter
          { 
            cache: 'no-store',
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          if (index < 5) {
            console.warn(`[fire-feed] Failed to fetch trades for ${wallet.slice(0, 10)}...: ${response.status}`, errorText.slice(0, 200));
          }
          return [];
        }

        const trades = await response.json();
        if (!Array.isArray(trades)) {
          if (index < 5) {
            console.warn(`[fire-feed] Non-array response for ${wallet.slice(0, 10)}...:`, typeof trades, trades);
          }
          return [];
        }
        
        if (trades.length === 0 && index < 5) {
          console.log(`[fire-feed] No trades returned from Polymarket API for ${wallet.slice(0, 10)}...`);
        }

        totalTradesFetched += trades.length;

        // Filter to last 30 days and BUY trades only
        // Handle timestamp: Polymarket can return seconds or milliseconds
        const filteredTrades = trades
          .filter((trade: any) => {
            if (trade.side !== 'BUY') return false;
            
            let timestamp = typeof trade.timestamp === 'string' 
              ? parseInt(trade.timestamp) 
              : trade.timestamp;
            
            // Convert to milliseconds if it's in seconds (< 10000000000 = before year 2001)
            if (timestamp < 10000000000) {
              timestamp = timestamp * 1000;
            }
            
            const isRecent = timestamp >= thirtyDaysAgoMs;
            
            if (index < 3 && trades.length > 0) {
              console.log(`[fire-feed] Sample trade for ${wallet.slice(0, 10)}...:`, {
                side: trade.side,
                rawTimestamp: trade.timestamp,
                parsedTimestamp: timestamp,
                timestampDate: new Date(timestamp).toISOString(),
                thirtyDaysAgo: new Date(thirtyDaysAgoMs).toISOString(),
                isRecent,
              });
            }
            
            return isRecent;
          })
          .slice(0, FIRE_TRADES_PER_TRADER);
        
        totalTradesAfterFilter += filteredTrades.length;
        
        if (index < 3 && filteredTrades.length > 0) {
          console.log(`[fire-feed] ${wallet.slice(0, 10)}...: ${trades.length} total trades, ${filteredTrades.length} after filter`);
        }
        
        return filteredTrades;
      } catch (error) {
        if (index < 3) {
          console.warn(`[fire-feed] Error fetching trades for ${wallet.slice(0, 10)}...:`, error);
        }
        return [];
      }
    });

    const allTradesResults = await Promise.all(tradePromises);
    const tradesByWallet = new Map<string, any[]>();
    
    wallets.forEach((wallet, index) => {
      const trades = allTradesResults[index] || [];
      if (trades.length > 0) {
        tradesByWallet.set(wallet, trades);
      }
    });

    console.log(`[fire-feed] Summary: ${totalTradesFetched} total trades fetched, ${totalTradesAfterFilter} after 30-day filter`);
    console.log(`[fire-feed] Fetched trades for ${tradesByWallet.size} traders`);
    
    // Add summary to debug stats (before filtering loop updates tradersWithoutStats)
    debugStats.summary = {
      tradersChecked: wallets.length,
      tradersWithStats: statsMap.size,
      totalTradesFetched,
      totalTradesAfterFilter,
      tradersWithTrades: tradesByWallet.size,
    };
    
    if (tradesByWallet.size === 0) {
      console.warn('[fire-feed] ⚠️  No trades found after filtering!');
      console.warn(`[fire-feed] Checked ${wallets.length} traders, fetched ${totalTradesFetched} trades`);
      console.warn(`[fire-feed] Possible issues:`);
      console.warn(`  - All trades are older than 30 days`);
      console.warn(`  - All trades are SELL (not BUY)`);
      console.warn(`  - Timestamp format mismatch`);
      console.warn(`  - Polymarket API returning empty results`);
    }

    // 4. Filter trades based on FIRE criteria
    const fireTrades: any[] = [];
    const debugStats = {
      tradersWithoutStats: 0,
      tradesChecked: 0,
      tradesPassed: 0,
      passedByWinRate: 0,
      passedByRoi: 0,
      passedByConviction: 0,
      tradesWithNullWinRate: 0,
      tradesWithNullRoi: 0,
      tradesWithNullConviction: 0,
      tradesWithAllNull: 0,
      sampleRejectedTrade: null as any,
    };
    
    console.log(`[fire-feed] Starting to filter ${Array.from(tradesByWallet.values()).reduce((sum, t) => sum + t.length, 0)} trades through thresholds...`);
    
    for (const [wallet, trades] of tradesByWallet.entries()) {
      const stats = statsMap.get(wallet);
      if (!stats) {
        debugStats.tradersWithoutStats++;
        if (debugStats.tradersWithoutStats <= 3) {
          console.warn(`[fire-feed] Trader ${wallet.slice(0, 10)}... has no stats, skipping ${trades.length} trades`);
        }
        continue;
      }

      for (const trade of trades) {
        debugStats.tradesChecked++;
        const category = deriveCategoryFromTrade(trade);
        const winRate = winRateForTradeType(stats, category);
        const roiPct = roiForTradeType(stats, category);
        const conviction = convictionMultiplierForTrade(trade, stats);
        
        if (winRate === null) debugStats.tradesWithNullWinRate++;
        if (roiPct === null) debugStats.tradesWithNullRoi++;
        if (conviction === null) debugStats.tradesWithNullConviction++;
        if (winRate === null && roiPct === null && conviction === null) {
          debugStats.tradesWithAllNull++;
          if (!debugStats.sampleRejectedTrade) {
            debugStats.sampleRejectedTrade = {
              wallet: wallet.slice(0, 10) + '...',
              category: category || 'undefined',
              winRate,
              roiPct,
              conviction,
            };
          }
        }
        
        const meetsWinRate = winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD;
        const meetsRoi = roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD;
        const meetsConviction = conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
        
        // Log first few trades for debugging
        if (debugStats.tradesChecked <= 5) {
          console.log(`[fire-feed] Trade ${debugStats.tradesChecked}:`, {
            wallet: wallet.slice(0, 10) + '...',
            category: category || 'undefined',
            winRate: winRate !== null ? `${(winRate * 100).toFixed(1)}%` : 'null',
            roiPct: roiPct !== null ? `${(roiPct * 100).toFixed(1)}%` : 'null',
            conviction: conviction !== null ? `${conviction.toFixed(2)}x` : 'null',
            meetsWinRate,
            meetsRoi,
            meetsConviction,
            passes: meetsWinRate || meetsRoi || meetsConviction,
            thresholds: {
              winRate: `${(FIRE_WIN_RATE_THRESHOLD * 100).toFixed(0)}%`,
              roi: `${(FIRE_ROI_THRESHOLD * 100).toFixed(0)}%`,
              conviction: `${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}x`,
            },
          });
        }
        
        if (meetsWinRate || meetsRoi || meetsConviction) {
          debugStats.tradesPassed++;
          if (meetsWinRate) debugStats.passedByWinRate++;
          if (meetsRoi) debugStats.passedByRoi++;
          if (meetsConviction) debugStats.passedByConviction++;
          
          const reasons: string[] = [];
          if (meetsWinRate) reasons.push('win_rate');
          if (meetsConviction) reasons.push('conviction');
          if (meetsRoi) reasons.push('roi');
          
          let timestamp = typeof trade.timestamp === 'string' 
            ? parseInt(trade.timestamp) 
            : trade.timestamp;
          
          // Convert to milliseconds if needed
          if (timestamp < 10000000000) {
            timestamp = timestamp * 1000;
          }
          
          const formattedTrade = {
            id: trade.id || `${wallet}-${timestamp}`,
            timestamp: Math.floor(timestamp / 1000), // Unix seconds
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
            token_id: trade.tokenId || trade.token_id,
            tokenId: trade.tokenId || trade.token_id,
            user: wallet,
            wallet: wallet,
            _followedWallet: wallet,
            _fireReasons: reasons,
            _fireScore: reasons.length,
            _fireWinRate: winRate,
            _fireRoi: roiPct,
            _fireConviction: conviction,
            raw: trade,
          };
          
          fireTrades.push(formattedTrade);
        }
      }
    }

    // 5. Sort by timestamp (most recent first)
    fireTrades.sort((a: any, b: any) => {
      const tsA = Number(a.timestamp) || 0;
      const tsB = Number(b.timestamp) || 0;
      return tsB - tsA;
    });

    // 6. Build trader names map
    const traderNames: Record<string, string> = {};
    topTraders.forEach((trader) => {
      traderNames[trader.wallet.toLowerCase()] = trader.displayName;
    });

    console.log('[FIRE Feed] Debug stats:', debugStats);
    console.log(`[FIRE Feed] Filter thresholds: Win Rate ≥${(FIRE_WIN_RATE_THRESHOLD * 100).toFixed(0)}%, ROI ≥${(FIRE_ROI_THRESHOLD * 100).toFixed(0)}%, Conviction ≥${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}x`);
    console.log(`[FIRE Feed] Returning ${fireTrades.length} filtered trades`);
    console.log(`[FIRE Feed] Trades passed by: Win Rate: ${debugStats.passedByWinRate}, ROI: ${debugStats.passedByRoi}, Conviction: ${debugStats.passedByConviction}`);
    
    // Log detailed breakdown if no trades passed
    if (fireTrades.length === 0 && debugStats.tradesChecked > 0) {
      console.warn('[FIRE Feed] ⚠️  NO TRADES PASSED FILTERS');
      console.warn(`[FIRE Feed] Checked ${debugStats.tradesChecked} trades from ${tradesByWallet.size} traders`);
      console.warn(`[FIRE Feed] ${debugStats.tradersWithoutStats} traders had no stats`);
      console.warn(`[FIRE Feed] ${debugStats.tradesWithAllNull} trades had all null stats (winRate, roi, conviction)`);
      console.warn(`[FIRE Feed] ${debugStats.tradesWithNullWinRate} trades had null winRate`);
      console.warn(`[FIRE Feed] ${debugStats.tradesWithNullRoi} trades had null ROI`);
      console.warn(`[FIRE Feed] ${debugStats.tradesWithNullConviction} trades had null conviction`);
      if (debugStats.sampleRejectedTrade) {
        console.warn('[FIRE Feed] Sample rejected trade:', JSON.stringify(debugStats.sampleRejectedTrade, null, 2));
      }
    }

    return NextResponse.json({
      trades: fireTrades,
      traders: traderNames,
      stats: Object.fromEntries(statsMap),
      debug: debugStats, // Always include debug info
    });
  } catch (error: any) {
    console.error('Error fetching FIRE feed:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch FIRE feed',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
