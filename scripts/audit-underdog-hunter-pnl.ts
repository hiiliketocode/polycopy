#!/usr/bin/env npx tsx
/**
 * Audit Underdog Hunter PnL - verify dashboard KPIs align with order data
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
  path.resolve(process.cwd(), '..', '.env.local'),
];
for (const p of envPaths) config({ path: p });

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const WALLET_ID = 'FT_UNDERDOG_HUNTER';

async function main() {
  // 1. Wallet record
  const { data: wallet } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, starting_balance, current_balance, total_pnl, total_trades, open_positions')
    .eq('wallet_id', WALLET_ID)
    .single();

  // 2. All orders
  const allOrders: any[] = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('ft_orders')
      .select('*')
      .eq('wallet_id', WALLET_ID)
      .order('order_time', { ascending: true })
      .range(offset, offset + 999);
    if (!data?.length) break;
    allOrders.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const open = allOrders.filter(o => o.outcome === 'OPEN');
  const won = allOrders.filter(o => o.outcome === 'WON');
  const lost = allOrders.filter(o => o.outcome === 'LOST');
  const resolved = [...won, ...lost];

  const realizedFromOrders = resolved.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const openExposure = open.reduce((s, o) => s + (o.size ?? 0), 0);

  console.log('\n=== UNDERDOG HUNTER PnL AUDIT ===\n');
  console.log('WALLET (ft_wallets):');
  console.log('  starting_balance:', wallet?.starting_balance);
  console.log('  current_balance:', wallet?.current_balance);
  console.log('  total_pnl:', wallet?.total_pnl);
  console.log('  total_trades:', wallet?.total_trades);
  console.log('  open_positions:', wallet?.open_positions);

  console.log('\nORDERS (ft_orders):');
  console.log('  Total orders:', allOrders.length);
  console.log('  Open:', open.length);
  console.log('  Resolved:', resolved.length, '(Won:', won.length, ', Lost:', lost.length, ')');
  console.log('  Win rate:', resolved.length > 0 ? ((won.length / resolved.length) * 100).toFixed(1) + '%' : 'N/A');

  console.log('\nREALIZED PnL:');
  console.log('  Sum of resolved order pnl:', realizedFromOrders.toFixed(2));
  console.log('  Wallet total_pnl:', wallet?.total_pnl);
  console.log('  Match:', Math.abs(realizedFromOrders - Number(wallet?.total_pnl ?? 0)) < 0.01 ? 'YES' : 'NO - MISMATCH');

  console.log('\nOPEN EXPOSURE (cost in positions):');
  console.log('  Sum of open order size:', openExposure.toFixed(2));
  console.log('  Cash formula: starting + realized - open_exposure =', 
    (Number(wallet?.starting_balance ?? 1000) + realizedFromOrders - openExposure).toFixed(2));

  console.log('\nSAMPLE RESOLVED ORDERS (first 5 WON, first 5 LOST):');
  won.slice(0, 5).forEach((o, i) => {
    const shares = o.size / o.entry_price;
    const expectedPnl = o.size * (1 - o.entry_price) / o.entry_price;
    console.log(`  WON ${i+1}: entry=${o.entry_price}, size=$${o.size}, pnl=$${o.pnl?.toFixed(2)}, expected(BUY WON)=$${expectedPnl.toFixed(2)}`);
  });
  lost.slice(0, 5).forEach((o, i) => {
    const expectedPnl = -o.size;
    console.log(`  LOST ${i+1}: entry=${o.entry_price}, size=$${o.size}, pnl=$${o.pnl?.toFixed(2)}, expected(BUY LOST)=$${expectedPnl.toFixed(2)}`);
  });

  console.log('\nSAMPLE OPEN ORDERS (first 5):');
  open.slice(0, 5).forEach((o, i) => {
    const cost = o.size;
    const shares = o.size / o.entry_price;
    console.log(`  ${i+1}: entry=${o.entry_price}, size=$${o.size}, cost=$${cost.toFixed(2)}, shares=${shares.toFixed(2)}`);
  });

  console.log('\nPNL FORMULA CHECK (BUY WON):');
  const wonWithWrongPnl = won.filter(o => {
    const expected = o.size * (1 - o.entry_price) / o.entry_price;
    const actual = o.pnl ?? 0;
    return Math.abs(expected - actual) > 0.05;
  });
  console.log('  WON orders with PnL mismatch (>$0.05):', wonWithWrongPnl.length, '/', won.length);
  if (wonWithWrongPnl.length > 0) {
    wonWithWrongPnl.slice(0, 3).forEach(o => {
      const expected = o.size * (1 - o.entry_price) / o.entry_price;
      console.log(`    order_id=${o.order_id?.slice(0,8)} entry=${o.entry_price} size=${o.size} actual_pnl=${o.pnl} expected=${expected.toFixed(2)}`);
    });
  }

  console.log('\nPNL FORMULA CHECK (BUY LOST):');
  const lostWithWrongPnl = lost.filter(o => {
    const expected = -o.size;
    const actual = o.pnl ?? 0;
    return Math.abs(expected - actual) > 0.05;
  });
  console.log('  LOST orders with PnL mismatch (>$0.05):', lostWithWrongPnl.length, '/', lost.length);

  console.log('\n=== END AUDIT ===\n');
}

main().catch(e => { console.error(e); process.exit(1); });
