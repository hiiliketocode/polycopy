import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { pauseStrategy, resumeStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * GET /api/lt/strategies/[id]
 * Get a specific strategy (admin only)
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        let { data: strategy, error } = await supabase
            .from('lt_strategies')
            .select(`
                *,
                lt_risk_rules (*),
                lt_risk_state (*)
            `)
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .single();

        // Fallback: lookup by ft_wallet_id when id is LT_<ft_wallet_id> (same strategy, ensures page loads)
        if ((error || !strategy) && strategyId.startsWith('LT_')) {
            const ftWalletId = strategyId.slice(3);
            const fallback = await supabase
                .from('lt_strategies')
                .select(`
                    *,
                    lt_risk_rules (*),
                    lt_risk_state (*)
                `)
                .eq('ft_wallet_id', ftWalletId)
                .eq('user_id', userId)
                .maybeSingle();
            if (fallback.data) {
                strategy = fallback.data;
                error = null;
            }
        }

        if (error || !strategy) {
            return NextResponse.json(
                { error: 'Strategy not found' },
                { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
            );
        }

        return NextResponse.json(
            { success: true, strategy },
            { headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
    } catch (error: any) {
        console.error('[LT Strategy] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/lt/strategies/[id]
 * Update a strategy (admin only)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();
        const body = await request.json();

        const { data: existing } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .single();

        if (!existing) {
            return NextResponse.json(
                { error: 'Strategy not found' },
                { status: 404 }
            );
        }

        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .update({
                ...body,
                updated_at: new Date().toISOString(),
            })
            .eq('strategy_id', strategyId)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            strategy,
        });
    } catch (error: any) {
        console.error('[LT Strategy] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

