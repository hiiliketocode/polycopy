import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
// Note: FIRE_TOP_TRADERS_LIMIT removed - now includes ALL traders
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
  // ROI can be stored as decimal (0.15 = 15%) or percentage (15 = 15%)
  // Based on audit: ROI is stored as decimal in BigQuery, but Supabase might differ
  // If value > 10, assume it's a percentage (e.g., 15% = 15) and convert to decimal (0.15)
  // Threshold of 10 is safe: 10% ROI as percentage = 10, as decimal = 0.10
  // Values > 10 are very unlikely to be decimals (would be >1000% ROI)
  if (Math.abs(value) > 10) return value / 100;
  // If value is between -10 and 10, assume it's already a decimal
  return value;
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
  
  // If category is provided, try to find matching profile first
  if (category && stats.profiles && stats.profiles.length > 0) {
    const normalizedCategory = category.toLowerCase();
    const matchingProfile = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });

    if (matchingProfile) {
      // Try multiple field names for win rate
      const profileWinRate =
        normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
        normalizeWinRateValue(matchingProfile?.win_rate) ??
        normalizeWinRateValue(matchingProfile?.l_win_rate);
      if (profileWinRate !== null && !Number.isNaN(profileWinRate)) {
        return profileWinRate;
      }
    }
  }

  // Fallback to global stats (always use this if no category or no matching profile)
  const globalWinRate = normalizeWinRateValue(stats.globalWinRate);
  if (globalWinRate !== null && !Number.isNaN(globalWinRate)) {
    return globalWinRate;
  }
  return null;
}

function roiForTradeType(
  stats: any,
  category?: string
): number | null {
  if (!stats) return null;
  
  // If category is provided, try to find matching profile first
  if (category && stats.profiles && stats.profiles.length > 0) {
    const normalizedCategory = category.toLowerCase();
    const matchingProfile = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });

    if (matchingProfile) {
      const roi =
        matchingProfile?.d30_roi_pct ??
        matchingProfile?.roi_pct ??
        matchingProfile?.l_total_roi_pct ??
        matchingProfile?.d30_total_roi_pct ??
        null;
      if (roi !== null && roi !== undefined) {
        return normalizeRoiValue(roi);
      }
    }
  }

  // Fallback to global stats (always use this if no category or no matching profile)
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined) {
    return normalizeRoiValue(stats.globalRoiPct);
  }
  return null;
}

function convictionMultiplierForTrade(
  trade: any,
  stats: any
): number | null {
  if (!stats) return null;
  
  const size = Number(trade.shares_normalized ?? trade.size ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price) || size <= 0 || price <= 0) return null;
  const tradeValue = size * price;
  if (tradeValue <= 0) return null;
  
  // Prefer 30-day average (more recent, less inflated)
  // Fallback to lifetime average, then position size average
  const avgBetSize = pickNumber(
    stats?.d30_avg_trade_size_usd,
    stats?.l_avg_trade_size_usd,
    stats?.avgBetSizeUsd,
    stats?.l_avg_pos_size_usd
  );
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  // Safety cap: don't let average be more than 5x current trade
  // This prevents inflated averages from making conviction appear artificially low
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  const conviction = tradeValue / cappedAvgBetSize;
  
  // Validate conviction is a reasonable number
  if (!Number.isFinite(conviction) || conviction <= 0) return null;
  
  // Log if we had to cap (only in development)
  if (process.env.NODE_ENV === 'development' && cappedAvgBetSize !== avgBetSize) {
    console.log('[fire-feed] Capped avg bet size for conviction:', {
      wallet: trade.wallet_address?.substring(0, 10),
      tradeValue,
      originalAvg: avgBetSize,
      cappedAvg: cappedAvgBetSize,
      conviction,
    });
  }
  
  return conviction;
}

// Helper to pick first valid number from multiple options
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

export async function GET(request: Request) {
  try {
    // Validate Supabase configuration
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    // 1. Fetch all recent trades (30 days) and get unique wallet addresses
    // No longer limited to top 100 traders - includes ALL traders
    console.log('[fire-feed] Fetching all trades from last 30 days...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: allTradesData, error: allTradesError } = await supabase
      .from('trades')
      .select('wallet_address')
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .eq('side', 'BUY') // Only BUY trades for FIRE feed
      .limit(10000); // Get enough to find unique wallets
    
    if (allTradesError) {
      console.error('Error fetching trades for wallet extraction:', allTradesError);
      return NextResponse.json({ trades: [], traders: {} });
    }

    // Extract unique wallet addresses
    const walletsSet = new Set<string>();
    (allTradesData || []).forEach((trade: any) => {
      const wallet = (trade.wallet_address || '').toLowerCase();
      if (wallet) {
        walletsSet.add(wallet);
      }
    });
    
    const wallets = Array.from(walletsSet);
    console.log(`[fire-feed] Found ${wallets.length} unique traders with trades in last 30 days`);

    if (wallets.length === 0) {
      return NextResponse.json({ trades: [], traders: {} });
    }

    // Build trader meta from wallet addresses (will be enriched later if needed)
    const traderMeta: Record<string, { displayName: string }> = {};
    wallets.forEach((wallet) => {
      traderMeta[wallet] = { 
        displayName: wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown'
      };
    });

    // 2. Fetch stats for all traders in parallel from Supabase
    // Include both d30_* (30-day) and l_* (lifetime) fields for fallback
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
      console.error('Error fetching global stats:', globalsRes.error);
    }
    if (profilesRes.error) {
      console.error('Error fetching profile stats:', profilesRes.error);
    }

    const globals = globalsRes.error ? [] : globalsRes.data || [];
    const profiles = profilesRes.error ? [] : profilesRes.data || [];

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
          normalizeWinRateValue(row.d30_win_rate) ?? // 30-day preferred
          normalizeWinRateValue(row.l_win_rate) ?? // lifetime fallback
          normalizeWinRateValue(row.recent_win_rate) ??
          normalizeWinRateValue(row.global_win_rate),
        globalRoiPct:
          normalizeRoiValue(row.d30_total_roi_pct) ?? // 30-day preferred
          normalizeRoiValue(row.l_total_roi_pct) ?? // lifetime fallback
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

    // 3. Fetch recent trades from Supabase for all traders in ONE query
    // Use 30 days - same window as wallet extraction
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', wallets)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .eq('side', 'BUY') // Only BUY trades for FIRE feed
      .order('timestamp', { ascending: false })
      .limit(5000); // Increased limit since we're including all traders now

    if (tradesError) {
      console.error('Error fetching trades from Supabase:', tradesError);
      // Don't fail completely - return empty trades if query fails
      // This allows the feed to still work if trades table has issues
      console.warn('Continuing with empty trades due to Supabase error');
    }

    // 4. Group trades by wallet and limit per trader
    const tradesByWallet = new Map<string, any[]>();
    (tradesData || []).forEach((trade: any) => {
      const wallet = (trade.wallet_address || '').toLowerCase();
      if (!wallet) return;
      const list = tradesByWallet.get(wallet) ?? [];
      if (list.length < FIRE_TRADES_PER_TRADER) {
        list.push(trade);
        tradesByWallet.set(wallet, list);
      }
    });

    console.log(`[FIRE Feed] Processed ${wallets.length} traders, ${tradesData?.length || 0} trades, ${tradesByWallet.size} traders with trades`);
    console.log(`[FIRE Feed] Stats available for ${statsMap.size} traders`);
    
    // Log sample stats to verify data
    if (statsMap.size > 0) {
      const sampleWallet = Array.from(statsMap.keys())[0];
      const sampleStats = statsMap.get(sampleWallet);
      console.log(`[FIRE Feed] Sample stats for ${sampleWallet.slice(0, 10)}...:`, {
        globalWinRate: sampleStats?.globalWinRate,
        globalRoiPct: sampleStats?.globalRoiPct,
        d30_avg_trade_size_usd: sampleStats?.d30_avg_trade_size_usd,
        l_avg_trade_size_usd: sampleStats?.l_avg_trade_size_usd,
        profilesCount: sampleStats?.profiles?.length || 0,
      });
    }
    
    // Log sample trade to verify structure
    if (tradesData && tradesData.length > 0) {
      const sampleTrade = tradesData[0];
      console.log(`[FIRE Feed] Sample trade structure:`, {
        hasWallet: !!sampleTrade.wallet_address,
        hasConditionId: !!sampleTrade.condition_id,
        hasPrice: !!sampleTrade.price,
        hasSize: !!(sampleTrade.shares_normalized || sampleTrade.size),
        hasCategory: !!(sampleTrade.category || sampleTrade.market_category),
        category: sampleTrade.category || sampleTrade.market_category || 'undefined',
      });
    }

    // 5. Filter trades based on FIRE criteria
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
    
    for (const [wallet, trades] of tradesByWallet.entries()) {
      const stats = statsMap.get(wallet);
      if (!stats) {
        debugStats.tradersWithoutStats++;
        // Log first few missing stats for debugging
        if (debugStats.tradersWithoutStats <= 3) {
          console.warn(`[FIRE Feed] Trader ${wallet.slice(0, 10)}... has no stats, skipping ${trades.length} trades`);
        }
        continue;
      }

      for (const trade of trades) {
        debugStats.tradesChecked++;
        const category = deriveCategoryFromTrade(trade);
        const winRate = winRateForTradeType(stats, category);
        const roiPct = roiForTradeType(stats, category);
        const conviction = convictionMultiplierForTrade(trade, stats);
        
        // Track null stats for debugging
        if (winRate === null) debugStats.tradesWithNullWinRate++;
        if (roiPct === null) debugStats.tradesWithNullRoi++;
        if (conviction === null) debugStats.tradesWithNullConviction++;
        if (winRate === null && roiPct === null && conviction === null) {
          debugStats.tradesWithAllNull++;
          // Store first trade with all null stats for debugging
          if (!debugStats.sampleRejectedTrade) {
            debugStats.sampleRejectedTrade = {
              wallet: wallet.slice(0, 10) + '...',
              conditionId: trade.condition_id?.slice(0, 20) + '...',
              category: category || 'undefined',
              hasCategory: !!category,
              winRate,
              roiPct,
              conviction,
              stats: {
                globalWinRate: stats.globalWinRate,
                globalRoiPct: stats.globalRoiPct,
                avgBetSizeUsd: stats.avgBetSizeUsd,
                d30_avg_trade_size_usd: stats.d30_avg_trade_size_usd,
                l_avg_trade_size_usd: stats.l_avg_trade_size_usd,
                profilesCount: stats.profiles?.length || 0,
                tradeValue: Number(trade.shares_normalized ?? trade.size ?? 0) * Number(trade.price ?? 0),
              },
            };
          }
        }
        
        // ROI and win rate are normalized to decimals (0.15 = 15%), so compare directly
        // Use OR logic: trade passes if it meets ANY criteria
        const meetsWinRate = winRate !== null && !Number.isNaN(winRate) && winRate >= FIRE_WIN_RATE_THRESHOLD;
        const meetsRoi = roiPct !== null && !Number.isNaN(roiPct) && roiPct >= FIRE_ROI_THRESHOLD;
        const meetsConviction = conviction !== null && !Number.isNaN(conviction) && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
        
        // Log first few trades that don't meet criteria for debugging
        if (!meetsWinRate && !meetsRoi && !meetsConviction && debugStats.tradesChecked <= 10) {
          console.log(`[FIRE Feed] Trade ${debugStats.tradesChecked} rejected:`, {
            wallet: wallet.slice(0, 10) + '...',
            category: category || 'undefined',
            winRate: winRate !== null ? `${(winRate * 100).toFixed(1)}%` : 'null',
            roiPct: roiPct !== null ? `${(roiPct * 100).toFixed(1)}%` : 'null',
            conviction: conviction !== null ? `${conviction.toFixed(2)}x` : 'null',
            thresholds: {
              winRate: `${(FIRE_WIN_RATE_THRESHOLD * 100).toFixed(0)}%`,
              roi: `${(FIRE_ROI_THRESHOLD * 100).toFixed(0)}%`,
              conviction: `${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}x`,
            },
            meetsWinRate,
            meetsRoi,
            meetsConviction,
            rawStats: {
              globalWinRate: stats.globalWinRate,
              globalRoiPct: stats.globalRoiPct,
              profilesCount: stats.profiles?.length || 0,
            },
          });
        }
        
        if (meetsWinRate || meetsConviction || meetsRoi) {
          debugStats.tradesPassed++;
          if (meetsWinRate) debugStats.passedByWinRate++;
          if (meetsRoi) debugStats.passedByRoi++;
          if (meetsConviction) debugStats.passedByConviction++;
          const reasons: string[] = [];
          if (meetsWinRate) reasons.push('win_rate');
          if (meetsConviction) reasons.push('conviction');
          if (meetsRoi) reasons.push('roi');
          
          // Format trade for frontend - match expected format from Polymarket API
          const tradeTimestamp = new Date(trade.timestamp).getTime();
          const formattedTrade = {
            // Core trade fields
            id: trade.id || trade.tx_hash,
            timestamp: tradeTimestamp / 1000, // Unix seconds (frontend will convert to ms)
            side: trade.side || 'BUY',
            size: Number(trade.shares_normalized || trade.size || 0),
            amount: Number(trade.shares_normalized || trade.size || 0),
            price: Number(trade.price || 0),
            outcome: trade.token_label || 'YES',
            option: trade.token_label || 'YES',
            // Market fields
            conditionId: trade.condition_id,
            condition_id: trade.condition_id,
            market_slug: trade.market_slug,
            slug: trade.market_slug,
            title: trade.title,
            question: trade.title,
            category: undefined, // Will be derived from market data if needed
            market_category: undefined,
            // Transaction fields
            tx_hash: trade.tx_hash,
            transactionHash: trade.tx_hash,
            order_hash: trade.order_hash,
            // Token fields
            token_id: trade.token_id,
            tokenId: trade.token_id,
            asset: trade.token_id,
            asset_id: trade.token_id,
            // User fields
            user: wallet,
            wallet: wallet,
            _followedWallet: wallet,
            // FIRE feed specific
            _fireReasons: reasons,
            _fireScore: reasons.length,
            // Add computed stats for consistency
            _fireWinRate: winRate,
            _fireRoi: roiPct,
            _fireConviction: conviction,
            // Raw data for reference
            raw: trade.raw || trade,
          };
          
          fireTrades.push(formattedTrade);
        }
      }
    }

    // 6. Sort by timestamp (most recent first)
    // Timestamp is in Unix seconds, so compare directly
    fireTrades.sort((a: any, b: any) => {
      const tsA = Number(a.timestamp) || 0;
      const tsB = Number(b.timestamp) || 0;
      return tsB - tsA;
    });

    // 7. Build trader names map
    const traderNames: Record<string, string> = {};
    wallets.forEach((wallet) => {
      const meta = traderMeta[wallet];
      traderNames[wallet] = meta?.displayName || (wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown');
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
      console.warn(`[FIRE Feed] Trades passed by: Win Rate: ${debugStats.passedByWinRate}, ROI: ${debugStats.passedByRoi}, Conviction: ${debugStats.passedByConviction}`);
      if (debugStats.sampleRejectedTrade) {
        console.warn('[FIRE Feed] Sample rejected trade:', JSON.stringify(debugStats.sampleRejectedTrade, null, 2));
      }
      
      // Log sample stats to help diagnose
      if (statsMap.size > 0) {
        const sampleWallets = Array.from(statsMap.keys()).slice(0, 5);
        sampleWallets.forEach((sampleWallet) => {
          const sampleStats = statsMap.get(sampleWallet);
          const sampleTrades = tradesByWallet.get(sampleWallet) || [];
          const sampleTrade = sampleTrades[0];
          const sampleCategory = sampleTrade ? deriveCategoryFromTrade(sampleTrade) : undefined;
          const sampleWinRate = sampleTrade ? winRateForTradeType(sampleStats, sampleCategory) : null;
          const sampleRoi = sampleTrade ? roiForTradeType(sampleStats, sampleCategory) : null;
          const sampleConviction = sampleTrade ? convictionMultiplierForTrade(sampleTrade, sampleStats) : null;
          console.warn(`[FIRE Feed] Sample trader ${sampleWallet.slice(0, 10)}...:`, {
            globalWinRate: sampleStats?.globalWinRate,
            globalRoiPct: sampleStats?.globalRoiPct,
            avgBetSizeUsd: sampleStats?.avgBetSizeUsd,
            d30_avg_trade_size_usd: sampleStats?.d30_avg_trade_size_usd,
            l_avg_trade_size_usd: sampleStats?.l_avg_trade_size_usd,
            profilesCount: sampleStats?.profiles?.length || 0,
            tradesCount: sampleTrades.length,
            sampleTradeCategory: sampleCategory || 'undefined',
            sampleWinRate: sampleWinRate !== null ? `${(sampleWinRate * 100).toFixed(1)}%` : 'null',
            sampleRoi: sampleRoi !== null ? `${(sampleRoi * 100).toFixed(1)}%` : 'null',
            sampleConviction: sampleConviction !== null ? `${sampleConviction.toFixed(2)}x` : 'null',
            meetsWinRate: sampleWinRate !== null && sampleWinRate >= FIRE_WIN_RATE_THRESHOLD,
            meetsRoi: sampleRoi !== null && sampleRoi >= FIRE_ROI_THRESHOLD,
            meetsConviction: sampleConviction !== null && sampleConviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD,
          });
        });
      }
    }

    return NextResponse.json({
      trades: fireTrades,
      traders: traderNames,
      stats: Object.fromEntries(statsMap), // Include stats for frontend use
      debug: process.env.NODE_ENV === 'development' ? debugStats : undefined,
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
