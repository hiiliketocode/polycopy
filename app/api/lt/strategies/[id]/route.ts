import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { pauseStrategy, resumeStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * GET /api/lt/strategies/[id]
 * Get a specific strategy with risk rules and risk state (admin only)
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // Fetch strategy (simple query - no ambiguous joins)
        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('[LT Strategy GET] Query error:', error.message, error.code, { strategyId, userId });
            return NextResponse.json(
                { error: 'Failed to load strategy', detail: error.message },
                { status: 500, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        if (!strategy) {
            console.warn('[LT Strategy GET] Not found:', { strategyId, userId });
            return NextResponse.json(
                { error: 'Strategy not found' },
                { status: 404, headers: { 'Cache-Control': 'no-store' } }
            );
        }

        // Fetch risk rules separately (avoids ambiguous FK between lt_strategies <-> lt_risk_rules)
        const { data: riskRules } = await supabase
            .from('lt_risk_rules')
            .select('*')
            .eq('strategy_id', strategyId)
            .maybeSingle();

        // Fetch risk state separately
        const { data: riskState } = await supabase
            .from('lt_risk_state')
            .select('*')
            .eq('strategy_id', strategyId)
            .maybeSingle();

        return NextResponse.json(
            {
                success: true,
                strategy: {
                    ...strategy,
                    lt_risk_rules: riskRules ? [riskRules] : [],
                    lt_risk_state: riskState ? [riskState] : [],
                },
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error: any) {
        console.error('[LT Strategy GET] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } }
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

        // Verify ownership
        const { data: existing } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!existing) {
            return NextResponse.json(
                { error: 'Strategy not found' },
                { status: 404 }
            );
        }

        // Update strategy
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
        console.error('[LT Strategy PATCH] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
