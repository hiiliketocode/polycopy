#!/usr/bin/env npx tsx
/**
 * Populate trades_public_resolved from trades_public + markets.
 * Joins on condition_id; uses markets.closed and winning_side/resolved_outcome to set WON/LOST.
 * Runs in chunks to avoid timeouts. Use for signals backtest (large N, ~1.9M trades).
 *
 * Data: trades_public has price, size, outcome (YES/NO), trader_wallet, condition_id. It does NOT
 * have ML score, conviction, trader_win_rate, trader_roi, or trader_resolved_count — those exist
 * only in ft_orders (computed when we copy a trade). So this table is for price/size backtests only.
 *
 * Run: npx tsx scripts/populate-trades-public-resolved.ts
 *      npx tsx scripts/populate-trades-public-resolved.ts --days 30
 *      npx tsx scripts/populate-trades-public-resolved.ts --delay 100   # ms between chunks to avoid DB load
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
  ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10) || 30
  : 30;

const PAGE_SIZE = 2000;
const BATCH_UPSERT = 500;
const CHUNK_DELAY_MS = process.argv.includes('--delay')
  ? Math.max(0, parseInt(process.argv[process.argv.indexOf('--delay') + 1], 10) || 0)
  : 0;

function normalizeOutcome(s: string | null): string {
  if (!s) return '';
  const t = String(s).toUpperCase().trim();
  if (t === 'YES' || t === 'NO') return t;
  if (t === 'Y') return 'YES';
  if (t === 'N') return 'NO';
  return t;
}

function winningLabelFromMarket(m: {
  winning_side?: unknown;
  resolved_outcome?: string | null;
}): string | null {
  const ws = m.winning_side;
  if (ws != null && typeof ws === 'string' && ws.trim()) return normalizeOutcome(ws) || ws.trim();
  if (ws != null && typeof ws === 'object' && ws !== null && 'label' in ws) {
    const label = (ws as { label?: string }).label;
    if (label) return normalizeOutcome(label) || label.trim();
  }
  const ro = m.resolved_outcome;
  if (ro != null && typeof ro === 'string' && ro.trim()) return normalizeOutcome(ro) || ro.trim();
  return null;
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();
  console.log(`Populating trades_public_resolved from trades_public (${fromIso.slice(0, 10)} → ${toIso.slice(0, 10)}). Chunk size ${PAGE_SIZE}...`);

  let totalProcessed = 0;
  let totalResolved = 0;
  let cursor: string | null = null;

  while (true) {
    let q = supabase
      .from('trades_public')
      .select('trade_id, trader_wallet, condition_id, price, size, trade_timestamp, outcome')
      .gte('trade_timestamp', fromIso)
      .lt('trade_timestamp', toIso)
      .order('trade_timestamp', { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) q = q.gt('trade_timestamp', cursor);

    const { data: trades, error: tradesErr } = await q;
    if (tradesErr) {
      console.error('trades_public fetch error:', tradesErr.message);
      break;
    }
    if (!trades?.length) break;

    const conditionIds = [...new Set((trades as { condition_id: string }[]).map((t) => t.condition_id).filter(Boolean))];
    const { data: markets, error: marketsErr } = await supabase
      .from('markets')
      .select('condition_id, closed, winning_side, resolved_outcome')
      .in('condition_id', conditionIds)
      .eq('closed', true);

    if (marketsErr) {
      console.error('markets fetch error:', marketsErr.message);
      cursor = (trades[trades.length - 1] as { trade_timestamp: string }).trade_timestamp;
      totalProcessed += trades.length;
      continue;
    }

    const resolutionByCid = new Map<string, string>();
    for (const m of markets || []) {
      const winner = winningLabelFromMarket(m);
      if (winner) resolutionByCid.set(m.condition_id, winner);
    }

    const toUpsert: Array<{
      trade_id: string;
      trader_wallet: string;
      condition_id: string;
      price: number;
      size: number | null;
      trade_timestamp: string;
      outcome_side: string;
      resolved: string;
      refreshed_at: string;
    }> = [];

    for (const t of trades as Array<{ trade_id: string; trader_wallet: string; condition_id: string; price: number; size: number | null; trade_timestamp: string; outcome: string | null }>) {
      const winner = resolutionByCid.get(t.condition_id);
      if (!winner) continue;
      const side = normalizeOutcome(t.outcome);
      if (!side) continue;
      const resolved = side === winner ? 'WON' : 'LOST';
      let price = Number(t.price);
      if (price > 1 && price <= 100) price = price / 100;
      toUpsert.push({
        trade_id: t.trade_id,
        trader_wallet: t.trader_wallet,
        condition_id: t.condition_id,
        price,
        size: t.size,
        trade_timestamp: t.trade_timestamp,
        outcome_side: side,
        resolved,
        refreshed_at: new Date().toISOString(),
      });
    }

    for (let i = 0; i < toUpsert.length; i += BATCH_UPSERT) {
      const batch = toUpsert.slice(i, i + BATCH_UPSERT);
      const { error: upsertErr } = await supabase.from('trades_public_resolved').upsert(batch, {
        onConflict: 'trade_id',
        ignoreDuplicates: false,
      });
      if (upsertErr) console.error('Upsert error:', upsertErr.message);
    }

    totalProcessed += trades.length;
    totalResolved += toUpsert.length;
    cursor = (trades[trades.length - 1] as { trade_timestamp: string }).trade_timestamp;

    if (totalProcessed % 20000 < PAGE_SIZE) {
      console.log(`  Processed ${totalProcessed}, resolved ${totalResolved}`);
    }
    if (CHUNK_DELAY_MS > 0) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    if (trades.length < PAGE_SIZE) break;
  }

  console.log('Done. Total processed:', totalProcessed, '| resolved written:', totalResolved);
  console.log('Run backtest: npx tsx scripts/signals-backtest.ts --source trades_public --out public/data/signals-backtest-results.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
