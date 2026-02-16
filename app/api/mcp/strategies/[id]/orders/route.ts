/**
 * GET /api/mcp/strategies/[id]/orders
 *
 * MCP-only: Get orders for a strategy (place_trade read-only). Auth: CRON_SECRET (Bearer).
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const { id: strategyId } = await params;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const supabase = createAdminServiceClient();

  try {
    const { data: strategy } = await supabase
      .from('lt_strategies')
      .select('strategy_id')
      .eq('strategy_id', strategyId)
      .maybeSingle();

    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    let query = supabase
      .from('lt_orders')
      .select(`
        lt_order_id, order_id, ft_trader_wallet, condition_id, token_label,
        market_title, side, signal_price, signal_size_usd, executed_price,
        executed_size_usd, status, outcome, order_placed_at, fully_filled_at
      `)
      .eq('strategy_id', strategyId)
      .order('order_placed_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      strategy_id: strategyId,
      orders: orders || [],
      count: (orders || []).length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
