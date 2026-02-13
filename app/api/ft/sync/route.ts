import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';
import { isTraderExcluded } from '@/lib/ft-excluded-traders';
import { getPolyScore } from '@/lib/polyscore/get-polyscore';
import {
  calculateBetSize,
  FT_SLIPPAGE_PCT,
  getSourceTradeId,
  parseExtendedFilters,
  parseTimestamp,
  type ExtendedFilters,
} from '@/lib/ft-sync/shared-logic';

// Allow up to 5 minutes for sync (93+ wallets with DB + API calls each)
export const maxDuration = 300;

const TOP_TRADERS_LIMIT = 100; // Polymarket API max per request
const LEADERBOARD_PAGES = 2;   // Fetch 2 pages (top 100 + next 100) per leaderboard view → up to 800 slots, deduped
const TRADES_PAGE_SIZE = 50;   // Per page from Polymarket API
const MAX_PAGES_PER_TRADER = 4; // Max 200 trades per trader per sync
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

// getSourceTradeId, parseExtendedFilters imported from @/lib/ft-sync/shared-logic

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

// calculateBetSize, parseTimestamp imported from @/lib/ft-sync/shared-logic
// Single source of truth: both FT sync and LT executor use the same functions.

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

    // 4. Fetch recent trades from Polymarket API — PARALLEL in batches of 25
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
    const FETCH_CONCURRENCY = 25;

    // Pre-filter traders by trade count (same criteria, just separated for batching)
    type EligibleTrader = { trader: typeof topTraders[0]; stats: TraderStats; effectiveTradeCount: number };
    const eligibleTraders: EligibleTrader[] = [];
    for (const trader of topTraders) {
      const w = trader.wallet.toLowerCase();
      const stats = statsMap.get(w) || { winRate: 0.5, tradeCount: 0, avgTradeSize: 0 };
      const effectiveTradeCount = stats.tradeCount > 0 ? stats.tradeCount : 50;
      const minCount = targetTraderAddresses.has(w) ? 0
        : dayActiveTraderAddresses.has(w) ? 10
        : MIN_TRADE_COUNT;
      if (effectiveTradeCount >= minCount) {
        eligibleTraders.push({ trader, stats, effectiveTradeCount });
      }
    }

    // Fetch trades for a single trader (paginated, up to MAX_PAGES_PER_TRADER pages)
    // Uses the /trades endpoint (good for leaderboard traders)
    const fetchTradesForTrader = async (
      { trader, stats, effectiveTradeCount }: EligibleTrader
    ): Promise<{ trades: EnrichedTrade[]; fetchErrors: string[] }> => {
      const w = trader.wallet.toLowerCase();
      const trades: EnrichedTrade[] = [];
      const fetchErrors: string[] = [];
      let offset = 0;
      let pagesFetched = 0;
      let oldestInTrader: Date | null = null;

      while (pagesFetched < MAX_PAGES_PER_TRADER) {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?user=${w}&limit=${TRADES_PAGE_SIZE}&offset=${offset}`,
          { cache: 'no-store' }
        );
        if (!response.ok) {
          fetchErrors.push(`Failed to fetch trades for ${w.slice(0, 8)}: ${response.status}`);
          break;
        }
        const rawTrades: PolymarketTrade[] = await response.json();
        if (!Array.isArray(rawTrades) || rawTrades.length === 0) break;

        for (const trade of rawTrades.filter(t => t.side === 'BUY' && t.conditionId)) {
          const tradeTime = parseTimestamp(trade.timestamp);
          if (tradeTime && (!oldestInTrader || tradeTime < oldestInTrader)) oldestInTrader = tradeTime;
          const size = Number(trade.size ?? 0);
          const price = Number(trade.price ?? 0);
          const tradeValue = size * price;
          const conviction = stats.avgTradeSize > 0 ? tradeValue / stats.avgTradeSize : 1;
          trades.push({
            ...trade,
            traderWallet: w,
            traderWinRate: stats.winRate,
            traderTradeCount: effectiveTradeCount,
            traderAvgTradeSize: stats.avgTradeSize,
            tradeValue,
            conviction
          });
        }

        pagesFetched++;
        offset += rawTrades.length;
        if (rawTrades.length < TRADES_PAGE_SIZE) break;
        if (oldestInTrader && oldestInTrader <= minLastSyncTime) break;
      }
      return { trades, fetchErrors };
    };

    // Fetch trades for a TARGET TRADER using the /activity endpoint.
    // The /trades endpoint misses many fills for whale/algo traders (e.g. KCH123 had
    // 0 trades on Feb 11 from /trades but 3,160 fills from /activity).
    // Aggregates individual fills into ONE position per (conditionId, outcome).
    const MAX_ACTIVITY_PAGES = 100; // Up to 20,000 fill records
    const fetchActivityForTargetTrader = async (
      { trader, stats, effectiveTradeCount }: EligibleTrader,
      sinceMs: number
    ): Promise<{ trades: EnrichedTrade[]; fetchErrors: string[] }> => {
      const w = trader.wallet.toLowerCase();
      const fetchErrors: string[] = [];

      // ── 1. Paginate the activity endpoint (cursor = timestamp) ──
      type ActivityRecord = {
        proxyWallet?: string; timestamp: number; conditionId?: string;
        type?: string; size?: number; usdcSize?: number;
        transactionHash?: string; price?: number; asset?: string;
        side?: string; outcomeIndex?: number; title?: string;
        slug?: string; outcome?: string;
      };
      const allActivity: ActivityRecord[] = [];
      let cursor = '';

      for (let page = 0; page < MAX_ACTIVITY_PAGES; page++) {
        const url = `https://data-api.polymarket.com/activity?user=${w}&limit=200${cursor ? `&cursor=${cursor}` : ''}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          fetchErrors.push(`Failed to fetch activity for ${w.slice(0, 8)}: ${response.status}`);
          break;
        }
        const data: ActivityRecord[] = await response.json();
        if (!Array.isArray(data) || data.length === 0) break;

        allActivity.push(...data);
        cursor = String(data[data.length - 1].timestamp);

        // Stop if we've gone past our window
        const oldestTs = Number(data[data.length - 1].timestamp);
        const oldestMs = oldestTs < 1e10 ? oldestTs * 1000 : oldestTs;
        if (oldestMs <= sinceMs) break;
        if (data.length < 200) break;
      }

      // ── 2. Filter: BUY trades only, after sinceMs ──
      const buyFills = allActivity.filter(a => {
        if (a.type !== 'TRADE' || a.side !== 'BUY' || !a.conditionId) return false;
        const ts = Number(a.timestamp);
        const ms = ts < 1e10 ? ts * 1000 : ts;
        return ms > sinceMs;
      });

      // ── 3. Aggregate fills into positions (one per conditionId + outcome) ──
      type Position = {
        conditionId: string; outcome: string; title: string; slug: string; asset: string;
        totalShares: number; totalUsd: number;
        minTimestamp: number; maxTimestamp: number;
        firstTxHash: string; side: string; fillCount: number;
      };
      const positionMap = new Map<string, Position>();

      for (const fill of buyFills) {
        const cid = fill.conditionId!;
        const outcome = fill.outcome || 'YES';
        const key = `${cid}-${outcome}`;
        const ts = Number(fill.timestamp);
        const shares = Number(fill.size ?? 0);
        const usd = Number(fill.usdcSize ?? 0);

        const existing = positionMap.get(key);
        if (existing) {
          existing.totalShares += shares;
          existing.totalUsd += usd;
          existing.fillCount++;
          if (ts < existing.minTimestamp) { existing.minTimestamp = ts; existing.firstTxHash = fill.transactionHash || existing.firstTxHash; }
          if (ts > existing.maxTimestamp) existing.maxTimestamp = ts;
        } else {
          positionMap.set(key, {
            conditionId: cid, outcome, title: fill.title || '', slug: fill.slug || '',
            asset: fill.asset || '', totalShares: shares, totalUsd: usd,
            minTimestamp: ts, maxTimestamp: ts,
            firstTxHash: fill.transactionHash || '', side: fill.side || 'BUY', fillCount: 1
          });
        }
      }

      // ── 4. Convert to EnrichedTrade[] ──
      const trades: EnrichedTrade[] = [];
      for (const pos of Array.from(positionMap.values())) {
        const avgPrice = pos.totalShares > 0 ? pos.totalUsd / pos.totalShares : 0;
        const conviction = stats.avgTradeSize > 0 ? pos.totalUsd / stats.avgTradeSize : 1;

        trades.push({
          // Use agg-<conditionId_short>-<outcome> as stable dedup ID
          id: `agg-${pos.conditionId.substring(2, 12)}-${pos.outcome}`,
          transactionHash: pos.firstTxHash,
          asset: pos.asset,
          conditionId: pos.conditionId,
          title: pos.title,
          slug: pos.slug,
          outcome: pos.outcome,
          side: pos.side,
          size: pos.totalShares,
          price: avgPrice,
          // Use maxTimestamp so the position passes the lastSyncTime filter
          // (any fill after lastSyncTime means the position is "new")
          timestamp: pos.maxTimestamp,
          proxyWallet: w,
          traderWallet: w,
          traderWinRate: stats.winRate,
          traderTradeCount: effectiveTradeCount,
          traderAvgTradeSize: stats.avgTradeSize,
          tradeValue: pos.totalUsd,
          conviction
        });
      }

      console.log(`[ft/sync] Activity fetch for ${w.slice(0, 8)}: ${allActivity.length} records → ${buyFills.length} BUY fills → ${trades.length} positions`);
      return { trades, fetchErrors };
    };

    // Fire requests in parallel batches of FETCH_CONCURRENCY
    // Target traders use the /activity endpoint (more comprehensive for whale traders)
    const fetchStartMs = Date.now();
    for (let i = 0; i < eligibleTraders.length; i += FETCH_CONCURRENCY) {
      const batch = eligibleTraders.slice(i, i + FETCH_CONCURRENCY);
      const batchResults = await Promise.allSettled(batch.map(et => {
        if (targetTraderAddresses.has(et.trader.wallet.toLowerCase())) {
          return fetchActivityForTargetTrader(et, minLastSyncTime.getTime());
        }
        return fetchTradesForTrader(et);
      }));
      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          allTrades.push(...r.value.trades);
          errors.push(...r.value.fetchErrors);
        } else {
          errors.push(`Trader fetch error: ${r.reason}`);
        }
      }
    }
    console.log(`[ft/sync] Trade fetch: ${eligibleTraders.length} traders in ${((Date.now() - fetchStartMs) / 1000).toFixed(1)}s (concurrency=${FETCH_CONCURRENCY})`);
    
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
      winning_side?: string | null;
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
          bet_structure: market.bet_structure ?? null,
          // winning_side from DB can be a JSON object {"id":"...","label":"Yes"} or a plain string
          winning_side: typeof market.winning_side === 'object' && market.winning_side !== null
            ? (market.winning_side as { label?: string }).label ?? null
            : market.winning_side ?? null
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
              // Derive winning_side from outcomePrices for resolved markets
              let gammaWinningSide: string | null = null;
              if (closed && m.outcomePrices && Array.isArray(m.outcomePrices)) {
                const outNames = m.outcomes || ['Yes', 'No'];
                const winIdx = m.outcomePrices.findIndex((p: string) => parseFloat(p) > 0.9);
                if (winIdx >= 0 && outNames[winIdx]) gammaWinningSide = outNames[winIdx];
              }
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
                game_start_time: gameStartTime ?? null,
                winning_side: gammaWinningSide
              });
            }
          }
        } catch (err) {
          console.warn('[ft/sync] Polymarket API fallback error:', err);
        }
      }
    }
    
    console.log(`[ft/sync] Got market info for ${marketMap.size} markets (${missingConditionIds.length} from Polymarket API fallback)`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // 6. FILTER ENGINE — route trades to wallets (zero DB writes for skips)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Design: All filtering is pure in-memory. DB writes only happen for:
    //   a) ft_orders INSERT (trade qualifies)
    //   b) ft_wallets UPDATE (last_sync_time)
    //
    // Dedup:
    //   - Across syncs: pre-loaded existingSourceIds from ft_orders (one query per wallet)
    //   - Within sync:  seenThisSync Set (in-memory)
    //
    // This eliminates thousands of ft_seen_trades upserts that were the #1 bottleneck.
    // ═══════════════════════════════════════════════════════════════════════

    const results: Record<string, { inserted: number; skipped: number; evaluated: number; reasons: Record<string, number> }> = {};
    // Cache ML score by source_trade_id to avoid N getPolyScore calls when same trade qualifies for multiple use_model wallets
    const mlScoreCache = new Map<string, number | null>();

    const walletLoopStartMs = Date.now();
    const MAX_SYNC_MS = 240_000; // Stop after 4 min to leave headroom for response
    const MAX_PER_WALLET_MS = 30_000; // Hard cap per wallet
    let walletsProcessed = 0;
    let walletsStopped = false;

    for (const wallet of activeWallets) {
      // Time guard: stop before Vercel timeout; remaining wallets go first next run
      if (Date.now() - walletLoopStartMs > MAX_SYNC_MS) {
        walletsStopped = true;
        console.log(`[ft/sync] Time guard: ${walletsProcessed}/${activeWallets.length} wallets in ${((Date.now() - walletLoopStartMs) / 1000).toFixed(0)}s, stopping`);
        break;
      }

      results[wallet.wallet_id] = { inserted: 0, skipped: 0, evaluated: 0, reasons: {} };

      try {
        const walletStartMs = Date.now();
        const reasons = results[wallet.wallet_id].reasons;
        const lastSyncTime = wallet.last_sync_time ? new Date(wallet.last_sync_time) : new Date(wallet.start_date);

        // ── One DB read: existing orders for cash check + source_trade_id dedup ──
        const { data: walletOrders } = await supabase
          .from('ft_orders')
          .select('outcome, size, pnl, source_trade_id')
          .eq('wallet_id', wallet.wallet_id)
          .limit(10000);

        const existingSourceIds = new Set<string>();
        let openExposure = 0;
        let realizedPnl = 0;
        for (const o of walletOrders || []) {
          if (o.source_trade_id) existingSourceIds.add(o.source_trade_id);
          if (o.outcome === 'OPEN') openExposure += Number(o.size) || 0;
          if (o.outcome === 'WON' || o.outcome === 'LOST') realizedPnl += Number(o.pnl) || 0;
        }

        const startingBalance = wallet.starting_balance || 1000;
        let runningOpenExposure = openExposure;
        const extFilters = parseExtendedFilters(wallet);
        const minWinRate = extFilters.min_trader_win_rate ??
                          (wallet.use_model ? 0 : (wallet.model_threshold ?? 0));

        // Within-sync dedupe
        const seenThisSync = new Set<string>();

        for (const trade of allTrades) {
          // Per-wallet time guard
          if (Date.now() - walletStartMs > MAX_PER_WALLET_MS) {
            console.log(`[ft/sync] Wallet ${wallet.wallet_id} hit 30s per-wallet limit`);
            reasons['per_wallet_timeout'] = 1;
            break;
          }

          const tradeTime = parseTimestamp(trade.timestamp);
          if (!tradeTime) continue;
          if (tradeTime <= lastSyncTime) continue;

          const sourceTradeId = getSourceTradeId(trade);
          if (existingSourceIds.has(sourceTradeId)) continue; // Already taken in previous sync
          if (seenThisSync.has(sourceTradeId)) continue;
          seenThisSync.add(sourceTradeId);

          // ── Target trader filter (no DB writes) ──
          const targetTrader = extFilters.target_trader;
          const targetTraders = extFilters.target_traders;
          if (wallet.wallet_id.startsWith('TRADER_') && !targetTrader && (!targetTraders || targetTraders.length === 0)) {
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
              reasons['not_target_trader'] = (reasons['not_target_trader'] || 0) + 1;
              results[wallet.wallet_id].skipped++;
              continue;
            }
          }

          results[wallet.wallet_id].evaluated++;

          // TRADER_* wallets with a target_trader bypass certain filters —
          // the whole point is to mirror everything that trader does.
          const isTargetTraderWallet = !!(targetTrader && wallet.wallet_id.startsWith('TRADER_'));

          // ── Market checks (all in-memory, no DB writes) ──
          const market = marketMap.get(trade.conditionId || '');
          if (!market) { reasons['market_not_found'] = (reasons['market_not_found'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          // TRADER_* wallets tracking a target_trader allow resolved markets —
          // we want to capture ALL of the trader's activity for performance evaluation,
          // even trades on markets that resolved between trade time and sync time.
          const allowResolved = isTargetTraderWallet;
          if (!allowResolved && (market.resolved || market.closed)) { reasons['market_resolved'] = (reasons['market_resolved'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (!allowResolved && market.endTime && tradeTime >= market.endTime) { reasons['after_market_end'] = (reasons['after_market_end'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }

          if (extFilters.trade_live_only) {
            const gameStartIso = market.game_start_time ?? null;
            if (!gameStartIso) { reasons['no_game_start_time'] = (reasons['no_game_start_time'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
            if (now < new Date(gameStartIso)) { reasons['pre_game'] = (reasons['pre_game'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          }

          // ── Price / edge / WR filters (all in-memory) ──
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
          const edge = traderWinRate - priceWithSlippage;

          if (price < wallet.price_min || price > wallet.price_max) { reasons['price_out_of_range'] = (reasons['price_out_of_range'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (!isTargetTraderWallet && traderWinRate < minWinRate) { reasons['low_win_rate'] = (reasons['low_win_rate'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (!isTargetTraderWallet && edge < wallet.min_edge) { reasons['insufficient_edge'] = (reasons['insufficient_edge'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (!isTargetTraderWallet && traderTradeCount < (wallet.min_trader_resolved_count || 30)) { reasons['low_trade_count'] = (reasons['low_trade_count'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (!isTargetTraderWallet && (wallet.min_conviction || 0) > 0 && trade.conviction < (wallet.min_conviction || 0)) { reasons['low_conviction'] = (reasons['low_conviction'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (extFilters.max_trader_win_rate !== undefined && traderWinRate > extFilters.max_trader_win_rate) { reasons['high_win_rate'] = (reasons['high_win_rate'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (extFilters.max_edge !== undefined && edge > extFilters.max_edge) { reasons['high_edge'] = (reasons['high_edge'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (extFilters.max_conviction !== undefined && trade.conviction > extFilters.max_conviction) { reasons['high_conviction'] = (reasons['high_conviction'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }

          // ── Category filter (in-memory) ──
          const marketCats = extFilters.market_categories?.length
            ? extFilters.market_categories
            : (wallet.market_categories?.length ? wallet.market_categories : null);
          if (marketCats && marketCats.length > 0) {
            const titleLower = ((trade.title || market.title || '').toString()).toLowerCase();
            const tagsArr = Array.isArray(market.tags) ? market.tags : (typeof market.tags === 'object' && market.tags !== null ? Object.values(market.tags) : []);
            const tagsStr = tagsArr.map((t: unknown) => String(t || '')).join(' ').toLowerCase();
            if (!marketCats.some(cat => `${titleLower} ${tagsStr}`.includes((cat || '').toLowerCase()))) {
              reasons['wrong_category'] = (reasons['wrong_category'] || 0) + 1; results[wallet.wallet_id].skipped++; continue;
            }
          }

          // ── Trade size filter (in-memory) ──
          const originalTradeSize = Number(trade.size || 0);
          if (extFilters.min_original_trade_usd !== undefined && originalTradeSize < extFilters.min_original_trade_usd) { reasons['trade_too_small'] = (reasons['trade_too_small'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }
          if (extFilters.max_original_trade_usd !== undefined && originalTradeSize > extFilters.max_original_trade_usd) { reasons['trade_too_large'] = (reasons['trade_too_large'] || 0) + 1; results[wallet.wallet_id].skipped++; continue; }

          // ── ML scoring (use_model wallets only — only DB-touching filter) ──
          let preInsertMlProbability: number | null = null;
          if (wallet.use_model && wallet.model_threshold != null) {
            try {
              if (mlScoreCache.has(sourceTradeId)) {
                preInsertMlProbability = mlScoreCache.get(sourceTradeId) ?? null;
              } else {
                let outcomes = market.outcomes || ['Yes', 'No'];
                let outcomePrices = market.outcome_prices;
                if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { outcomes = ['Yes', 'No']; } }
                if (typeof outcomePrices === 'string') { try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = [0.5, 0.5]; } }
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
                  if (polyScoreResponse.prediction?.probability) preInsertMlProbability = polyScoreResponse.prediction.probability;
                  else if (polyScoreResponse.valuation?.ai_fair_value) preInsertMlProbability = polyScoreResponse.valuation.ai_fair_value;
                  else if (polyScoreResponse.analysis?.prediction_stats?.ai_fair_value) preInsertMlProbability = polyScoreResponse.analysis.prediction_stats.ai_fair_value;
                  if (preInsertMlProbability != null && preInsertMlProbability > 1) preInsertMlProbability /= 100;
                }
                mlScoreCache.set(sourceTradeId, preInsertMlProbability);
              }
              if (preInsertMlProbability == null || preInsertMlProbability < wallet.model_threshold) {
                const reason = preInsertMlProbability == null ? 'ml_unavailable' : 'low_ml_score';
                reasons[reason] = (reasons[reason] || 0) + 1;
                results[wallet.wallet_id].skipped++;
                continue;
              }
            } catch (mlErr: unknown) {
              console.warn(`[ft/sync] ML pre-check failed for ${sourceTradeId}:`, mlErr);
              reasons['ml_unavailable'] = (reasons['ml_unavailable'] || 0) + 1;
              results[wallet.wallet_id].skipped++;
              continue;
            }
          }

          // ── Cash / bankroll check (in-memory) ──
          const effectiveBankroll = Math.max(0, startingBalance + realizedPnl - runningOpenExposure);
          const effectiveBetSize = calculateBetSize(
            wallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll, preInsertMlProbability
          );
          if (effectiveBankroll < effectiveBetSize || effectiveBankroll <= 0) {
            reasons['insufficient_cash'] = (reasons['insufficient_cash'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
            continue;
          }

          // ═══ PASSED ALL FILTERS → INSERT ORDER ═══
          // For TRADER_* wallets capturing trades on already-resolved markets,
          // determine outcome immediately (WON/LOST based on winning_side).
          let orderOutcome = 'OPEN';
          let orderPnl: number | null = null;
          if (allowResolved && (market.resolved || market.closed) && market.winning_side) {
            const tokenLabel = (trade.outcome || 'YES').toUpperCase().trim();
            const winningSide = market.winning_side.toUpperCase().trim();
            const won = tokenLabel === winningSide;
            orderOutcome = won ? 'WON' : 'LOST';
            // PnL: WON = (shares - cost), LOST = -cost
            // shares = betSize / entryPrice, cost = betSize
            const shares = priceWithSlippage > 0 ? effectiveBetSize / priceWithSlippage : 0;
            orderPnl = won ? +(shares - effectiveBetSize).toFixed(2) : -effectiveBetSize;
          }

          const ftOrder: Record<string, unknown> = {
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
            model_probability: preInsertMlProbability,
            edge_pct: edge,
            conviction: trade.conviction ?? null,
            outcome: orderOutcome,
            order_time: tradeTime.toISOString()
          };
          if (orderPnl !== null) ftOrder.pnl = orderPnl;

          const { error: insertError } = await supabase.from('ft_orders').insert(ftOrder);
          if (insertError) {
            console.error(`[ft/sync] Insert error for ${wallet.wallet_id}:`, insertError);
            reasons['insert_error'] = (reasons['insert_error'] || 0) + 1;
            results[wallet.wallet_id].skipped++;
          } else {
            results[wallet.wallet_id].inserted++;
            runningOpenExposure += effectiveBetSize;
          }
        }

        // Update wallet sync time (no ft_seen_trades COUNT queries needed)
        await supabase.from('ft_wallets').update({
          last_sync_time: now.toISOString(),
          updated_at: now.toISOString()
        }).eq('wallet_id', wallet.wallet_id);

        walletsProcessed++;
      } catch (walletErr: unknown) {
        const msg = walletErr instanceof Error ? walletErr.message : String(walletErr);
        console.error(`[ft/sync] Error processing wallet ${wallet.wallet_id}:`, msg);
        errors.push(`Wallet ${wallet.wallet_id}: ${msg}`);
        walletsProcessed++;
        // CRITICAL: update last_sync_time even on error to prevent queue deadlock
        try {
          await supabase.from('ft_wallets').update({
            last_sync_time: now.toISOString(), updated_at: now.toISOString()
          }).eq('wallet_id', wallet.wallet_id);
        } catch { /* ignore */ }
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
      traders_checked: eligibleTraders.length,
      trades_fetched: allTrades.length,
      wallets_processed: walletsProcessed,
      wallets_remaining: activeWallets.length - walletsProcessed,
      time_guard_hit: walletsStopped,
      elapsed_ms: Date.now() - walletLoopStartMs,
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
