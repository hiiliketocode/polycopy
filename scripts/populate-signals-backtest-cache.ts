#!/usr/bin/env npx tsx
/**
 * Populate signals_backtest_cache in chunks to avoid Supabase statement timeout.
 * Run after applying migration 20260221_create_signals_backtest_cache.sql.
 *
 * Usage: npx tsx scripts/populate-signals-backtest-cache.ts
 *        npx tsx scripts/populate-signals-backtest-cache.ts --days 365
 *
 * Fetches resolved ft_orders in 30-day windows, dedupes by source_trade_id,
 * and upserts into signals_backtest_cache. Only includes traders in top 100 (30d PnL).
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
  path.resolve(process.cwd(), '..', '.env.local'),
];
for (const p of envPaths) {
  config({ path: p });
}
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

const DAYS = process.argv.includes('--days')
  ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10) || 180
  : 180;

interface Row {
  source_trade_id: string;
  trader_address: string | null;
  entry_price: number | null;
  outcome: string;
  model_probability: number | null;
  trader_win_rate: number | null;
  trader_roi: number | null;
  trader_resolved_count: number | null;
  conviction: number | null;
  order_time: string;
}

async function fetchTop100Traders(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(100);
  if (!error && data?.length) {
    return new Set(
      data
        .map((r: { wallet_address?: string }) => (r.wallet_address ?? '').toLowerCase())
        .filter(Boolean)
    );
  }
  return new Set();
}

async function main() {
  console.log('Fetching top 100 traders (30d PnL)...');
  const top100 = await fetchTop100Traders();
  const wallets = Array.from(top100);
  if (!wallets.length) {
    console.error('No top-100 wallets found.');
    process.exit(1);
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  console.log(`Populating cache from ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)} in 30-day chunks...`);

  const CHUNK_DAYS = 30;
  let totalInserted = 0;
  let cursor = new Date(start);

  while (cursor < end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS);
    const fromIso = cursor.toISOString();
    const toIso = chunkEnd > end ? end.toISOString() : chunkEnd.toISOString();

    const all: Row[] = [];
    let pageCursor: string | null = null;
    const PAGE = 1000;

    while (true) {
      let q = supabase
        .from('ft_orders')
        .select('source_trade_id,trader_address,entry_price,outcome,model_probability,trader_win_rate,trader_roi,trader_resolved_count,conviction,order_time')
        .in('outcome', ['WON', 'LOST'])
        .gte('order_time', fromIso)
        .lt('order_time', toIso)
        .in('trader_address', wallets)
        .order('order_time', { ascending: true })
        .limit(PAGE);
      if (pageCursor) q = q.gt('order_time', pageCursor);
      const { data, error } = await q;
      if (error) {
        console.error('Chunk fetch error:', error.message);
        break;
      }
      if (!data?.length) break;
      const rows = data as Row[];
      const seen = new Set<string>();
      for (const r of rows) {
        const id = r.source_trade_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        all.push(r);
      }
      const last = rows[rows.length - 1];
      pageCursor = last?.order_time ?? null;
      if (!pageCursor || rows.length < PAGE) break;
    }

    if (all.length > 0) {
      const toUpsert = all.map((r) => ({
        source_trade_id: r.source_trade_id,
        trader_address: r.trader_address,
        entry_price: r.entry_price,
        outcome: r.outcome,
        model_probability: r.model_probability,
        trader_win_rate: r.trader_win_rate,
        trader_roi: r.trader_roi,
        trader_resolved_count: r.trader_resolved_count,
        conviction: r.conviction,
        order_time: r.order_time,
        refreshed_at: new Date().toISOString(),
      }));
      const { error: upsertErr } = await supabase.from('signals_backtest_cache').upsert(toUpsert, {
        onConflict: 'source_trade_id',
        ignoreDuplicates: false,
      });
      if (upsertErr) {
        console.error('Upsert error:', upsertErr.message);
      } else {
        totalInserted += toUpsert.length;
        console.log(`  ${fromIso.slice(0, 10)} → ${toIso.slice(0, 10)}: ${toUpsert.length} rows (total ${totalInserted})`);
      }
    }

    cursor = chunkEnd;
    if (chunkEnd >= end) break;
  }

  console.log('Done. Total rows in cache:', totalInserted);
  console.log('Run backtest: npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
