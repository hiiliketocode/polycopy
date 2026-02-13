/**
 * POST /api/lt/execute
 *
 * Core LT execution endpoint. Called by cron every minute.
 * Sources trades from ft_orders (FT wallet decisions), deduplicates,
 * and executes via the V2 executor pipeline.
 *
 * Flow:
 *   1. Daily risk reset (if needed)
 *   2. Process cooldown queue for all strategies
 *   3. Fetch active strategies + FT wallet configs
 *   4. For each strategy → get OPEN ft_orders → deduplicate → execute
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { createLTLogger } from '@/lib/live-trading/lt-logger';
import { processAllCooldowns } from '@/lib/live-trading/capital-manager';
import { resetDailyRiskState } from '@/lib/live-trading/risk-manager-v2';
import { getActiveStrategies, executeTrade, type LTStrategy } from '@/lib/live-trading/executor-v2';
import { batchResolveTokenIds } from '@/lib/live-trading/token-cache';
import { type FTWallet, type EnrichedTrade, getSourceTradeId, FT_SLIPPAGE_PCT } from '@/lib/ft-sync/shared-logic';

const FT_LOOKBACK_HOURS = 6;  // Look back 6 hours for FT orders (down from 24h)

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const logger = createLTLogger(supabase);
    const now = new Date();

    try {
        await logger.info('EXECUTION_START', `LT execution starting at ${now.toISOString()}`);

        // ── Step 1: Daily risk reset ──
        const resetCount = await resetDailyRiskState(supabase);
        if (resetCount > 0) {
            await logger.info('DAILY_RESET', `Reset daily risk state for ${resetCount} strategies`);
        }

        // ── Step 2: Process cooldowns ──
        const cooldownResult = await processAllCooldowns(supabase);
        if (cooldownResult.totalReleased > 0) {
            await logger.info('COOLDOWN_PROCESS', `Released $${cooldownResult.totalReleased.toFixed(2)} from cooldown across ${cooldownResult.processed} strategies`);
        }

        // ── Step 3: Get active strategies ──
        const strategies = await getActiveStrategies(supabase);
        if (strategies.length === 0) {
            await logger.info('EXECUTION_END', 'No active strategies');
            return NextResponse.json({ success: true, message: 'No active strategies', strategies: 0 });
        }

        await logger.info('EXECUTION_START', `Found ${strategies.length} active strategies`);

        // ── Step 4: Load FT wallet configs ──
        const ftWalletIds = [...new Set(strategies.map(s => s.ft_wallet_id))];
        const { data: ftWallets } = await supabase
            .from('ft_wallets')
            .select('*')
            .in('wallet_id', ftWalletIds);

        if (!ftWallets || ftWallets.length === 0) {
            await logger.error('EXECUTION_END', 'No FT wallets found');
            return NextResponse.json({ success: false, error: 'No FT wallets found' });
        }

        const ftWalletMap = new Map<string, FTWallet>();
        ftWallets.forEach(w => ftWalletMap.set(w.wallet_id, w as FTWallet));

        // ── Step 5: Process each strategy ──
        const results: Record<string, { executed: number; skipped: number; errors: number; reasons: Record<string, number> }> = {};

        // Sort strategies: process those with fewest recent ft_orders first
        // so that one busy strategy (e.g. 800+ orders) doesn't starve the rest.
        // We'll also enforce a per-strategy time budget.
        const STRATEGY_TIME_BUDGET_MS = 15_000; // 15 seconds per strategy max

        for (const strategy of strategies) {
            const strategyLogger = logger.withContext({
                strategy_id: strategy.strategy_id,
                ft_wallet_id: strategy.ft_wallet_id,
            });

            results[strategy.strategy_id] = { executed: 0, skipped: 0, errors: 0, reasons: {} };
            const summary = results[strategy.strategy_id];

            const ftWallet = ftWalletMap.get(strategy.ft_wallet_id);
            if (!ftWallet) {
                await strategyLogger.warn('STRATEGY_START', `FT wallet not found: ${strategy.ft_wallet_id}`);
                continue;
            }

            await strategyLogger.info('STRATEGY_START', `Processing strategy (cash: $${strategy.available_cash.toFixed(2)}, locked: $${strategy.locked_capital.toFixed(2)}, cooldown: $${strategy.cooldown_capital.toFixed(2)})`, {
                available_cash: strategy.available_cash,
                locked_capital: strategy.locked_capital,
                cooldown_capital: strategy.cooldown_capital,
            });

            // ── Step 5a: Fetch OPEN ft_orders ──
            const lookbackMs = FT_LOOKBACK_HOURS * 60 * 60 * 1000;
            const minOrderTime = new Date(now.getTime() - lookbackMs).toISOString();

            const { data: ftOrders, error: ftError } = await supabase
                .from('ft_orders')
                .select('order_id, condition_id, market_title, market_slug, token_label, source_trade_id, trader_address, entry_price, size, order_time, trader_win_rate, trader_resolved_count, conviction')
                .eq('wallet_id', strategy.ft_wallet_id)
                .eq('outcome', 'OPEN')
                .gte('order_time', minOrderTime)
                .order('order_time', { ascending: true });

            if (ftError) {
                await strategyLogger.error('FT_QUERY', `FT orders query failed: ${ftError.message}`);
                summary.reasons['ft_query_error'] = 1;
                continue;
            }

            if (!ftOrders?.length) {
                await strategyLogger.info('FT_QUERY', `No OPEN ft_orders in last ${FT_LOOKBACK_HOURS}h — FT wallet may not have new trades`);
                continue;
            }

            await strategyLogger.info('FT_QUERY', `Found ${ftOrders.length} OPEN ft_orders to consider`);

            // ── Step 5b: Dedup against existing lt_orders ──
            // Paginate to handle >1000 rows (Supabase default limit)
            const executedSourceIds = new Set<string>();
            let dedupOffset = 0;
            const DEDUP_PAGE = 1000;
            while (true) {
                const { data: page } = await supabase
                    .from('lt_orders')
                    .select('source_trade_id')
                    .eq('strategy_id', strategy.strategy_id)
                    .range(dedupOffset, dedupOffset + DEDUP_PAGE - 1);
                if (!page || page.length === 0) break;
                for (const o of page) { if (o.source_trade_id) executedSourceIds.add(o.source_trade_id); }
                if (page.length < DEDUP_PAGE) break;
                dedupOffset += DEDUP_PAGE;
            }

            // ── Step 5c: Pre-resolve token IDs ──
            const tokenPairs = ftOrders
                .filter(fo => !executedSourceIds.has(fo.source_trade_id || `${fo.trader_address}-${fo.condition_id}-${fo.order_time}`))
                .map(fo => ({
                    conditionId: fo.condition_id,
                    outcome: fo.token_label || 'YES',
                }));

            if (tokenPairs.length > 0) {
                await batchResolveTokenIds(supabase, tokenPairs, strategyLogger);
            }

            // ── Step 5d: Execute each trade ──
            const totalFtOrders = ftOrders.length;
            let dedupSkipped = 0;
            const strategyStartTime = Date.now();

            for (const fo of ftOrders) {
                // Time budget: don't let one strategy monopolize the cron
                if (Date.now() - strategyStartTime > STRATEGY_TIME_BUDGET_MS) {
                    await strategyLogger.warn('TIME_BUDGET', `Strategy time budget exhausted (${STRATEGY_TIME_BUDGET_MS}ms) — deferring remaining ${totalFtOrders - dedupSkipped - summary.executed - summary.errors} trades to next run`);
                    break;
                }

                const sourceTradeId = fo.source_trade_id || `${fo.trader_address}-${fo.condition_id}-${fo.order_time}`;

                if (executedSourceIds.has(sourceTradeId)) {
                    dedupSkipped++;
                    summary.skipped++;
                    continue;
                }

                const entryPrice = Number(fo.entry_price) || 0;
                const sizeUsd = Number(fo.size) || 0;
                const conviction = Number(fo.conviction) ?? 1;
                const traderWinRate = Number(fo.trader_win_rate) ?? 0.5;
                const traderTradeCount = Number(fo.trader_resolved_count) ?? 50;

                // CRITICAL: Derive the original trader's price by reversing FT's
                // simulated slippage. FT stores entry_price = original_price × (1 + 0.3%).
                // LT must start from the original price so it can apply its own
                // independent slippage for CLOB limit orders, and calculate edge
                // identically to FT (both using FT_SLIPPAGE_PCT from the same base).
                const originalTradePrice = entryPrice / (1 + FT_SLIPPAGE_PCT);

                const trade: EnrichedTrade = {
                    id: sourceTradeId,
                    transactionHash: sourceTradeId,
                    conditionId: fo.condition_id,
                    title: fo.market_title,
                    slug: fo.market_slug,
                    outcome: (fo.token_label || 'YES').toUpperCase(),
                    side: 'BUY',
                    size: entryPrice > 0 ? sizeUsd / entryPrice : 0,
                    price: originalTradePrice,
                    timestamp: fo.order_time,
                    traderWallet: (fo.trader_address || '').toLowerCase(),
                    traderWinRate,
                    traderTradeCount,
                    traderAvgTradeSize: conviction > 0 ? sizeUsd / conviction : sizeUsd,
                    tradeValue: sizeUsd,
                    conviction,
                };

                try {
                    const result = await executeTrade(supabase, strategy, trade, ftWallet, fo.order_id, strategyLogger);

                    if (result.success) {
                        summary.executed++;
                        executedSourceIds.add(sourceTradeId);
                    } else {
                        summary.errors++;
                        const key = result.stage || result.error || 'unknown';
                        summary.reasons[key] = (summary.reasons[key] || 0) + 1;
                    }
                } catch (err: any) {
                    summary.errors++;
                    summary.reasons['exception'] = (summary.reasons['exception'] || 0) + 1;
                    await strategyLogger.error('ERROR', `Exception executing trade: ${err.message}`, {
                        source_trade_id: sourceTradeId,
                        error: err.message,
                    });
                }
            }

            if (dedupSkipped > 0) {
                await strategyLogger.info('DEDUP', `Skipped ${dedupSkipped}/${totalFtOrders} FT orders (already processed). ${totalFtOrders - dedupSkipped} new.`);
            }

            // Update sync time
            await supabase.from('lt_strategies')
                .update({ last_sync_time: now.toISOString(), updated_at: now.toISOString() })
                .eq('strategy_id', strategy.strategy_id);

            await strategyLogger.info('STRATEGY_END', `Strategy done: ${summary.executed} executed, ${summary.skipped} skipped (dedup), ${summary.errors} errors`, summary);
        }

        const totalExecuted = Object.values(results).reduce((s, r) => s + r.executed, 0);
        const totalErrors = Object.values(results).reduce((s, r) => s + r.errors, 0);

        await logger.info('EXECUTION_END', `LT execution complete: ${totalExecuted} executed, ${totalErrors} errors across ${strategies.length} strategies`, {
            total_executed: totalExecuted,
            total_errors: totalErrors,
        });

        return NextResponse.json({
            success: true,
            executed_at: now.toISOString(),
            strategies_processed: strategies.length,
            total_executed: totalExecuted,
            total_errors: totalErrors,
            cooldown_released: cooldownResult.totalReleased,
            daily_reset_count: resetCount,
            results,
        });
    } catch (error: any) {
        await logger.error('ERROR', `LT execution fatal error: ${error.message}`, { error: error.message, stack: error.stack?.slice(0, 500) });
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to execute live trades',
        description: 'V2: Executes real orders for active LT strategies from ft_orders. Includes cash management, risk checks, structured logging.',
    });
}
