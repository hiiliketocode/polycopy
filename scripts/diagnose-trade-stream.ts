#!/usr/bin/env npx tsx
/**
 * Local diagnostic for the trade stream pipeline.
 * Run: npx tsx scripts/diagnose-trade-stream.ts
 * Requires: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env
 *
 * Checks: target traders count, leaderboard wallets, traders table, recent ft_orders
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

function parseExtendedFilters(w: { detailed_description?: string | null }) {
  if (!w.detailed_description) return {};
  try {
    return JSON.parse(w.detailed_description) as {
      target_trader?: string;
      target_traders?: string[];
    };
  } catch {
    return {};
  }
}

async function main() {
  const now = new Date();
  console.log('=== Trade Stream Diagnostic ===\n');
  console.log('Run at:', now.toISOString());

  // 1. Active FT wallets
  const { data: wallets, error: wErr } = await supabase
    .from('ft_wallets')
    .select('wallet_id, start_date, end_date, detailed_description')
    .eq('is_active', true);

  if (wErr) {
    console.error('ft_wallets error:', wErr.message);
    return;
  }

  const targetTraders = new Set<string>();
  let leaderboardCount = 0;

  for (const w of wallets || []) {
    const start = new Date(w.start_date);
    const end = new Date(w.end_date);
    if (start > now || end < now) continue;

    const ext = parseExtendedFilters(w);
    if (ext.target_trader) targetTraders.add(ext.target_trader.toLowerCase().trim());
    for (const t of ext.target_traders || []) {
      if (t?.trim()) targetTraders.add(t.toLowerCase().trim());
    }
    if (!ext.target_trader && (!ext.target_traders || ext.target_traders.length === 0)) {
      leaderboardCount++;
    }
  }

  console.log('\n1. FT Wallets (active, in date range):', (wallets || []).filter((w) => {
    const s = new Date(w.start_date);
    const e = new Date(w.end_date);
    return s <= now && e >= now;
  }).length);
  console.log('   Leaderboard-style (no target):', leaderboardCount);
  console.log('   Target traders from config:', targetTraders.size);

  // 2. Traders table
  const { count: tradersCount } = await supabase
    .from('traders')
    .select('*', { count: 'exact', head: true });

  const { data: traderRows } = await supabase.from('traders').select('wallet_address').limit(5);
  console.log('\n2. Traders table:', tradersCount ?? 0, 'rows');
  if (leaderboardCount > 0) {
    for (const row of traderRows || []) {
      targetTraders.add((row.wallet_address || '').toLowerCase().trim());
    }
    const { data: allTraders } = await supabase.from('traders').select('wallet_address');
    for (const row of allTraders || []) {
      const addr = (row.wallet_address || '').toLowerCase().trim();
      if (addr) targetTraders.add(addr);
    }
    console.log('   Total target set (with traders table):', targetTraders.size);
  }

  // 3. Recent ft_orders
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { count: orders24h } = await supabase
    .from('ft_orders')
    .select('*', { count: 'exact', head: true })
    .gte('order_time', since24h);

  const { count: openCount } = await supabase
    .from('ft_orders')
    .select('*', { count: 'exact', head: true })
    .eq('outcome', 'OPEN');

  console.log('\n3. ft_orders last 24h:', orders24h ?? 0);
  console.log('   ft_orders OPEN (pending):', openCount ?? 0);

  // 4. Most recent ft_order
  const { data: recent } = await supabase
    .from('ft_orders')
    .select('order_time, wallet_id, condition_id')
    .order('order_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    console.log('\n4. Most recent ft_order:', recent.order_time, '|', recent.wallet_id);
  } else {
    console.log('\n4. No ft_orders in database');
  }

  // 5. Verdict
  console.log('\n=== Verdict ===');
  if (targetTraders.size === 0) {
    console.log('❌ TARGET SET EMPTY — Worker will NOT forward any trades.');
    console.log('   Fix: Ensure traders table has rows (run sync-trader-leaderboard)');
    console.log('   Or: Add target_trader/target_traders to at least one FT wallet');
  } else {
    console.log('✓ Target set has', targetTraders.size, 'traders — worker should forward');
    console.log('  If still no trades: check Fly.io worker logs, API_BASE_URL, CRON_SECRET');
  }

  if ((orders24h ?? 0) === 0) {
    console.log('\n❌ No ft_orders in last 24h — pipeline is not inserting');
  }
}

main().catch(console.error);
