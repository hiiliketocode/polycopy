import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/status
 * Admin-only: check DB setup and live trading state (strategies, risk state, orders).
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
                strategy_id,
                ft_wallet_id,
                display_name,
                is_active,
                is_paused,
                wallet_address,
                starting_capital,
                health_status,
                last_sync_time,
                created_at,
                user_id
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (stratErr) {
            return NextResponse.json({
                ok: false,
                error: 'Failed to read lt_strategies',
                detail: stratErr.message,
            }, { status: 500 });
        }

        const list = strategies || [];
        const strategyIds = list.map((s: { strategy_id: string }) => s.strategy_id);

        let riskState: Record<string, unknown> = {};
        let orderCounts: Record<string, number> = {};

        if (strategyIds.length > 0) {
            const { data: riskRows } = await supabase
                .from('lt_risk_state')
                .select('strategy_id, current_equity, peak_equity, is_paused, circuit_breaker_active, consecutive_losses, current_drawdown_pct')
                .in('strategy_id', strategyIds);
            if (riskRows) {
                riskRows.forEach((r: { strategy_id: string; [k: string]: unknown }) => {
                    riskState[r.strategy_id] = r;
                });
            }

            const { data: orderRows } = await supabase
                .from('lt_orders')
                .select('strategy_id')
                .in('strategy_id', strategyIds);
            if (orderRows) {
                orderRows.forEach((o: { strategy_id: string }) => {
                    orderCounts[o.strategy_id] = (orderCounts[o.strategy_id] || 0) + 1;
                });
            }
        }

        const strategiesWithMeta = list.map((s: Record<string, unknown>) => ({
            ...s,
            risk_state: riskState[s.strategy_id as string] ?? null,
            orders_count: orderCounts[s.strategy_id as string] ?? 0,
        }));

        const activeCount = list.filter((s: { is_active: boolean }) => s.is_active).length;
        const pausedCount = list.filter((s: { is_paused: boolean }) => s.is_paused).length;
        const totalOrders = Object.values(orderCounts).reduce((a, b) => a + b, 0);

        return NextResponse.json({
            ok: true,
            user_id: userId,
            tables_ok: true,
            summary: {
                strategies_count: list.length,
                active_count: activeCount,
                paused_count: pausedCount,
                total_lt_orders: totalOrders,
            },
            strategies: strategiesWithMeta,
        });
    } catch (e: unknown) {
        console.error('[LT Status]', e);
        return NextResponse.json({
            ok: false,
            error: e instanceof Error ? e.message : 'Internal error',
        }, { status: 500 });
    }
}
