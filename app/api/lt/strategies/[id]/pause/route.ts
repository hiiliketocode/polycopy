import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';
import { pauseStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = {
    params: Promise<{ id: string }>;
};

/**
 * POST /api/lt/strategies/[id]/pause
 * Pause a strategy
 */
export async function POST(request: Request, { params }: RouteParams) {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

        await pauseStrategy(supabase, strategyId, 'Manually paused by user');

        return NextResponse.json({
            success: true,
            message: 'Strategy paused',
        });
    } catch (error: any) {
        console.error('[LT Strategy] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
