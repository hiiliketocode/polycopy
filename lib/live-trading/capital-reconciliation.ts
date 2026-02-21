/**
 * Capital reconciliation for LT strategies.
 *
 * Recomputes from source of truth:
 *   equity = initial_capital + realized_pnl
 *   locked_capital = sum of open (FILLED/PARTIAL/PENDING) order values
 *   available_cash = equity - locked - cooldown
 *   daily_spent_usd, current_drawdown_pct
 *
 * Used by:
 *   - POST /api/lt/sync-order-status (after syncing CLOB)
 *   - POST /api/lt/execute (before processing strategies, so locks see fresh cash)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/live-trading/paginated-query';

export interface RunCapitalReconciliationOptions {
  now?: Date;
  log?: boolean;
}

export interface RunCapitalReconciliationResult {
  strategiesReconciled: number;
  capitalReconciled: number;
}

export async function runCapitalReconciliation(
  supabase: SupabaseClient,
  options: RunCapitalReconciliationOptions = {},
): Promise<RunCapitalReconciliationResult> {
  const now = options.now ?? new Date();
  const doLog = options.log !== false;

  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const todayMidnightIso = todayMidnight.toISOString();

  let capitalReconciled = 0;
  let strategiesReconciled = 0;

  const { data: activeStrategies } = await supabase
    .from('lt_strategies')
    .select('strategy_id, locked_capital, available_cash, initial_capital, cooldown_capital, daily_spent_usd')
    .eq('is_active', true);

  for (const strat of activeStrategies || []) {
    const strategyId = strat.strategy_id;
    const initialCapital = Number(strat.initial_capital) || 0;
    const cooldown = Number(strat.cooldown_capital) || 0;
    const currentAvailable = Number(strat.available_cash) || 0;
    const actualLocked = Number(strat.locked_capital) || 0;
    const currentDailySpent = Number(strat.daily_spent_usd) || 0;

    const openOrders = await fetchAllRows(supabase, 'lt_orders',
      'signal_size_usd, executed_size_usd, status',
      [['strategy_id', 'eq', strategyId], ['outcome', 'eq', 'OPEN'], ['status', 'in', ['FILLED', 'PARTIAL', 'PENDING']]]);

    const shouldBeLocked = openOrders.reduce((sum: number, o: any) => {
      if (o.status === 'PENDING') return sum + (Number(o.signal_size_usd) || 0);
      return sum + (Number(o.executed_size_usd) || 0);
    }, 0);

    const resolvedOrders = await fetchAllRows(supabase, 'lt_orders',
      'pnl',
      [['strategy_id', 'eq', strategyId], ['outcome', 'in', ['WON', 'LOST']]]);

    const realizedPnl = resolvedOrders.reduce((sum: number, o: any) => sum + (Number(o.pnl) || 0), 0);

    const todayFilledOrders = await fetchAllRows(supabase, 'lt_orders',
      'executed_size_usd',
      [['strategy_id', 'eq', strategyId], ['status', 'in', ['FILLED', 'PARTIAL']], ['executed_size_usd', 'not.is', null], ['order_placed_at', 'gte', todayMidnightIso]]);

    const correctDailySpent = +(
      (todayFilledOrders || []).reduce((sum: number, o: any) => sum + (Number(o.executed_size_usd) || 0), 0)
    ).toFixed(2);

    let correctCooldown = cooldown;
    if (cooldown > 0) {
      const { data: unreleasedCooldowns } = await supabase
        .from('lt_cooldown_queue')
        .select('amount')
        .eq('strategy_id', strategyId)
        .is('released_at', null);

      const queuedCooldown = (unreleasedCooldowns || []).reduce(
        (sum: number, item: any) => sum + (Number(item.amount) || 0), 0
      );

      if (Math.abs(cooldown - queuedCooldown) > 0.01) {
        correctCooldown = +queuedCooldown.toFixed(2);
        if (doLog) {
          console.log(
            `[capital-reconciliation] COOLDOWN FIX ${strategyId}: cooldown $${cooldown.toFixed(2)} → $${correctCooldown.toFixed(2)}`
          );
        }
      }
    }

    const correctEquity = +(initialCapital + realizedPnl).toFixed(2);
    let correctLocked = +shouldBeLocked.toFixed(2);
    if (initialCapital > 0 && correctLocked > initialCapital) {
      if (doLog) {
        console.log(`[capital-reconciliation] LOCKED CAP ${strategyId}: capping locked to initial $${initialCapital.toFixed(2)}`);
      }
      correctLocked = +initialCapital.toFixed(2);
    }
    const correctAvailable = +(correctEquity - correctLocked - correctCooldown).toFixed(2);
    const correctDrawdown = correctEquity < initialCapital
      ? +((initialCapital - correctEquity) / initialCapital).toFixed(4)
      : 0;

    const currentEquity = +(currentAvailable + actualLocked + cooldown).toFixed(2);
    const equityDrift = Math.abs(currentEquity - correctEquity);
    const lockedDrift = Math.abs(actualLocked - correctLocked);
    const cooldownDrift = Math.abs(cooldown - correctCooldown);
    const dailySpentDrift = Math.abs(currentDailySpent - correctDailySpent);

    if (equityDrift > 0.01 || lockedDrift > 0.01 || cooldownDrift > 0.01 || dailySpentDrift > 0.50) {
      const updatePayload: Record<string, any> = {
        locked_capital: Math.max(0, correctLocked),
        cooldown_capital: Math.max(0, correctCooldown),
        available_cash: Math.max(0, correctAvailable),
        current_drawdown_pct: correctDrawdown,
        peak_equity: Math.max(correctEquity, Number(initialCapital)),
        updated_at: now.toISOString(),
      };

      if (dailySpentDrift > 0.50) {
        updatePayload.daily_spent_usd = correctDailySpent;
      }

      await supabase
        .from('lt_strategies')
        .update(updatePayload)
        .eq('strategy_id', strategyId);

      capitalReconciled += Math.abs(correctAvailable - currentAvailable);
      strategiesReconciled++;

      if (doLog) {
        console.log(
          `[capital-reconciliation] RECONCILED ${strategyId}: available $${currentAvailable.toFixed(2)} → $${correctAvailable.toFixed(2)} | locked $${actualLocked.toFixed(2)} → $${correctLocked.toFixed(2)}`
        );
      }
    }
  }

  if (doLog && strategiesReconciled > 0) {
    console.log(`[capital-reconciliation] Reconciled ${strategiesReconciled} strategies, freed $${capitalReconciled.toFixed(2)}`);
  }

  return { strategiesReconciled, capitalReconciled };
}
