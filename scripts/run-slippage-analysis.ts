#!/usr/bin/env npx tsx
/**
 * Run slippage analysis on real copy trades from orders table.
 * Uses Supabase client - no raw SQL needed.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fallback to .env
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

async function run() {
  console.log('=== SLIPPAGE ANALYSIS: Real Copy Trades ===\n');

  // First check total orders
  const { count: totalOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });
  console.log(`Total orders in table: ${totalOrders ?? '?'}\n`);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_id, market_id, price_when_copied, amount_invested, filled_size, created_at, side, copy_user_id, copied_trade_id')
    .not('copy_user_id', 'is', null)
    .not('copied_trade_id', 'is', null)
    .or('side.eq.BUY,side.eq.buy')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    console.error('Error fetching orders:', error.message);
    process.exit(1);
  }

  const withSlippage = (orders || []).filter(
    (o) =>
      o.filled_size &&
      Number(o.filled_size) > 0 &&
      o.price_when_copied &&
      Number(o.price_when_copied) > 0 &&
      o.amount_invested &&
      Number(o.amount_invested) > 0
  );

  console.log('=== 0. QUALIFYING ORDERS COUNT ===');
  console.log(`Copy BUYs (from fetch): ${orders?.length ?? 0}`);
  console.log(`With slippage data: ${withSlippage.length}\n`);

  if (withSlippage.length === 0) {
    console.log('No orders with slippage data. Exiting.');
    return;
  }

  const slippages = withSlippage.map((o) => {
    const fill = Number(o.amount_invested) / Number(o.filled_size);
    const trader = Number(o.price_when_copied);
    return ((fill - trader) / trader) * 100;
  });

  console.log('=== A1. RAW SAMPLE (first 10) ===');
  withSlippage.slice(0, 10).forEach((o) => {
    const fill = Number(o.amount_invested) / Number(o.filled_size);
    const slippage = ((fill - Number(o.price_when_copied)) / Number(o.price_when_copied)) * 100;
    console.log(`  ${o.order_id?.slice(0, 8)}... | trader=${o.price_when_copied} fill=${fill.toFixed(4)} slippage=${slippage.toFixed(2)}%`);
  });

  console.log('\n=== A2. AGGREGATE SLIPPAGE STATS ===');
  const mean = slippages.reduce((a, b) => a + b, 0) / slippages.length;
  const variance = slippages.reduce((s, x) => s + (x - mean) ** 2, 0) / slippages.length;
  const std = Math.sqrt(variance);
  console.log(`  n_trades:        ${slippages.length}`);
  console.log(`  mean_slippage:   ${mean.toFixed(3)}%`);
  console.log(`  stddev:          ${std.toFixed(3)}%`);
  console.log(`  median:          ${percentile(slippages, 0.5).toFixed(3)}%`);
  console.log(`  p5:              ${percentile(slippages, 0.05).toFixed(2)}%`);
  console.log(`  p25:             ${percentile(slippages, 0.25).toFixed(2)}%`);
  console.log(`  p75:             ${percentile(slippages, 0.75).toFixed(2)}%`);
  console.log(`  p95:             ${percentile(slippages, 0.95).toFixed(2)}%`);

  console.log('\n=== A3. FAVORABLE vs. UNFAVORABLE ===');
  const favorable = slippages.filter((s) => s < 0).length;
  const unfavorable = slippages.filter((s) => s > 0).length;
  const neutral = slippages.filter((s) => s === 0).length;
  const total = slippages.length;
  console.log(`  favorable:   ${favorable} (${((favorable / total) * 100).toFixed(1)}%)`);
  console.log(`  unfavorable: ${unfavorable} (${((unfavorable / total) * 100).toFixed(1)}%)`);
  console.log(`  neutral:     ${neutral} (${((neutral / total) * 100).toFixed(1)}%)`);

  console.log('\n=== Done ===');
}

run().catch(console.error);
