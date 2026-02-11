/**
 * Risk Manager V2 — Simplified 6-step risk checks for Live Trading
 *
 * Philosophy:
 *   Cash management handles "can I afford this?"
 *   Risk rules handle "should I take this risk?"
 *
 * Check order:
 *   1. Available Cash (hard constraint — physical money)
 *   2. Position Size Limit (per-trade max)
 *   3. Total Exposure Limit (max locked capital)
 *   4. Daily Budget (soft limit, resets daily)
 *   5. Daily Loss Limit (circuit breaker)
 *   6. Drawdown Limit (circuit breaker)
 *
 * Every check produces a clear, descriptive log message.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LTLogger } from './lt-logger';
import { totalEquity, type CapitalState } from './capital-manager';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface RiskCheckInput {
    trade_size_usd: number;
    condition_id: string;
    source_trade_id: string;
}

export interface RiskCheckResult {
    allowed: boolean;
    reason: string;
    check_failed?: string;  // Which check specifically failed
}

export interface StrategyRiskState {
    // Cash management
    available_cash: number;
    locked_capital: number;
    cooldown_capital: number;
    initial_capital: number;

    // Risk rules
    max_position_size_usd: number | null;
    max_total_exposure_usd: number | null;
    daily_budget_usd: number | null;
    max_daily_loss_usd: number | null;
    circuit_breaker_loss_pct: number | null;

    // Risk state
    daily_spent_usd: number;
    daily_loss_usd: number;
    peak_equity: number;
    circuit_breaker_active: boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Core Risk Check
// ──────────────────────────────────────────────────────────────────────

/**
 * Run all 6 risk checks in order.
 * Returns the first failure or { allowed: true } if all pass.
 */
export function checkRisk(
    state: StrategyRiskState,
    input: RiskCheckInput,
    logger?: LTLogger,
): RiskCheckResult {
    const { trade_size_usd } = input;

    // ── 1. Available Cash (hard constraint) ──
    if (trade_size_usd > state.available_cash) {
        const msg = `Insufficient cash: need $${trade_size_usd.toFixed(2)}, have $${state.available_cash.toFixed(2)} available`;
        logger?.warn('RISK_CHECK', msg, {
            check: 'AVAILABLE_CASH',
            need: trade_size_usd,
            have: state.available_cash,
            locked: state.locked_capital,
            cooldown: state.cooldown_capital,
        });
        return { allowed: false, reason: msg, check_failed: 'AVAILABLE_CASH' };
    }

    // ── 2. Position Size Limit (per-trade max) ──
    if (state.max_position_size_usd !== null && trade_size_usd > state.max_position_size_usd) {
        const msg = `Position size $${trade_size_usd.toFixed(2)} exceeds max $${state.max_position_size_usd.toFixed(2)}`;
        logger?.warn('RISK_CHECK', msg, { check: 'MAX_POSITION_SIZE', trade_size_usd, max: state.max_position_size_usd });
        return { allowed: false, reason: msg, check_failed: 'MAX_POSITION_SIZE' };
    }

    // ── 3. Total Exposure Limit (max locked capital) ──
    if (state.max_total_exposure_usd !== null) {
        const totalExposureAfter = state.locked_capital + trade_size_usd;
        if (totalExposureAfter > state.max_total_exposure_usd) {
            const msg = `Total exposure $${totalExposureAfter.toFixed(2)} would exceed limit $${state.max_total_exposure_usd.toFixed(2)} (currently locked: $${state.locked_capital.toFixed(2)})`;
            logger?.warn('RISK_CHECK', msg, {
                check: 'MAX_TOTAL_EXPOSURE',
                locked_now: state.locked_capital,
                trade_size_usd,
                limit: state.max_total_exposure_usd,
            });
            return { allowed: false, reason: msg, check_failed: 'MAX_TOTAL_EXPOSURE' };
        }
    }

    // ── 4. Daily Budget (soft limit) ──
    if (state.daily_budget_usd !== null) {
        const afterSpend = state.daily_spent_usd + trade_size_usd;
        if (afterSpend > state.daily_budget_usd) {
            const msg = `Daily budget exceeded: spent $${state.daily_spent_usd.toFixed(2)} + $${trade_size_usd.toFixed(2)} = $${afterSpend.toFixed(2)} > limit $${state.daily_budget_usd.toFixed(2)}`;
            logger?.warn('RISK_CHECK', msg, {
                check: 'DAILY_BUDGET',
                daily_spent: state.daily_spent_usd,
                trade_size_usd,
                limit: state.daily_budget_usd,
            });
            return { allowed: false, reason: msg, check_failed: 'DAILY_BUDGET' };
        }
    }

    // ── 5. Daily Loss Limit (circuit breaker) ──
    if (state.max_daily_loss_usd !== null && state.daily_loss_usd >= state.max_daily_loss_usd) {
        const msg = `Daily loss limit hit: lost $${state.daily_loss_usd.toFixed(2)} >= limit $${state.max_daily_loss_usd.toFixed(2)} — circuit breaker active`;
        logger?.warn('RISK_CHECK', msg, {
            check: 'DAILY_LOSS_LIMIT',
            daily_loss: state.daily_loss_usd,
            limit: state.max_daily_loss_usd,
        });
        return { allowed: false, reason: msg, check_failed: 'DAILY_LOSS_LIMIT' };
    }

    // ── 6. Drawdown Limit (circuit breaker) ──
    if (state.circuit_breaker_loss_pct !== null) {
        const currentEq = state.available_cash + state.locked_capital + state.cooldown_capital;
        const drawdown = state.peak_equity > 0
            ? (state.peak_equity - currentEq) / state.peak_equity
            : 0;

        if (drawdown >= state.circuit_breaker_loss_pct / 100) {
            const msg = `Drawdown circuit breaker: down ${(drawdown * 100).toFixed(1)}% from peak $${state.peak_equity.toFixed(2)} (current $${currentEq.toFixed(2)}), limit ${state.circuit_breaker_loss_pct}%`;
            logger?.warn('RISK_CHECK', msg, {
                check: 'DRAWDOWN_BREAKER',
                drawdown_pct: +(drawdown * 100).toFixed(2),
                peak_equity: state.peak_equity,
                current_equity: currentEq,
                limit_pct: state.circuit_breaker_loss_pct,
            });
            return { allowed: false, reason: msg, check_failed: 'DRAWDOWN_BREAKER' };
        }
    }

    // ── All checks passed ──
    logger?.debug('RISK_CHECK', `All risk checks passed for $${trade_size_usd.toFixed(2)} trade`, {
        trade_size_usd,
        available: state.available_cash,
        locked: state.locked_capital,
        daily_spent: state.daily_spent_usd,
    });

    return { allowed: true, reason: 'All risk checks passed' };
}

// ──────────────────────────────────────────────────────────────────────
// Load state from DB
// ──────────────────────────────────────────────────────────────────────

/** Fetch the risk-relevant state for a strategy. */
export async function loadStrategyRiskState(
    supabase: SupabaseClient,
    strategyId: string,
): Promise<StrategyRiskState | null> {
    const { data, error } = await supabase
        .from('lt_strategies')
        .select(`
            available_cash, locked_capital, cooldown_capital, initial_capital,
            max_position_size_usd, max_total_exposure_usd, daily_budget_usd,
            max_daily_loss_usd, circuit_breaker_loss_pct,
            daily_spent_usd, daily_loss_usd, peak_equity, circuit_breaker_active
        `)
        .eq('strategy_id', strategyId)
        .single();

    if (error || !data) return null;

    return {
        available_cash: Number(data.available_cash) || 0,
        locked_capital: Number(data.locked_capital) || 0,
        cooldown_capital: Number(data.cooldown_capital) || 0,
        initial_capital: Number(data.initial_capital) || 0,
        max_position_size_usd: data.max_position_size_usd != null ? Number(data.max_position_size_usd) : null,
        max_total_exposure_usd: data.max_total_exposure_usd != null ? Number(data.max_total_exposure_usd) : null,
        daily_budget_usd: data.daily_budget_usd != null ? Number(data.daily_budget_usd) : null,
        max_daily_loss_usd: data.max_daily_loss_usd != null ? Number(data.max_daily_loss_usd) : null,
        circuit_breaker_loss_pct: data.circuit_breaker_loss_pct != null ? Number(data.circuit_breaker_loss_pct) : null,
        daily_spent_usd: Number(data.daily_spent_usd) || 0,
        daily_loss_usd: Number(data.daily_loss_usd) || 0,
        peak_equity: Number(data.peak_equity) || 0,
        circuit_breaker_active: Boolean(data.circuit_breaker_active),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Update state after trade resolution
// ──────────────────────────────────────────────────────────────────────

export async function updateRiskStateAfterResolution(
    supabase: SupabaseClient,
    strategyId: string,
    investedAmount: number,
    won: boolean,
): Promise<void> {
    const { data: strategy } = await supabase
        .from('lt_strategies')
        .select('daily_spent_usd, daily_loss_usd, consecutive_losses, peak_equity, available_cash, locked_capital, cooldown_capital, max_daily_loss_usd, circuit_breaker_loss_pct')
        .eq('strategy_id', strategyId)
        .single();

    if (!strategy) return;

    const newConsecutiveLosses = won ? 0 : (Number(strategy.consecutive_losses) || 0) + 1;
    const newDailyLoss = won
        ? Number(strategy.daily_loss_usd) || 0
        : (Number(strategy.daily_loss_usd) || 0) + investedAmount;

    // Equity after this resolution
    const currentEquity =
        (Number(strategy.available_cash) || 0) +
        (Number(strategy.locked_capital) || 0) +
        (Number(strategy.cooldown_capital) || 0);

    const newPeakEquity = Math.max(Number(strategy.peak_equity) || 0, currentEquity);
    const drawdown = newPeakEquity > 0 ? (newPeakEquity - currentEquity) / newPeakEquity : 0;

    // Check circuit breaker conditions
    const circuitBreakerActive =
        (strategy.max_daily_loss_usd != null && newDailyLoss >= Number(strategy.max_daily_loss_usd)) ||
        (strategy.circuit_breaker_loss_pct != null && drawdown >= Number(strategy.circuit_breaker_loss_pct) / 100);

    await supabase
        .from('lt_strategies')
        .update({
            daily_loss_usd: +newDailyLoss.toFixed(2),
            consecutive_losses: newConsecutiveLosses,
            peak_equity: +newPeakEquity.toFixed(2),
            current_drawdown_pct: +drawdown.toFixed(4),
            circuit_breaker_active: circuitBreakerActive,
            updated_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);
}

/** Record daily spending after a trade is placed. */
export async function recordDailySpend(
    supabase: SupabaseClient,
    strategyId: string,
    amount: number,
): Promise<void> {
    const { data } = await supabase
        .from('lt_strategies')
        .select('daily_spent_usd')
        .eq('strategy_id', strategyId)
        .single();

    if (!data) return;

    await supabase
        .from('lt_strategies')
        .update({
            daily_spent_usd: +(Number(data.daily_spent_usd) + amount).toFixed(2),
            updated_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);
}

// ──────────────────────────────────────────────────────────────────────
// Daily Reset
// ──────────────────────────────────────────────────────────────────────

/** Reset daily counters for all active strategies (called at midnight UTC). */
export async function resetDailyRiskState(
    supabase: SupabaseClient,
): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
        .from('lt_strategies')
        .update({
            daily_spent_usd: 0,
            daily_loss_usd: 0,
            consecutive_losses: 0,
            circuit_breaker_active: false,
            last_reset_date: today,
            updated_at: new Date().toISOString(),
        })
        .neq('last_reset_date', today)
        .eq('is_active', true)
        .select('strategy_id');

    return data?.length ?? 0;
}
