import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/orders
 * Admin-only: returns recent LT orders across all strategies (for LT Trades tab).
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
            .from('lt_orders')
            .select('lt_order_id, strategy_id, order_id, market_title, market_slug, token_label, status, outcome, signal_price, signal_size_usd, executed_price, executed_size_usd, shares_bought, order_placed_at, fully_filled_at, rejection_reason, pnl, created_at')
            .order('order_placed_at', { ascending: false })
            .limit(limit);

        if (strategyId) {
            query = query.eq('strategy_id', strategyId);
        }

        const { data: orders, error } = await query;

        if (error) {
            console.error('[lt/orders] Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ orders: orders || [] });
    } catch (err: unknown) {
        console.error('[lt/orders] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal error' },
            { status: 500 }
        );
    }
}
