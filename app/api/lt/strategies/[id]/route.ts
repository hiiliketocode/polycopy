import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { pauseStrategy, resumeStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * GET /api/lt/strategies/[id]
 * Get a specific strategy (admin only).
 * Simple: lookup by strategy_id only, no joins (avoids PostgREST ambiguity).
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // Simple query: no joins. Joins to lt_risk_rules fail due to ambiguous FK.
        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .single();

        if (error || !strategy) {
            console.error('[LT Strategy GET] Not found:', strategyId, 'user:', userId, 'error:', error?.message);
            return NextResponse.json(
                { error: 'Strategy not found', debug: { strategyId, userId: userId.slice(0, 8), dbError: error?.message } },
                { status: 404, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // Fetch risk state separately (simple 1:1 via strategy_id)
        const { data: riskState } = await supabase
            .from('lt_risk_state')
            .select('*')
            .eq('strategy_id', strategyId)
            .maybeSingle();

        return NextResponse.json(
            { success: true, strategy: { ...strategy, lt_risk_state: riskState ? [riskState] : [] } },
            { headers: { 'Cache-Control': 'no-store' } }
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
