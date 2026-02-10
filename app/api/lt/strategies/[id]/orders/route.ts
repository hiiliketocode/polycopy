import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Resolve strategy_id from URL id (3-tier: strategy_id -> ft_wallet_id -> single-user)
 */
async function findStrategyId(supabase: ReturnType<typeof createAdminServiceClient>, idFromUrl: string, userId: string): Promise<string | null> {
    const { data: s1 } = await supabase.from('lt_strategies').select('strategy_id').eq('strategy_id', idFromUrl).eq('user_id', userId).maybeSingle();
    if (s1) return s1.strategy_id;

    if (idFromUrl.startsWith('LT_')) {
        const { data: s2 } = await supabase.from('lt_strategies').select('strategy_id').eq('ft_wallet_id', idFromUrl.slice(3)).eq('user_id', userId).maybeSingle();
        if (s2) return s2.strategy_id;
    }

    const { data: all } = await supabase.from('lt_strategies').select('strategy_id').eq('user_id', userId).limit(2);
    if (all && all.length === 1) return all[0].strategy_id;

    return null;
}

/**
 * GET /api/lt/strategies/[id]/orders
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: idFromUrl } = await params;
        const supabase = createAdminServiceClient();

        const strategyId = await findStrategyId(supabase, idFromUrl, userId);
        if (!strategyId) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const { data: orders, error } = await supabase
            .from('lt_orders')
            .select(`
                lt_order_id, ft_order_id, order_id, source_trade_id,
                market_title, market_slug, token_label,
                signal_price, signal_size_usd, executed_price, executed_size,
                status, rejection_reason, fill_rate,
                order_placed_at, first_fill_at, fully_filled_at,
                outcome, pnl, resolved_at
            `)
            .eq('strategy_id', strategyId)
            .order('order_placed_at', { ascending: false })
            .limit(200);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const list = orders || [];
        const filled = list.filter((o: { status: string }) => o.status === 'FILLED').length;
        const partial = list.filter((o: { status: string }) => o.status === 'PARTIAL').length;
        const failed = list.filter((o: { status: string }) => o.status === 'REJECTED' || o.status === 'CANCELLED').length;
        const pending = list.filter((o: { status: string }) => o.status === 'PENDING').length;
        const totalSignalUsd = list.reduce((s: number, o: { signal_size_usd?: number }) => s + (Number(o.signal_size_usd) || 0), 0);
        const totalExecutedUsd = list.reduce((s: number, o: { executed_size?: number }) => s + (Number(o.executed_size) || 0), 0);
        const fillRatePct = totalSignalUsd > 0 ? (totalExecutedUsd / totalSignalUsd) * 100 : null;
        const withFillRate = list.filter((o: { fill_rate?: number }) => o.fill_rate != null);
        const avgFillRate = withFillRate.length
            ? withFillRate.reduce((s: number, o: { fill_rate?: number }) => s + (Number(o.fill_rate) || 0), 0) / withFillRate.length
            : null;

        return NextResponse.json({
            success: true,
            orders: list,
            stats: {
                attempts: list.length, filled, partial, failed, pending,
                fill_rate_pct: fillRatePct != null ? Math.round(fillRatePct * 100) / 100 : null,
                avg_fill_rate: avgFillRate != null ? Math.round(avgFillRate * 10000) / 10000 : null,
                total_signal_usd: totalSignalUsd,
                total_executed_usd: totalExecutedUsd,
            },
        });
    } catch (err: unknown) {
        console.error('[LT Orders] Error:', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
    }
}
