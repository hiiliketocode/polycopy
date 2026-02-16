/**
 * GET /api/ft/stream-status
 *
 * Diagnostic endpoint to verify the real-time trade stream pipeline.
 * Returns target-traders state, leaderboard wallet count, and recent activity.
 *
 * Auth: CRON_SECRET or admin.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import {
  parseExtendedFilters,
  type FTWallet,
} from '@/lib/ft-sync/shared-logic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    // 1. Target traders (same logic as target-traders route)
    const { data: wallets } = await supabase
      .from('ft_wallets')
      .select('wallet_id, start_date, end_date, is_active, detailed_description')
      .eq('is_active', true);

    const targetTraders = new Set<string>();
    let leaderboardWalletCount = 0;

    for (const w of wallets || []) {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      if (start > now || end < now) continue;

      const ext = parseExtendedFilters(w as FTWallet);
      if (ext.target_trader) targetTraders.add(ext.target_trader.toLowerCase().trim());
      for (const t of ext.target_traders || []) {
        if (t?.trim()) targetTraders.add(t.toLowerCase().trim());
      }
      if (!ext.target_trader && (!ext.target_traders || ext.target_traders.length === 0)) {
        leaderboardWalletCount++;
      }
    }

    // 2. Traders table count (when leaderboard wallets exist)
    let tradersTableCount = 0;
    if (leaderboardWalletCount > 0) {
      const { count } = await supabase
        .from('traders')
        .select('*', { count: 'exact', head: true });
      tradersTableCount = count ?? 0;
      // Add traders to target set for total
      const { data: traderRows } = await supabase.from('traders').select('wallet_address');
      for (const row of traderRows || []) {
        const addr = (row.wallet_address || '').toLowerCase().trim();
        if (addr) targetTraders.add(addr);
      }
    }

    // 3. Recent ft_orders (last 24h) - proxy for stream activity
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { count: orders24h } = await supabase
      .from('ft_orders')
      .select('*', { count: 'exact', head: true })
      .gte('order_time', since24h);

    // 4. Recent ft_orders with outcome OPEN (pending LT execution)
    const { count: openCount } = await supabase
      .from('ft_orders')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'OPEN');

    return NextResponse.json({
      ok: true,
      target_traders_count: targetTraders.size,
      has_leaderboard_wallets: leaderboardWalletCount > 0,
      leaderboard_wallet_count: leaderboardWalletCount,
      traders_table_count: tradersTableCount,
      ft_orders_last_24h: orders24h ?? 0,
      ft_orders_open: openCount ?? 0,
      updated_at: now.toISOString(),
      _checks: {
        worker_should_forward: targetTraders.size > 0,
        worker_log_look_for: targetTraders.size > 0
          ? `[worker] Loaded ${targetTraders.size} target traders`
          : 'Worker will not forward (target set empty)',
      },
    });
  } catch (err) {
    console.error('[ft/stream-status] Error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
