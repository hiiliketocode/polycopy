import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getActiveStrategies, executeTrade } from '@/lib/live-trading/executor';
import { initializeRiskState } from '@/lib/live-trading/risk-manager';
import { ltLog } from '@/lib/live-trading/lt-execute-logger';
import { type FTWallet, type EnrichedTrade } from '@/lib/ft-sync/shared-logic';

/**
 * Resolve CLOB token_id from condition_id and outcome label (YES/NO).
 * Used when executing from ft_orders which don't store token_id.
 * Includes retry logic with exponential backoff for reliability.
 */
async function resolveTokenId(
    conditionId: string,
    tokenLabel: string,
    supabase: ReturnType<typeof createAdminServiceClient>,
    maxRetries: number = 3
): Promise<string | null> {
    const label = (tokenLabel || 'yes').toLowerCase();
    
    // Try CLOB API with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Token Resolution] Attempt ${attempt}/${maxRetries} for ${conditionId} (${label})`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
            
            const resp = await fetch(
                `https://clob.polymarket.com/markets/${conditionId}`, 
                { 
                    cache: 'no-store',
                    signal: controller.signal
                }
            );
            clearTimeout(timeoutId);
            
            if (resp.ok) {
                const clobMarket = await resp.json();
                if (Array.isArray(clobMarket?.tokens)) {
                    const matched = clobMarket.tokens.find((t: any) => (t.outcome || '').toLowerCase() === label);
                    const tokenId = matched?.token_id || clobMarket.tokens[0]?.token_id || null;
                    
                    if (tokenId) {
                        console.log(`[Token Resolution] ✅ Resolved via CLOB: ${tokenId}`);
                        return tokenId;
                    }
                }
            }
        } catch (error: any) {
            console.warn(`[Token Resolution] CLOB attempt ${attempt} failed:`, error.message);
            
            // Don't retry on last attempt
            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const waitMs = 1000 * Math.pow(2, attempt - 1);
                console.log(`[Token Resolution] Waiting ${waitMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }
    }
    
    // Fallback to database
    console.log(`[Token Resolution] CLOB API failed, trying database fallback...`);
    try {
        const { data: marketRow, error: dbError } = await supabase
            .from('markets')
            .select('tokens')
            .eq('condition_id', conditionId)
            .single();
        
        if (dbError) {
            console.warn(`[Token Resolution] Database query failed:`, dbError.message);
            return null;
        }
        
        let tokens = marketRow?.tokens;
        if (typeof tokens === 'string') {
            try {
                tokens = JSON.parse(tokens);
            } catch {
                tokens = null;
            }
        }
        
        if (Array.isArray(tokens)) {
            const matched = tokens.find((t: any) => (t.outcome || '').toLowerCase() === label);
            const tokenId = matched?.token_id || tokens[0]?.token_id || null;
            
            if (tokenId) {
                console.log(`[Token Resolution] ✅ Resolved via database: ${tokenId}`);
                return tokenId;
            }
        }
    } catch (error: any) {
        console.error(`[Token Resolution] Database fallback failed:`, error.message);
    }
    
    console.error(`[Token Resolution] ❌ Failed to resolve token ID for ${conditionId} (${label})`);
    return null;
}

/**
 * POST /api/lt/execute
 * Execute live trades for active strategies by following FT's decisions.
 * Sources trades from ft_orders (the FT wallet's taken trades), not from Polymarket API.
 * Called by cron every 2 minutes.
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    try {
        const supabase = createAdminServiceClient();
        const now = new Date();

        console.log('[lt/execute] Starting execution at', now.toISOString());
        await ltLog(supabase, 'info', `Starting execution at ${now.toISOString()}`);

        // Get active strategies
        const strategies = await getActiveStrategies(supabase);
        if (strategies.length === 0) {
            await ltLog(supabase, 'info', 'No active strategies to execute');
            return NextResponse.json({
                success: true,
                message: 'No active strategies to execute',
                strategies: 0,
            });
        }

        console.log(`[lt/execute] Found ${strategies.length} active strategies`);
        await ltLog(supabase, 'info', `Found ${strategies.length} active strategies`);

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

        // Process each strategy: source trades from ft_orders (FT's decisions), not from Polymarket API
        const results: Record<string, { executed: number; skipped: number; errors: number; reasons: Record<string, number> }> = {};

        for (const strategy of strategies) {
            results[strategy.strategy_id] = { executed: 0, skipped: 0, errors: 0, reasons: {} };
            const reasons = results[strategy.strategy_id].reasons;

            // Ensure risk state and rules exist (legacy strategies may lack them)
            const { data: existingState } = await supabase
                .from('lt_risk_state')
                .select('state_id')
                .eq('strategy_id', strategy.strategy_id)
                .limit(1)
                .maybeSingle();
            if (!existingState) {
                await initializeRiskState(supabase, strategy.strategy_id, strategy.starting_capital || 1000);
                console.log(`[lt/execute] Initialized missing risk state for ${strategy.strategy_id}`);
            }
            const { data: existingRules } = await supabase
                .from('lt_risk_rules')
                .select('rule_id')
                .eq('strategy_id', strategy.strategy_id)
                .limit(1)
                .maybeSingle();
            if (!existingRules) {
                const { data: newRules } = await supabase
                    .from('lt_risk_rules')
                    .insert({
                        strategy_id: strategy.strategy_id,
                        daily_budget_pct: 0.10,
                        max_position_size_pct: 0.10,
                        max_total_exposure_pct: 0.50,
                        max_drawdown_pct: 0.07,
                        max_consecutive_losses: 5,
                        max_slippage_pct: 0.01,
                        max_concurrent_positions: 20,
                    })
                    .select('rule_id')
                    .single();
                if (newRules) {
                    await supabase.from('lt_strategies').update({ risk_rules_id: newRules.rule_id }).eq('strategy_id', strategy.strategy_id);
                }
                console.log(`[lt/execute] Created missing risk rules for ${strategy.strategy_id}`);
            }

            const ftWallet = ftWalletMap.get(strategy.ft_wallet_id);
            if (!ftWallet) {
                console.warn(`[lt/execute] FT wallet not found: ${strategy.ft_wallet_id}`);
                continue;
            }

            // Fetch OPEN ft_orders for this wallet. Use fixed 24h lookback from now so we reliably catch
            // all recent FT decisions regardless of last_sync_time edge cases.
            const lookbackMs = 24 * 60 * 60 * 1000;
            const minOrderTime = new Date(now.getTime() - lookbackMs).toISOString();

            const { data: ftOrders, error: ftOrdersError } = await supabase
                .from('ft_orders')
                .select('order_id, condition_id, market_title, market_slug, token_label, source_trade_id, trader_address, entry_price, size, order_time, trader_win_rate, trader_resolved_count, conviction')
                .eq('wallet_id', strategy.ft_wallet_id)
                .eq('outcome', 'OPEN')
                .gte('order_time', minOrderTime)
                .order('order_time', { ascending: true });

            if (ftOrdersError) {
                reasons['ft_orders_error'] = (reasons['ft_orders_error'] || 0) + 1;
                const errMsg = ftOrdersError?.message || String(ftOrdersError);
                console.error(`[lt/execute] FT orders query failed for ${strategy.strategy_id} (ft_wallet=${strategy.ft_wallet_id}):`, errMsg);
                await ltLog(supabase, 'error', `FT orders query failed: ${errMsg}`, { strategy_id: strategy.strategy_id, ft_wallet_id: strategy.ft_wallet_id });
                await supabase.from('lt_strategies').update({ last_sync_time: now.toISOString() }).eq('strategy_id', strategy.strategy_id);
                continue;
            }

            if (!ftOrders?.length) {
                // Diagnostic: check if OTHER wallets have ft_orders (proves sync is working, this wallet just has none)
                const { data: otherWalletCounts } = await supabase
                    .from('ft_orders')
                    .select('wallet_id')
                    .eq('outcome', 'OPEN')
                    .gte('order_time', minOrderTime);
                const byWallet: Record<string, number> = {};
                for (const o of otherWalletCounts || []) {
                    byWallet[o.wallet_id] = (byWallet[o.wallet_id] || 0) + 1;
                }
                const totalOther = Object.values(byWallet).reduce((a, b) => a + b, 0);
                const diagMsg = `No FT orders found for ${strategy.strategy_id} (ft_wallet=${strategy.ft_wallet_id}) since ${minOrderTime}. Diagnostic: ${totalOther} OPEN ft_orders exist for other wallets: ${JSON.stringify(byWallet)}`;
                console.log(`[lt/execute] ${diagMsg}`);
                await ltLog(supabase, 'info', diagMsg, { strategy_id: strategy.strategy_id, ft_wallet_id: strategy.ft_wallet_id, extra: { byWallet, minOrderTime } });
                await supabase.from('lt_strategies').update({ last_sync_time: now.toISOString() }).eq('strategy_id', strategy.strategy_id);
                continue;
            }

            console.log(`[lt/execute] ${strategy.strategy_id}: Found ${ftOrders.length} OPEN ft_orders to consider`);
            await ltLog(supabase, 'info', `Found ${ftOrders.length} OPEN ft_orders to consider`, { strategy_id: strategy.strategy_id });

            const { data: executedTrades } = await supabase
                .from('lt_orders')
                .select('source_trade_id')
                .eq('strategy_id', strategy.strategy_id);
            const executedSourceIds = new Set((executedTrades || []).map((o: any) => o.source_trade_id));

            for (const fo of ftOrders) {
                const sourceTradeId = fo.source_trade_id || `${fo.trader_address}-${fo.condition_id}-${fo.order_time}`;
                
                console.log(`[lt/execute] Processing FT order for ${strategy.strategy_id}:`, {
                    order_id: fo.order_id,
                    market: fo.market_title?.substring(0, 50) + '...',
                    trader: fo.trader_address?.substring(0, 10) + '...',
                    price: fo.entry_price,
                    size: fo.size,
                    token_label: fo.token_label,
                    order_time: fo.order_time,
                    source_trade_id: sourceTradeId
                });
                
                if (executedSourceIds.has(sourceTradeId)) {
                    console.log(`[lt/execute] ⏭️  Skipping already executed trade: ${sourceTradeId}`);
                    continue;
                }

                const tokenId = await resolveTokenId(fo.condition_id, fo.token_label || 'YES', supabase);
                if (!tokenId) {
                    console.error(`[lt/execute] ❌ Skipping - Token ID resolution failed for ${fo.condition_id}`);
                    reasons['no_token_id'] = (reasons['no_token_id'] || 0) + 1;
                    results[strategy.strategy_id].skipped++;
                    const msg = `Token resolution failed: condition_id=${fo.condition_id} token_label=${fo.token_label || 'YES'} market="${(fo.market_title || '').slice(0, 50)}"`;
                    console.warn(`[lt/execute] ${msg}`);
                    await ltLog(supabase, 'warn', msg, { strategy_id: strategy.strategy_id, source_trade_id: sourceTradeId });
                    continue;
                }
                
                console.log(`[lt/execute] ✅ Token ID resolved: ${tokenId}`);

                const entryPrice = Number(fo.entry_price) || 0;
                const sizeUsd = Number(fo.size) || 0;
                const conviction = Number(fo.conviction) ?? 1;
                const traderWinRate = Number(fo.trader_win_rate) ?? 0.5;
                const traderTradeCount = Number(fo.trader_resolved_count) ?? 50;

                const trade: EnrichedTrade = {
                    id: sourceTradeId,
                    transactionHash: sourceTradeId,
                    asset: tokenId,
                    conditionId: fo.condition_id,
                    title: fo.market_title,
                    slug: fo.market_slug,
                    outcome: (fo.token_label || 'YES').toUpperCase(),
                    side: 'BUY',
                    size: entryPrice > 0 ? sizeUsd / entryPrice : 0,
                    price: entryPrice,
                    timestamp: fo.order_time,
                    traderWallet: (fo.trader_address || '').toLowerCase(),
                    traderWinRate,
                    traderTradeCount,
                    traderAvgTradeSize: conviction > 0 ? sizeUsd / conviction : sizeUsd,
                    tradeValue: sizeUsd,
                    conviction,
                };

                console.log(`[lt/execute] 🔄 Calling executeTrade for ${fo.market_title?.substring(0, 40)}...`);
                
                try {
                    const execResult = await executeTrade(supabase, strategy, trade, ftWallet, fo.order_id);
                    if (execResult.success) {
                        results[strategy.strategy_id].executed++;
                        executedSourceIds.add(sourceTradeId);
                        console.log(`[lt/execute] Executed ${strategy.strategy_id} source_trade_id=${sourceTradeId}`);
                        await ltLog(supabase, 'info', `Executed source_trade_id=${sourceTradeId}`, { strategy_id: strategy.strategy_id, source_trade_id: sourceTradeId });
                    } else {
                        results[strategy.strategy_id].errors++;
                        const errKey = execResult.error || 'execution_failed';
                        reasons[errKey] = (reasons[errKey] || 0) + 1;
                        const fullReason = execResult.riskCheckReason || execResult.error || errKey;
                        const failureMsg = `Execution failure: { source_trade_id: '${sourceTradeId}', error: '${fullReason}', risk_check: ${!execResult.riskCheckPassed} }`;
                        console.warn(`[lt/execute] ${failureMsg}`);
                        await ltLog(supabase, 'warn', failureMsg, { strategy_id: strategy.strategy_id, source_trade_id: sourceTradeId, extra: { error: fullReason, risk_check: !execResult.riskCheckPassed } });
                    }
                } catch (error: any) {
                    const errMsg = error?.message || String(error);
                    const failureMsg = `Execution failure: { source_trade_id: '${sourceTradeId}', error: '${errMsg}' }`;
                    console.error(`[lt/execute] ${failureMsg}`);
                    await ltLog(supabase, 'error', failureMsg, { strategy_id: strategy.strategy_id, source_trade_id: sourceTradeId, extra: { error: errMsg } });
                    results[strategy.strategy_id].errors++;
                    reasons['execution_error'] = (reasons['execution_error'] || 0) + 1;
                }
            }

            // Only update last_sync_time if we actually processed orders
            // This prevents advancing the sync time when nothing was eligible, which would skip future orders
            if (ftOrders && ftOrders.length > 0) {
                await supabase.from('lt_strategies').update({ last_sync_time: now.toISOString() }).eq('strategy_id', strategy.strategy_id);
                console.log(`[lt/execute] Updated last_sync_time for ${strategy.strategy_id} after processing ${ftOrders.length} FT orders`);
            }
        }

        const totalExecuted = Object.values(results).reduce((sum, r) => sum + r.executed, 0);
        const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);
        const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);
        const totalFtOrdersConsidered = Object.values(results).reduce((sum, r) => sum + r.executed + r.skipped + r.errors, 0);

        return NextResponse.json({
            success: true,
            executed_at: now.toISOString(),
            strategies_processed: strategies.length,
            ft_orders_considered: totalFtOrdersConsidered,
            total_executed: totalExecuted,
            total_skipped: totalSkipped,
            total_errors: totalErrors,
            results,
        });
    } catch (error: any) {
        const errMsg = error?.message || String(error);
        console.error('[lt/execute] Error:', error);
        try {
            const supabase = createAdminServiceClient();
            await ltLog(supabase, 'error', `Execute route error: ${errMsg}`);
        } catch {
            // ignore
        }
        return NextResponse.json(
            { success: false, error: 'Execution failed', details: String(error) },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to execute live trades',
        description: 'Executes real orders for active LT strategies from ft_orders (FT strategy decisions). No rule changes.',
    });
}
