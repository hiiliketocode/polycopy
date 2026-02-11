import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { getRiskRules, getRiskState } from '@/lib/live-trading/risk-manager';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/lt/strategies/[id]/risk
 * Get risk rules and current risk state for a strategy
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // Verify user owns this strategy
        const { data: strategy } = await supabase
            .from('lt_strategies')
            .select('strategy_id, user_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const rules = await getRiskRules(supabase, strategyId);
        const state = await getRiskState(supabase, strategyId);

        return NextResponse.json({
            success: true,
            rules,
            state
        });
    } catch (err: unknown) {
        console.error('[LT Risk Settings] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/lt/strategies/[id]/risk
 * Update risk rules for a strategy
 */
export async function PATCH(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // Verify user owns this strategy
        const { data: strategy } = await supabase
            .from('lt_strategies')
            .select('strategy_id, user_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const body = await request.json();
        
        // Build update object from allowed fields
        const allowedFields = [
            'daily_budget_usd',
            'daily_budget_pct',
            'max_position_size_usd',
            'max_total_exposure_usd',
            'max_concurrent_positions',
            'max_drawdown_pct',
            'max_consecutive_losses',
            'max_slippage_pct'
        ];

        const updates: Record<string, any> = {};
        for (const field of allowedFields) {
            if (field in body) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        updates.updated_at = new Date().toISOString();

        // Update risk rules
        const { error: updateError } = await supabase
            .from('lt_risk_rules')
            .update(updates)
            .eq('strategy_id', strategyId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Return updated rules
        const rules = await getRiskRules(supabase, strategyId);
        const state = await getRiskState(supabase, strategyId);

        return NextResponse.json({
            success: true,
            message: 'Risk settings updated',
            rules,
            state
        });
    } catch (err: unknown) {
        console.error('[LT Risk Settings Update] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
