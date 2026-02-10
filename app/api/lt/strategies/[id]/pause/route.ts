import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { pauseStrategy } from '@/lib/live-trading/risk-manager';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: idFromUrl } = await params;
        const supabase = createAdminServiceClient();

        // 3-tier lookup
        let strategyId: string | null = null;
        const { data: s1 } = await supabase.from('lt_strategies').select('strategy_id').eq('strategy_id', idFromUrl).eq('user_id', userId).maybeSingle();
        if (s1) strategyId = s1.strategy_id;
        if (!strategyId && idFromUrl.startsWith('LT_')) {
            const { data: s2 } = await supabase.from('lt_strategies').select('strategy_id').eq('ft_wallet_id', idFromUrl.slice(3)).eq('user_id', userId).maybeSingle();
            if (s2) strategyId = s2.strategy_id;
        }
        if (!strategyId) {
            const { data: all } = await supabase.from('lt_strategies').select('strategy_id').eq('user_id', userId).limit(2);
            if (all && all.length === 1) strategyId = all[0].strategy_id;
        }
        if (!strategyId) return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

        await pauseStrategy(supabase, strategyId, 'Manually paused by user');
        return NextResponse.json({ success: true, message: 'Strategy paused' });
    } catch (error: any) {
        console.error('[LT Pause] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
