import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { resumeStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * POST /api/lt/strategies/[id]/resume
 * Resume a strategy (admin only)
 */
export async function POST(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        // Verify ownership
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

        await resumeStrategy(supabase, strategyId);

        return NextResponse.json({
            success: true,
            message: 'Strategy resumed',
        });
    } catch (error: any) {
        console.error('[LT Strategy] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
