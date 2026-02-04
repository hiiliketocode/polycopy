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
  const normalizedCategory = category?.toLowerCase() ?? '';

  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const matchingProfile = stats.profiles.find((profile: any) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });

    const profileWinRate =
      normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
      normalizeWinRateValue(matchingProfile?.win_rate);
    if (profileWinRate !== null) {
      return profileWinRate;
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
    if (roi !== null && roi !== undefined && Number.isFinite(Number(roi))) {
      return Number(roi);
    }
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined && Number.isFinite(Number(stats.globalRoiPct))) {
    return Number(stats.globalRoiPct);
  }
  return null;
}

function convictionMultiplierForTrade(
  trade: any,
  stats: any
): number | null {
  const size = Number(trade.shares_normalized ?? trade.size ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price)) return null;
  const tradeValue = size * price;
  
  // Prefer 30-day average (more recent, less inflated)
  // Fallback to lifetime average
  const avgBetSize = pickNumber(
    stats?.d30_avg_trade_size_usd,
    stats?.avgBetSizeUsd,
    stats?.l_avg_trade_size_usd
  );
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  // Safety cap: don't let average be more than 5x current trade
  // This prevents inflated averages from making conviction appear artificially low
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  const conviction = tradeValue / cappedAvgBetSize;
  
  // Log if we had to cap
  if (cappedAvgBetSize !== avgBetSize) {
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
function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    const num = typeof v === 'string' ? Number(v) : v;
    if (typeof num === 'number' && Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    // Validate Supabase configuration
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Supabase configuration missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
    }

    // 1. Fetch top traders from leaderboard (call function directly, no HTTP fetch)
    console.log('[fire-feed] Fetching leaderboard traders...');
    const tradersRaw = await fetchPolymarketLeaderboard({
      limit: FIRE_TOP_TRADERS_LIMIT,
      orderBy: 'PNL',
      timePeriod: 'month',
      category: 'overall',
    });

    const wallets: string[] = tradersRaw
      .map((trader: any) => (trader.wallet || trader.proxyWallet || '').toLowerCase())
      .filter(Boolean)
      .slice(0, FIRE_TOP_TRADERS_LIMIT);

    if (wallets.length === 0) {
      return NextResponse.json({ trades: [], traders: {} });
    }

    const traderMeta: Record<string, { displayName: string }> = {};
    tradersRaw.forEach((trader: any) => {
      const w = (trader.wallet || trader.proxyWallet || '').toLowerCase();
      if (w) {
        traderMeta[w] = { displayName: trader.displayName || trader.userName || trader.username || '' };
      }
    });

    // 2. Fetch stats for all traders in parallel from Supabase
    const [globalsRes, profilesRes] = await Promise.all([
      supabase
        .from('trader_global_stats')
        .select('wallet_address, global_win_rate, recent_win_rate, d30_win_rate, d30_total_roi_pct, global_roi_pct, avg_bet_size_usdc, d30_avg_trade_size_usd, l_avg_trade_size_usd')
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
          normalizeWinRateValue(row.d30_win_rate) ??
          normalizeWinRateValue(row.recent_win_rate) ??
          normalizeWinRateValue(row.global_win_rate),
        globalRoiPct:
          Number.isFinite(Number(row.d30_total_roi_pct)) ? Number(row.d30_total_roi_pct) :
          Number.isFinite(Number(row.global_roi_pct)) ? Number(row.global_roi_pct) :
          null,
        avgBetSizeUsd:
          typeof row.avg_bet_size_usdc === 'number'
            ? row.avg_bet_size_usdc
            : Number(row.avg_bet_size_usdc) || null,
        d30_avg_trade_size_usd:
          typeof row.d30_avg_trade_size_usd === 'number'
            ? row.d30_avg_trade_size_usd
            : Number(row.d30_avg_trade_size_usd) || null,
        l_avg_trade_size_usd:
          typeof row.l_avg_trade_size_usd === 'number'
            ? row.l_avg_trade_size_usd
            : Number(row.l_avg_trade_size_usd) || null,
        profiles: profilesByWallet.get(wallet) || [],
      });
    });

    // 3. Fetch recent trades from Supabase for all traders in ONE query
    // Use 30 days to match the "top 30-day ROI traders" concept
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: tradesData, error: tradesError } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', wallets)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .eq('side', 'BUY') // Only BUY trades for FIRE feed
      .order('timestamp', { ascending: false })
      .limit(2000); // Get more trades to filter from

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
              category,
              stats: {
                globalWinRate: stats.globalWinRate,
                globalRoiPct: stats.globalRoiPct,
                avgBetSizeUsd: stats.avgBetSizeUsd,
                d30_avg_trade_size_usd: stats.d30_avg_trade_size_usd,
                profilesCount: stats.profiles?.length || 0,
              },
            };
          }
        }
        
        // ROI is stored as decimal (0.15 = 15%), so compare directly
        const meetsWinRate = winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD;
        const meetsRoi = roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD;
        const meetsConviction = conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
        
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
    console.log(`[FIRE Feed] Filter thresholds: Win Rate ≥${FIRE_WIN_RATE_THRESHOLD}, ROI ≥${FIRE_ROI_THRESHOLD}, Conviction ≥${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}`);
    console.log(`[FIRE Feed] Returning ${fireTrades.length} filtered trades`);
    
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
