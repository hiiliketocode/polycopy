import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * GET /api/lt/strategies/[id]
 * Get a specific strategy (admin only).
 * Cross-admin: any admin can view any admin's strategy (read-only).
 * V2: Everything is on lt_strategies table — no separate risk tables.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // First try own strategy
        let { data: strategy, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
        }

        // If not found, check other admins' strategies (cross-admin read)
        if (!strategy) {
            const { data: crossStrategy, error: crossError } = await supabase
                .from('lt_strategies')
                .select('*')
                .eq('strategy_id', strategyId)
                .maybeSingle();

            if (crossError) {
                return NextResponse.json({ error: crossError.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
            }
            if (crossStrategy) {
                // Verify the owner is also an admin
                const { data: ownerProfile } = await supabase
                    .from('profiles')
                    .select('is_admin, wallet_label')
                    .eq('id', crossStrategy.user_id)
                    .maybeSingle();
                if (ownerProfile?.is_admin) {
                    return NextResponse.json(
                        {
                            success: true,
                            strategy: { ...crossStrategy, owner_label: ownerProfile.wallet_label || null, is_own: false },
                        },
                        { headers: { 'Cache-Control': 'no-store' } },
                    );
                }
            }
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
        }

        // Get own label
        const { data: ownProfile } = await supabase
            .from('profiles')
            .select('wallet_label')
            .eq('id', userId)
            .maybeSingle();

        return NextResponse.json(
            { success: true, strategy: { ...strategy, owner_label: ownProfile?.wallet_label || null, is_own: true } },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}

/**
 * PATCH /api/lt/strategies/[id]
 * Update a strategy (admin only).
 * Only the owner can modify their own strategy.
 * Updatable fields: display_name, description, is_active, is_paused, shadow_mode,
 * slippage_tolerance_pct, order_type, min/max_order_size_usd, risk rules, etc.
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

        // Verify ownership (only owner can modify)
        const { data: existing } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!existing) {
            return NextResponse.json({ error: 'Strategy not found or not owned by you' }, { status: 404 });
        }

        // Whitelist updatable fields
        const allowed = [
            'display_name', 'description', 'is_active', 'is_paused', 'shadow_mode',
            'slippage_tolerance_pct', 'order_type', 'min_order_size_usd', 'max_order_size_usd',
            'max_position_size_usd', 'max_total_exposure_usd', 'daily_budget_usd',
            'max_daily_loss_usd', 'circuit_breaker_loss_pct', 'stop_loss_pct', 'take_profit_pct',
            'max_hold_hours', 'cooldown_hours',
        ];

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        for (const key of allowed) {
            if (body[key] !== undefined) {
                updates[key] = body[key];
            }
        }

        // If activating, set launched_at
        if (body.is_active === true) {
            const { data: current } = await supabase
                .from('lt_strategies')
                .select('launched_at')
                .eq('strategy_id', strategyId)
                .single();
            if (!current?.launched_at) {
                updates.launched_at = new Date().toISOString();
            }
        }

        // If unpausing, clear circuit breaker
        if (body.is_paused === false) {
            updates.circuit_breaker_active = false;
        }

        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .update(updates)
            .eq('strategy_id', strategyId)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, strategy });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
