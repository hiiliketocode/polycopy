import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

/**
 * GET /api/v2/bots/my-performance
 *
 * Returns per-strategy aggregate stats from lt_orders for the authenticated user.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();

    // Get user's strategies
    const { data: strategies } = await supabase
      .from('lt_strategies')
      .select('strategy_id, ft_wallet_id, display_name, is_active, is_paused')
      .eq('user_id', userId);

    if (!strategies || strategies.length === 0) {
      return NextResponse.json({
        success: true,
        performance: [],
        aggregate: { total_trades: 0, wins: 0, losses: 0, total_pnl: 0 },
      });
    }

    const strategyIds = strategies.map((s: any) => s.strategy_id);

    // Fetch ALL lt_orders with pagination to avoid Supabase 1000-row default limit
    // Include PENDING orders so in-progress trades are visible
    const INCLUDED_STATUSES = ['FILLED', 'PARTIAL', 'PENDING'];
    const PAGE_SIZE = 1000;
    let allOrders: any[] = [];
    let page = 0;
    while (true) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: batch, error: ordersErr } = await supabase
        .from('lt_orders')
        .select('strategy_id, outcome, pnl, executed_size_usd, status')
        .in('strategy_id', strategyIds)
        .in('status', INCLUDED_STATUSES)
        .range(from, to);

      if (ordersErr) {
        return NextResponse.json({ error: ordersErr.message }, { status: 500 });
      }
      if (!batch || batch.length === 0) break;
      allOrders = allOrders.concat(batch);
      if (batch.length < PAGE_SIZE) break;
      page++;
    }
    const orders = allOrders;

    // Aggregate per strategy
    const statsMap: Record<string, { total: number; wins: number; losses: number; open: number; pending: number; pnl: number }> = {};
    for (const sid of strategyIds) {
      statsMap[sid] = { total: 0, wins: 0, losses: 0, open: 0, pending: 0, pnl: 0 };
    }

    for (const o of (orders || [])) {
      const s = statsMap[(o as any).strategy_id];
      if (!s) continue;
      s.total++;
      const outcome = ((o as any).outcome || '').toUpperCase();
      const status = ((o as any).status || '').toUpperCase();
      if (outcome === 'WON') s.wins++;
      else if (outcome === 'LOST') s.losses++;
      else if (status === 'PENDING') s.pending++;
      else if (outcome === 'OPEN') s.open++;
      s.pnl += Number((o as any).pnl) || 0;
    }

    const performance = strategies.map((st: any) => {
      const s = statsMap[st.strategy_id] || { total: 0, wins: 0, losses: 0, open: 0, pending: 0, pnl: 0 };
      const resolved = s.wins + s.losses;
      return {
        strategy_id: st.strategy_id,
        ft_wallet_id: st.ft_wallet_id,
        display_name: st.display_name,
        is_active: st.is_active,
        is_paused: st.is_paused,
        total_trades: s.total,
        wins: s.wins,
        losses: s.losses,
        open_trades: s.open,
        pending_trades: s.pending,
        total_pnl: Math.round(s.pnl * 100) / 100,
        win_rate: resolved > 0 ? Math.round((s.wins / resolved) * 1000) / 10 : 0,
      };
    });

    const aggregate = {
      total_trades: performance.reduce((a, p) => a + p.total_trades, 0),
      wins: performance.reduce((a, p) => a + p.wins, 0),
      losses: performance.reduce((a, p) => a + p.losses, 0),
      total_pnl: Math.round(performance.reduce((a, p) => a + p.total_pnl, 0) * 100) / 100,
    };

    return NextResponse.json({ success: true, performance, aggregate });
  } catch (error: any) {
    console.error('[v2/bots/my-performance] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
