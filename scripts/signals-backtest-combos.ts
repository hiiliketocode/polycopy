#!/usr/bin/env npx tsx
/**
 * Run multiple indicator combos over signals_backtest_enriched and compare performance.
 * Use this to find a stronger global score (e.g. ML + WR + conviction) for users.
 *
 * Prereqs: run populate-signals-backtest-enriched.ts first.
 *
 * Run: npx tsx scripts/signals-backtest-combos.ts
 *      npx tsx scripts/signals-backtest-combos.ts --out public/data/signals-combo-results.json
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

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

interface EnrichedRow {
  trade_id: string;
  trader_wallet: string;
  price: number;
  size: number | null;
  trade_timestamp: string;
  resolved: string;
  trader_win_rate: number | null;
  trader_roi: number | null;
  trader_resolved_count: number | null;
  conviction: number | null;
  model_probability: number | null;
}

export type ComboFilter = {
  ml_min?: number;
  wr_min?: number;
  conv_min?: number;
  roi_min?: number;
  count_min?: number;
};

function unitProfit(o: { price: number; resolved: string }): number {
  const p = Number(o.price);
  if (o.resolved === 'WON' && p > 0 && p < 1) return 1 / p - 1;
  if (o.resolved === 'LOST') return -1;
  return 0;
}

function applyComboFilter(rows: EnrichedRow[], filter: ComboFilter): EnrichedRow[] {
  let out = rows;
  if (filter.ml_min != null) out = out.filter((r) => (r.model_probability ?? 0) >= filter.ml_min!);
  if (filter.wr_min != null) out = out.filter((r) => ((r.trader_win_rate ?? 0) * 100) >= filter.wr_min!);
  if (filter.conv_min != null) out = out.filter((r) => (r.conviction ?? 0) >= filter.conv_min!);
  if (filter.roi_min != null) {
    out = out.filter((r) => {
      const roi = r.trader_roi;
      if (roi == null) return false;
      const pct = Number(roi) <= 1 && Number(roi) >= -1 ? Number(roi) * 100 : Number(roi);
      return pct >= filter.roi_min!;
    });
  }
  if (filter.count_min != null) out = out.filter((r) => (r.trader_resolved_count ?? 0) >= filter.count_min!);
  return out;
}

function runCombo(rows: EnrichedRow[], filter: ComboFilter): { trades: number; wins: number; unitRoiPct: number; winRatePct: number; unitPnlSum: number } {
  const subset = applyComboFilter(rows, filter);
  const wins = subset.filter((r) => r.resolved === 'WON').length;
  const unitPnlSum = subset.reduce((s, o) => s + unitProfit(o), 0);
  const trades = subset.length;
  const unitRoiPct = trades > 0 ? (unitPnlSum / trades) * 100 : 0;
  const winRatePct = trades > 0 ? (wins / trades) * 100 : 0;
  return { trades, wins, unitRoiPct, winRatePct, unitPnlSum };
}

async function fetchEnriched(): Promise<EnrichedRow[]> {
  const all: EnrichedRow[] = [];
  const PAGE = 10000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('signals_backtest_enriched')
      .select('trade_id, trader_wallet, price, size, trade_timestamp, resolved, trader_win_rate, trader_roi, trader_resolved_count, conviction, model_probability')
      .order('trade_timestamp', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('signals_backtest_enriched fetch error:', error.message);
      break;
    }
    if (!data?.length) break;
    all.push(...(data as EnrichedRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
    if (all.length % 50000 < PAGE) console.log('  enriched rows:', all.length);
  }
  return all;
}

const DEFAULT_COMBOS: { name: string; filter: ComboFilter }[] = [
  { name: 'All (no filter)', filter: {} },
  { name: 'ML ≥ 50%', filter: { ml_min: 0.5 } },
  { name: 'ML ≥ 55%', filter: { ml_min: 0.55 } },
  { name: 'ML ≥ 60%', filter: { ml_min: 0.6 } },
  { name: 'WR ≥ 55%', filter: { wr_min: 55 } },
  { name: 'WR ≥ 60%', filter: { wr_min: 60 } },
  { name: 'Conv ≥ 1.5', filter: { conv_min: 1.5 } },
  { name: 'ML ≥ 55% + WR ≥ 55%', filter: { ml_min: 0.55, wr_min: 55 } },
  { name: 'ML ≥ 55% + WR ≥ 60%', filter: { ml_min: 0.55, wr_min: 60 } },
  { name: 'ML ≥ 55% + Conv ≥ 1.5', filter: { ml_min: 0.55, conv_min: 1.5 } },
  { name: 'ML ≥ 55% + WR ≥ 60% + Conv ≥ 1.5', filter: { ml_min: 0.55, wr_min: 60, conv_min: 1.5 } },
  { name: 'Count ≥ 100', filter: { count_min: 100 } },
  { name: 'ML ≥ 55% + Count ≥ 100', filter: { ml_min: 0.55, count_min: 100 } },
];

async function main() {
  console.log('Loading signals_backtest_enriched...');
  const rows = await fetchEnriched();
  console.log('Total rows:', rows.length);
  if (rows.length === 0) {
    console.error('No data. Run: npx tsx scripts/populate-signals-backtest-enriched.ts');
    process.exit(1);
  }

  const combos = DEFAULT_COMBOS;
  const results: Array<{ name: string; filter: ComboFilter; trades: number; wins: number; winRatePct: number; unitRoiPct: number; unitPnlSum: number }> = [];

  for (const { name, filter } of combos) {
    const r = runCombo(rows, filter);
    results.push({ name, filter, ...r });
  }

  // Print table
  const col = (s: string, w: number) => s.padEnd(w);
  const num = (n: number, w: number, d = 1) => n.toFixed(d).padStart(w);
  console.log('\n--- Combo comparison (unit ROI = 1 unit per trade, pure signal) ---\n');
  console.log(col('Combo', 42) + col('Trades', 10) + col('Wins', 8) + col('WR%', 8) + col('Unit ROI%', 12));
  console.log('-'.repeat(82));
  for (const r of results) {
    console.log(col(r.name.slice(0, 41), 42) + col(String(r.trades), 10) + col(String(r.wins), 8) + num(r.winRatePct, 8) + num(r.unitRoiPct, 12));
  }

  const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  if (outPath) {
    const jsonPath = path.resolve(process.cwd(), outPath);
    const dir = path.dirname(jsonPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload = {
      meta: { generatedAt: new Date().toISOString(), totalEnrichedRows: rows.length },
      combos: results,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log('\nWrote', jsonPath);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
