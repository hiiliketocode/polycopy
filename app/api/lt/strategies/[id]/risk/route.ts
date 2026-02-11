import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

/** Risk-related fields on lt_strategies (inline in V2 schema) */
const RISK_RULE_FIELDS = [
    'max_position_size_usd',
    'max_total_exposure_usd',
    'daily_budget_usd',
    'max_daily_loss_usd',
    'circuit_breaker_loss_pct',
    'stop_loss_pct',
    'take_profit_pct',
    'max_hold_hours'
] as const;

/** Risk state fields on lt_strategies */
const RISK_STATE_FIELDS = [
    'is_paused',
    'circuit_breaker_active',
    'daily_spent_usd',
    'daily_loss_usd',
    'consecutive_losses',
    'peak_equity',
    'current_drawdown_pct',
    'last_reset_date'
] as const;

/**
 * GET /api/lt/strategies/[id]/risk
 * Get risk rules and current risk state for a strategy (from lt_strategies inline)
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;

    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error || !strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const rules = Object.fromEntries(
            RISK_RULE_FIELDS.map(f => [f, strategy[f] ?? null])
        );
        const state = Object.fromEntries(
            RISK_STATE_FIELDS.map(f => [f, strategy[f] ?? null])
        );

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
 * Update risk rules for a strategy (on lt_strategies directly)
 */
export async function PATCH(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;

    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

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
        const updates: Record<string, unknown> = {};

        for (const field of RISK_RULE_FIELDS) {
            if (field in body) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        updates.updated_at = new Date().toISOString();

        const { data: updated, error: updateError } = await supabase
            .from('lt_strategies')
            .update(updates)
            .eq('strategy_id', strategyId)
            .select('*')
            .single();

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        const rules = Object.fromEntries(
            RISK_RULE_FIELDS.map(f => [f, updated[f] ?? null])
        );
        const state = Object.fromEntries(
            RISK_STATE_FIELDS.map(f => [f, updated[f] ?? null])
        );

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
