import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * POST /api/lt/strategies/[id]/resume
 * Resume a strategy (admin only)
 * Updates is_paused and circuit_breaker_active on lt_strategies directly.
 */
export async function POST(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

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

        const { error: updateError } = await supabase
            .from('lt_strategies')
            .update({
                is_active: true,
                is_paused: false,
                circuit_breaker_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('strategy_id', strategyId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Strategy resumed',
        });
    } catch (error: unknown) {
        console.error('[LT Strategy] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
