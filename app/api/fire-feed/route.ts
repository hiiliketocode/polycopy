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
      const profileWinRate = normalizeWinRateValue(matchingProfile?.d30_win_rate) ?? normalizeWinRateValue(matchingProfile?.win_rate);
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
    const roi = match?.d30_roi_pct ?? match?.roi_pct ?? null;
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
  
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  const conviction = tradeValue / cappedAvgBetSize;
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
    const [globalsRes, profilesRes] = await Promise.all([
      supabase.from('trader_global_stats')
        .select('wallet_address, l_win_rate, d30_win_rate, l_total_roi_pct, d30_total_roi_pct, l_avg_trade_size_usd, d30_avg_trade_size_usd, l_avg_pos_size_usd, global_win_rate, recent_win_rate, global_roi_pct, avg_bet_size_usdc')
        .in('wallet_address', wallets),
      supabase.from('trader_profile_stats')
        .select('wallet_address, final_niche, bet_structure, price_bracket, win_rate, d30_win_rate, roi_pct, d30_roi_pct')
        .in('wallet_address', wallets),
    ]);

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
          globalWinRate: normalizeWinRateValue(row.d30_win_rate) ?? normalizeWinRateValue(row.l_win_rate) ?? normalizeWinRateValue(row.recent_win_rate) ?? normalizeWinRateValue(row.global_win_rate),
          globalRoiPct: normalizeRoiValue(row.d30_total_roi_pct) ?? normalizeRoiValue(row.l_total_roi_pct) ?? normalizeRoiValue(row.global_roi_pct),
          avgBetSizeUsd: pickNumber(row.avg_bet_size_usdc, row.d30_avg_trade_size_usd, row.l_avg_trade_size_usd, row.l_avg_pos_size_usd),
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

    // 4. Process trades - show all trades from top PNL traders
    // Since these are already top performers from the leaderboard, their trades qualify as "fire"
    // Stats are used to enhance the display but aren't required to pass
    const fireTrades: any[] = [];
    
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
    
    for (const trade of allTrades) {
      const wallet = trade._wallet?.toLowerCase();
      if (!wallet) continue;
      
      debugStats.tradesChecked++;
      
      const stats = statsMap.get(wallet);
      const traderPnl = traderPnlMap.get(wallet) || 0;
      
      // Calculate stats-based metrics if available
      const category = deriveCategoryFromTrade(trade);
      const winRate = stats ? winRateForTradeType(stats, category) : null;
      const roiPct = stats ? roiForTradeType(stats, category) : null;
      const conviction = stats ? convictionMultiplierForTrade(trade, stats) : null;
      
      const meetsWinRate = winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD;
      const meetsRoi = roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD;
      const meetsConviction = conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
      
      // Fire reasons: stats-based OR being a top PNL trader
      const hasStats = stats !== null;
      const isTopPnlTrader = traderPnl >= 10000; // $10k+ monthly PNL = top trader
      
      // Pass if ANY stats criteria met, OR if from a top PNL trader
      const passesFilter = meetsWinRate || meetsRoi || meetsConviction || isTopPnlTrader;
      
      if (!hasStats) {
        debugStats.tradersWithoutStats++;
      }
      
      if (passesFilter) {
        debugStats.tradesPassed++;
        if (meetsWinRate) debugStats.passedByWinRate++;
        if (meetsRoi) debugStats.passedByRoi++;
        if (meetsConviction) debugStats.passedByConviction++;
        if (isTopPnlTrader && !meetsWinRate && !meetsRoi && !meetsConviction) debugStats.passedByTopPnl++;
        
        let timestamp = typeof trade.timestamp === 'string' ? parseInt(trade.timestamp) : trade.timestamp;
        if (timestamp < 10000000000) timestamp = timestamp * 1000;
        
        const fireReasons: string[] = [];
        if (meetsWinRate) fireReasons.push('win_rate');
        if (meetsRoi) fireReasons.push('roi');
        if (meetsConviction) fireReasons.push('conviction');
        if (isTopPnlTrader && fireReasons.length === 0) fireReasons.push('top_pnl');
        
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
          token_id: trade.tokenId || trade.token_id,
          tokenId: trade.tokenId || trade.token_id,
          user: wallet,
          wallet: wallet,
          _followedWallet: wallet,
          _fireReasons: fireReasons,
          _fireScore: fireReasons.length,
          _fireWinRate: winRate,
          _fireRoi: roiPct,
          _fireConviction: conviction,
          _traderPnl: traderPnl,
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

    console.log(`[fire-feed] Returning ${fireTrades.length} filtered trades`);
    console.log(`[fire-feed] Debug:`, JSON.stringify(debugStats, null, 2));

    return NextResponse.json({
      trades: fireTrades,
      traders: traderNames,
      stats: Object.fromEntries(statsMap),
      debug: debugStats,
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
