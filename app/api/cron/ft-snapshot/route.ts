import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

/**
 * Cron: GET /api/cron/ft-snapshot
 * Runs every hour to record performance snapshots for active FT wallets.
 * Enables line charts for PnL %, cash, and cumulative return over time.
 * Requires CRON_SECRET when set.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminServiceClient();
    const now = new Date();
    // Truncate to hour boundary (e.g. 14:30 -> 14:00)
    const snapshotAt = new Date(now);
    snapshotAt.setMinutes(0, 0, 0);

    // 1. Get active wallets (in test period)
    const { data: wallets, error: walletsErr } = await supabase
      .from('ft_wallets')
      .select('wallet_id, starting_balance, total_pnl, total_trades, open_positions, start_date, end_date')
      .eq('is_active', true);

    if (walletsErr || !wallets?.length) {
      return NextResponse.json({
        success: true,
        snapshots_recorded: 0,
        message: 'No active wallets',
      });
    }

    const activeWallets = wallets.filter((w) => {
      const wAny = w as { start_date?: string; end_date?: string };
      if (!wAny.start_date || !wAny.end_date) return true;
      const start = new Date(wAny.start_date);
      const end = new Date(wAny.end_date);
      return start <= now && end >= now;
    });

    if (activeWallets.length === 0) {
      return NextResponse.json({
        success: true,
        snapshots_recorded: 0,
        message: 'No wallets in active test period',
      });
    }

    let recorded = 0;
    for (const wallet of activeWallets) {
      const walletId = wallet.wallet_id;
      const startingBalance = Number(wallet.starting_balance) || 1000;

      // Get orders for realized + exposure
      const { data: orders } = await supabase
        .from('ft_orders')
        .select('outcome, pnl, size')
        .eq('wallet_id', walletId);

      const resolved = (orders || []).filter((o) => o.outcome === 'WON' || o.outcome === 'LOST');
      const openOrders = (orders || []).filter((o) => o.outcome === 'OPEN');

      const realizedPnl = resolved.reduce((s, o) => s + (o.pnl || 0), 0);
      const openExposure = openOrders.reduce((s, o) => s + (o.size || 0), 0);
      const totalPnl = Number(wallet.total_pnl) ?? realizedPnl; // Use DB total (includes unrealized from resolve)
      const unrealizedPnl = totalPnl - realizedPnl;
      const cash = Math.max(0, startingBalance + realizedPnl - openExposure);
      const returnPct = startingBalance > 0
        ? Number(((totalPnl / startingBalance) * 100).toFixed(2))
        : 0;

      const { error: insertErr } = await supabase
        .from('ft_performance_snapshots')
        .upsert(
          {
            wallet_id: walletId,
            snapshot_at: snapshotAt.toISOString(),
            starting_balance: startingBalance,
            cash,
            realized_pnl: realizedPnl,
            unrealized_pnl: unrealizedPnl,
            total_pnl: totalPnl,
            return_pct: returnPct,
            open_exposure: openExposure,
            total_trades: wallet.total_trades ?? (orders?.length ?? 0),
            open_positions: wallet.open_positions ?? openOrders.length,
          },
          { onConflict: 'wallet_id,snapshot_at' }
        );

      if (!insertErr) recorded++;
    }

    return NextResponse.json({
      success: true,
      snapshots_recorded: recorded,
      snapshot_at: snapshotAt.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[cron/ft-snapshot] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
