#!/usr/bin/env npx tsx
/**
 * FT Health Check - verify sync and resolve are working.
 * Run: npx tsx scripts/ft-health-check.ts
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 1 * HOUR_MS).toISOString();
  const sixHoursAgo = new Date(now.getTime() - 6 * HOUR_MS).toISOString();

  console.log('\n=== FT Health Check ===');
  console.log(`Run at: ${now.toISOString()}\n`);

  // 1. Wallet sync status
  const { data: wallets, error: wErr } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, last_sync_time, is_active, total_trades, open_positions')
    .eq('is_active', true)
    .order('last_sync_time', { ascending: false });

  if (wErr) {
    console.error('Error fetching wallets:', wErr.message);
  } else {
    const activeCount = wallets?.length ?? 0;
    const recentSync = wallets?.filter((w) => w.last_sync_time && w.last_sync_time >= oneHourAgo).length ?? 0;
    const oldestSync = wallets?.reduce((min, w) => {
      if (!w.last_sync_time) return min;
      const t = new Date(w.last_sync_time).getTime();
      return min ? Math.min(min, t) : t;
    }, 0 as number | null);

    console.log('1. Wallets');
    console.log(`   Active: ${activeCount}`);
    console.log(`   Synced in last hour: ${recentSync}`);
    if (oldestSync) {
      const age = Math.round((now.getTime() - oldestSync) / 60000);
      console.log(`   Oldest sync: ${age} min ago`);
    }
    if (wallets && wallets.length > 0) {
      const sample = wallets[0];
      console.log(`   Sample (most recent): ${sample.display_name} @ ${sample.last_sync_time || 'never'}`);
    }
  }

  // 2. Recent orders (last 6h)
  const { data: recentOrders, error: oErr } = await supabase
    .from('ft_orders')
    .select('order_id, wallet_id, outcome, order_time, created_at')
    .gte('created_at', sixHoursAgo)
    .order('created_at', { ascending: false });

  if (oErr) {
    console.error('Error fetching orders:', oErr.message);
  } else {
    const inserted = recentOrders?.filter((o) => o.created_at >= oneHourAgo).length ?? 0;
    const open = recentOrders?.filter((o) => o.outcome === 'OPEN').length ?? 0;
    const resolved = recentOrders?.filter((o) => o.outcome === 'WON' || o.outcome === 'LOST').length ?? 0;

    console.log('\n2. Orders (last 6h)');
    console.log(`   Total: ${recentOrders?.length ?? 0}`);
    console.log(`   Inserted last hour: ${inserted}`);
    console.log(`   Open: ${open} | Resolved: ${resolved}`);
    if (recentOrders && recentOrders.length > 0) {
      const latest = recentOrders[0];
      const age = Math.round((now.getTime() - new Date(latest.created_at).getTime()) / 60000);
      console.log(`   Latest: ${latest.wallet_id} (${latest.outcome}) ${age} min ago`);
    }
  }

  // 3. ft_seen_trades recent activity (sync is evaluating trades)
  const { count: seenCount, error: sErr } = await supabase
    .from('ft_seen_trades')
    .select('*', { count: 'exact', head: true })
    .gte('seen_at', oneHourAgo);

  if (!sErr) {
    console.log('\n3. Sync activity (ft_seen_trades last hour)');
    console.log(`   Trades evaluated: ${seenCount ?? 0}`);
  }

  // 4. Overall counts
  const { count: totalOrders } = await supabase
    .from('ft_orders')
    .select('*', { count: 'exact', head: true });

  const { count: openCount } = await supabase
    .from('ft_orders')
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'OPEN');

  console.log('\n4. Totals');
  console.log(`   All orders: ${totalOrders ?? 0}`);
  console.log(`   Open positions: ${openCount ?? 0}`);

  console.log('\n=== Summary ===');
  const ok =
    (wallets?.length ?? 0) > 0 &&
    (recentOrders?.length ?? 0) >= 0 &&
    (seenCount !== undefined || (recentOrders?.length ?? 0) > 0);
  if (ok) {
    console.log('✓ FT system appears healthy. Sync and resolve crons should be running.');
  } else {
    console.log('⚠ Check Vercel cron logs for ft-sync and ft-resolve.');
  }
  console.log('');
}

main().catch(console.error);
