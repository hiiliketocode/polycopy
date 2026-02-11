import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/logs
 * Admin-only: returns recent LT execute logs from lt_execute_logs table.
 */
export async function GET(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);
        const strategyId = searchParams.get('strategy_id') || undefined;

        const supabase = createAdminServiceClient();
        let query = supabase
            .from('lt_execute_logs')
            .select('id, created_at, level, message, strategy_id, ft_wallet_id, source_trade_id, extra')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (strategyId) {
            query = query.eq('strategy_id', strategyId);
        }

        const { data: logs, error } = await query;

        if (error) {
            // Table may not exist yet (migration not run)
            if (error.code === '42P01') {
                return NextResponse.json({ logs: [], message: 'Logs table not yet created. Run migrations.' });
            }
            console.error('[lt/logs] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ logs: logs || [] });
    } catch (err: unknown) {
        console.error('[lt/logs] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal error' },
            { status: 500 }
        );
    }
}
