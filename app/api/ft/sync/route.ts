import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';
import { isTraderExcluded } from '@/lib/ft-excluded-traders';
import { getPolyScore } from '@/lib/polyscore/get-polyscore';

// Allow up to 5 minutes for sync (93+ wallets with DB + API calls each)
export const maxDuration = 300;

const TOP_TRADERS_LIMIT = 100; // Polymarket API max per request
const LEADERBOARD_PAGES = 2;   // Fetch 2 pages (top 100 + next 100) per leaderboard view → up to 800 slots, deduped
const TRADES_PAGE_SIZE = 50;   // Per page from Polymarket API
const MAX_PAGES_PER_TRADER = 4; // Max 200 trades per trader per sync
const FT_SLIPPAGE_PCT = 0.003; // 0.3% - from empirical analysis of real copy trades

type PolymarketTrade = {
  id?: string;
  transactionHash?: string;
  asset?: string;
  conditionId?: string;
  title?: string;
  slug?: string;
  outcome?: string; // YES or NO
  side?: string;    // BUY or SELL
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  proxyWallet?: string;
};

type ExtendedFilters = {
  min_trader_win_rate?: number;   // Alternative to model_threshold
  max_trader_win_rate?: number;   // For anti-strategies
  max_conviction?: number;        // For testing low conviction
  max_edge?: number;              // For testing negative edge
  market_categories?: string[];   // Filter by market type keywords
  min_original_trade_usd?: number; // Minimum original trade size
  max_original_trade_usd?: number; // Maximum original trade size
  hypothesis?: string;            // Strategy thesis
  trader_pool?: 'top_pnl' | 'top_wr' | 'high_volume' | 'newcomers'; // Which traders to watch
  target_trader?: string;         // Specific trader address to copy (lowercase)
  target_traders?: string[];      // List of trader addresses (e.g. top niche traders from trader_profile_stats)
  target_trader_name?: string;    // Display name for the trader
  trade_live_only?: boolean;      // Only take trades when current time >= market game_start_time (sports events only; no fallback to start_time)
};

type FTWallet = {
  wallet_id: string;
  model_threshold: number | null;  // Used as min trader win rate when use_model=true
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  bet_size: number;
  bet_allocation_weight: number;  // Legacy multiplier for FIXED method
    allocation_method: 'FIXED' | 'KELLY' | 'EDGE_SCALED' | 'TIERED' | 'CONFIDENCE' | 'CONVICTION' | 'ML_SCALED' | 'WHALE';
  kelly_fraction: number;
  min_bet: number;
  max_bet: number;
  starting_balance: number;
  current_balance: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  last_sync_time: string | null;
  min_trader_resolved_count: number;
  min_conviction: number;  // Minimum conviction multiplier filter (0 = no filter)
  detailed_description?: string;  // JSON string with extended filters
  market_categories?: string[] | null;  // Column from migration (fallback when not in detailed_description)
  wr_source?: string | null;  // 'GLOBAL' | 'PROFILE' - Profile = use trader_profile_stats (niche/structure/bracket)
};

/**
 * Generate unique trade ID for deduplication. Prefer Polymarket id, then transactionHash.
 */
function getSourceTradeId(trade: { id?: string; transactionHash?: string; traderWallet?: string; conditionId?: string; timestamp?: string | number }): string {
  if (trade.id && String(trade.id).trim()) return String(trade.id).trim();
  if (trade.transactionHash && String(trade.transactionHash).trim()) return String(trade.transactionHash).trim();
  return `${trade.traderWallet || ''}-${trade.conditionId || ''}-${trade.timestamp || ''}`;
}

/**
 * Parse extended filters from detailed_description JSON
 */
function parseExtendedFilters(wallet: FTWallet): ExtendedFilters {
  if (!wallet.detailed_description) return {};
  try {
    return JSON.parse(wallet.detailed_description);
  } catch {
    return {};
  }
}

/** Derive price bracket for profile stats: LOW < 0.30, MID 0.30-0.70, HIGH > 0.70 */
function priceToBracket(price: number): 'LOW' | 'MID' | 'HIGH' {
  if (price < 0.30) return 'LOW';
  if (price <= 0.70) return 'MID';
  return 'HIGH';
}

/** Get profile WR and trade count for a trade; fallback to global stats if no match */
function getProfileWinRate(
  profiles: Array<{ final_niche: string; structure: string; bracket: string; winRate: number; tradeCount: number }>,
  niche: string,
  structure: string,
  bracket: string,
  globalFallback: { winRate: number; tradeCount: number }
): { winRate: number; tradeCount: number } {
  if (!profiles.length || !niche) return globalFallback;
  const n = niche.toLowerCase();
  const s = structure.toUpperCase() || 'STANDARD';
  const b = bracket.toUpperCase() || 'MID';
  // 1. Exact match (niche, structure, bracket)
  let matches = profiles.filter(p => p.final_niche === n && p.structure === s && p.bracket === b);
  if (matches.length === 0) {
    // 2. Match (niche, structure) - aggregate brackets
    matches = profiles.filter(p => p.final_niche === n && p.structure === s);
  }
  if (matches.length === 0) {
    // 3. Match niche only - aggregate structure+bracket
    matches = profiles.filter(p => p.final_niche === n || n.includes(p.final_niche) || p.final_niche.includes(n));
  }
  if (matches.length === 0) return globalFallback;
  const totalTrades = matches.reduce((sum, p) => sum + p.tradeCount, 0);
  if (totalTrades === 0) return globalFallback;
  const winWeighted = matches.reduce((sum, p) => sum + p.winRate * p.tradeCount, 0);
  return { winRate: winWeighted / totalTrades, tradeCount: totalTrades };
}

/**
 * Calculate bet size based on allocation method
 */
function calculateBetSize(
  wallet: FTWallet,
  traderWinRate: number,
  entryPrice: number,
  edge: number,
  conviction: number,  // Trader's conviction = trade_value / avg_trade_size
  effectiveBankroll?: number,  // startingBalance + realizedPnl - openExposure (avoids stale current_balance)
  modelProbability?: number | null  // ML score 0-1; used by ML_SCALED allocation
): number {
  const method = wallet.allocation_method || 'FIXED';
  const minBet = wallet.min_bet || 0.50;
  const maxBet = wallet.max_bet || 10.00;
  
  let betSize: number;
  
  switch (method) {
    case 'KELLY': {
      // Kelly Criterion: f = edge / (1 - entry_price)
      // Guard: at 99¢+, denominator → 0; use minBet to avoid blow-up
      if (entryPrice >= 0.99) {
        betSize = minBet;
        break;
      }
      const kellyFraction = wallet.kelly_fraction || 0.25;
      const bankroll = effectiveBankroll ?? wallet.current_balance ?? wallet.starting_balance ?? 1000;
      
      const fullKelly = edge / (1 - entryPrice);
      const kellyBet = bankroll * fullKelly * kellyFraction;
      
      betSize = kellyBet;
      break;
    }
    
    case 'EDGE_SCALED': {
      // Scale bet based on edge: higher edge = bigger bet
      // bet = base * (1 + edge * scale_factor)
      // With edge of 10% and scale_factor of 5, bet = base * 1.5
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      const scaleFactor = 5; // Each 10% edge adds 50% to bet
      betSize = baseBet * (1 + edge * scaleFactor);
      break;
    }
    
    case 'TIERED': {
      // Simple brackets based on edge
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      if (edge >= 0.15) {
        betSize = baseBet * 2.0;  // 15%+ edge: 2x
      } else if (edge >= 0.10) {
        betSize = baseBet * 1.5;  // 10-15% edge: 1.5x
      } else if (edge >= 0.05) {
        betSize = baseBet * 1.0;  // 5-10% edge: 1x
      } else {
        betSize = baseBet * 0.5;  // <5% edge: 0.5x
      }
      break;
    }
    
    case 'CONVICTION': {
      // Scale bet based on trader's conviction (how much more/less than usual they're betting)
      // conviction = 1.0 means normal bet, 2.0 means 2x their usual, etc.
      // Higher trader conviction → larger bet from us
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      
      // Conviction multiplier: 0.5x at conv=0.5, 1x at conv=1, 2x at conv=2, cap at 3x
      const convictionMultiplier = Math.min(Math.max(conviction, 0.5), 3.0);
      betSize = baseBet * convictionMultiplier;
      break;
    }
    
    case 'CONFIDENCE': {
      // Multi-factor confidence score using edge, win rate, AND conviction
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      const edgeScore = Math.min(edge / 0.20, 1);
      const wrScore = Math.min((traderWinRate - 0.50) / 0.30, 1);
      const convictionScore = Math.min((conviction - 0.5) / 2.5, 1);
      const confidenceScore = (edgeScore * 0.4) + (convictionScore * 0.3) + (wrScore * 0.3);
      betSize = baseBet * (0.5 + confidenceScore * 1.5);
      break;
    }
    
    case 'ML_SCALED': {
      // Scale bet by ML confidence: 55% → ~1.1x, 65% → ~1.3x, 70% → ~1.4x (cap 0.5x–2x)
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      const ml = modelProbability ?? 0.55;
      const mlMult = Math.min(Math.max(0.5 + (ml - 0.5), 0.5), 2.0); // 0.5x to 2x
      betSize = baseBet * mlMult;
      break;
    }

    case 'WHALE': {
      // Multi-signal: ML + conviction + WR + edge. Whale trades = high conviction + high WR + high ML.
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      const ml = modelProbability ?? 0.55;
      const mlScore = Math.min(Math.max((ml - 0.5) / 0.5, 0), 1);
      const wrScore = Math.min(Math.max((traderWinRate - 0.50) / 0.30, 0), 1);
      const convScore = Math.min(Math.max((conviction - 0.5) / 2.5, 0), 1);
      const edgeScore = Math.min(edge / 0.20, 1);
      const composite = 0.35 * mlScore + 0.30 * convScore + 0.25 * wrScore + 0.10 * edgeScore;
      betSize = baseBet * (0.5 + composite); // 0.5x to 2x
      break;
    }
    
    case 'FIXED':
    default: {
      // Simple fixed bet size
      betSize = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      break;
    }
  }
  
  // Apply min/max caps
  betSize = Math.max(minBet, Math.min(maxBet, betSize));
  
  // Round to 2 decimal places
  return Math.round(betSize * 100) / 100;
}

function parseTimestamp(value: number | string | undefined): Date | null {
  if (value === undefined || value === null) return null;
  let ts = Number(value);
  if (!Number.isFinite(ts)) return null;
  if (ts < 10000000000) ts *= 1000; // Convert seconds to ms
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * POST /api/ft/sync
 * 
 * Syncs new trades from Polymarket's live API into forward test wallets.
 * 
 * Flow:
 * 1. Get top traders from Polymarket leaderboard
 * 2. Get their stats (win rate) from our database
 * 3. Fetch their recent trades from Polymarket data API
 * 4. Filter trades that match each wallet's criteria
 * 5. Insert qualifying trades as FT orders
 */
export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const now = new Date();
    
    console.log('[ft/sync] Starting sync at', now.toISOString());
    
    // 1. Get active FT wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('is_active', true);
    
    if (walletsError || !wallets || wallets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active wallets to sync',
        wallets: 0
      });
    }
    
    // Filter to only active test period wallets, then sort stalest-first so
    // neglected wallets get priority. This ensures every wallet gets processed
    // across multiple sync runs even if a single run can't finish all 90+ wallets.
    const activeWallets = (wallets as FTWallet[]).filter(w => {
      const startDate = new Date(w.start_date);
      const endDate = new Date(w.end_date);
      return startDate <= now && endDate >= now;
    }).sort((a, b) => {
      const aTime = a.last_sync_time ? new Date(a.last_sync_time).getTime() : 0;
      const bTime = b.last_sync_time ? new Date(b.last_sync_time).getTime() : 0;
      return aTime - bTime; // stalest first
    });
    
    if (activeWallets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No wallets in active test period',
        wallets: wallets.length,
        active: 0
      });
    }
    
    console.log(`[ft/sync] Found ${activeWallets.length} active wallets (stalest-first)`);
    
    // 2. Get traders from different pools based on strategy needs
    // Fetch multiple pools: month/week for quality, DAY for currently active (critical for live events like Super Bowl)
    // Each pool fetches LEADERBOARD_PAGES pages (offset 0, 100, ...) so we get more than just "top 100"
    const leaderboardPromises: Promise<Awaited<ReturnType<typeof fetchPolymarketLeaderboard>>[]>[] = [];
    const views: { timePeriod: string; orderBy: string }[] = [
      { timePeriod: 'month', orderBy: 'PNL' },
      { timePeriod: 'month', orderBy: 'VOL' },
      { timePeriod: 'week', orderBy: 'PNL' },
      { timePeriod: 'day', orderBy: 'VOL' }
    ];
    for (const { timePeriod, orderBy } of views) {
      const pagePromises = Array.from({ length: LEADERBOARD_PAGES }, (_, i) =>
        fetchPolymarketLeaderboard({ timePeriod, orderBy, limit: TOP_TRADERS_LIMIT, offset: i * TOP_TRADERS_LIMIT })
      );
      leaderboardPromises.push(Promise.all(pagePromises));
    }
    const [monthPnlPages, monthVolPages, weekPnlPages, dayVolPages] = await Promise.all(leaderboardPromises);

    const tradersByPnlMonth = monthPnlPages.flat();
    const tradersByVolMonth = monthVolPages.flat();
    const tradersByPnlWeek = weekPnlPages.flat();
    const tradersByVolDay = dayVolPages.flat();

    // Merge into unique trader set (day pool captures who's trading RIGHT NOW)
    const traderMap = new Map<string, typeof tradersByPnlMonth[0]>();
    [...tradersByPnlMonth, ...tradersByVolMonth, ...tradersByPnlWeek, ...tradersByVolDay].forEach(t => {
      const key = t.wallet.toLowerCase();
      if (!traderMap.has(key)) {
        traderMap.set(key, t);
      }
    });
    
    // Add target_trader / target_traders from niche/category strategies (from trader_profile_stats)
    for (const w of activeWallets) {
      const ext = parseExtendedFilters(w);
      if (ext.target_trader) {
        const addr = ext.target_trader.toLowerCase();
        if (!traderMap.has(addr)) {
          traderMap.set(addr, { wallet: addr } as typeof tradersByPnlMonth[0]);
        }
      }
      if (ext.target_traders?.length) {
        for (const addr of ext.target_traders) {
          const key = (addr || '').toLowerCase();
          if (key && !traderMap.has(key)) {
            traderMap.set(key, { wallet: key } as typeof tradersByPnlMonth[0]);
          }
        }
      }
    }
    
    let topTraders = Array.from(traderMap.values());
    topTraders = topTraders.filter((t) => !isTraderExcluded(t.wallet));
    if (topTraders.length < Array.from(traderMap.values()).length) {
      console.log(`[ft/sync] Excluded ${Array.from(traderMap.values()).length - topTraders.length} traders (FT_EXCLUDED_TRADERS)`);
    }
    
    // Day-active traders: currently trading today; relax min trade count so we don't miss live event action
    const dayActiveTraderAddresses = new Set(tradersByVolDay.map(t => t.wallet.toLowerCase()));
    
    // Set of trader addresses that are explicitly targeted by any wallet (relax min trade count for these)
    const targetTraderAddresses = new Set<string>();
    for (const w of activeWallets) {
      const ext = parseExtendedFilters(w);
      if (ext.target_trader) targetTraderAddresses.add(ext.target_trader.toLowerCase());
      ext.target_traders?.forEach((a: string) => { if (a) targetTraderAddresses.add(a.toLowerCase()); });
    }
    
    console.log(`[ft/sync] Fetched ${topTraders.length} unique traders (leaderboard + niche targets)`);
    
    if (topTraders.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Could not fetch traders from Polymarket leaderboard'
      });
    }
    
    const traderWallets = topTraders.map(t => t.wallet.toLowerCase());
    
    // 3. Get trader stats from our database (win rate, trade count, avg trade size)
    const hasProfileWallets = activeWallets.some((w: FTWallet) => w.wr_source === 'PROFILE');
    
    const [statsRes, profileStatsRes] = await Promise.all([
      supabase.from('trader_global_stats')
        .select('wallet_address, l_win_rate, d30_win_rate, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd')
        .in('wallet_address', traderWallets),
      hasProfileWallets
        ? supabase.from('trader_profile_stats')
            .select('wallet_address, final_niche, structure, bracket, l_win_rate, d30_win_rate, d30_count, l_count')
            .in('wallet_address', traderWallets)
        : Promise.resolve({ data: [] as any[], error: null })
    ]);
    
    interface TraderStats { winRate: number; tradeCount: number; avgTradeSize: number }
    const statsMap = new Map<string, TraderStats>();
    if (!statsRes.error && statsRes.data) {
      for (const stat of statsRes.data) {
        const winRate = stat.d30_win_rate ?? stat.l_win_rate ?? 0.5;
        const tradeCount = stat.d30_count ?? stat.l_count ?? 0;
        const avgTradeSize = stat.d30_avg_trade_size_usd ?? stat.l_avg_trade_size_usd ?? 0;
        statsMap.set(stat.wallet_address.toLowerCase(), {
          winRate: typeof winRate === 'number' ? winRate : parseFloat(winRate) || 0.5,
          tradeCount: typeof tradeCount === 'number' ? tradeCount : parseInt(tradeCount) || 0,
          avgTradeSize: typeof avgTradeSize === 'number' ? avgTradeSize : parseFloat(avgTradeSize) || 0
        });
      }
    }
    
    const profilesByWallet = new Map<string, Array<{ final_niche: string; structure: string; bracket: string; winRate: number; tradeCount: number }>>();
    if (hasProfileWallets && !profileStatsRes.error && profileStatsRes.data) {
      for (const row of profileStatsRes.data) {
        const w = (row.wallet_address || '').toLowerCase();
        if (!w) continue;
        const wr = row.d30_win_rate ?? row.l_win_rate ?? 0.5;
        const tc = row.d30_count ?? row.l_count ?? 0;
        const list = profilesByWallet.get(w) ?? [];
        list.push({
          final_niche: (row.final_niche || 'OTHER').toLowerCase(),
          structure: (row.structure || 'STANDARD').toUpperCase(),
          bracket: (row.bracket || 'MID').toUpperCase(),
          winRate: typeof wr === 'number' ? wr : parseFloat(wr) || 0.5,
          tradeCount: typeof tc === 'number' ? tc : parseInt(tc) || 0
        });
        profilesByWallet.set(w, list);
      }
      console.log(`[ft/sync] Got profile stats for ${profilesByWallet.size} traders (${profileStatsRes.data.length} profile rows)`);
    }
    
    console.log(`[ft/sync] Got stats for ${statsMap.size} traders`);

    // Oldest lastSyncTime across wallets - fetch trades since then
    const minLastSyncTime = activeWallets.reduce((min, w) => {
      const t = w.last_sync_time ? new Date(w.last_sync_time) : new Date(w.start_date);
      return !min || t < min ? t : min;
    }, null as Date | null) || new Date(0);

    // 4. Fetch recent trades for each trader from Polymarket API (with pagination)
    interface EnrichedTrade extends PolymarketTrade {
      traderWallet: string;
      traderWinRate: number;
      traderTradeCount: number;
      traderAvgTradeSize: number;
      tradeValue: number;
      conviction: number;
    }
    const allTrades: EnrichedTrade[] = [];
    const errors: string[] = [];

    const MIN_TRADE_COUNT = 30;
    for (const trader of topTraders) {
      const wallet = trader.wallet.toLowerCase();
      const stats = statsMap.get(wallet) || { winRate: 0.5, tradeCount: 0, avgTradeSize: 0 };

      // Skip traders with insufficient track record (except target_traders and day-active traders).
      // Day-active: use lower threshold (10) so we capture live event trades from currently active traders.
      // When stats missing, treat as 50 - leaderboard presence implies activity.
      const effectiveTradeCount = stats.tradeCount > 0 ? stats.tradeCount : 50;
      const minCount = targetTraderAddresses.has(wallet) ? 0
        : dayActiveTraderAddresses.has(wallet) ? 10
        : MIN_TRADE_COUNT;
      if (effectiveTradeCount < minCount) continue;

      try {
        let offset = 0;
        let pagesFetched = 0;
        let oldestInTrader: Date | null = null;

        while (pagesFetched < MAX_PAGES_PER_TRADER) {
          const response = await fetch(
            `https://data-api.polymarket.com/trades?user=${wallet}&limit=${TRADES_PAGE_SIZE}&offset=${offset}`,
            { cache: 'no-store' }
          );

          if (!response.ok) {
            errors.push(`Failed to fetch trades for ${wallet.slice(0, 8)}: ${response.status}`);
            break;
          }

          const trades: PolymarketTrade[] = await response.json();
          if (!Array.isArray(trades) || trades.length === 0) break;

          const buyTrades = trades.filter(t => t.side === 'BUY' && t.conditionId);
          for (const trade of buyTrades) {
            const tradeTime = parseTimestamp(trade.timestamp);
            if (tradeTime && (!oldestInTrader || tradeTime < oldestInTrader)) {
              oldestInTrader = tradeTime;
            }

            const size = Number(trade.size ?? 0);
            const price = Number(trade.price ?? 0);
            const tradeValue = size * price;
            const conviction = stats.avgTradeSize > 0 ? tradeValue / stats.avgTradeSize : 1;

            allTrades.push({
              ...trade,
              traderWallet: wallet,
              traderWinRate: stats.winRate,
              traderTradeCount: effectiveTradeCount,
              traderAvgTradeSize: stats.avgTradeSize,
              tradeValue,
              conviction
            });
          }

          pagesFetched++;
          offset += trades.length;
          if (trades.length < TRADES_PAGE_SIZE) break;
          // Stop if we've gone past our lookback window
          if (oldestInTrader && oldestInTrader <= minLastSyncTime) break;
        }
      } catch (err: any) {
        errors.push(`Error fetching trades for ${wallet.slice(0, 8)}: ${err.message}`);
      }
    }
    
    console.log(`[ft/sync] Collected ${allTrades.length} BUY trades from ${topTraders.length} traders`);
    
    if (allTrades.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trades found to process',
        traders_checked: topTraders.length,
        errors: errors.length > 0 ? errors : undefined
      });
    }
    
    // 5. Get market info from our database to check if markets are still open
    const conditionIds = [...new Set(allTrades.map(t => t.conditionId).filter((id): id is string => Boolean(id)))];
    
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('condition_id, end_time, closed, resolved_outcome, winning_side, title, slug, outcome_prices, outcomes, tags, start_time, game_start_time, market_subtype, bet_structure')
      .in('condition_id', conditionIds);
    
    type MarketInfo = {
      endTime: Date | null;
      closed: boolean;
      resolved: boolean;
      title?: string;
      slug?: string;
      outcome_prices?: number[] | string;
      outcomes?: string[];
      tags?: string[] | unknown;
      end_time?: string;
      start_time?: string;
      game_start_time?: string | null;
      market_subtype?: string | null;
      bet_structure?: string | null;
    };
    
    const marketMap = new Map<string, MarketInfo>();
    
    if (!marketsError && markets) {
      for (const market of markets) {
        const isResolved = market.closed || 
          market.resolved_outcome !== null || 
          market.winning_side !== null;
        
        marketMap.set(market.condition_id, {
          endTime: market.end_time ? new Date(market.end_time) : null,
          closed: market.closed || false,
          resolved: isResolved,
          title: market.title,
          slug: market.slug,
          outcome_prices: market.outcome_prices,
          outcomes: market.outcomes,
          tags: market.tags,
          end_time: market.end_time,
          start_time: market.start_time,
          game_start_time: market.game_start_time ?? null,
          market_subtype: market.market_subtype ?? null,
          bet_structure: market.bet_structure ?? null
        });
      }
    }
    
    // Fallback: fetch missing markets from Polymarket API (our DB may not have new markets)
    const missingConditionIds = conditionIds.filter(id => !marketMap.has(id));
    if (missingConditionIds.length > 0) {
      const BATCH_SIZE = 20;
      for (let i = 0; i < missingConditionIds.length; i += BATCH_SIZE) {
        const batch = missingConditionIds.slice(i, i + BATCH_SIZE);
        try {
          const params = batch.map(id => `condition_ids=${id}`).join('&');
          const response = await fetch(`https://gamma-api.polymarket.com/markets?${params}`, { 
            headers: { 'Accept': 'application/json' } 
          });
          if (response.ok) {
            const pmMarkets = await response.json();
            for (const m of Array.isArray(pmMarkets) ? pmMarkets : []) {
              const cid = m.conditionId || m.condition_id;
              if (!cid) continue;
              const endTime = (m.endDate || m.end_date || m.endTime) ? new Date(m.endDate || m.end_date || m.endTime) : null;
              const closed = m.closed ?? false;
              let resolved = closed;
              if (m.outcomePrices && Array.isArray(m.outcomePrices)) {
                const prices = m.outcomePrices.map((p: any) => parseFloat(p));
                resolved = resolved || (prices.some((p: number) => p > 0.9) ?? false);
              }
              // game_start_time = actual event/game start (sports only). Do NOT use startDate/start_date
              // — that's market listing time; politics/crypto would wrongly get "live" status.
              const gameStartTime = m.gameStartTime || m.game_start_time || null;
              marketMap.set(cid, {
                endTime,
                closed,
                resolved,
                title: m.question || m.title,
                slug: m.slug,
                outcome_prices: m.outcomePrices,
                outcomes: m.outcomes || ['Yes', 'No'],
                tags: m.tags || [],
                end_time: m.endDate || m.end_date,
                start_time: m.startDate || m.start_date,
                game_start_time: gameStartTime ?? null
              });
            }
          }
        } catch (err) {
          console.warn('[ft/sync] Polymarket API fallback error:', err);
        }
      }
    }
    
    console.log(`[ft/sync] Got market info for ${marketMap.size} markets (${missingConditionIds.length} from Polymarket API fallback)`);
    
    // 6. Process trades and insert into FT wallets
    const results: Record<string, { inserted: number; skipped: number; evaluated: number; reasons: Record<string, number> }> = {};
    // Cache ML score by source_trade_id to avoid N getPolyScore calls when same trade qualifies for multiple use_model wallets
    const mlScoreCache = new Map<string, number | null>();

    const syncStartMs = Date.now();
    const MAX_SYNC_MS = 240_000; // Stop after 4 min to leave headroom for response (maxDuration=300s)
    let walletsProcessed = 0;
    let walletsStopped = false;

    for (const wallet of activeWallets) {
      // Time guard: stop before Vercel timeout; remaining wallets will be first next run (stalest-first)
      if (Date.now() - syncStartMs > MAX_SYNC_MS) {
        walletsStopped = true;
        console.log(`[ft/sync] Time guard: ${walletsProcessed}/${activeWallets.length} wallets processed in ${((Date.now() - syncStartMs) / 1000).toFixed(0)}s, stopping`);
        break;
      }

      results[wallet.wallet_id] = { inserted: 0, skipped: 0, evaluated: 0, reasons: {} };

      // Wrap each wallet in try/catch so one failure doesn't block all remaining wallets
      try {
      const reasons = results[wallet.wallet_id].reasons;
      
      const lastSyncTime = wallet.last_sync_time ? new Date(wallet.last_sync_time) : new Date(wallet.start_date);
      
      // Fetch current wallet state for cash check (stop trading when out of cash)
      const { data: walletOrders } = await supabase
        .from('ft_orders')
        .select('outcome, size, pnl')
        .eq('wallet_id', wallet.wallet_id)
        .limit(10000);
      const openExposure = (walletOrders || [])
        .filter(o => o.outcome === 'OPEN')
        .reduce((sum, o) => sum + (Number(o.size) || 0), 0);
      const realizedPnl = (walletOrders || [])
        .filter(o => o.outcome === 'WON' || o.outcome === 'LOST')
        .reduce((sum, o) => sum + (Number(o.pnl) || 0), 0);
      const startingBalance = wallet.starting_balance || 1000;
      let runningOpenExposure = openExposure;
      
      // Parse extended filters from detailed_description
      const extFilters = parseExtendedFilters(wallet);
      
      // Determine min win rate: use_model strategies gate on ML score, NOT trader WR.
      // So minWinRate comes only from extFilters; model_threshold gates ML score (see below).
      const minWinRate = extFilters.min_trader_win_rate ?? 
                        (wallet.use_model ? 0 : (wallet.model_threshold ?? 0));
      
      // Build list of source_trade_ids we might process (trades since last sync)
      const candidateSourceIds = new Set<string>();
      for (const t of allTrades) {
        const tt = parseTimestamp(t.timestamp);
        if (tt && tt > lastSyncTime) candidateSourceIds.add(getSourceTradeId(t));
      }
      
      // Load already-seen trades from ft_seen_trades (prevents double counting across syncs)
      const alreadySeenIds = new Set<string>();
      if (candidateSourceIds.size > 0) {
        const ids = Array.from(candidateSourceIds);
        for (let i = 0; i < ids.length; i += 100) {
          const batch = ids.slice(i, i + 100);
          const { data: seen } = await supabase
            .from('ft_seen_trades')
            .select('source_trade_id')
            .eq('wallet_id', wallet.wallet_id)
            .in('source_trade_id', batch);
          if (seen) seen.forEach((r: { source_trade_id: string }) => alreadySeenIds.add(r.source_trade_id));
        }
      }
      
      // Within-sync dedupe (same trade may appear twice in allTrades from API)
      const seenThisSync = new Set<string>();
      
      const recordSeen = async (sourceTradeId: string, outcome: 'taken' | 'skipped', skipReason?: string) => {
        await supabase.from('ft_seen_trades').upsert({
          wallet_id: wallet.wallet_id,
          source_trade_id: sourceTradeId,
          outcome,
          skip_reason: skipReason ?? null,
          seen_at: now.toISOString()
        }, { onConflict: 'wallet_id,source_trade_id' });
      };
      
      for (const trade of allTrades) {
        const tradeTime = parseTimestamp(trade.timestamp);
        if (!tradeTime) continue;
        if (tradeTime <= lastSyncTime) continue;
        
        const sourceTradeId = getSourceTradeId(trade);
        if (alreadySeenIds.has(sourceTradeId)) continue;
        if (seenThisSync.has(sourceTradeId)) continue;
        seenThisSync.add(sourceTradeId);
        
        // Target trader filter - record skipped if not from allowed traders
        const targetTrader = extFilters.target_trader;
        const targetTraders = extFilters.target_traders;
        // TRADER_* wallets: fail closed — must have target_trader; otherwise skip all trades
        if (wallet.wallet_id.startsWith('TRADER_') && !targetTrader && (!targetTraders || targetTraders.length === 0)) {
          await recordSeen(sourceTradeId, 'skipped', 'not_target_trader');
          reasons['not_target_trader'] = (reasons['not_target_trader'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (targetTrader || (targetTraders && targetTraders.length > 0)) {
          const traderWallet = (trade.traderWallet || '').toLowerCase();
          const allowed = targetTrader
            ? traderWallet === targetTrader.toLowerCase()
            : targetTraders!.some(t => traderWallet === (t || '').toLowerCase());
          if (!allowed) {
            await recordSeen(sourceTradeId, 'skipped', 'not_target_trader');
            reasons['not_target_trader'] = (reasons['not_target_trader'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }
        }
        
        results[wallet.wallet_id].evaluated++;
        
        const market = marketMap.get(trade.conditionId || '');
        if (!market) {
          await recordSeen(sourceTradeId, 'skipped', 'market_not_found');
          reasons['market_not_found'] = (reasons['market_not_found'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (market.resolved || market.closed) {
          await recordSeen(sourceTradeId, 'skipped', 'market_resolved');
          reasons['market_resolved'] = (reasons['market_resolved'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (market.endTime && tradeTime >= market.endTime) {
          await recordSeen(sourceTradeId, 'skipped', 'after_market_end');
          reasons['after_market_end'] = (reasons['after_market_end'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }

        // trade_live_only: only take trades when current time >= actual game/event start.
        // Use ONLY game_start_time (sports events). Do NOT fall back to start_time — that's market
        // listing time; politics/crypto markets would incorrectly pass.
        if (extFilters.trade_live_only) {
          const gameStartIso = market.game_start_time ?? null;
          if (!gameStartIso) {
            await recordSeen(sourceTradeId, 'skipped', 'no_game_start_time');
            reasons['no_game_start_time'] = (reasons['no_game_start_time'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }
          const gameStart = new Date(gameStartIso);
          if (now < gameStart) {
            await recordSeen(sourceTradeId, 'skipped', 'pre_game');
            reasons['pre_game'] = (reasons['pre_game'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }
        }

        const price = Number(trade.price || 0);
        const priceWithSlippage = Math.min(0.9999, price * (1 + FT_SLIPPAGE_PCT));
        const globalStats = statsMap.get((trade.traderWallet || '').toLowerCase()) ?? { winRate: 0.5, tradeCount: 0, avgTradeSize: 0 };
        let traderWinRate = trade.traderWinRate;
        let traderTradeCount = trade.traderTradeCount;
        if (wallet.wr_source === 'PROFILE' && profilesByWallet.size > 0) {
          const niche = (market.market_subtype || '').trim() || 'OTHER';
          const structure = (market.bet_structure || 'STANDARD').toUpperCase();
          const bracket = priceToBracket(price);
          const profiles = profilesByWallet.get((trade.traderWallet || '').toLowerCase()) ?? [];
          const profileRes = getProfileWinRate(profiles, niche, structure, bracket, { winRate: globalStats.winRate, tradeCount: globalStats.tradeCount });
          traderWinRate = profileRes.winRate;
          traderTradeCount = profileRes.tradeCount;
        }
        const edge = traderWinRate - priceWithSlippage; // Edge at our execution price (after slippage)
        
        if (price < wallet.price_min || price > wallet.price_max) {
          await recordSeen(sourceTradeId, 'skipped', 'price_out_of_range');
          reasons['price_out_of_range'] = (reasons['price_out_of_range'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (traderWinRate < minWinRate) {
          await recordSeen(sourceTradeId, 'skipped', 'low_win_rate');
          reasons['low_win_rate'] = (reasons['low_win_rate'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (edge < wallet.min_edge) {
          await recordSeen(sourceTradeId, 'skipped', 'insufficient_edge');
          reasons['insufficient_edge'] = (reasons['insufficient_edge'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (traderTradeCount < (wallet.min_trader_resolved_count || 30)) {
          await recordSeen(sourceTradeId, 'skipped', 'low_trade_count');
          reasons['low_trade_count'] = (reasons['low_trade_count'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        const minConviction = wallet.min_conviction || 0;
        if (minConviction > 0 && trade.conviction < minConviction) {
          await recordSeen(sourceTradeId, 'skipped', 'low_conviction');
          reasons['low_conviction'] = (reasons['low_conviction'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        
        if (extFilters.max_trader_win_rate !== undefined && traderWinRate > extFilters.max_trader_win_rate) {
          await recordSeen(sourceTradeId, 'skipped', 'high_win_rate');
          reasons['high_win_rate'] = (reasons['high_win_rate'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (extFilters.max_edge !== undefined && edge > extFilters.max_edge) {
          await recordSeen(sourceTradeId, 'skipped', 'high_edge');
          reasons['high_edge'] = (reasons['high_edge'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (extFilters.max_conviction !== undefined && trade.conviction > extFilters.max_conviction) {
          await recordSeen(sourceTradeId, 'skipped', 'high_conviction');
          reasons['high_conviction'] = (reasons['high_conviction'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        
        const marketCats = extFilters.market_categories?.length
          ? extFilters.market_categories
          : (wallet.market_categories?.length ? wallet.market_categories : null);
        if (marketCats && marketCats.length > 0) {
          const titleLower = ((trade.title || market.title || '').toString()).toLowerCase();
          const tagsArr = Array.isArray(market.tags) ? market.tags : (typeof market.tags === 'object' && market.tags !== null ? Object.values(market.tags) : []);
          const tagsStr = tagsArr.map((t: unknown) => String(t || '')).join(' ').toLowerCase();
          const searchable = `${titleLower} ${tagsStr}`;
          const matchesCategory = marketCats.some(cat =>
            searchable.includes((cat || '').toLowerCase())
          );
          if (!matchesCategory) {
            await recordSeen(sourceTradeId, 'skipped', 'wrong_category');
            reasons['wrong_category'] = (reasons['wrong_category'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }
        }
        
        const originalTradeSize = Number(trade.size || 0);
        if (extFilters.min_original_trade_usd !== undefined && originalTradeSize < extFilters.min_original_trade_usd) {
          await recordSeen(sourceTradeId, 'skipped', 'trade_too_small');
          reasons['trade_too_small'] = (reasons['trade_too_small'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        if (extFilters.max_original_trade_usd !== undefined && originalTradeSize > extFilters.max_original_trade_usd) {
          await recordSeen(sourceTradeId, 'skipped', 'trade_too_large');
          reasons['trade_too_large'] = (reasons['trade_too_large'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        
        // P0-1: For use_model=true, compute ML score BEFORE bet sizing (needed for ML_SCALED allocation)
        let preInsertMlProbability: number | null = null;
        if (wallet.use_model && wallet.model_threshold != null) {
          try {
            if (mlScoreCache.has(sourceTradeId)) {
              preInsertMlProbability = mlScoreCache.get(sourceTradeId) ?? null;
            } else {
              let outcomes = market.outcomes || ['Yes', 'No'];
              let outcomePrices = market.outcome_prices;
              if (typeof outcomes === 'string') {
                try { outcomes = JSON.parse(outcomes); } catch { outcomes = ['Yes', 'No']; }
              }
              if (typeof outcomePrices === 'string') {
                try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = [0.5, 0.5]; }
              }
              const outcomesArr = Array.isArray(outcomes) ? outcomes : ['Yes', 'No'];
              const pricesArr = Array.isArray(outcomePrices) ? outcomePrices.map((p: unknown) => Number(p) || 0.5) : [0.5, 0.5];
              const tokenIdx = outcomesArr.findIndex((o: string) => (o || '').toLowerCase() === (trade.outcome || 'YES').toLowerCase());
              const currentPrice = pricesArr[tokenIdx >= 0 ? tokenIdx : 0] ?? 0.5;
              const sharesForMl = price > 0 ? (wallet.bet_size || 1.2) / price : 0;

              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const polyScoreResponse = await getPolyScore({
              original_trade: {
                wallet_address: trade.traderWallet,
                condition_id: trade.conditionId || '',
                side: (trade.side || 'BUY') as 'BUY' | 'SELL',
                price,
                shares_normalized: sharesForMl,
                timestamp: tradeTime.toISOString()
              },
              market_context: {
                current_price: currentPrice,
                current_timestamp: new Date().toISOString(),
                market_title: market.title || trade.title || '',
                market_tags: market.tags ? JSON.stringify(market.tags) : null,
                market_end_time_unix: market.endTime ? Math.floor(market.endTime.getTime() / 1000) : null,
                market_start_time_unix: market.start_time ? Math.floor(new Date(market.start_time).getTime() / 1000) : null,
                token_label: trade.outcome || 'YES'
              },
              user_slippage: 0.3
            }, serviceRoleKey);

            if (polyScoreResponse.success) {
              if (polyScoreResponse.prediction?.probability) {
                preInsertMlProbability = polyScoreResponse.prediction.probability;
              } else if (polyScoreResponse.valuation?.ai_fair_value) {
                preInsertMlProbability = polyScoreResponse.valuation.ai_fair_value;
              } else if (polyScoreResponse.analysis?.prediction_stats?.ai_fair_value) {
                preInsertMlProbability = polyScoreResponse.analysis.prediction_stats.ai_fair_value;
              }
              // Normalize: API may return 0-100 (percent) instead of 0-1
              if (preInsertMlProbability != null && preInsertMlProbability > 1) {
                preInsertMlProbability = preInsertMlProbability / 100;
              }
            }
            mlScoreCache.set(sourceTradeId, preInsertMlProbability);
            }
            if (preInsertMlProbability == null || preInsertMlProbability < wallet.model_threshold) {
              await recordSeen(sourceTradeId, 'skipped', preInsertMlProbability == null ? 'ml_unavailable' : 'low_ml_score');
              reasons[preInsertMlProbability == null ? 'ml_unavailable' : 'low_ml_score'] = (reasons[preInsertMlProbability == null ? 'ml_unavailable' : 'low_ml_score'] || 0) + 1;
              results[wallet.wallet_id].skipped++;
              continue;
            }
          } catch (mlErr: unknown) {
            console.warn(`[ft/sync] ML pre-check failed for ${sourceTradeId}:`, mlErr);
            await recordSeen(sourceTradeId, 'skipped', 'ml_unavailable');
            reasons['ml_unavailable'] = (reasons['ml_unavailable'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }
        }
        
        const effectiveBankroll = Math.max(0, startingBalance + realizedPnl - runningOpenExposure);
        const effectiveBetSize = calculateBetSize(
          wallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll, preInsertMlProbability
        );
        const cashAvailable = effectiveBankroll;
        if (cashAvailable < effectiveBetSize || cashAvailable <= 0) {
          await recordSeen(sourceTradeId, 'skipped', 'insufficient_cash');
          reasons['insufficient_cash'] = (reasons['insufficient_cash'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        
        const { data: existing } = await supabase
          .from('ft_orders')
          .select('order_id')
          .eq('wallet_id', wallet.wallet_id)
          .eq('source_trade_id', sourceTradeId)
          .limit(1);
        
        if (existing && existing.length > 0) {
          await recordSeen(sourceTradeId, 'skipped', 'duplicate');
          reasons['duplicate'] = (reasons['duplicate'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
          continue;
        }
        
        const ftOrder = {
          wallet_id: wallet.wallet_id,
          order_type: 'FT',
          side: trade.side,
          market_slug: trade.slug || null,
          condition_id: trade.conditionId,
          market_title: trade.title || null,
          token_label: trade.outcome || 'YES',
          source_trade_id: sourceTradeId,
          trader_address: trade.traderWallet,
          entry_price: priceWithSlippage,
          size: effectiveBetSize,
          market_end_time: market.endTime?.toISOString() || null,
          trader_win_rate: traderWinRate,
          trader_roi: null,
          trader_resolved_count: trade.traderTradeCount,
          model_probability: preInsertMlProbability, // Already computed for use_model; enrich-ml backfills others
          edge_pct: edge,
          conviction: trade.conviction ?? null,
          outcome: 'OPEN',
          order_time: tradeTime.toISOString()
        };
        
        const { data: insertedOrder, error: insertError } = await supabase.from('ft_orders').insert(ftOrder).select('order_id').single();
        
        if (insertError) {
          await recordSeen(sourceTradeId, 'skipped', 'insert_error');
          console.error(`[ft/sync] Insert error for ${wallet.wallet_id}:`, insertError);
          reasons['insert_error'] = (reasons['insert_error'] || 0) + 1;
          results[wallet.wallet_id].skipped++;
        } else {
          await recordSeen(sourceTradeId, 'taken');
          results[wallet.wallet_id].inserted++;
          runningOpenExposure += effectiveBetSize;

          // For use_model wallets we already have model_probability from pre-insert. For others, enrich-ml cron will backfill.
          // (Optional: could call getPolyScore here for non-use_model orders, but enrich-ml runs every 10 min)
        }
      }
      
      // Derive trades_seen and trades_skipped from ft_seen_trades (accurate, no double count)
      const [seenRes, skippedRes] = await Promise.all([
        supabase.from('ft_seen_trades').select('*', { count: 'exact', head: true }).eq('wallet_id', wallet.wallet_id),
        supabase.from('ft_seen_trades').select('*', { count: 'exact', head: true }).eq('wallet_id', wallet.wallet_id).eq('outcome', 'skipped')
      ]);
      const tradesSeen = seenRes.count ?? 0;
      const tradesSkipped = skippedRes.count ?? 0;
      
      await supabase
        .from('ft_wallets')
        .update({ 
          last_sync_time: now.toISOString(),
          trades_seen: tradesSeen,
          trades_skipped: tradesSkipped,
          updated_at: now.toISOString()
        })
        .eq('wallet_id', wallet.wallet_id);

      walletsProcessed++;
      } catch (walletErr: unknown) {
        // Log but don't let one wallet's error stop all remaining wallets
        const msg = walletErr instanceof Error ? walletErr.message : String(walletErr);
        console.error(`[ft/sync] Error processing wallet ${wallet.wallet_id}:`, msg);
        errors.push(`Wallet ${wallet.wallet_id}: ${msg}`);
        walletsProcessed++;
      }
    }
    
    // Calculate totals
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalEvaluated = 0;
    for (const walletId in results) {
      totalInserted += results[walletId].inserted;
      totalSkipped += results[walletId].skipped;
      totalEvaluated += results[walletId].evaluated;
    }
    
    return NextResponse.json({
      success: true,
      synced_at: now.toISOString(),
      traders_checked: topTraders.length,
      trades_fetched: allTrades.length,
      wallets_processed: walletsProcessed,
      wallets_remaining: activeWallets.length - walletsProcessed,
      time_guard_hit: walletsStopped,
      elapsed_ms: Date.now() - syncStartMs,
      markets_found: marketMap.size,
      wallets_total: activeWallets.length,
      total_inserted: totalInserted,
      total_skipped: totalSkipped,
      total_evaluated: totalEvaluated,
      results,
      fetch_errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('[ft/sync] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Sync failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to sync new trades from Polymarket',
    description: 'Fetches recent trades from top traders and adds qualifying ones to FT wallets'
  });
}
