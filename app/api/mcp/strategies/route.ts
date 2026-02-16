/**
 * GET /api/mcp/strategies
 *
 * MCP-only: List LT strategies. Auth: CRON_SECRET (Bearer).
 * Returns all strategies for admin users (used by MCP server when no session).
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAdminSessionUser } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();

  try {
    let adminIds: string[] = [];

    const sessionUser = await getAdminSessionUser();
    if (sessionUser) {
      adminIds = [sessionUser.id];
    } else {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('is_admin', true);
      adminIds = (admins || []).map((a: { id: string }) => a.id);
      if (adminIds.length === 0) {
        return NextResponse.json({ ok: false, strategies: [], summary: { strategies_count: 0 } });
      }
    }

    const { data: strategies, error } = await supabase
      .from('lt_strategies')
      .select(`
        strategy_id, ft_wallet_id, display_name, is_active, is_paused,
        shadow_mode, wallet_address, initial_capital, available_cash,
        locked_capital, cooldown_capital, circuit_breaker_active,
        daily_spent_usd, consecutive_losses, current_drawdown_pct,
        last_sync_time, created_at, user_id
      `)
      .in('user_id', adminIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const list = strategies || [];
    const strategyIds = list.map((s: { strategy_id: string }) => s.strategy_id);

    let orderCounts: Record<string, number> = {};
    if (strategyIds.length > 0) {
      await Promise.all(
        strategyIds.map(async (sid: string) => {
          const { count } = await supabase
            .from('lt_orders')
            .select('*', { count: 'exact', head: true })
            .eq('strategy_id', sid);
          orderCounts[sid] = count ?? 0;
        })
      );
    }

    const strategiesWithMeta = list.map((s: Record<string, unknown>) => ({
      ...s,
      equity:
        Number(s.available_cash) + Number(s.locked_capital) + Number(s.cooldown_capital),
      orders_count: orderCounts[s.strategy_id as string] ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      summary: {
        strategies_count: list.length,
        active_count: list.filter((s: { is_active: boolean }) => s.is_active).length,
        paused_count: list.filter((s: { is_paused: boolean }) => s.is_paused).length,
        total_lt_orders: Object.values(orderCounts).reduce((a, b) => a + b, 0),
      },
      strategies: strategiesWithMeta,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
