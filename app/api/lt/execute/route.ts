import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getActiveStrategies, executeTrade, type EnrichedTrade } from '@/lib/live-trading/executor';
import { fetchPolymarketLeaderboard } from '@/lib/polymarket-leaderboard';
import {
    evaluateTrade,
    getSourceTradeId,
    parseTimestamp,
    type PolymarketTrade,
    type FTWallet,
    type MarketInfo,
    parseExtendedFilters,
} from '@/lib/ft-sync/shared-logic';

const TOP_TRADERS_LIMIT = 100;
const TRADES_PAGE_SIZE = 50;
const MAX_PAGES_PER_TRADER = 4;

/**
 * POST /api/lt/execute
 * Execute live trades for active strategies
 * Called by cron every 2 minutes (mirrors ft/sync)
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    try {
        const supabase = createAdminServiceClient();
        const now = new Date();

        console.log('[lt/execute] Starting execution at', now.toISOString());

        // Get active strategies
        const strategies = await getActiveStrategies(supabase);
        if (strategies.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No active strategies to execute',
                strategies: 0,
            });
        }

        console.log(`[lt/execute] Found ${strategies.length} active strategies`);

        // Get FT wallet configs
        const ftWalletIds = [...new Set(strategies.map(s => s.ft_wallet_id))];
        const { data: ftWallets } = await supabase
            .from('ft_wallets')
            .select('*')
            .in('wallet_id', ftWalletIds);

        if (!ftWallets || ftWallets.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No FT wallets found for strategies',
            });
        }

        const ftWalletMap = new Map<string, FTWallet>();
        ftWallets.forEach(w => ftWalletMap.set(w.wallet_id, w as FTWallet));

        // Get oldest lastSyncTime across strategies
        const minLastSyncTime = strategies.reduce((min, s) => {
            const t = s.last_sync_time ? new Date(s.last_sync_time) : (s.launched_at ? new Date(s.launched_at) : new Date(0));
            return !min || t < min ? t : min;
        }, null as Date | null) || new Date(0);

        // Get traders from leaderboard (same as ft/sync)
        const [tradersByPnlMonth, tradersByVolMonth, tradersByPnlWeek] = await Promise.all([
            fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'PNL', limit: TOP_TRADERS_LIMIT }),
            fetchPolymarketLeaderboard({ timePeriod: 'month', orderBy: 'VOL', limit: TOP_TRADERS_LIMIT }),
            fetchPolymarketLeaderboard({ timePeriod: 'week', orderBy: 'PNL', limit: TOP_TRADERS_LIMIT })
        ]);

        const traderMap = new Map<string, typeof tradersByPnlMonth[0]>();
        [...tradersByPnlMonth, ...tradersByVolMonth, ...tradersByPnlWeek].forEach(t => {
            const key = t.wallet.toLowerCase();
            if (!traderMap.has(key)) {
                traderMap.set(key, t);
            }
        });

        // Add target traders from strategies
        for (const strategy of strategies) {
            const ftWallet = ftWalletMap.get(strategy.ft_wallet_id);
            if (!ftWallet) continue;
            const ext = parseExtendedFilters(ftWallet);
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
        const traderWallets = topTraders.map(t => t.wallet.toLowerCase());

        // Get trader stats
        const { data: traderStats } = await supabase
            .from('trader_global_stats')
            .select('wallet_address, l_win_rate, d30_win_rate, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd')
            .in('wallet_address', traderWallets);

        interface TraderStats { winRate: number; tradeCount: number; avgTradeSize: number }
        const statsMap = new Map<string, TraderStats>();
        if (traderStats) {
            for (const stat of traderStats) {
                const winRate = stat.d30_win_rate ?? stat.l_win_rate ?? 0.5;
                const tradeCount = stat.d30_count ?? stat.l_count ?? 0;
                const avgTradeSize = stat.d30_avg_trade_size_usd ?? stat.l_avg_trade_size_usd ?? 0;
                statsMap.set(stat.wallet_address.toLowerCase(), {
                    winRate: typeof winRate === 'number' ? winRate : parseFloat(String(winRate)) || 0.5,
                    tradeCount: typeof tradeCount === 'number' ? tradeCount : parseInt(String(tradeCount)) || 0,
                    avgTradeSize: typeof avgTradeSize === 'number' ? avgTradeSize : parseFloat(String(avgTradeSize)) || 0
                });
            }
        }

        // Fetch trades from Polymarket
        const allTrades: EnrichedTrade[] = [];
        const MIN_TRADE_COUNT = 30;

        for (const trader of topTraders) {
            const wallet = trader.wallet.toLowerCase();
            const stats = statsMap.get(wallet) || { winRate: 0.5, tradeCount: 0, avgTradeSize: 0 };
            if (stats.tradeCount < MIN_TRADE_COUNT) continue;

            try {
                let offset = 0;
                let pagesFetched = 0;
                let oldestInTrader: Date | null = null;

                while (pagesFetched < MAX_PAGES_PER_TRADER) {
                    const response = await fetch(
                        `https://data-api.polymarket.com/trades?user=${wallet}&limit=${TRADES_PAGE_SIZE}&offset=${offset}`,
                        { cache: 'no-store' }
                    );

                    if (!response.ok) break;
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
                            traderTradeCount: stats.tradeCount,
                            traderAvgTradeSize: stats.avgTradeSize,
                            tradeValue,
                            conviction
                        });
                    }

                    pagesFetched++;
                    offset += trades.length;
                    if (trades.length < TRADES_PAGE_SIZE) break;
                    if (oldestInTrader && oldestInTrader <= minLastSyncTime) break;
                }
            } catch (err: any) {
                console.warn(`[lt/execute] Error fetching trades for ${wallet}:`, err.message);
            }
        }

        console.log(`[lt/execute] Collected ${allTrades.length} BUY trades`);

        // Get market info
        const conditionIds = [...new Set(allTrades.map(t => t.conditionId).filter((id): id is string => Boolean(id)))];
        const { data: markets } = await supabase
            .from('markets')
            .select('condition_id, end_time, closed, resolved_outcome, winning_side, title, slug, outcome_prices, outcomes, tags, start_time, game_start_time')
            .in('condition_id', conditionIds);

        const marketMap = new Map<string, MarketInfo>();
        if (markets) {
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

        // Process trades for each strategy
        const results: Record<string, { executed: number; skipped: number; errors: number; reasons: Record<string, number> }> = {};
        const mlScoreCache = new Map<string, number | null>();
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        for (const strategy of strategies) {
            results[strategy.strategy_id] = { executed: 0, skipped: 0, errors: 0, reasons: {} };
            const reasons = results[strategy.strategy_id].reasons;

            const ftWallet = ftWalletMap.get(strategy.ft_wallet_id);
            if (!ftWallet) {
                console.warn(`[lt/execute] FT wallet not found: ${strategy.ft_wallet_id}`);
                continue;
            }

            const lastSyncTime = strategy.last_sync_time
                ? new Date(strategy.last_sync_time)
                : (strategy.launched_at ? new Date(strategy.launched_at) : new Date(0));

            // Get current exposure for bankroll calculation
            const { data: ltOrders } = await supabase
                .from('lt_orders')
                .select('outcome, executed_size, pnl')
                .eq('strategy_id', strategy.strategy_id);

            const openExposure = (ltOrders || [])
                .filter(o => o.outcome === 'OPEN')
                .reduce((sum, o) => sum + (Number(o.executed_size) || 0), 0);
            const realizedPnl = (ltOrders || [])
                .filter(o => o.outcome === 'WON' || o.outcome === 'LOST')
                .reduce((sum, o) => sum + (Number(o.pnl) || 0), 0);
            const effectiveBankroll = Math.max(0, strategy.starting_capital + realizedPnl - openExposure);

            // Check already executed trades
            const { data: executedTrades } = await supabase
                .from('lt_orders')
                .select('source_trade_id')
                .eq('strategy_id', strategy.strategy_id);

            const executedSourceIds = new Set((executedTrades || []).map((o: any) => o.source_trade_id));

            // Evaluate and execute trades
            for (const trade of allTrades) {
                const tradeTime = parseTimestamp(trade.timestamp);
                if (!tradeTime || tradeTime <= lastSyncTime) continue;

                const sourceTradeId = getSourceTradeId({
                    id: trade.id,
                    transactionHash: trade.transactionHash,
                    traderWallet: trade.traderWallet,
                    conditionId: trade.conditionId,
                    timestamp: trade.timestamp,
                });
                if (executedSourceIds.has(sourceTradeId)) continue;

                const market = marketMap.get(trade.conditionId || '');
                const evaluation = await evaluateTrade(
                    trade,
                    ftWallet,
                    market || null,
                    now,
                    lastSyncTime,
                    effectiveBankroll,
                    mlScoreCache,
                    serviceRoleKey
                );

                if (!evaluation.qualifies) {
                    reasons[evaluation.reason || 'unknown'] = (reasons[evaluation.reason || 'unknown'] || 0) + 1;
                    results[strategy.strategy_id].skipped++;
                    continue;
                }

                // Execute trade
                try {
                    const execResult = await executeTrade(
                        supabase,
                        strategy,
                        trade,
                        ftWallet
                    );

                    if (execResult.success) {
                        results[strategy.strategy_id].executed++;
                        executedSourceIds.add(sourceTradeId);
                    } else {
                        results[strategy.strategy_id].errors++;
                        reasons[execResult.error || 'execution_failed'] = (reasons[execResult.error || 'execution_failed'] || 0) + 1;
                    }
                } catch (error: any) {
                    console.error(`[lt/execute] Execution error for ${sourceTradeId}:`, error);
                    results[strategy.strategy_id].errors++;
                    reasons['execution_error'] = (reasons['execution_error'] || 0) + 1;
                }
            }

            // Update last sync time
            await supabase
                .from('lt_strategies')
                .update({ last_sync_time: now.toISOString() })
                .eq('strategy_id', strategy.strategy_id);
        }

        const totalExecuted = Object.values(results).reduce((sum, r) => sum + r.executed, 0);
        const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

        return NextResponse.json({
            success: true,
            executed_at: now.toISOString(),
            strategies_processed: strategies.length,
            trades_evaluated: allTrades.length,
            total_executed: totalExecuted,
            total_skipped: totalSkipped,
            total_errors: totalErrors,
            results,
        });
    } catch (error: any) {
        console.error('[lt/execute] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Execution failed', details: String(error) },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to execute live trades',
        description: 'Executes real trades for active LT strategies following FT signals',
    });
}
