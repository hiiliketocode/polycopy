/**
 * Run the 20260212_remove_low_ml_ft_orders migration.
 * Uses Supabase client - load env via .env.local (next dev / dotenv).
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function run() {
  console.log('Running remove low ML FT orders migration...');

  // 1. Delete orders where ML doesn't meet threshold
  const { data: useModelWallets } = await supabase
    .from('ft_wallets')
    .select('wallet_id, model_threshold')
    .eq('use_model', true)
    .not('model_threshold', 'is', null);

  if (!useModelWallets?.length) {
    console.log('No use_model wallets with threshold found.');
    return;
  }

  let totalDeleted = 0;
  for (const w of useModelWallets) {
    const threshold = Number(w.model_threshold);
    const { data: toDelete, error: fetchErr } = await supabase
      .from('ft_orders')
      .select('order_id')
      .eq('wallet_id', w.wallet_id)
      .or(`model_probability.is.null,model_probability.lt.${threshold}`);

    if (fetchErr) {
      console.error(`Error fetching orders for ${w.wallet_id}:`, fetchErr);
      continue;
    }
    if (!toDelete?.length) continue;

    const ids = toDelete.map((o) => o.order_id);
    const { error: delErr } = await supabase.from('ft_orders').delete().in('order_id', ids);
    if (delErr) {
      console.error(`Error deleting from ${w.wallet_id}:`, delErr);
      continue;
    }
    totalDeleted += ids.length;
    console.log(`  ${w.wallet_id}: deleted ${ids.length} orders`);
  }
  console.log(`Total deleted: ${totalDeleted}`);

  // 2. Recompute wallet stats for use_model wallets with remaining orders
  for (const w of useModelWallets) {
    const { data: orders } = await supabase
      .from('ft_orders')
      .select('outcome, pnl')
      .eq('wallet_id', w.wallet_id);

    const { data: wallet } = await supabase.from('ft_wallets').select('starting_balance').eq('wallet_id', w.wallet_id).single();
    const startingBalance = Number(wallet?.starting_balance ?? 1000);

    const totalTrades = orders?.length ?? 0;
    const openPositions = orders?.filter((o) => o.outcome === 'OPEN').length ?? 0;
    const totalPnl = orders?.filter((o) => o.outcome !== 'OPEN').reduce((s, o) => s + (o.pnl ?? 0), 0) ?? 0;

    await supabase
      .from('ft_wallets')
      .update({
        total_trades: totalTrades,
        open_positions: openPositions,
        total_pnl: totalPnl,
        current_balance: startingBalance + totalPnl,
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_id', w.wallet_id);
  }

  // 2b. Reset wallets with zero orders
  const { data: allUseModel } = await supabase
    .from('ft_wallets')
    .select('wallet_id')
    .eq('use_model', true)
    .not('model_threshold', 'is', null);
  const { data: walletsWithOrders } = await supabase.from('ft_orders').select('wallet_id');
  const hasOrders = new Set((walletsWithOrders ?? []).map((r) => r.wallet_id));

  for (const w of allUseModel ?? []) {
    if (hasOrders.has(w.wallet_id)) continue;
    const { data: wallet } = await supabase.from('ft_wallets').select('starting_balance').eq('wallet_id', w.wallet_id).single();
    await supabase
      .from('ft_wallets')
      .update({
        total_trades: 0,
        open_positions: 0,
        total_pnl: 0,
        current_balance: Number(wallet?.starting_balance ?? 1000),
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_id', w.wallet_id);
  }

  console.log('Migration complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
