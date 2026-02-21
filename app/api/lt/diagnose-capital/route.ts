/**
 * GET /api/lt/diagnose-capital
 *
 * Diagnostic: for each active LT strategy, returns current DB capital state,
 * open lt_orders count/sum, OPEN ft_orders count (last 12h), and what
 * reconciliation would compute. Use this to verify why "Insufficient cash"
 * rejections happen — e.g. if available_cash is wrong or if we have far more
 * ft_order candidates than cash can cover in one run.
 *
 * Auth: admin or CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { fetchAllRows } from '@/lib/live-trading/paginated-query';

const FT_LOOKBACK_HOURS = 12;

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();
  const minOrderTime = new Date(now.getTime() - FT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const todayMidnightIso = todayMidnight.toISOString();

  const { data: strategies } = await supabase
    .from('lt_strategies')
    .select('strategy_id, ft_wallet_id, is_paused, available_cash, locked_capital, initial_capital, cooldown_capital')
    .eq('is_active', true);

  const diagnostics: Array<{
    strategy_id: string;
    is_paused: boolean;
    db: { available_cash: number; locked_capital: number; initial_capital: number; cooldown_capital: number };
    open_lt_orders: { count: number; sum_locked_usd: number };
    open_ft_orders_12h: number;
    reconciliation: {
      correct_equity: number;
      correct_locked: number;
      correct_available: number;
      realized_pnl: number;
      drift: boolean;
    };
    interpretation: string;
  }> = [];

  for (const strat of strategies || []) {
    const strategyId = strat.strategy_id;
    const initialCapital = Number(strat.initial_capital) || 0;
    const cooldown = Number(strat.cooldown_capital) || 0;
    const currentAvailable = Number(strat.available_cash) || 0;
    const actualLocked = Number(strat.locked_capital) || 0;

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

    const correctEquity = +(initialCapital + realizedPnl).toFixed(2);
    let correctLocked = +shouldBeLocked.toFixed(2);
    if (initialCapital > 0 && correctLocked > initialCapital) correctLocked = +initialCapital.toFixed(2);
    const correctAvailable = +(correctEquity - correctLocked - cooldown).toFixed(2);

    const { count: ftOrdersCount } = await supabase
      .from('ft_orders')
      .select('order_id', { count: 'exact', head: true })
      .eq('wallet_id', strat.ft_wallet_id)
      .eq('outcome', 'OPEN')
      .gte('order_time', minOrderTime);

    const openFtOrders12h = ftOrdersCount ?? 0;
    const drift = Math.abs(currentAvailable - correctAvailable) > 0.01 || Math.abs(actualLocked - correctLocked) > 0.01;

    let interpretation: string;
    if (strat.is_paused) {
      interpretation = 'Paused — no execute; rejections in LT Trades are from when it was active.';
    } else if (drift) {
      interpretation = `DB has drifted: available_cash should be $${correctAvailable.toFixed(2)} (reconciliation will fix on next sync/execute).`;
    } else if (openFtOrders12h > 0 && correctAvailable > 0) {
      const approxOrdersFundable = Math.floor(correctAvailable / (strat.initial_capital > 0 ? Math.min(3, correctAvailable / 50) : 3));
      if (openFtOrders12h > approxOrdersFundable * 2) {
        interpretation = `Many OPEN ft_orders (${openFtOrders12h}) vs ~$${correctAvailable.toFixed(0)} available — later attempts in same run will see "Insufficient cash" after first ~${approxOrdersFundable} locks.`;
      } else {
        interpretation = `OPEN ft_orders (${openFtOrders12h}) and available cash look compatible; if you still see cash rejections, check logs for attempt_index_this_run when CASH_CHECK fails.`;
      }
    } else if (correctAvailable <= 0) {
      interpretation = 'Reconciliation says available should be ≤0 (equity - locked - cooldown). Cash rejections expected until positions resolve.';
    } else {
      interpretation = 'No OPEN ft_orders in last 12h; cash rejections may be from a previous run.';
    }

    diagnostics.push({
      strategy_id: strategyId,
      is_paused: !!strat.is_paused,
      db: {
        available_cash: currentAvailable,
        locked_capital: actualLocked,
        initial_capital: initialCapital,
        cooldown_capital: cooldown,
      },
      open_lt_orders: { count: openOrders.length, sum_locked_usd: +shouldBeLocked.toFixed(2) },
      open_ft_orders_12h: openFtOrders12h,
      reconciliation: {
        correct_equity: correctEquity,
        correct_locked: correctLocked,
        correct_available: correctAvailable,
        realized_pnl: realizedPnl,
        drift,
      },
      interpretation,
    });
  }

  return NextResponse.json({
    message: 'LT capital diagnostic — use to verify cause of "Insufficient cash" rejections.',
    at: now.toISOString(),
    strategies: diagnostics,
  });
}
