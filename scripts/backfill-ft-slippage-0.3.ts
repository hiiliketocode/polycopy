#!/usr/bin/env npx tsx
/**
 * Backfill: Apply 0.3% slippage to all FT orders.
 * 1. Updates entry_price = entry_price * 1.003
 * 2. Recomputes pnl for resolved orders (WON/LOST)
 * 3. Recomputes edge_pct
 * 4. Recomputes wallet total_pnl and current_balance
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { createClient } from '@supabase/supabase-js';

const SLIPPAGE = 0.003; // 0.3%

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log('=== FT Slippage Backfill (0.3%) ===\n');

  // 1. Fetch all orders
  const { data: orders, error: fetchErr } = await supabase
    .from('ft_orders')
    .select('order_id, wallet_id, entry_price, size, outcome, token_label, side, trader_win_rate');

  if (fetchErr) {
    console.error('Error fetching orders:', fetchErr.message);
    process.exit(1);
  }

  if (!orders?.length) {
    console.log('No ft_orders found. Done.');
    return;
  }

  console.log(`Found ${orders.length} orders`);

  // 2. Update entry_price and edge_pct for all (batched)
  const BATCH = 50;
  let updated = 0;
  for (let i = 0; i < orders.length; i += BATCH) {
    const chunk = orders.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (o) => {
        const oldEntry = Number(o.entry_price);
        if (!oldEntry || oldEntry <= 0) return false;
        const newEntry = Math.min(0.9999, oldEntry * (1 + SLIPPAGE));
        const newEdge = o.trader_win_rate != null
          ? Number(o.trader_win_rate) - newEntry
          : null;
        const { error } = await supabase
          .from('ft_orders')
          .update({ entry_price: newEntry, edge_pct: newEdge })
          .eq('order_id', o.order_id);
        return !error;
      })
    );
    updated += results.filter(Boolean).length;
  }
  console.log(`Updated entry_price + edge_pct for ${updated} orders`);

  // 3. Recompute pnl for resolved orders
  const resolved = orders.filter((o) => o.outcome === 'WON' || o.outcome === 'LOST');

  const pnlUpdates = await Promise.all(
    resolved.map(async (o) => {
      const entryPrice = Number(o.entry_price) * (1 + SLIPPAGE); // new entry after slippage
      const size = Number(o.size) || 0;
      const side = (o.side || 'BUY').toUpperCase();

      let pnl: number;
      if (side === 'BUY') {
        pnl = o.outcome === 'WON'
          ? (entryPrice > 0 ? (size * (1 - entryPrice)) / entryPrice : 0)
          : -size;
      } else {
        pnl = o.outcome === 'WON'
          ? size * entryPrice
          : -size * (1 - entryPrice);
      }

      const { error } = await supabase
        .from('ft_orders')
        .update({ pnl })
        .eq('order_id', o.order_id);
      return !error;
    })
  );
  const pnlUpdated = pnlUpdates.filter(Boolean).length;

  console.log(`Recomputed pnl for ${pnlUpdated} resolved orders`);

  // 4. Recompute wallet stats
  const { data: wallets } = await supabase
    .from('ft_wallets')
    .select('wallet_id, starting_balance');

  for (const w of wallets ?? []) {
    const { data: walletOrders } = await supabase
      .from('ft_orders')
      .select('outcome, pnl, size')
      .eq('wallet_id', w.wallet_id);

    const totalTrades = walletOrders?.length ?? 0;
    const openPositions = (walletOrders ?? []).filter((o) => o.outcome === 'OPEN').length;
    const totalPnl = (walletOrders ?? [])
      .filter((o) => o.outcome !== 'OPEN')
      .reduce((s, o) => s + (o.pnl ?? 0), 0);
    const startingBalance = Number(w.starting_balance) || 1000;

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
  console.log(`Updated ${wallets?.length ?? 0} wallet stats`);

  console.log('\n=== Backfill complete ===');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
