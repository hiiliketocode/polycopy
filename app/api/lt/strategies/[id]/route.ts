import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = {
    params: Promise<{ id: string }>;
};

const NO_CACHE = { 'Cache-Control': 'no-store, max-age=0' };

/**
 * Resolve a strategy by URL id. 3-tier lookup:
 *   1. strategy_id match
 *   2. ft_wallet_id match (LT_FT_ML_EDGE -> FT_ML_EDGE)
 *   3. single-strategy fallback (user has only one strategy)
 * Fetches risk_state and risk_rules as SEPARATE queries (no PostgREST embedded joins).
 */
async function resolveStrategy(supabase: ReturnType<typeof createAdminServiceClient>, idFromUrl: string, userId: string) {
    // 1. Try by strategy_id
    let { data: strategy, error } = await supabase
        .from('lt_strategies')
        .select('*')
        .eq('strategy_id', idFromUrl)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('[LT resolve] strategy_id lookup error:', error.message, error.code);
    }

    // 2. Fallback: ft_wallet_id (e.g. LT_FT_ML_EDGE -> FT_ML_EDGE)
    if (!strategy && idFromUrl.startsWith('LT_')) {
        const { data: fallback, error: fbErr } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('ft_wallet_id', idFromUrl.slice(3))
            .eq('user_id', userId)
            .maybeSingle();
        if (fbErr) console.error('[LT resolve] ft_wallet_id fallback error:', fbErr.message);
        if (fallback) strategy = fallback;
    }

    // 3. Last resort: if user has exactly one strategy, use it
    if (!strategy) {
        const { data: all } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('user_id', userId)
            .limit(2);
        if (all && all.length === 1) {
            strategy = all[0];
            console.log(`[LT resolve] Single-strategy fallback: ${strategy.strategy_id} (requested ${idFromUrl})`);
        }
    }

    if (!strategy) return null;

    // Fetch risk state and risk rules as SEPARATE queries (avoids PostgREST join issues)
    const [riskStateRes, riskRulesRes] = await Promise.all([
        supabase.from('lt_risk_state').select('*').eq('strategy_id', strategy.strategy_id).maybeSingle(),
        supabase.from('lt_risk_rules').select('*').eq('strategy_id', strategy.strategy_id).maybeSingle(),
    ]);

    return {
        ...strategy,
        lt_risk_state: riskStateRes.data ? [riskStateRes.data] : [],
        lt_risk_rules: riskRulesRes.data ? [riskRulesRes.data] : [],
    };
}

/**
 * GET /api/lt/strategies/[id]
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        const strategy = await resolveStrategy(supabase, strategyId, userId);

        if (!strategy) {
            console.error(`[LT GET 404] id=${strategyId}, user=${userId}`);
            return NextResponse.json(
                { error: 'Strategy not found', requested_id: strategyId },
                { status: 404, headers: NO_CACHE }
            );
        }

        return NextResponse.json(
            { success: true, strategy },
            { headers: NO_CACHE }
        );
    } catch (error: any) {
        console.error('[LT GET error]', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/lt/strategies/[id]
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

        const resolved = await resolveStrategy(supabase, strategyId, userId);
        if (!resolved) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        const { data: strategy, error } = await supabase
            .from('lt_strategies')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('strategy_id', resolved.strategy_id)
            .select('*')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, strategy });
    } catch (error: any) {
        console.error('[LT PATCH error]', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
