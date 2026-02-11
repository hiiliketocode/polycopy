import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/status
 * Admin-only: check DB setup and live trading state.
 * V2: Risk state is inline on lt_strategies — no separate tables.
 */
export async function GET() {
    const authError = await requireAdmin();
    if (authError) return authError;
    const user = await getAdminSessionUser();
    const userId = user!.id;

    try {
        const supabase = createAdminServiceClient();

        const { data: strategies, error: stratErr } = await supabase
            .from('lt_strategies')
            .select(`
                strategy_id, ft_wallet_id, display_name, is_active, is_paused,
                shadow_mode, wallet_address, initial_capital, available_cash,
                locked_capital, cooldown_capital, circuit_breaker_active,
                daily_spent_usd, consecutive_losses, current_drawdown_pct,
                last_sync_time, created_at
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (stratErr) {
            return NextResponse.json({ ok: false, error: stratErr.message }, { status: 500 });
        }

        const list = strategies || [];
        const strategyIds = list.map((s: any) => s.strategy_id);

        let orderCounts: Record<string, number> = {};
        if (strategyIds.length > 0) {
            const { data: orderRows } = await supabase
                .from('lt_orders')
                .select('strategy_id')
                .in('strategy_id', strategyIds);
            if (orderRows) {
                orderRows.forEach((o: any) => {
                    orderCounts[o.strategy_id] = (orderCounts[o.strategy_id] || 0) + 1;
                });
            }
        }

        const strategiesWithMeta = list.map((s: any) => ({
            ...s,
            equity: Number(s.available_cash) + Number(s.locked_capital) + Number(s.cooldown_capital),
            orders_count: orderCounts[s.strategy_id] ?? 0,
        }));

        return NextResponse.json({
            ok: true,
            user_id: userId,
            summary: {
                strategies_count: list.length,
                active_count: list.filter((s: any) => s.is_active).length,
                paused_count: list.filter((s: any) => s.is_paused).length,
                total_lt_orders: Object.values(orderCounts).reduce((a, b) => a + b, 0),
            },
            strategies: strategiesWithMeta,
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
