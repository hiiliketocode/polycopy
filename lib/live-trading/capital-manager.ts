/**
 * Capital Manager — 3-bucket capital model for Live Trading
 *
 * Mirrors the proven FT portfolio.ts approach:
 *   available_cash  → ready to trade
 *   locked_capital  → in open positions
 *   cooldown_capital → resolved, waiting cooldown_hours before release
 *
 * All dollar amounts are in USD.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface CapitalState {
    available_cash: number;
    locked_capital: number;
    cooldown_capital: number;
    initial_capital: number;
    cooldown_hours: number;
}

export interface LockResult {
    success: boolean;
    error?: string;
    available_before?: number;
    available_after?: number;
}

// ──────────────────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────────────────

/** Fetch the current capital state for a strategy. */
export async function getCapitalState(
    supabase: SupabaseClient,
    strategyId: string,
): Promise<CapitalState | null> {
    const { data, error } = await supabase
        .from('lt_strategies')
        .select('available_cash, locked_capital, cooldown_capital, initial_capital, cooldown_hours')
        .eq('strategy_id', strategyId)
        .single();

    if (error || !data) return null;
    return {
        available_cash: Number(data.available_cash) || 0,
        locked_capital: Number(data.locked_capital) || 0,
        cooldown_capital: Number(data.cooldown_capital) || 0,
        initial_capital: Number(data.initial_capital) || 0,
        cooldown_hours: Number(data.cooldown_hours) || 3,
    };
}

/** Total equity = available + locked + cooldown. */
export function totalEquity(state: CapitalState): number {
    return state.available_cash + state.locked_capital + state.cooldown_capital;
}

// ──────────────────────────────────────────────────────────────────────
// Lock — move cash from available → locked when entering a trade
// ──────────────────────────────────────────────────────────────────────

/**
 * Lock capital for a new trade.
 *
 * Uses an optimistic-concurrency update (WHERE available_cash = currentValue)
 * to avoid race conditions between concurrent cron invocations.
 */
export async function lockCapitalForTrade(
    supabase: SupabaseClient,
    strategyId: string,
    amount: number,
): Promise<LockResult> {
    if (amount <= 0) {
        return { success: false, error: 'Lock amount must be positive' };
    }

    // 1. Read current state
    const state = await getCapitalState(supabase, strategyId);
    if (!state) {
        return { success: false, error: 'Strategy not found' };
    }

    if (state.available_cash < amount) {
        return {
            success: false,
            error: `Insufficient available cash: need $${amount.toFixed(2)}, have $${state.available_cash.toFixed(2)} (locked: $${state.locked_capital.toFixed(2)}, cooldown: $${state.cooldown_capital.toFixed(2)})`,
            available_before: state.available_cash,
        };
    }

    const newAvailable = +(state.available_cash - amount).toFixed(2);
    const newLocked = +(state.locked_capital + amount).toFixed(2);

    // 2. Atomic update with optimistic concurrency check
    const { error, count } = await supabase
        .from('lt_strategies')
        .update({
            available_cash: newAvailable,
            locked_capital: newLocked,
            updated_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId)
        .eq('available_cash', state.available_cash);  // optimistic lock

    if (error) {
        return { success: false, error: `DB error locking capital: ${error.message}` };
    }

    // If count is 0, someone else modified available_cash — retry once
    if (count === 0) {
        const retryState = await getCapitalState(supabase, strategyId);
        if (!retryState || retryState.available_cash < amount) {
            return {
                success: false,
                error: 'Concurrent modification — insufficient cash after retry',
                available_before: retryState?.available_cash,
            };
        }
        const retryAvailable = +(retryState.available_cash - amount).toFixed(2);
        const retryLocked = +(retryState.locked_capital + amount).toFixed(2);
        const { error: retryError } = await supabase
            .from('lt_strategies')
            .update({
                available_cash: retryAvailable,
                locked_capital: retryLocked,
                updated_at: new Date().toISOString(),
            })
            .eq('strategy_id', strategyId)
            .eq('available_cash', retryState.available_cash);

        if (retryError) {
            return { success: false, error: `DB error on retry: ${retryError.message}` };
        }
        return {
            success: true,
            available_before: retryState.available_cash,
            available_after: retryAvailable,
        };
    }

    return {
        success: true,
        available_before: state.available_cash,
        available_after: newAvailable,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Unlock — refund capital when an order is rejected / not filled
// ──────────────────────────────────────────────────────────────────────

/**
 * Unlock capital back to available (e.g. order failed to fill).
 * Caps the unlock so total equity never exceeds initial_capital (prevents double-unlock inflation).
 */
export async function unlockCapital(
    supabase: SupabaseClient,
    strategyId: string,
    amount: number,
): Promise<void> {
    if (amount <= 0) return;

    const state = await getCapitalState(supabase, strategyId);
    if (!state) return;

    // Guard: only unlock up to what's actually locked
    const safeAmount = Math.min(amount, state.locked_capital);
    if (safeAmount <= 0) return;

    const newLocked = Math.max(0, +(state.locked_capital - safeAmount).toFixed(2));
    const newAvailable = +(state.available_cash + safeAmount).toFixed(2);

    // Safety cap: prevent total equity from exceeding initial capital
    const newEquity = newAvailable + newLocked + state.cooldown_capital;
    const cappedAvailable = newEquity > state.initial_capital
        ? +(newAvailable - (newEquity - state.initial_capital)).toFixed(2)
        : newAvailable;

    await supabase
        .from('lt_strategies')
        .update({
            available_cash: Math.max(0, cappedAvailable),
            locked_capital: newLocked,
            updated_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);
}

// ──────────────────────────────────────────────────────────────────────
// Release — move capital from locked → cooldown when position resolves
// ──────────────────────────────────────────────────────────────────────

/**
 * Release capital after a position resolves.
 *
 * @param investedAmount  USD originally invested (moved from locked → removed)
 * @param exitValue       USD received from resolution (0 for loss, shares×$1 for win)
 * @param ltOrderId       Optional: link the cooldown entry to the order
 */
export async function releaseCapitalFromTrade(
    supabase: SupabaseClient,
    strategyId: string,
    investedAmount: number,
    exitValue: number,
    ltOrderId?: string,
): Promise<void> {
    const state = await getCapitalState(supabase, strategyId);
    if (!state) return;

    const cooldownHours = state.cooldown_hours || 3;
    const availableAt = new Date(Date.now() + cooldownHours * 3_600_000);

    // Move invested from locked (it's gone — either won or lost)
    const newLocked = Math.max(0, +(state.locked_capital - investedAmount).toFixed(2));

    // Exit value goes to cooldown (if > 0)
    const newCooldown = +(state.cooldown_capital + exitValue).toFixed(2);

    await supabase
        .from('lt_strategies')
        .update({
            locked_capital: newLocked,
            cooldown_capital: newCooldown,
            updated_at: new Date().toISOString(),
        })
        .eq('strategy_id', strategyId);

    // Queue the cooldown release
    if (exitValue > 0) {
        await supabase
            .from('lt_cooldown_queue')
            .insert({
                strategy_id: strategyId,
                lt_order_id: ltOrderId ?? null,
                amount: exitValue,
                available_at: availableAt.toISOString(),
            });
    }
}

// ──────────────────────────────────────────────────────────────────────
// Process Cooldowns — move ready items from cooldown → available
// ──────────────────────────────────────────────────────────────────────

/**
 * Process cooldown queue: release items whose available_at has passed.
 * Returns total USD released.
 */
export async function processCooldowns(
    supabase: SupabaseClient,
    strategyId: string,
): Promise<number> {
    const now = new Date().toISOString();

    // 1. Find ready items
    const { data: ready, error: readError } = await supabase
        .from('lt_cooldown_queue')
        .select('id, amount')
        .eq('strategy_id', strategyId)
        .lte('available_at', now)
        .is('released_at', null);

    if (readError || !ready || ready.length === 0) return 0;

    const totalReleased = ready.reduce((sum, item) => sum + Number(item.amount), 0);
    const readyIds = ready.map((item) => item.id);

    // 2. Mark as released
    await supabase
        .from('lt_cooldown_queue')
        .update({ released_at: now })
        .in('id', readyIds);

    // 3. Move to available cash
    const state = await getCapitalState(supabase, strategyId);
    if (state) {
        const newAvailable = +(state.available_cash + totalReleased).toFixed(2);
        const newCooldown = Math.max(0, +(state.cooldown_capital - totalReleased).toFixed(2));

        await supabase
            .from('lt_strategies')
            .update({
                available_cash: newAvailable,
                cooldown_capital: newCooldown,
                updated_at: new Date().toISOString(),
            })
            .eq('strategy_id', strategyId);
    }

    return totalReleased;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

/** Process cooldowns for ALL active strategies. */
export async function processAllCooldowns(
    supabase: SupabaseClient,
): Promise<{ processed: number; totalReleased: number }> {
    const { data: strategies } = await supabase
        .from('lt_strategies')
        .select('strategy_id')
        .eq('is_active', true);

    if (!strategies) return { processed: 0, totalReleased: 0 };

    let totalReleased = 0;
    for (const s of strategies) {
        totalReleased += await processCooldowns(supabase, s.strategy_id);
    }

    return { processed: strategies.length, totalReleased };
}
