import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';
import { getPolyScore } from '@/lib/polyscore/get-polyscore';

const TOP_TRADERS_LIMIT = 100; // Polymarket API max is 100
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
  trade_live_only?: boolean;      // Only take trades when current time >= market game_start_time (or start_time)
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
  allocation_method: 'FIXED' | 'KELLY' | 'EDGE_SCALED' | 'TIERED' | 'CONFIDENCE' | 'CONVICTION';
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

/**
 * Calculate bet size based on allocation method
 */
function calculateBetSize(
  wallet: FTWallet,
  traderWinRate: number,
  entryPrice: number,
  edge: number,
  conviction: number,  // Trader's conviction = trade_value / avg_trade_size
  effectiveBankroll?: number  // startingBalance + realizedPnl - openExposure (avoids stale current_balance)
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
      // score = weighted combination of edge, trader WR, and conviction
      const baseBet = wallet.bet_size * (wallet.bet_allocation_weight || 1.0);
      const edgeScore = Math.min(edge / 0.20, 1); // Normalize edge (cap at 20%)
      const wrScore = Math.min((traderWinRate - 0.50) / 0.30, 1); // Normalize WR above 50%
      const convictionScore = Math.min((conviction - 0.5) / 2.5, 1); // Normalize conviction (0.5 to 3 → 0 to 1)
      
      // Weighted: 40% edge + 30% conviction + 30% win rate
      const confidenceScore = (edgeScore * 0.4) + (convictionScore * 0.3) + (wrScore * 0.3);
      betSize = baseBet * (0.5 + confidenceScore * 1.5); // 0.5x to 2x based on score
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
    
    // Filter to only active test period wallets
    const activeWallets = (wallets as FTWallet[]).filter(w => {
      const startDate = new Date(w.start_date);
      const endDate = new Date(w.end_date);
      return startDate <= now && endDate >= now;
    });
    
    if (activeWallets.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No wallets in active test period',
        wallets: wallets.length,
        active: 0
      });
    }
    
    console.log(`[ft/sync] Found ${activeWallets.length} active wallets`);
    
    // 2. Get traders from different pools based on strategy needs
    // Fetch multiple pools to support different strategies
    const [tradersByPnlMonth, tradersByVolMonth, tradersByPnlWeek] = await Promise.all([
      fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'PNL', limit: TOP_TRADERS_LIMIT }),
      fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'VOL', limit: TOP_TRADERS_LIMIT }),
      fetchPolymarketLeaderboard({ timePeriod: 'week', orderBy: 'PNL', limit: TOP_TRADERS_LIMIT })
    ]);
    
    // Merge into unique trader set
    const traderMap = new Map<string, typeof tradersByPnlMonth[0]>();
    [...tradersByPnlMonth, ...tradersByVolMonth, ...tradersByPnlWeek].forEach(t => {
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
    
    const topTraders = Array.from(traderMap.values());
    
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
    const { data: traderStats, error: statsError } = await supabase
      .from('trader_global_stats')
      .select('wallet_address, l_win_rate, d30_win_rate, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd')
      .in('wallet_address', traderWallets);
    
    interface TraderStats { winRate: number; tradeCount: number; avgTradeSize: number }
    const statsMap = new Map<string, TraderStats>();
    if (!statsError && traderStats) {
      for (const stat of traderStats) {
        // Use 30-day stats first, then lifetime as fallback
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

      // Skip traders with insufficient track record (except niche-targeted traders from trader_profile_stats).
      // When stats are missing (trader not in trader_global_stats), treat as 50 - leaderboard presence implies activity.
      const effectiveTradeCount = stats.tradeCount > 0 ? stats.tradeCount : 50;
      if (!targetTraderAddresses.has(wallet) && effectiveTradeCount < MIN_TRADE_COUNT) continue;

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
      .select('condition_id, end_time, closed, resolved_outcome, winning_side, title, slug, outcome_prices, outcomes, tags, start_time')
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
          game_start_time: market.game_start_time ?? null
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
              const gameStart = m.gameStartTime || m.game_start_time || m.startDate || m.start_date;
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
                game_start_time: gameStart ?? null
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

    for (const wallet of activeWallets) {
      results[wallet.wallet_id] = { inserted: 0, skipped: 0, evaluated: 0, reasons: {} };
      const reasons = results[wallet.wallet_id].reasons;
      
      const lastSyncTime = wallet.last_sync_time ? new Date(wallet.last_sync_time) : new Date(wallet.start_date);
      
      // Fetch current wallet state for cash check (stop trading when out of cash)
      const { data: walletOrders } = await supabase
        .from('ft_orders')
        .select('outcome, size, pnl')
        .eq('wallet_id', wallet.wallet_id);
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

        // trade_live_only: only take trades when current time >= game/event start
        if (extFilters.trade_live_only) {
          const gameStartIso = market.game_start_time || market.start_time;
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
        const traderWinRate = trade.traderWinRate;
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
        if (trade.traderTradeCount < (wallet.min_trader_resolved_count || 30)) {
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
          const titleLower = (trade.title || '').toLowerCase();
          const matchesCategory = marketCats.some(cat =>
            titleLower.includes((cat || '').toLowerCase())
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
        
        const effectiveBankroll = Math.max(0, startingBalance + realizedPnl - runningOpenExposure);
        const effectiveBetSize = calculateBetSize(wallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll);
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
        
        // P0-1: For use_model=true, compute ML score BEFORE insert; skip if below threshold
        let preInsertMlProbability: number | null = null;
        if (wallet.use_model && wallet.model_threshold != null) {
          try {
            // Reuse cached ML score if same trade was already scored for another use_model wallet
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
              const shares = price > 0 ? effectiveBetSize / price : 0;

              const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
              const polyScoreResponse = await getPolyScore({
              original_trade: {
                wallet_address: trade.traderWallet,
                condition_id: trade.conditionId || '',
                side: (trade.side || 'BUY') as 'BUY' | 'SELL',
                price,
                shares_normalized: shares,
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
      markets_found: marketMap.size,
      wallets_processed: activeWallets.length,
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
