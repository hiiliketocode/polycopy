#!/usr/bin/env npx tsx
/**
 * Signals Backtest — WR, Conviction, Avg ROI, Trade Count (Top 100 traders)
 * Same methodology as ML backtest: pure signal, 1 unit per trade, deduped by source_trade_id.
 * Outputs JSON for the v2 Polycopy Signals page.
 *
 * Run: npx tsx scripts/signals-backtest.ts
 *      npx tsx scripts/signals-backtest.ts --out public/data/signals-backtest-results.json
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

interface OrderRow {
  source_trade_id: string | null;
  trader_address: string | null;
  entry_price: number | null;
  outcome: string;
  model_probability: number | null;
  trader_win_rate: number | null;
  trader_roi: number | null;
  trader_resolved_count: number | null;
  conviction: number | null;
}

function unitProfit(o: OrderRow): number {
  const p = Number(o.entry_price);
  if (o.outcome === 'WON' && p > 0 && p < 1) return 1 / p - 1;
  if (o.outcome === 'LOST') return -1;
  return 0;
}

interface BucketResult {
  label: string;
  min: number;
  max: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  unitRoiPct: number;
  unitPnlSum: number;
  avgPerTrade: number;
  profitFactor: number;
}

function computeBucketStats(
  orders: OrderRow[],
  buckets: { label: string; min: number; max: number }[],
  getValue: (o: OrderRow) => number
): BucketResult[] {
  return buckets.map((b) => {
    const inBucket = orders.filter((o) => {
      const v = getValue(o);
      return v >= b.min && v < b.max;
    });
    const wins = inBucket.filter((o) => o.outcome === 'WON').length;
    const losses = inBucket.filter((o) => o.outcome === 'LOST').length;
    const total = wins + losses;
    const unitPnls = inBucket.map(unitProfit);
    const unitPnlSum = unitPnls.reduce((s, u) => s + u, 0);
    const unitRoiPct = total > 0 ? (unitPnlSum / total) * 100 : 0;
    const grossWin = unitPnls.filter((u) => u > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(unitPnls.filter((u) => u < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    return {
      label: b.label,
      min: b.min,
      max: b.max,
      trades: total,
      wins,
      losses,
      winRatePct: total > 0 ? (wins / total) * 100 : 0,
      unitRoiPct,
      unitPnlSum,
      avgPerTrade: total > 0 ? unitPnlSum / total : 0,
      profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    };
  });
}

async function fetchTop100Traders(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(100);
  if (!error && data?.length) {
    return new Set(data.map((r: { wallet_address?: string }) => (r.wallet_address ?? '').toLowerCase()).filter(Boolean));
  }
  return new Set();
}

/** Only fetch orders on or after this date to avoid statement timeout on full table scan. */
const SINCE_DAYS = 180;

/** Fetch from pre-aggregated cache (populate with scripts/populate-signals-backtest-cache.ts). */
async function fetchOrdersFromCache(): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  const PAGE = 5000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('signals_backtest_cache')
      .select('source_trade_id,trader_address,entry_price,outcome,model_probability,trader_win_rate,trader_roi,trader_resolved_count,conviction')
      .order('order_time', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('Cache fetch error:', error.message);
      return [];
    }
    if (!data?.length) break;
    all.push(...(data as OrderRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
    if (all.length % 10000 === 0) console.log('  from cache:', all.length);
  }
  return all;
}

async function fetchOrders(): Promise<OrderRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - SINCE_DAYS);
  const sinceIso = since.toISOString();
  console.log('  (since', sinceIso.slice(0, 10), ')');
  const all: OrderRow[] = [];
  const PAGE = 1000;
  let cursor: string | null = null;
  while (true) {
    let q = supabase
      .from('ft_orders')
      .select('source_trade_id,trader_address,entry_price,outcome,model_probability,trader_win_rate,trader_roi,trader_resolved_count,conviction,order_time')
      .in('outcome', ['WON', 'LOST'])
      .gte('order_time', sinceIso)
      .order('order_time', { ascending: true })
      .limit(PAGE);
    if (cursor) q = q.gt('order_time', cursor);
    const { data, error } = await q;
    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
    if (!data?.length) break;
    const rows = data as (OrderRow & { order_time?: string })[];
    rows.forEach((r) => {
      const { order_time: _, ...rest } = r;
      all.push(rest as OrderRow);
    });
    const last = rows[rows.length - 1];
    cursor = last?.order_time ?? null;
    if (!cursor || rows.length < PAGE) break;
    if (all.length % 10000 === 0) console.log('  fetched', all.length);
  }
  return all;
}

async function main() {
  const useCacheOnly = process.argv.includes('--use-cache');
  console.log('Fetching top 100 traders (30d PnL)...');
  const top100 = await fetchTop100Traders();

  let orders: OrderRow[];
  let usedCache = false;
  if (useCacheOnly) {
    console.log('Reading from signals_backtest_cache (--use-cache)...');
    orders = await fetchOrdersFromCache();
    if (!orders.length) {
      console.error('Cache is empty. Run: npx tsx scripts/populate-signals-backtest-cache.ts');
      process.exit(1);
    }
    console.log('Total rows from cache:', orders.length);
    usedCache = true;
  } else {
    console.log('Trying signals_backtest_cache first...');
    const fromCache = await fetchOrdersFromCache();
    if (fromCache.length > 0) {
      console.log('Using cache:', fromCache.length, 'rows');
      orders = fromCache;
      usedCache = true;
    } else {
      console.log('Cache empty; fetching resolved ft_orders (may timeout)...');
      orders = await fetchOrders();
      console.log('Total rows:', orders.length);
    }
  }

  orders = orders.filter((o) => top100.has((o.trader_address ?? '').toLowerCase()));
  const seen = new Set<string>();
  orders = orders.filter((o) => {
    const key = (o.source_trade_id ?? '') as string;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log('Unique trades (top 100):', orders.length);

  const WR_BUCKETS = [
    { label: '0-40%', min: 0, max: 40.001 },
    { label: '40-50%', min: 40, max: 50.001 },
    { label: '50-55%', min: 50, max: 55.001 },
    { label: '55-60%', min: 55, max: 60.001 },
    { label: '60-65%', min: 60, max: 65.001 },
    { label: '65-70%', min: 65, max: 70.001 },
    { label: '70-80%', min: 70, max: 80.001 },
    { label: '80%+', min: 80, max: 101 },
  ];
  const CONV_BUCKETS = [
    { label: '0-1x', min: 0, max: 1.001 },
    { label: '1-1.5x', min: 1, max: 1.501 },
    { label: '1.5-2x', min: 1.5, max: 2.001 },
    { label: '2-3x', min: 2, max: 3.001 },
    { label: '3x+', min: 3, max: 999 },
  ];
  const ROI_BUCKETS = [
    { label: '<0%', min: -999, max: 0.001 },
    { label: '0-5%', min: 0, max: 5.001 },
    { label: '5-10%', min: 5, max: 10.001 },
    { label: '10-20%', min: 10, max: 20.001 },
    { label: '20%+', min: 20, max: 999 },
  ];
  const COUNT_BUCKETS = [
    { label: '0-30', min: 0, max: 30.001 },
    { label: '30-100', min: 30, max: 100.001 },
    { label: '100-500', min: 100, max: 500.001 },
    { label: '500+', min: 500, max: 999999 },
  ];
  const ML_BUCKETS = [
    { label: '0-50%', min: 0, max: 50.001 },
    { label: '50-55%', min: 50, max: 55.001 },
    { label: '55-60%', min: 55, max: 60.001 },
    { label: '60-70%', min: 60, max: 70.001 },
    { label: '70-80%', min: 70, max: 80.001 },
    { label: '80%+', min: 80, max: 101 },
  ];

  const wrPct = (o: OrderRow) => (Number(o.trader_win_rate) ?? 0) * 100;
  const conv = (o: OrderRow) => Number(o.conviction) ?? 0;
  const roiPct = (o: OrderRow) => {
    const r = o.trader_roi;
    if (r == null) return -999;
    return Number(r) <= 1 && Number(r) >= -1 ? Number(r) * 100 : Number(r);
  };
  const count = (o: OrderRow) => Number(o.trader_resolved_count) ?? 0;
  const mlPct = (o: OrderRow) => (Number(o.model_probability) ?? 0) * 100;

  const ordersWithMl = orders.filter((o) => o.model_probability != null);

  const wrStats = computeBucketStats(orders, WR_BUCKETS, wrPct);
  const convStats = computeBucketStats(orders, CONV_BUCKETS, conv);
  const roiStats = computeBucketStats(orders, ROI_BUCKETS, roiPct);
  const countStats = computeBucketStats(orders, COUNT_BUCKETS, count);
  const mlStats = computeBucketStats(ordersWithMl, ML_BUCKETS, mlPct);

  const now = new Date();
  let windowStart: string | undefined = new Date(now.getTime() - SINCE_DAYS * 864e5).toISOString().slice(0, 10);
  let windowEnd: string | undefined = now.toISOString().slice(0, 10);
  if (usedCache) {
    const { data: range } = await supabase.from('signals_backtest_cache').select('order_time').order('order_time', { ascending: true }).limit(1).maybeSingle();
    const { data: rangeEnd } = await supabase.from('signals_backtest_cache').select('order_time').order('order_time', { ascending: false }).limit(1).maybeSingle();
    if (range?.order_time) windowStart = (range.order_time as string).slice(0, 10);
    if (rangeEnd?.order_time) windowEnd = (rangeEnd.order_time as string).slice(0, 10);
  }
  const summary = {
    meta: {
      title: 'Signals Backtest — Top 100 Traders (30d PnL)',
      uniqueTrades: orders.length,
      uniqueTradesWithMl: ordersWithMl.length,
      scope: usedCache ? 'Pure signal, 1 unit per trade, deduped. Data from signals_backtest_cache.' : `Pure signal, 1 unit per trade, deduped by source_trade_id. Last ${SINCE_DAYS}d only.`,
      generatedAt: now.toISOString(),
      backtestWindowStart: windowStart,
      backtestWindowEnd: windowEnd,
      scopeType: 'global',
    },
    byMlScore: mlStats.filter((s) => s.trades > 0),
    byWinRate: wrStats.filter((s) => s.trades > 0),
    byConviction: convStats.filter((s) => s.trades > 0),
    byTraderRoi: roiStats.filter((s) => s.trades > 0),
    byTradeCount: countStats.filter((s) => s.trades > 0),
  };

  const outPath = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;
  const jsonPath = outPath ? path.resolve(process.cwd(), outPath) : path.resolve(process.cwd(), 'public/data/signals-backtest-results.json');
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log('Wrote', jsonPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
