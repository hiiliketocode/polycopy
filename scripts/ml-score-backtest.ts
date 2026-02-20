#!/usr/bin/env npx tsx
/**
 * ML Score Backtest — Pure signal value
 * ======================================
 * Evaluates the ML score only: no FT wallets, no bot strategies, no copy sizing.
 * Each unique trade is counted once (deduped by source_trade_id). Metrics are
 * win rate and unit ROI: as if you risked 1 unit per trade (profit = WON ? 1/price - 1 : -1).
 *
 * Data: ft_orders (where we have model_probability and outcome). Deduped so each
 * underlying trade appears once.
 *
 * Run: npx tsx scripts/ml-score-backtest.ts
 *      npx tsx scripts/ml-score-backtest.ts --top100   filter to top 100 traders by last 30d PnL
 *      npx tsx scripts/ml-score-backtest.ts --top30    filter to top 30 traders by last 30d PnL
 *      npx tsx scripts/ml-score-backtest.ts --top30 --out docs/ml-backtest-top30.txt   write report to file
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
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Types
// ============================================================================
interface FTOrderRow {
  order_id: string;
  wallet_id: string;
  source_trade_id: string | null;
  trader_address: string | null;
  entry_price: number | null;
  size: number | null;
  model_probability: number | null;
  outcome: string;
  pnl: number | null;
  order_time: string;
  resolved_time: string | null;
}

/** Pure signal: profit per 1 unit risked. WON => (1/price - 1), LOST => -1. */
function unitProfit(o: FTOrderRow): number {
  const p = Number(o.entry_price);
  if (o.outcome === 'WON' && p > 0 && p < 1) return 1 / p - 1;
  if (o.outcome === 'LOST') return -1;
  return 0;
}

interface BucketStats {
  label: string;
  min: number;
  max: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalCost: number;
  roiPct: number;
  avgPnlPerTrade: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancyPerTrade: number; // avg PnL per trade (same as avgPnlPerTrade, for clarity)
  pnlStdDev: number | null; // std dev of PnL per trade (risk indicator)
}

// ============================================================================
// Helpers
// ============================================================================
const pad = (s: string, len: number) => s.padEnd(len);
const padL = (s: string, len: number) => s.padStart(len);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtPctSigned = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtDollar = (n: number) => `$${n.toFixed(2)}`;

// Optional: tee output to a file (--out path). Use built-in log so tee() doesn't recurse.
const _log = (m: string) => require('node:console').log(m);
let outStream: NodeJS.WritableStream | null = null;
function tee(msg: string) {
  _log(msg);
  if (outStream) outStream.write(msg + '\n');
}
function printSection(title: string) {
  tee(`\n${'='.repeat(90)}`);
  tee(`  ${title}`);
  tee(`${'='.repeat(90)}`);
}
function printSubsection(title: string) {
  tee(`\n--- ${title} ---`);
}

// ============================================================================
// Top N traders by last 30d PnL (for --top100 / --top30 filter)
// ============================================================================
async function fetchTopNTradersBy30dPnl(limit: number): Promise<Set<string>> {
  const { data: rankings, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(limit);

  if (!error && rankings && rankings.length > 0) {
    const set = new Set(rankings.map((r: { wallet_address?: string }) => (r.wallet_address ?? '').toLowerCase()).filter(Boolean));
    return set;
  }
  // Fallback: Polymarket leaderboard API (month ≈ 30d)
  tee(`  (wallet_realized_pnl_rankings empty or missing; fetching top ${limit} by PnL from Polymarket month leaderboard)`);
  try {
    const res = await fetch(
      `https://data-api.polymarket.com/v1/leaderboard?timePeriod=month&orderBy=PNL&limit=${Math.min(limit, 100)}&offset=0&category=overall`,
      { headers: { 'User-Agent': 'Polycopy/1.0' }, cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : (json as { proxyWallet?: string }[])?.map((t: { proxyWallet?: string }) => (t.proxyWallet ?? '').toLowerCase()) ?? [];
    return new Set(list.filter(Boolean));
  } catch (e) {
    console.error('  Could not get top N traders:', e);
    return new Set();
  }
}

// ============================================================================
// Data: fetch all resolved ft_orders with model_probability
// ============================================================================
async function fetchResolvedOrdersWithMl(): Promise<FTOrderRow[]> {
  const all: FTOrderRow[] = [];
  const PAGE = 1000; // Supabase/PostgREST often cap at 1000 per request
  let cursor: string | null = null; // order_time cursor to avoid large-offset timeouts
  let retries = 0;

  while (true) {
    let query = supabase
      .from('ft_orders')
      .select('order_id,wallet_id,source_trade_id,trader_address,entry_price,size,model_probability,outcome,pnl,order_time,resolved_time')
      .in('outcome', ['WON', 'LOST'])
      .not('model_probability', 'is', null)
      .order('order_time', { ascending: true })
      .limit(PAGE);
    if (cursor != null) {
      query = query.gt('order_time', cursor);
    }
    const { data, error } = await query;

    if (error) {
      if (retries < 3) {
        retries++;
        console.error(`  Retry ${retries}/3 (cursor ${cursor ?? 'start'}): ${error.message}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error('Error fetching ft_orders:', error.message);
      break;
    }
    retries = 0;
    if (data && data.length > 0) {
      const rows = data as FTOrderRow[];
      all.push(...rows);
      cursor = rows[rows.length - 1].order_time;
      if (all.length % 10000 === 0) tee(`  ... fetched ${all.length} orders`);
      if (rows.length < PAGE) break; // last page
    } else {
      break;
    }
  }
  return all;
}

/** Compute stats using pure signal: 1 unit risked per trade, unit profit = WON ? (1/price - 1) : -1. */
function computeBucketStats(
  orders: FTOrderRow[],
  buckets: { label: string; min: number; max: number }[],
  scoreFromOrder: (o: FTOrderRow) => number
): BucketStats[] {
  return buckets.map((b) => {
    const inBucket = orders.filter((o) => {
      const score = scoreFromOrder(o);
      return score >= b.min && score < b.max;
    });
    const wins = inBucket.filter((o) => o.outcome === 'WON').length;
    const losses = inBucket.filter((o) => o.outcome === 'LOST').length;
    const total = wins + losses;
    const winRate = total > 0 ? wins / total : 0;
    const unitPnls = inBucket.map(unitProfit);
    const totalPnl = unitPnls.reduce((s, u) => s + u, 0);
    const totalCost = total; // 1 unit per trade
    const roiPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const avgPnlPerTrade = total > 0 ? totalPnl / total : 0;
    const grossWin = unitPnls.filter((u) => u > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(unitPnls.filter((u) => u < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const avgWin = wins > 0 ? unitPnls.filter((u) => u > 0).reduce((a, b) => a + b, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(unitPnls.filter((u) => u < 0).reduce((a, b) => a + b, 0)) / losses : 0;
    const meanPnl = unitPnls.length > 0 ? unitPnls.reduce((a, b) => a + b, 0) / unitPnls.length : 0;
    const variance =
      unitPnls.length > 1
        ? unitPnls.reduce((s, p) => s + (p - meanPnl) ** 2, 0) / (unitPnls.length - 1)
        : 0;
    const pnlStdDev = unitPnls.length > 1 ? Math.sqrt(variance) : null;

    return {
      label: b.label,
      min: b.min,
      max: b.max,
      trades: total,
      wins,
      losses,
      winRate,
      totalPnl,
      totalCost,
      roiPct,
      avgPnlPerTrade,
      profitFactor,
      avgWin,
      avgLoss,
      expectancyPerTrade: avgPnlPerTrade,
      pnlStdDev,
    };
  });
}

function printBucketTable(stats: BucketStats[], title: string, extraCols?: boolean) {
  tee(`\n  ${title}`);
  const header = extraCols
    ? `${pad('Bucket', 12)} | ${padL('Trades', 7)} | ${padL('Won', 5)} | ${padL('Lost', 5)} | ${padL('WR', 7)} | ${padL('Unit ROI%', 9)} | ${padL('Unit PnL', 10)} | ${padL('Avg/trade', 9)} | ${padL('PF', 5)} | ${padL('AvgWin', 8)} | ${padL('AvgLoss', 8)}`
    : `${pad('Bucket', 12)} | ${padL('Trades', 7)} | ${padL('Won', 5)} | ${padL('Lost', 5)} | ${padL('WR', 7)} | ${padL('Unit ROI%', 9)} | ${padL('Unit PnL', 10)} | ${padL('Avg/trade', 9)} | ${padL('PF', 5)}`;
  tee(`  ${header}`);
  tee(`  ${'-'.repeat(extraCols ? 108 : 88)}`);
  stats.forEach((s) => {
    if (s.trades === 0) return;
    const pfStr = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    const row = extraCols
      ? `${pad(s.label, 12)} | ${padL(s.trades.toString(), 7)} | ${padL(s.wins.toString(), 5)} | ${padL(s.losses.toString(), 5)} | ${padL(fmtPct(s.winRate), 7)} | ${padL(fmtPctSigned(s.roiPct), 9)} | ${padL(s.totalPnl.toFixed(2), 10)} | ${padL(s.avgPnlPerTrade.toFixed(3), 9)} | ${padL(pfStr, 5)} | ${padL(s.avgWin.toFixed(3), 8)} | ${padL((-s.avgLoss).toFixed(3), 8)}`
      : `${pad(s.label, 12)} | ${padL(s.trades.toString(), 7)} | ${padL(s.wins.toString(), 5)} | ${padL(s.losses.toString(), 5)} | ${padL(fmtPct(s.winRate), 7)} | ${padL(fmtPctSigned(s.roiPct), 9)} | ${padL(s.totalPnl.toFixed(2), 10)} | ${padL(s.avgPnlPerTrade.toFixed(3), 9)} | ${padL(pfStr, 5)}`;
    tee(`  ${row}`);
  });
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) {
    const outPath = path.resolve(process.cwd(), process.argv[outIdx + 1]);
    outStream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    console.log(`Writing report to ${outPath}`);
  }

  const top100Only = process.argv.includes('--top100');
  const top30Only = process.argv.includes('--top30');
  const topN = top30Only ? 30 : top100Only ? 100 : 0;
  const topLabel = topN ? `Top ${topN} traders (last 30d PnL) only` : '';

  printSection(
    topN ? `ML Score Backtest — ${topLabel}` : 'ML Score Backtest — How useful is the ML score for trade decisions?'
  );

  tee('\n  Pure signal backtest: value of the ML score only. Not FT/bot PnL or strategies.');
  tee('  Each unique trade counted once (deduped by source_trade_id). Metrics = win rate + unit ROI.');
  tee('  Unit ROI: as if you risked 1 unit per trade; profit = WON ? (1/entry_price - 1) : -1.\n');

  let orders = await fetchResolvedOrdersWithMl();
  if (orders.length === 0) {
    tee('  No resolved orders with ML score found. Exiting.');
    process.exit(0);
  }

  // Dedupe: one row per unique trade (same trade copied by multiple bots = one signal)
  const seen = new Set<string>();
  orders = orders.filter((o) => {
    const key = (o.source_trade_id ?? o.order_id) as string;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  tee(`  Unique trades (after dedupe): ${orders.length}.`);

  let ordersOthers: FTOrderRow[] = [];
  if (topN > 0) {
    const topSet = await fetchTopNTradersBy30dPnl(topN);
    tee(`  Top ${topN} traders (30d PnL): ${topSet.size} wallets.\n`);
    const before = orders.length;
    ordersOthers = orders.filter((o) => !topSet.has((o.trader_address ?? '').toLowerCase()));
    orders = orders.filter((o) => topSet.has((o.trader_address ?? '').toLowerCase()));
    tee(`  Top ${topN}: ${orders.length} unique trades | Others: ${ordersOthers.length} (${before} total).`);
    if (orders.length === 0) {
      tee(`  No trades from top ${topN} traders. Exiting.`);
      process.exit(0);
    }
  }

  const minDate = orders.reduce((min, o) => (o.order_time < min ? o.order_time : min), orders[0].order_time);
  const maxDate = orders.reduce((max, o) => (o.order_time > max ? o.order_time : max), orders[0].order_time);
  printSubsection('Data range');
  tee(`  Unique trades with ML score${topN ? ` (top ${topN} traders only)` : ''}: ${orders.length}`);
  if (topN > 0 && ordersOthers.length > 0) tee(`  Others (traders not in top ${topN}): ${ordersOthers.length} unique trades`);
  tee(`  Order time range: ${minDate} → ${maxDate}`);
  tee('  Scope: We only have ML scores for trades that were evaluated by sync (considered for copy).');
  tee('  So this is the set of trades we scored — each counted once. Not every trade the trader ever made.');

  // ML score: model_probability is stored in DB as 0–1 (e.g. 0.55 = 55%). We display as 0–100 for buckets.
  const scorePct = (o: FTOrderRow) => (Number(o.model_probability) ?? 0) * 100;

  // Validation: ensure we're applying ML score correctly
  printSubsection('ML score validation (sanity check)');
  const withMp = orders.filter((o) => o.model_probability != null);
  const rawValues = withMp.map((o) => Number(o.model_probability));
  const inRange01 = rawValues.filter((v) => v >= 0 && v <= 1).length;
  const aboveOne = rawValues.filter((v) => v > 1).length;
  tee(`  Orders with model_probability set: ${withMp.length} (of ${orders.length})`);
  tee(`  model_probability in [0, 1]: ${inRange01}; > 1 (would need /100): ${aboveOne}`);
  if (aboveOne > 0) tee('  WARNING: Some values > 1 — sync may store 0–100; we treat as 0–1. Re-check bucketing.');
  const sample = [...orders].sort(() => Math.random() - 0.5).slice(0, 8);
  tee('  Sample rows (raw model_probability → score% → bucket → outcome, pnl, size):');
  const bucketOf = (pct: number) => {
    if (pct < 10.001) return '0-10';
    if (pct < 20.001) return '11-20';
    if (pct < 30.001) return '21-30';
    if (pct < 40.001) return '31-40';
    if (pct < 50.001) return '41-50';
    if (pct < 60.001) return '51-60';
    if (pct < 70.001) return '61-70';
    if (pct < 80.001) return '71-80';
    if (pct < 90.001) return '81-90';
    return '91-100';
  };
  sample.forEach((o) => {
    const raw = Number(o.model_probability);
    const pct = scorePct(o);
    const bucket = bucketOf(pct);
    const up = unitProfit(o);
    tee(`    mp=${raw?.toFixed(4)} → ${pct.toFixed(1)}% → ${bucket} | ${o.outcome} unit_profit=${up.toFixed(3)}`);
  });

  // Decile buckets: 0–10, 11–20, ..., 91–100
  const decileBuckets = [
    { label: '0-10', min: 0, max: 10.001 },
    { label: '11-20', min: 11, max: 20.001 },
    { label: '21-30', min: 21, max: 30.001 },
    { label: '31-40', min: 31, max: 40.001 },
    { label: '41-50', min: 41, max: 50.001 },
    { label: '51-60', min: 51, max: 60.001 },
    { label: '61-70', min: 61, max: 70.001 },
    { label: '71-80', min: 71, max: 80.001 },
    { label: '81-90', min: 81, max: 90.001 },
    { label: '91-100', min: 91, max: 100.001 },
  ];

  // Quartile-style: 0–25, 26–50, 51–75, 76–100
  const quartileBuckets = [
    { label: '0-25', min: 0, max: 25.001 },
    { label: '26-50', min: 26, max: 50.001 },
    { label: '51-75', min: 51, max: 75.001 },
    { label: '76-100', min: 76, max: 100.001 },
  ];

  const decileStats = computeBucketStats(orders, decileBuckets, scorePct);
  const quartileStats = computeBucketStats(orders, quartileBuckets, scorePct);

  printSection('Results by ML score (deciles: 0–10, 11–20, …)');
  printBucketTable(decileStats, 'Decile buckets (ML score 0–100)', true);

  printSection('Results by ML score (quartiles: 0–25, 26–50, …)');
  printBucketTable(quartileStats, 'Quartile buckets', true);

  // Summary: overall and “above threshold” vs “below”
  printSection('Summary: Is higher ML score better?');
  const overall: BucketStats = {
    label: 'ALL',
    min: 0,
    max: 100,
    trades: orders.length,
    wins: orders.filter((o) => o.outcome === 'WON').length,
    losses: orders.filter((o) => o.outcome === 'LOST').length,
    winRate: 0,
    totalPnl: 0,
    totalCost: 0,
    roiPct: 0,
    avgPnlPerTrade: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    expectancyPerTrade: 0,
    pnlStdDev: null,
  };
  overall.winRate = overall.trades > 0 ? overall.wins / overall.trades : 0;
  overall.totalPnl = orders.reduce((s, o) => s + unitProfit(o), 0);
  overall.totalCost = overall.trades;
  overall.roiPct = overall.totalCost > 0 ? (overall.totalPnl / overall.totalCost) * 100 : 0;
  overall.avgPnlPerTrade = overall.trades > 0 ? overall.totalPnl / overall.trades : 0;
  const unitPnlsAll = orders.map(unitProfit);
  const grossWin = unitPnlsAll.filter((u) => u > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(unitPnlsAll.filter((u) => u < 0).reduce((a, b) => a + b, 0));
  overall.profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const above55 = orders.filter((o) => (Number(o.model_probability) ?? 0) * 100 >= 55);
  const below55 = orders.filter((o) => (Number(o.model_probability) ?? 0) * 100 < 55);
  const sumUnitPnl = (arr: FTOrderRow[]) => arr.reduce((s, o) => s + unitProfit(o), 0);
  const wr = (arr: FTOrderRow[]) => {
    const t = arr.length;
    return t > 0 ? arr.filter((o) => o.outcome === 'WON').length / t : 0;
  };
  const unitRoi = (arr: FTOrderRow[]) => (arr.length > 0 ? (sumUnitPnl(arr) / arr.length) * 100 : 0);

  tee(`  ${pad('Segment', 14)} | ${padL('Trades', 7)} | ${padL('WR', 7)} | ${padL('Unit ROI%', 9)} | ${padL('Unit PnL', 10)} | ${padL('Avg/trade', 9)}`);
  tee(`  ${'-'.repeat(68)}`);
  tee(
    `  ${pad('All (with ML)', 14)} | ${padL(overall.trades.toString(), 7)} | ${padL(fmtPct(overall.winRate), 7)} | ${padL(fmtPctSigned(overall.roiPct), 9)} | ${padL(overall.totalPnl.toFixed(2), 10)} | ${padL(overall.avgPnlPerTrade.toFixed(3), 9)}`
  );
  if (above55.length > 0) {
    const pnl55 = sumUnitPnl(above55);
    tee(
      `  ${pad('ML ≥ 55%', 14)} | ${padL(above55.length.toString(), 7)} | ${padL(fmtPct(wr(above55)), 7)} | ${padL(fmtPctSigned(unitRoi(above55)), 9)} | ${padL(pnl55.toFixed(2), 10)} | ${padL((pnl55 / above55.length).toFixed(3), 9)}`
    );
  }
  if (below55.length > 0) {
    const pnlBelow = sumUnitPnl(below55);
    tee(
      `  ${pad('ML < 55%', 14)} | ${padL(below55.length.toString(), 7)} | ${padL(fmtPct(wr(below55)), 7)} | ${padL(fmtPctSigned(unitRoi(below55)), 9)} | ${padL(pnlBelow.toFixed(2), 10)} | ${padL((pnlBelow / below55.length).toFixed(3), 9)}`
    );
  }

  // Top 30 vs Others comparison (when --top30) — same unit signal metrics
  if (topN === 30 && ordersOthers.length > 0) {
    printSection('Comparison: Top 30 traders vs Others (pure signal, unit ROI)');
    const wins = (arr: FTOrderRow[]) => arr.filter((o) => o.outcome === 'WON').length;
    const wr = (arr: FTOrderRow[]) => (arr.length > 0 ? wins(arr) / arr.length : 0);
    const sumUnitPnlC = (arr: FTOrderRow[]) => arr.reduce((s, o) => s + unitProfit(o), 0);
    const unitRoiC = (arr: FTOrderRow[]) => (arr.length > 0 ? (sumUnitPnlC(arr) / arr.length) * 100 : 0);
    const allOrders = [...orders, ...ordersOthers];
    tee('\n  Segment        |  Trades |   Won |  Lost |      WR | Unit ROI% |  Unit PnL | Avg/trade');
    tee('  ' + '-'.repeat(78));
    const row = (label: string, arr: FTOrderRow[]) => {
      const w = wins(arr);
      const l = arr.length - w;
      const pnl = sumUnitPnlC(arr);
      const avg = arr.length > 0 ? pnl / arr.length : 0;
      return `  ${pad(label, 14)} | ${padL(arr.length.toString(), 7)} | ${padL(w.toString(), 5)} | ${padL(l.toString(), 5)} | ${padL(fmtPct(wr(arr)), 7)} | ${padL(fmtPctSigned(unitRoiC(arr)), 9)} | ${padL(pnl.toFixed(2), 9)} | ${padL(avg.toFixed(3), 9)}`;
    };
    tee(row('Top 30 traders', orders));
    tee(row('Others', ordersOthers));
    tee(row('All', allOrders));
    tee('');
  }

  printSubsection('Metrics explained (pure signal)');
  tee('  WR         = Win rate (wins / (wins + losses)).');
  tee('  Unit ROI%  = (Total unit PnL / number of trades) × 100. Assumes 1 unit risked per trade.');
  tee('  Unit PnL   = Sum of unit profits: WON => (1/entry_price - 1), LOST => -1.');
  tee('  Avg/trade  = Average unit profit per trade (expectancy per 1 unit risked).');
  tee('  PF         = Profit factor = gross unit wins / gross unit losses (>1 = profitable).');
  tee('  Scope      = Each unique trade counted once (deduped by source_trade_id). No FT/bot sizing.\n');

  printSection('How the ML score is calculated');
  tee('  The score stored in ft_orders.model_probability is the model\'s predicted win probability (0–1).');
  tee('  It is computed per trade when we sync, by calling the predict-trade Edge Function.\n');
  tee('  INPUTS (per trade) — the function builds 41 features and sends them to the model:\n');
  tee('  • From the trade: entry_price, side (LONG/SHORT), size, condition_id, timestamp.');
  tee('  • From the market: final_niche (e.g. NBA, POLITICS), bet_structure (STANDARD/O/U/SPREAD),');
  tee('    volume/liquidity, market_duration_days, market_age_bucket, minutes_to_start, hours_to_close.');
  tee('  • From the trader (Supabase/Dome): global_win_rate, D30/D7 win_rate, lifetime/D30/D7 roi_pct,');
  tee('    total_lifetime_trades, avg_bet_size_usdc, stddev_bet_size_usdc, recent_win_rate.');
  tee('  • Profile waterfall: niche + structure + price_bracket → niche_win_rate, trader_historical_roi_pct.');
  tee('  • Trends (V11): win_rate_trend_short/long, roi_trend_short/long, performance_regime.');
  tee('  • Behavior: conviction_z_score, trade_sequence, total_exposure_log, trader_tempo_seconds,');
  tee('    is_chasing_price_up, is_averaging_down, is_hedging, trader_sells_ratio, is_with_crowd.');
  tee('  • Trade context: trade_size_tier, trade_size_log, position_direction, volume_momentum_ratio,');
  tee('    liquidity_impact_ratio, trader_selectivity, price_vs_trader_avg, niche_experience_pct,');
  tee('    is_in_best_niche, trader_experience_bucket.\n');
  tee('  HOW THE SCORE IS CALCULATED:');
  tee('  • The features are passed to either (1) BigQuery ML model polycopy_v1.poly_predictor_v11, or');
  tee('    (2) a local ML API that replicates it. The model is a classifier trained on historical');
  tee('    resolved trades; it outputs predicted_outcome_probs (probability of WON vs LOST).');
  tee('  • We take the probability for outcome WON (winProb). That value (0.0–1.0) is stored as');
  tee('    model_probability in ft_orders. The weights are inside the trained model (BigQuery or');
  tee('    local), not in app code.');
  tee('  • Sync uses prediction.probability or valuation.ai_fair_value from the Edge Function');
  tee('    response; both are set to winProb. If the API returns a value > 1, we divide by 100.\n');

  if (outStream) {
    outStream.end();
    outStream = null;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
