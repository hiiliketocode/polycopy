#!/usr/bin/env npx tsx
/**
 * Populate signals_backtest_enriched: resolution + rolling trader stats + ML from ft_orders.
 * Uses 15-day lookback (or --days N). Processes trades_public in trade_timestamp order so we
 * can compute trader_win_rate, trader_roi, trader_resolved_count, conviction at time of trade.
 * model_probability comes from ft_orders (where we copied the trade).
 *
 * Run: npx tsx scripts/populate-signals-backtest-enriched.ts
 *      npx tsx scripts/populate-signals-backtest-enriched.ts --days 15 --delay 50
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
  ? parseInt(process.argv[process.argv.indexOf('--days') + 1], 10) || 15
  : 15;

const PAGE_SIZE = 1500;
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

function winningLabelFromMarket(m: { winning_side?: unknown; resolved_outcome?: string | null }): string | null {
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

function unitPnl(price: number, resolved: string): number {
  if (resolved === 'WON' && price > 0 && price < 1) return 1 / price - 1;
  if (resolved === 'LOST') return -1;
  return 0;
}

type TraderState = { count: number; wins: number; unitPnlSum: number; totalSize: number };

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - DAYS);
  const fromIso = start.toISOString();
  const toIso = end.toISOString();
  console.log(`Populating signals_backtest_enriched (${DAYS}d: ${fromIso.slice(0, 10)} → ${toIso.slice(0, 10)}). Order by trade_timestamp for rolling stats...`);

  const traderState = new Map<string, TraderState>();
  let cursor: string | null = null;
  let totalWritten = 0;

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
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, closed, winning_side, resolved_outcome')
      .in('condition_id', conditionIds)
      .eq('closed', true);

    const resolutionByCid = new Map<string, string>();
    for (const m of markets || []) {
      const winner = winningLabelFromMarket(m);
      if (winner) resolutionByCid.set(m.condition_id, winner);
    }

    const tradeIds = (trades as Array<{ trade_id: string; trader_wallet: string }>).map((t) => t.trade_id);
    const traders = [...new Set((trades as { trader_wallet: string }[]).map((t) => t.trader_wallet))];
    const { data: ftRows } = await supabase
      .from('ft_orders')
      .select('source_trade_id, trader_address, model_probability')
      .in('source_trade_id', tradeIds)
      .in('trader_address', traders);

    const mlByKey = new Map<string, number>();
    for (const r of ftRows || []) {
      const key = `${(r.trader_address ?? '').toLowerCase()}:${r.source_trade_id}`;
      if (r.model_probability != null) mlByKey.set(key, Number(r.model_probability));
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
      trader_win_rate: number | null;
      trader_roi: number | null;
      trader_resolved_count: number | null;
      conviction: number | null;
      model_probability: number | null;
      refreshed_at: string;
    }> = [];

    for (const t of trades as Array<{
      trade_id: string;
      trader_wallet: string;
      condition_id: string;
      price: number;
      size: number | null;
      trade_timestamp: string;
      outcome: string | null;
    }>) {
      const winner = resolutionByCid.get(t.condition_id);
      if (!winner) continue;
      const side = normalizeOutcome(t.outcome);
      if (!side) continue;
      const resolved = side === winner ? 'WON' : 'LOST';
      let price = Number(t.price);
      if (price > 1 && price <= 100) price = price / 100;
      if (price <= 0 || price >= 1) continue;

      const wallet = (t.trader_wallet ?? '').toLowerCase();
      const state = traderState.get(wallet) ?? { count: 0, wins: 0, unitPnlSum: 0, totalSize: 0 };
      const traderWinRate = state.count > 0 ? state.wins / state.count : null;
      const traderRoi = state.count > 0 ? state.unitPnlSum / state.count : null;
      const traderResolvedCount = state.count;
      const avgSize = state.count > 0 ? state.totalSize / state.count : 0;
      const sizeUsd = t.size != null ? Number(t.size) : 0;
      const conviction = avgSize > 0 && sizeUsd > 0 ? sizeUsd / avgSize : null;

      const mlKey = `${wallet}:${t.trade_id}`;
      const modelProbability = mlByKey.get(mlKey) ?? null;

      toUpsert.push({
        trade_id: t.trade_id,
        trader_wallet: t.trader_wallet,
        condition_id: t.condition_id,
        price,
        size: t.size,
        trade_timestamp: t.trade_timestamp,
        outcome_side: side,
        resolved,
        trader_win_rate: traderWinRate,
        trader_roi: traderRoi,
        trader_resolved_count: traderResolvedCount,
        conviction,
        model_probability: modelProbability,
        refreshed_at: new Date().toISOString(),
      });

      state.count += 1;
      if (resolved === 'WON') state.wins += 1;
      state.unitPnlSum += unitPnl(price, resolved);
      state.totalSize += sizeUsd;
      traderState.set(wallet, state);
    }

    if (toUpsert.length > 0) {
      const { error: upsertErr } = await supabase.from('signals_backtest_enriched').upsert(toUpsert, {
        onConflict: 'trade_id',
        ignoreDuplicates: false,
      });
      if (upsertErr) console.error('Upsert error:', upsertErr.message);
      else totalWritten += toUpsert.length;
    }

    if (totalWritten % 10000 < PAGE_SIZE) console.log(`  Written ${totalWritten}`);
    cursor = (trades[trades.length - 1] as { trade_timestamp: string }).trade_timestamp;
    if (CHUNK_DELAY_MS > 0) await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    if (trades.length < PAGE_SIZE) break;
  }

  console.log('Done. Total rows in signals_backtest_enriched:', totalWritten);
  console.log('Run backtest: npx tsx scripts/signals-backtest.ts --source enriched --out public/data/signals-backtest-results.json');
  console.log('Run combos:  npx tsx scripts/signals-backtest-combos.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
