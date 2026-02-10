import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/lt/strategies/[id]/orders
 * Returns open orders, closed orders, and execution stats (fill rate, slippage).
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        const { data: strategy } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const { data: orders, error } = await supabase
            .from('lt_orders')
            .select(`
                lt_order_id,
                ft_order_id,
                order_id,
                source_trade_id,
                trader_address,
                condition_id,
                market_title,
                market_slug,
                token_label,
                signal_price,
                signal_size_usd,
                executed_price,
                executed_size,
                slippage_pct,
                fill_rate,
                execution_latency_ms,
                fill_latency_ms,
                risk_check_passed,
                risk_check_reason,
                status,
                rejection_reason,
                outcome,
                winning_label,
                pnl,
                ft_entry_price,
                ft_size,
                ft_pnl,
                performance_diff_pct,
                order_placed_at,
                first_fill_at,
                fully_filled_at,
                resolved_at,
                created_at
            `)
            .eq('strategy_id', strategyId)
            .order('order_placed_at', { ascending: false })
            .limit(500);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const all = orders || [];

        // Split into open and closed
        const openOrders = all.filter((o: any) => o.outcome === 'OPEN' && (o.status === 'FILLED' || o.status === 'PARTIAL'));
        const closedOrders = all.filter((o: any) => o.outcome === 'WON' || o.outcome === 'LOST' || o.outcome === 'CLOSED');
        const failedOrders = all.filter((o: any) => o.status === 'REJECTED' || o.status === 'CANCELLED');
        const pendingOrders = all.filter((o: any) => o.status === 'PENDING');

        // Execution stats
        const filled = all.filter((o: any) => o.status === 'FILLED');
        const totalSignalUsd = all.reduce((s: number, o: any) => s + (Number(o.signal_size_usd) || 0), 0);
        const totalExecutedUsd = all.reduce((s: number, o: any) => s + (Number(o.executed_size) || 0), 0);

        // Slippage stats
        const withSlippage = all.filter((o: any) => o.slippage_pct != null && o.status === 'FILLED');
        const avgSlippagePct = withSlippage.length > 0
            ? withSlippage.reduce((s: number, o: any) => s + Math.abs(Number(o.slippage_pct)), 0) / withSlippage.length
            : null;
        const maxSlippagePct = withSlippage.length > 0
            ? Math.max(...withSlippage.map((o: any) => Math.abs(Number(o.slippage_pct))))
            : null;

        // Fill rate stats
        const withFillRate = all.filter((o: any) => o.fill_rate != null);
        const avgFillRate = withFillRate.length > 0
            ? withFillRate.reduce((s: number, o: any) => s + Number(o.fill_rate), 0) / withFillRate.length
            : null;

        // Latency stats
        const withLatency = all.filter((o: any) => o.execution_latency_ms != null);
        const avgLatencyMs = withLatency.length > 0
            ? Math.round(withLatency.reduce((s: number, o: any) => s + Number(o.execution_latency_ms), 0) / withLatency.length)
            : null;

        // P&L stats
        const won = closedOrders.filter((o: any) => o.outcome === 'WON').length;
        const lost = closedOrders.filter((o: any) => o.outcome === 'LOST').length;
        const realizedPnl = closedOrders.reduce((s: number, o: any) => s + (Number(o.pnl) || 0), 0);

        return NextResponse.json({
            success: true,
            open_orders: openOrders,
            closed_orders: closedOrders,
            failed_orders: failedOrders,
            pending_orders: pendingOrders,
            stats: {
                total_attempts: all.length,
                filled: filled.length,
                failed: failedOrders.length,
                pending: pendingOrders.length,
                open_positions: openOrders.length,
                closed_positions: closedOrders.length,
                won,
                lost,
                win_rate: (won + lost) > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : null,
                realized_pnl: Math.round(realizedPnl * 100) / 100,
                total_signal_usd: Math.round(totalSignalUsd * 100) / 100,
                total_executed_usd: Math.round(totalExecutedUsd * 100) / 100,
                fill_rate_pct: totalSignalUsd > 0 ? Math.round((totalExecutedUsd / totalSignalUsd) * 10000) / 100 : null,
                avg_fill_rate: avgFillRate != null ? Math.round(avgFillRate * 10000) / 10000 : null,
                avg_slippage_pct: avgSlippagePct != null ? Math.round(avgSlippagePct * 10000) / 10000 : null,
                max_slippage_pct: maxSlippagePct != null ? Math.round(maxSlippagePct * 10000) / 10000 : null,
                avg_latency_ms: avgLatencyMs,
            },
        });
    } catch (err: unknown) {
        console.error('[LT Orders] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
