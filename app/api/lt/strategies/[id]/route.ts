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

        console.log(`[LT GET] Looking up strategy_id="${strategyId}" for user_id="${userId}"`);

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

        console.log(`[LT GET] Primary lookup result: found=${!!strategy}, error=${error?.message || 'none'}`);

        // Fallback: lookup by ft_wallet_id when id is LT_<ft_wallet_id> (same strategy, ensures page loads)
        if ((error || !strategy) && strategyId.startsWith('LT_')) {
            const ftWalletId = strategyId.slice(3);
            console.log(`[LT GET] Trying fallback: ft_wallet_id="${ftWalletId}" for user_id="${userId}"`);
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
            console.log(`[LT GET] Fallback result: found=${!!fallback.data}, error=${fallback.error?.message || 'none'}`);
            if (fallback.data) {
                strategy = fallback.data;
                error = null;
            }
        }

        if (error || !strategy) {
            console.log(`[LT GET] Returning 404: strategy_id="${strategyId}", user_id="${userId}"`);
            return NextResponse.json(
                { 
                    error: 'Strategy not found',
                    debug: { strategyId, userId, note: 'Check /api/lt/whoami and /api/lt/status to verify auth and strategy existence' }
                },
                { status: 404, headers: { 'Cache-Control': 'no-store, max-age=0' } }
            );
        }

        console.log(`[LT GET] Success: returning strategy ${strategy.strategy_id}`);
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

