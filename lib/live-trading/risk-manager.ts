/**
 * Risk Management Service for Live Trading
 * Handles budget limits, drawdown control, circuit breakers, and position sizing
 */

import { createAdminServiceClient } from '@/lib/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RiskRules {
    rule_id: string;
    strategy_id: string;
    daily_budget_usd: number | null;
    daily_budget_pct: number | null;
    weekly_budget_usd: number | null;
    monthly_budget_usd: number | null;
    max_position_size_usd: number | null;
    max_position_size_pct: number | null;
    max_total_exposure_usd: number | null;
    max_total_exposure_pct: number | null;
    max_positions_per_market: number;
    max_concurrent_positions: number;
    max_drawdown_pct: number;
    max_consecutive_losses: number;
    drawdown_resume_threshold_pct: number | null;
    max_slippage_pct: number;
    max_spread_pct: number | null;
    min_liquidity_usd: number | null;
    max_latency_ms: number;
    enable_stop_loss: boolean;
    stop_loss_pct: number | null;
    enable_take_profit: boolean;
    take_profit_pct: number | null;
}

export interface RiskState {
    state_id: string;
    strategy_id: string;
    current_equity: number;
    peak_equity: number;
    current_drawdown_pct: number;
    consecutive_losses: number;
    daily_spent_usd: number;
    daily_trades_count: number;
    daily_start_equity: number | null;
    daily_reset_at: string;
    weekly_spent_usd: number;
    monthly_spent_usd: number;
    circuit_breaker_active: boolean;
    circuit_breaker_reason: string | null;
    circuit_breaker_until: string | null;
    is_paused: boolean;
    pause_reason: string | null;
    paused_at: string | null;
}

export interface RiskCheckResult {
    allowed: boolean;
    reason?: string;
    riskCheckPassed: boolean;
}

export interface TradeSignal {
    condition_id: string;
    price: number;
    size: number;
    source_trade_id: string;
}

/**
 * Get risk rules for a strategy
 */
export async function getRiskRules(
    supabase: SupabaseClient,
    strategyId: string
): Promise<RiskRules | null> {
    const { data, error } = await supabase
        .from('lt_risk_rules')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as RiskRules;
}

/**
 * Get current risk state for a strategy
 */
export async function getRiskState(
    supabase: SupabaseClient,
    strategyId: string
): Promise<RiskState | null> {
    const { data, error } = await supabase
        .from('lt_risk_state')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as RiskState;
}

/**
 * Get current exposure (sum of open positions) for a strategy
 */
export async function getCurrentExposure(
    supabase: SupabaseClient,
    strategyId: string
): Promise<number> {
    const { data, error } = await supabase
        .from('lt_orders')
        .select('executed_size')
        .eq('strategy_id', strategyId)
        .eq('outcome', 'OPEN');

    if (error || !data) {
        return 0;
    }

    return data.reduce((sum, order) => sum + (Number(order.executed_size) || 0), 0);
}

/**
 * Get count of open positions for a strategy
 */
export async function getOpenPositionsCount(
    supabase: SupabaseClient,
    strategyId: string
): Promise<number> {
    const { data, error } = await supabase
        .from('lt_orders')
        .select('lt_order_id', { count: 'exact', head: true })
        .eq('strategy_id', strategyId)
        .eq('outcome', 'OPEN');

    if (error) {
        return 0;
    }

    return data?.length || 0;
}

/**
 * Get count of positions in a specific market for a strategy
 */
export async function getPositionsInMarket(
    supabase: SupabaseClient,
    strategyId: string,
    conditionId: string
): Promise<number> {
    const { data, error } = await supabase
        .from('lt_orders')
        .select('lt_order_id', { count: 'exact', head: true })
        .eq('strategy_id', strategyId)
        .eq('condition_id', conditionId)
        .eq('outcome', 'OPEN');

    if (error) {
        return 0;
    }

    return data?.length || 0;
}

/**
 * Reset daily budget if needed (call this daily)
 */
export async function resetDailyBudgetIfNeeded(
    supabase: SupabaseClient,
    strategyId: string
): Promise<void> {
    const state = await getRiskState(supabase, strategyId);
    if (!state) return;

    const now = new Date();
    const resetAt = new Date(state.daily_reset_at);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const resetDate = new Date(resetAt.getFullYear(), resetAt.getMonth(), resetAt.getDate());

    if (resetDate < today) {
        // Reset daily tracking
        await supabase
            .from('lt_risk_state')
            .update({
                daily_spent_usd: 0,
                daily_trades_count: 0,
                daily_start_equity: state.current_equity,
                daily_reset_at: today.toISOString(),
            })
            .eq('strategy_id', strategyId);
    }
}

/**
 * Check if trade passes all risk rules
 */
export async function checkRiskRules(
    supabase: SupabaseClient,
    strategyId: string,
    trade: TradeSignal,
    estimatedSlippage?: number,
    marketSpread?: number,
    marketLiquidity?: number,
    executionLatency?: number
): Promise<RiskCheckResult> {
    // Get risk rules and state
    const rules = await getRiskRules(supabase, strategyId);
    const state = await getRiskState(supabase, strategyId);

    if (!rules || !state) {
        return {
            allowed: false,
            reason: 'Risk rules or state not found',
            riskCheckPassed: false,
        };
    }

    // Reset daily budget if needed
    await resetDailyBudgetIfNeeded(supabase, strategyId);
    const updatedState = await getRiskState(supabase, strategyId);
    const currentState = updatedState || state;

    // 1. Circuit Breaker Check
    if (currentState.circuit_breaker_active) {
        if (currentState.circuit_breaker_until) {
            const until = new Date(currentState.circuit_breaker_until);
            if (new Date() < until) {
                return {
                    allowed: false,
                    reason: `Circuit breaker active: ${currentState.circuit_breaker_reason || 'Unknown reason'}`,
                    riskCheckPassed: false,
                };
            }
            // Auto-resume if time expired
            await supabase
                .from('lt_risk_state')
                .update({
                    circuit_breaker_active: false,
                    circuit_breaker_reason: null,
                    circuit_breaker_until: null,
                })
                .eq('strategy_id', strategyId);
        }
    }

    // 2. Pause Check
    if (currentState.is_paused) {
        return {
            allowed: false,
            reason: `Strategy paused: ${currentState.pause_reason || 'Unknown reason'}`,
            riskCheckPassed: false,
        };
    }

    // 3. Drawdown Check
    const drawdown = currentState.peak_equity > 0
        ? (currentState.peak_equity - currentState.current_equity) / currentState.peak_equity
        : 0;

    if (drawdown > rules.max_drawdown_pct) {
        await pauseStrategy(supabase, strategyId, `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds limit ${(rules.max_drawdown_pct * 100).toFixed(1)}%`);
        return {
            allowed: false,
            reason: 'Drawdown limit exceeded',
            riskCheckPassed: false,
        };
    }

    // 4. Consecutive Losses Check
    if (currentState.consecutive_losses >= rules.max_consecutive_losses) {
        await pauseStrategy(supabase, strategyId, `${currentState.consecutive_losses} consecutive losses`);
        return {
            allowed: false,
            reason: 'Max consecutive losses reached',
            riskCheckPassed: false,
        };
    }

    // 5. Daily Budget Check (only when a limit is configured)
    const dailyBudget =
        rules.daily_budget_usd !== null
            ? rules.daily_budget_usd
            : rules.daily_budget_pct != null
                ? currentState.current_equity * rules.daily_budget_pct
                : null;

    if (dailyBudget !== null && currentState.daily_spent_usd + trade.size > dailyBudget) {
        return {
            allowed: false,
            reason: `Daily budget exceeded: $${currentState.daily_spent_usd.toFixed(2)} + $${trade.size.toFixed(2)} > $${dailyBudget.toFixed(2)}`,
            riskCheckPassed: false,
        };
    }

    // 6. Position Size Check
    const maxPositionSize = rules.max_position_size_usd !== null
        ? rules.max_position_size_usd
        : (currentState.current_equity * (rules.max_position_size_pct || 0.02));

    if (trade.size > maxPositionSize) {
        return {
            allowed: false,
            reason: `Position size $${trade.size.toFixed(2)} exceeds max $${maxPositionSize.toFixed(2)}`,
            riskCheckPassed: false,
        };
    }

    // 7. Total Exposure Check
    const currentExposure = await getCurrentExposure(supabase, strategyId);
    const maxExposure = rules.max_total_exposure_usd !== null
        ? rules.max_total_exposure_usd
        : (currentState.current_equity * (rules.max_total_exposure_pct || 0.50));

    if (currentExposure + trade.size > maxExposure) {
        return {
            allowed: false,
            reason: `Total exposure limit exceeded: $${currentExposure.toFixed(2)} + $${trade.size.toFixed(2)} > $${maxExposure.toFixed(2)}`,
            riskCheckPassed: false,
        };
    }

    // 8. Concurrent Positions Check
    const openPositions = await getOpenPositionsCount(supabase, strategyId);
    if (openPositions >= rules.max_concurrent_positions) {
        return {
            allowed: false,
            reason: `Max ${rules.max_concurrent_positions} concurrent positions reached`,
            riskCheckPassed: false,
        };
    }

    // 9. Market-Specific Check
    const positionsInMarket = await getPositionsInMarket(supabase, strategyId, trade.condition_id);
    if (positionsInMarket >= rules.max_positions_per_market) {
        return {
            allowed: false,
            reason: 'Already have position in this market',
            riskCheckPassed: false,
        };
    }

    // 10. Slippage Check (if provided)
    if (estimatedSlippage !== undefined && estimatedSlippage > rules.max_slippage_pct) {
        return {
            allowed: false,
            reason: `Estimated slippage ${(estimatedSlippage * 100).toFixed(2)}% exceeds limit ${(rules.max_slippage_pct * 100).toFixed(2)}%`,
            riskCheckPassed: false,
        };
    }

    // 11. Spread Check (if provided)
    if (marketSpread !== undefined && rules.max_spread_pct !== null && marketSpread > rules.max_spread_pct) {
        return {
            allowed: false,
            reason: `Spread ${(marketSpread * 100).toFixed(2)}% exceeds limit ${(rules.max_spread_pct * 100).toFixed(2)}%`,
            riskCheckPassed: false,
        };
    }

    // 12. Liquidity Check (if provided)
    if (marketLiquidity !== undefined && rules.min_liquidity_usd !== null && marketLiquidity < rules.min_liquidity_usd) {
        return {
            allowed: false,
            reason: `Insufficient market liquidity: $${marketLiquidity.toFixed(2)} < $${rules.min_liquidity_usd.toFixed(2)}`,
            riskCheckPassed: false,
        };
    }

    // 13. Latency Check (if provided)
    if (executionLatency !== undefined && executionLatency > rules.max_latency_ms) {
        return {
            allowed: false,
            reason: `Execution latency ${executionLatency}ms exceeds limit ${rules.max_latency_ms}ms`,
            riskCheckPassed: false,
        };
    }

    return {
        allowed: true,
        riskCheckPassed: true,
    };
}

/**
 * Pause a strategy
 */
export async function pauseStrategy(
    supabase: SupabaseClient,
    strategyId: string,
    reason: string
): Promise<void> {
    await supabase
        .from('lt_risk_state')
        .update({
            is_paused: true,
            pause_reason: reason,
            paused_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);

    await supabase
        .from('lt_strategies')
        .update({
            is_paused: true,
        })
        .eq('strategy_id', strategyId);
}

/**
 * Resume a strategy
 */
export async function resumeStrategy(
    supabase: SupabaseClient,
    strategyId: string
): Promise<void> {
    await supabase
        .from('lt_risk_state')
        .update({
            is_paused: false,
            pause_reason: null,
            paused_at: null,
        })
        .eq('strategy_id', strategyId);

    await supabase
        .from('lt_strategies')
        .update({
            is_paused: false,
        })
        .eq('strategy_id', strategyId);
}

/**
 * Update risk state after a trade
 */
export async function updateRiskStateAfterTrade(
    supabase: SupabaseClient,
    strategyId: string,
    tradeSize: number,
    isWin: boolean | null = null  // null = still open
): Promise<void> {
    const state = await getRiskState(supabase, strategyId);
    if (!state) return;

    const newDailySpent = state.daily_spent_usd + tradeSize;
    const newDailyTrades = state.daily_trades_count + 1;

    let newEquity = state.current_equity - tradeSize;  // Subtract trade size (capital locked)
    let newPeakEquity = Math.max(state.peak_equity, newEquity);
    let newConsecutiveLosses = state.consecutive_losses;

    // Update based on outcome
    if (isWin === true) {
        // Win - equity increases, reset consecutive losses
        newConsecutiveLosses = 0;
    } else if (isWin === false) {
        // Loss - increment consecutive losses
        newConsecutiveLosses = state.consecutive_losses + 1;
    }

    const newDrawdown = newPeakEquity > 0
        ? (newPeakEquity - newEquity) / newPeakEquity
        : 0;

    await supabase
        .from('lt_risk_state')
        .update({
            current_equity: newEquity,
            peak_equity: newPeakEquity,
            current_drawdown_pct: newDrawdown,
            consecutive_losses: newConsecutiveLosses,
            daily_spent_usd: newDailySpent,
            daily_trades_count: newDailyTrades,
            last_updated: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);
}

/**
 * Activate circuit breaker
 */
export async function activateCircuitBreaker(
    supabase: SupabaseClient,
    strategyId: string,
    reason: string,
    durationMinutes: number = 60
): Promise<void> {
    const until = new Date(Date.now() + durationMinutes * 60 * 1000);

    await supabase
        .from('lt_risk_state')
        .update({
            circuit_breaker_active: true,
            circuit_breaker_reason: reason,
            circuit_breaker_until: until.toISOString(),
        })
        .eq('strategy_id', strategyId);
}

/**
 * Initialize risk state for a new strategy
 */
export async function initializeRiskState(
    supabase: SupabaseClient,
    strategyId: string,
    startingCapital: number
): Promise<void> {
    await supabase
        .from('lt_risk_state')
        .upsert({
            strategy_id: strategyId,
            current_equity: startingCapital,
            peak_equity: startingCapital,
            current_drawdown_pct: 0,
            consecutive_losses: 0,
            daily_spent_usd: 0,
            daily_trades_count: 0,
            daily_start_equity: startingCapital,
            daily_reset_at: new Date().toISOString(),
            weekly_spent_usd: 0,
            monthly_spent_usd: 0,
            circuit_breaker_active: false,
            circuit_breaker_reason: null,
            circuit_breaker_until: null,
            is_paused: false,
            pause_reason: null,
            paused_at: null,
        }, {
            onConflict: 'strategy_id',
        });
}
