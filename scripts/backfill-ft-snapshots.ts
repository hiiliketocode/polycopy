/**
 * Backfill ft_performance_snapshots from ft_orders.
 * Generates hourly points from wallet start_date to now.
 * Run: npx tsx scripts/backfill-ft-snapshots.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function backfill() {
  const { data: wallets } = await supabase
    .from('ft_wallets')
    .select('wallet_id, starting_balance, start_date, end_date')
    .eq('is_active', true);

  if (!wallets?.length) {
    console.log('No active wallets');
    return;
  }

  const { data: allOrders } = await supabase
    .from('ft_orders')
    .select('wallet_id, order_time, resolved_time, outcome, pnl, size');

  const ordersByWallet = new Map<string, typeof allOrders>();
  for (const o of allOrders ?? []) {
    if (!ordersByWallet.has(o.wallet_id)) ordersByWallet.set(o.wallet_id, []);
    ordersByWallet.get(o.wallet_id)!.push(o);
  }

  let totalInserted = 0;
  for (const w of wallets) {
    const start = new Date(w.start_date);
    const end = new Date(Math.min(Date.now(), new Date(w.end_date || Date.now()).getTime()));
    const orders = ordersByWallet.get(w.wallet_id) ?? [];
    const startBal = Number(w.starting_balance) || 1000;

    const snapshots: Array<{
      wallet_id: string;
      snapshot_at: string;
      starting_balance: number;
      cash: number;
      realized_pnl: number;
      unrealized_pnl: number;
      total_pnl: number;
      return_pct: number;
      open_exposure: number;
      total_trades: number;
      open_positions: number;
    }> = [];

    let t = new Date(start);
    t.setMinutes(0, 0, 0);
    const endHour = new Date(end);
    endHour.setMinutes(0, 0, 0);

    while (t <= endHour) {
      const hourEnd = new Date(t.getTime() + 60 * 60 * 1000);
      const resolvedByNow = orders.filter(
        (o) => (o.outcome === 'WON' || o.outcome === 'LOST') && o.resolved_time && new Date(o.resolved_time) <= hourEnd
      );
      const openAtNow = orders.filter((o) => {
        if (new Date(o.order_time) > hourEnd) return false;
        if (o.outcome === 'OPEN') return true;
        if (o.resolved_time && new Date(o.resolved_time) > hourEnd) return true;
        return false;
      });

      const realizedPnl = resolvedByNow.reduce((s, o) => s + (o.pnl || 0), 0);
      const openExposure = openAtNow.reduce((s, o) => s + (o.size || 0), 0);
      const totalPnl = realizedPnl; // No unrealized in backfill
      const cash = Math.max(0, startBal + realizedPnl - openExposure);
      const returnPct = startBal > 0 ? Number(((totalPnl / startBal) * 100).toFixed(2)) : 0;

      snapshots.push({
        wallet_id: w.wallet_id,
        snapshot_at: t.toISOString(),
        starting_balance: startBal,
        cash,
        realized_pnl: realizedPnl,
        unrealized_pnl: 0,
        total_pnl: totalPnl,
        return_pct: returnPct,
        open_exposure: openExposure,
        total_trades: resolvedByNow.length + openAtNow.length,
        open_positions: openAtNow.length,
      });

      t.setTime(t.getTime() + 60 * 60 * 1000);
    }

    if (snapshots.length > 0) {
      const { error } = await supabase.from('ft_performance_snapshots').upsert(snapshots, {
        onConflict: 'wallet_id,snapshot_at',
      });
      if (error) console.error(`Error for ${w.wallet_id}:`, error);
      else {
        totalInserted += snapshots.length;
        console.log(`${w.wallet_id}: ${snapshots.length} snapshots`);
      }
    }
  }
  console.log(`Total: ${totalInserted} snapshots inserted`);
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
