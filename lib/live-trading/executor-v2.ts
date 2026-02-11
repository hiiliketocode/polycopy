/**
 * Live Trading Executor V2
 *
 * Clean rebuild. Executes real trades by following FT strategy signals.
 * Reuses the same placeOrderCore and prepareOrderParamsForClob as manual quick trades.
 *
 * Flow per trade:
 *   1. Calculate bet size (shared-logic.ts)
 *   2. Lock capital (capital-manager.ts)
 *   3. Risk check (risk-manager-v2.ts)
 *   4. Resolve token ID (token-cache.ts)
 *   5. Prepare order params (order-prep.ts)
 *   6. Place order (place-order-core.ts)
 *   7. Poll CLOB for fill status
 *   8. Record results to lt_orders
 *   9. Update daily spend
 *   10. On failure: unlock capital
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { placeOrderCore } from '@/lib/polymarket/place-order-core';
import { prepareOrderParamsForClob } from '@/lib/polymarket/order-prep';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { ensureTraderId } from '@/lib/traders/ensure-id';
import { calculateBetSize, getSourceTradeId, type EnrichedTrade, type FTWallet } from '@/lib/ft-sync/shared-logic';
import { lockCapitalForTrade, unlockCapital, type CapitalState } from './capital-manager';
import { checkRisk, recordDailySpend, loadStrategyRiskState } from './risk-manager-v2';
import { resolveTokenId } from './token-cache';
import type { LTLogger } from './lt-logger';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface LTStrategy {
    strategy_id: string;
    ft_wallet_id: string;
    user_id: string;
    wallet_address: string;
    is_active: boolean;
    is_paused: boolean;
    shadow_mode: boolean;
    launched_at: string | null;
    initial_capital: number;
    available_cash: number;
    locked_capital: number;
    cooldown_capital: number;
    slippage_tolerance_pct: number;
    order_type: string;
    min_order_size_usd: number;
    max_order_size_usd: number;
    last_sync_time: string | null;
}

export interface ExecutionResult {
    success: boolean;
    lt_order_id?: string;
    order_id?: string;
    error?: string;
    stage?: string;
    bet_size?: number;
    executed_price?: number;
    shares_bought?: number;
}

// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 250;    // Same as quick trade cards
const MAX_POLL_MS = 30_000;      // 30 seconds max

// ──────────────────────────────────────────────────────────────────────
// CLOB Order Polling
// ──────────────────────────────────────────────────────────────────────

interface PollResult {
    status: string;
    sizeMatched: number;
    originalSize: number;
    remainingSize: number;
    terminal: boolean;
}

async function pollOrderUntilTerminal(
    userId: string,
    orderId: string,
    logger?: LTLogger,
): Promise<PollResult> {
    const { client } = await getAuthedClobClientForUserAnyWallet(userId);
    const start = Date.now();
    let last: PollResult | null = null;

    while (Date.now() - start < MAX_POLL_MS) {
        try {
            const clobOrder = await client.getOrder(orderId) as any;
            const originalSize = parseFloat(clobOrder?.original_size || clobOrder?.size || '0') || 0;
            const sizeMatched = parseFloat(clobOrder?.size_matched || '0') || 0;
            const remainingSize = Math.max(0, originalSize - sizeMatched);
            const status = String(clobOrder?.status || 'unknown').toLowerCase();

            last = {
                status,
                sizeMatched,
                originalSize,
                remainingSize,
                terminal: sizeMatched > 0 || ['cancelled', 'canceled', 'rejected', 'expired', 'failed', 'matched'].includes(status),
            };

            if (last.terminal) break;
        } catch (err: any) {
            logger?.warn('ORDER_POLL', `Poll error: ${err.message}`, { orderId });
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return last || { status: 'timeout', sizeMatched: 0, originalSize: 0, remainingSize: 0, terminal: true };
}

// ──────────────────────────────────────────────────────────────────────
// Get Active Strategies
// ──────────────────────────────────────────────────────────────────────

export async function getActiveStrategies(
    supabase: SupabaseClient,
): Promise<LTStrategy[]> {
    const { data, error } = await supabase
        .from('lt_strategies')
        .select('*')
        .eq('is_active', true)
        .eq('is_paused', false)
        .eq('circuit_breaker_active', false);

    if (error || !data) return [];
    return data as LTStrategy[];
}

// ──────────────────────────────────────────────────────────────────────
// Execute a Trade
// ──────────────────────────────────────────────────────────────────────

/**
 * Execute a single trade for a strategy.
 *
 * This function handles the entire lifecycle from bet sizing through
 * to order placement and recording, with proper capital management
 * at every step.
 */
export async function executeTrade(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    trade: EnrichedTrade,
    ftWallet: FTWallet,
    ftOrderId: string | undefined,
    logger: LTLogger,
): Promise<ExecutionResult> {
    const traceLogger = logger.forTrade({
        strategy_id: strategy.strategy_id,
        ft_wallet_id: strategy.ft_wallet_id,
        ft_order_id: ftOrderId,
    });

    const signalTime = Date.now();
    const sourceTradeId = getSourceTradeId({
        id: trade.id,
        transactionHash: trade.transactionHash,
        traderWallet: trade.traderWallet,
        conditionId: trade.conditionId,
        timestamp: trade.timestamp,
    });
    const price = Number(trade.price || 0);
    const side = ((trade.side || 'BUY').toUpperCase()) as 'BUY' | 'SELL';

    await traceLogger.info('ORDER_PREP', `Processing trade: ${trade.title?.slice(0, 60)}`, {
        source_trade_id: sourceTradeId,
        price,
        side,
        condition_id: trade.conditionId,
        trader: trade.traderWallet?.slice(0, 12),
    });

    // ── Step 1: Dedup check ──
    const { data: existing } = await supabase
        .from('lt_orders')
        .select('lt_order_id')
        .eq('strategy_id', strategy.strategy_id)
        .eq('source_trade_id', sourceTradeId)
        .limit(1);

    if (existing && existing.length > 0) {
        await traceLogger.debug('ORDER_PREP', `Skipping duplicate: ${sourceTradeId}`);
        return { success: false, error: 'Trade already executed', stage: 'DEDUP' };
    }

    // ── Step 2: Calculate bet size (same as FT) ──
    const effectiveBankroll = strategy.available_cash + strategy.locked_capital + strategy.cooldown_capital;
    const traderWinRate = trade.traderWinRate;
    const slippagePct = strategy.slippage_tolerance_pct || 3;
    const priceWithSlippage = Math.min(0.9999, price * (1 + slippagePct / 100));
    const edge = traderWinRate - priceWithSlippage;

    let betSize = calculateBetSize(ftWallet, traderWinRate, price, edge, trade.conviction, effectiveBankroll);

    // Clamp to strategy limits
    betSize = Math.max(strategy.min_order_size_usd, Math.min(strategy.max_order_size_usd, betSize));

    await traceLogger.debug('ORDER_PREP', `Bet size calculated: $${betSize.toFixed(2)}`, {
        method: ftWallet.allocation_method,
        edge: +edge.toFixed(4),
        win_rate: traderWinRate,
        bankroll: +effectiveBankroll.toFixed(2),
    });

    // ── Step 3: Lock capital ──
    const lockResult = await lockCapitalForTrade(supabase, strategy.strategy_id, betSize);
    if (!lockResult.success) {
        await traceLogger.warn('CASH_CHECK', `Capital lock failed: ${lockResult.error}`, {
            needed: betSize,
            available_before: lockResult.available_before,
        });
        // Record as rejected order for visibility
        await recordRejectedOrder(supabase, strategy, trade, sourceTradeId, ftOrderId, betSize, price, side, lockResult.error || 'Cash check failed');
        return { success: false, error: lockResult.error, stage: 'CASH_CHECK', bet_size: betSize };
    }

    await traceLogger.info('CASH_CHECK', `Locked $${betSize.toFixed(2)} (was $${lockResult.available_before?.toFixed(2)} → $${lockResult.available_after?.toFixed(2)})`, {
        locked_amount: betSize,
    });

    // ── Step 4: Risk check ──
    const riskState = await loadStrategyRiskState(supabase, strategy.strategy_id);
    if (!riskState) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.error('RISK_CHECK', 'Failed to load risk state');
        return { success: false, error: 'Failed to load risk state', stage: 'RISK_CHECK', bet_size: betSize };
    }

    const riskCheck = checkRisk(riskState, {
        trade_size_usd: betSize,
        condition_id: trade.conditionId || '',
        source_trade_id: sourceTradeId,
    }, traceLogger);

    if (!riskCheck.allowed) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.warn('RISK_CHECK', `Risk check failed: ${riskCheck.reason}`, {
            check_failed: riskCheck.check_failed,
        });
        await recordRejectedOrder(supabase, strategy, trade, sourceTradeId, ftOrderId, betSize, price, side, riskCheck.reason, riskCheck.check_failed);
        return { success: false, error: riskCheck.reason, stage: 'RISK_CHECK', bet_size: betSize };
    }

    // ── Step 5: Resolve token ID ──
    const tokenId = trade.asset || await resolveTokenId(supabase, trade.conditionId || '', trade.outcome || 'YES', traceLogger);
    if (!tokenId) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.error('TOKEN_RESOLVE', `Token resolution failed for ${trade.conditionId}`);
        return { success: false, error: 'Token ID resolution failed', stage: 'TOKEN_RESOLVE', bet_size: betSize };
    }

    // ── Step 6: Shadow mode check ──
    if (strategy.shadow_mode) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.info('ORDER_PLACE', `Shadow mode — would place ${side} $${betSize.toFixed(2)} @ ${price}`, {
            token_id: tokenId,
            shadow: true,
        });
        const ltOrderId = await recordShadowOrder(supabase, strategy, trade, sourceTradeId, ftOrderId, betSize, price, tokenId, side);
        return { success: true, lt_order_id: ltOrderId, stage: 'SHADOW', bet_size: betSize };
    }

    // ── Step 7: Prepare order params (same as manual quick trades) ──
    const sizeContracts = betSize / price;
    const prepared = await prepareOrderParamsForClob(tokenId, priceWithSlippage, sizeContracts, side);

    if (!prepared) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.warn('ORDER_PREP', `Order prep failed: price=${priceWithSlippage.toFixed(4)}, size=${sizeContracts.toFixed(4)}`, {
            priceWithSlippage,
            sizeContracts,
        });
        return { success: false, error: 'Order prep failed (size/price invalid)', stage: 'ORDER_PREP', bet_size: betSize };
    }

    const { price: finalPrice, size: finalSize, tickSize } = prepared;

    // Default to GTC with 30-min expiration (GTD under the hood)
    const ORDER_EXPIRATION_MINUTES = 30;
    const expiration = Math.floor(Date.now() / 1000) + ORDER_EXPIRATION_MINUTES * 60;
    const orderType = 'GTD' as const;

    await traceLogger.info('ORDER_PLACE', `Placing GTD ${side}: ${finalSize} contracts @ ${finalPrice} (expires in ${ORDER_EXPIRATION_MINUTES}m)`, {
        order_type: orderType,
        final_price: finalPrice,
        final_size: finalSize,
        tick_size: tickSize,
        slippage_pct: slippagePct,
        expiration_unix: expiration,
        expiration_minutes: ORDER_EXPIRATION_MINUTES,
    });

    // ── Step 8: Place order on CLOB ──
    const requestId = `lt_${strategy.strategy_id}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const orderIntentId = randomUUID();

    let result;
    try {
        result = await placeOrderCore({
            supabase,
            userId: strategy.user_id,
            tokenId,
            price: finalPrice,
            size: finalSize,
            side,
            orderType,
            requestId,
            orderIntentId,
            useAnyWallet: true,
            conditionId: trade.conditionId || null,
            outcome: trade.outcome || null,
            expiration,
            tickSize,
        });
    } catch (err: any) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        await traceLogger.error('ORDER_PLACE', `Place order threw: ${err.message}`, { error: err.message });
        return { success: false, error: `Order placement error: ${err.message}`, stage: 'ORDER_PLACE', bet_size: betSize };
    }

    if (!result.success) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);
        const errMsg = 'message' in result.evaluation ? result.evaluation.message : 'Order placement failed';
        await traceLogger.error('ORDER_PLACE', `Order rejected: ${errMsg}`, { evaluation: result.evaluation });
        return { success: false, error: errMsg, stage: 'ORDER_PLACE', bet_size: betSize };
    }

    const orderId = result.orderId ?? '';
    const orderEventId = result.orderEventId ?? null;

    // ── Step 9: Poll CLOB for fill ──
    await traceLogger.info('ORDER_POLL', `Polling CLOB for order ${orderId} (${POLL_INTERVAL_MS}ms interval)`);
    const pollResult = await pollOrderUntilTerminal(strategy.user_id, orderId, traceLogger);
    const executionLatency = Date.now() - signalTime;

    const filled = pollResult.sizeMatched > 0;
    const fillRate = pollResult.originalSize > 0 ? pollResult.sizeMatched / pollResult.originalSize : 0;

    await traceLogger.info('ORDER_RESULT', `Poll result: ${pollResult.status} filled=${pollResult.sizeMatched}/${pollResult.originalSize}`, {
        ...pollResult,
        execution_latency_ms: executionLatency,
    });

    // ── Step 10: Handle unfilled ──
    if (!filled) {
        await unlockCapital(supabase, strategy.strategy_id, betSize);

        if (orderEventId) {
            await supabase.from('order_events_log').update({
                status: 'rejected',
                error_message: `Order did not fill (${pollResult.status})`,
                raw_error: JSON.stringify(pollResult),
            }).eq('id', orderEventId);
        }

        await traceLogger.warn('ORDER_RESULT', `Order unfilled: ${pollResult.status} — capital unlocked`, {
            order_id: orderId,
        });

        return { success: false, error: `Order not filled (${pollResult.status})`, stage: 'ORDER_POLL', bet_size: betSize };
    }

    // ── Step 11: Record filled order ──
    const executedPrice = finalPrice;
    const sharesBought = pollResult.sizeMatched;
    const executedSizeUsd = +(sharesBought * executedPrice).toFixed(2);
    const slippageBps = price > 0 ? Math.round(((executedPrice - price) / price) * 10000) : 0;

    // Adjust locked capital to actual fill (may be partial)
    const overLock = betSize - executedSizeUsd;
    if (overLock > 0.01) {
        await unlockCapital(supabase, strategy.strategy_id, overLock);
    }

    // Upsert to orders table (real CLOB order)
    const traderId = await ensureTraderId(supabase, strategy.wallet_address);
    const now = new Date().toISOString();

    await supabase.from('orders').upsert({
        order_id: orderId,
        trader_id: traderId,
        market_id: trade.conditionId ?? null,
        outcome: (trade.outcome || 'YES').toUpperCase(),
        side: side.toLowerCase(),
        order_type: orderType,
        price: finalPrice,
        size: pollResult.originalSize,
        filled_size: sharesBought,
        remaining_size: pollResult.remainingSize,
        status: fillRate >= 1 ? 'filled' : 'partial',
        created_at: now,
        updated_at: now,
    }, { onConflict: 'order_id' });

    // Insert lt_orders
    const ltOrderId = randomUUID();
    const { error: ltInsertError } = await supabase
        .from('lt_orders')
        .insert({
            lt_order_id: ltOrderId,
            strategy_id: strategy.strategy_id,
            user_id: strategy.user_id,
            ft_order_id: ftOrderId ?? null,
            ft_wallet_id: strategy.ft_wallet_id,
            ft_trader_wallet: trade.traderWallet ?? null,
            source_trade_id: sourceTradeId,
            condition_id: trade.conditionId || '',
            token_id: tokenId,
            token_label: (trade.outcome || 'YES').toUpperCase(),
            market_title: trade.title ?? null,
            market_slug: trade.slug ?? null,
            side,
            signal_price: price,
            signal_size_usd: betSize,
            executed_price: executedPrice,
            executed_size_usd: executedSizeUsd,
            shares_bought: sharesBought,
            shares_remaining: sharesBought,
            order_id: orderId,
            status: fillRate >= 1 ? 'FILLED' : 'PARTIAL',
            fill_rate: +fillRate.toFixed(4),
            slippage_bps: slippageBps,
            outcome: 'OPEN',
            order_placed_at: now,
            fully_filled_at: fillRate >= 1 ? now : null,
            execution_latency_ms: executionLatency,
            risk_check_passed: true,
            is_force_test: false,
            is_shadow: false,
        });

    if (ltInsertError) {
        await traceLogger.error('ORDER_RESULT', `Failed to insert lt_orders: ${ltInsertError.message}`, {
            order_id: orderId,
        });
        // Don't unlock — the CLOB order was filled. We just have a recording issue.
        return {
            success: true,
            order_id: orderId,
            error: `Order filled but recording failed: ${ltInsertError.message}`,
            stage: 'RECORD',
            bet_size: betSize,
            executed_price: executedPrice,
            shares_bought: sharesBought,
        };
    }

    // Record daily spend
    await recordDailySpend(supabase, strategy.strategy_id, executedSizeUsd);

    await traceLogger.info('ORDER_RESULT', `Trade filled: ${sharesBought} shares @ $${executedPrice} = $${executedSizeUsd} (latency ${executionLatency}ms, slippage ${slippageBps}bps)`, {
        lt_order_id: ltOrderId,
        order_id: orderId,
        shares_bought: sharesBought,
        executed_size_usd: executedSizeUsd,
        slippage_bps: slippageBps,
        fill_rate: +fillRate.toFixed(4),
        execution_latency_ms: executionLatency,
    });

    return {
        success: true,
        lt_order_id: ltOrderId,
        order_id: orderId,
        bet_size: betSize,
        executed_price: executedPrice,
        shares_bought: sharesBought,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Helper: Record rejected order (for visibility/debugging)
// ──────────────────────────────────────────────────────────────────────

async function recordRejectedOrder(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    trade: EnrichedTrade,
    sourceTradeId: string,
    ftOrderId: string | undefined,
    betSize: number,
    price: number,
    side: string,
    rejectionReason: string,
    riskCheckFailed?: string,
): Promise<void> {
    await supabase.from('lt_orders').insert({
        lt_order_id: randomUUID(),
        strategy_id: strategy.strategy_id,
        user_id: strategy.user_id,
        ft_order_id: ftOrderId ?? null,
        ft_wallet_id: strategy.ft_wallet_id,
        ft_trader_wallet: trade.traderWallet ?? null,
        source_trade_id: sourceTradeId,
        condition_id: trade.conditionId || '',
        token_id: trade.asset || '',
        token_label: (trade.outcome || 'YES').toUpperCase(),
        market_title: trade.title ?? null,
        market_slug: trade.slug ?? null,
        side,
        signal_price: price,
        signal_size_usd: betSize,
        status: 'REJECTED',
        outcome: 'CANCELLED',
        risk_check_passed: false,
        risk_check_reason: riskCheckFailed || null,
        rejection_reason: rejectionReason,
        is_force_test: false,
        is_shadow: false,
    });
    // Silently ignore errors — this is a diagnostic record
}

// ──────────────────────────────────────────────────────────────────────
// Helper: Record shadow mode order
// ──────────────────────────────────────────────────────────────────────

async function recordShadowOrder(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    trade: EnrichedTrade,
    sourceTradeId: string,
    ftOrderId: string | undefined,
    betSize: number,
    price: number,
    tokenId: string,
    side: string,
): Promise<string> {
    const ltOrderId = randomUUID();
    await supabase.from('lt_orders').insert({
        lt_order_id: ltOrderId,
        strategy_id: strategy.strategy_id,
        user_id: strategy.user_id,
        ft_order_id: ftOrderId ?? null,
        ft_wallet_id: strategy.ft_wallet_id,
        ft_trader_wallet: trade.traderWallet ?? null,
        source_trade_id: sourceTradeId,
        condition_id: trade.conditionId || '',
        token_id: tokenId,
        token_label: (trade.outcome || 'YES').toUpperCase(),
        market_title: trade.title ?? null,
        market_slug: trade.slug ?? null,
        side,
        signal_price: price,
        signal_size_usd: betSize,
        executed_price: price,
        executed_size_usd: betSize,
        shares_bought: betSize / price,
        shares_remaining: betSize / price,
        status: 'FILLED',
        outcome: 'OPEN',
        risk_check_passed: true,
        is_force_test: false,
        is_shadow: true,
    });

    return ltOrderId;
}
