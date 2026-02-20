#!/usr/bin/env npx tsx
/**
 * Audit: last N FT orders - confirm each passed its wallet filters (no non-qualifying trade taken).
 * Run: npx tsx scripts/audit-ft-orders-qualification.ts [500|1000]
 *
 * See also: scripts/why-no-trades-diagnostic.ts for "why no trades in last hour" (ft_orders, lt_orders, capital, logs).
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';
const envPaths = [path.resolve(process.cwd(), '.env.local'), path.resolve(os.homedir(), 'PolyCopy', '.env.local')];
for (const p of envPaths) { config({ path: p }); }
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env'); process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const LIMIT = Math.min(parseInt(process.argv[2] || '1000', 10) || 1000, 5000);
const TOL = 0.01;

type Order = { order_id: string; wallet_id: string; entry_price: number | null; edge_pct: number | null; model_probability: number | null; conviction: number | null; trader_win_rate: number | null; trader_resolved_count: number | null; order_time: string };
type W = { wallet_id: string; price_min: number; price_max: number; min_edge: number; use_model: boolean; model_threshold: number | null; min_conviction: number; min_trader_resolved_count: number; detailed_description: string | null };

function parseExt(d: string | null): Record<string, unknown> { if (!d) return {}; try { return JSON.parse(d); } catch { return {}; } }

function check(o: Order, w: W): { pass: boolean; rule?: string; detail?: string } {
  const ext = parseExt(w.detailed_description);
  const price = o.entry_price ?? 0, edge = o.edge_pct ?? -1, mp = o.model_probability, conv = o.conviction ?? 0, wr = o.trader_win_rate ?? 0, rc = o.trader_resolved_count ?? 0;
  const minR = w.min_trader_resolved_count ?? 30;
  if (price < (w.price_min ?? 0) - TOL) return { pass: false, rule: 'price_min', detail: `${price} < ${w.price_min}` };
  if (price > (w.price_max ?? 1) + TOL) return { pass: false, rule: 'price_max', detail: `${price} > ${w.price_max}` };
  if (edge < (w.min_edge ?? 0) - 0.001) return { pass: false, rule: 'min_edge', detail: `${edge} < ${w.min_edge}` };
  if (rc < minR) return { pass: false, rule: 'min_trader_resolved_count', detail: `${rc} < ${minR}` };
  if (w.use_model && w.model_threshold != null) {
    if (mp == null) return { pass: false, rule: 'model_probability', detail: 'null' };
    if (mp < w.model_threshold - 0.001) return { pass: false, rule: 'model_threshold', detail: `${mp} < ${w.model_threshold}` };
  }
  if ((w.min_conviction ?? 0) > 0 && conv < (w.min_conviction ?? 0) - 0.01) return { pass: false, rule: 'min_conviction', detail: `${conv} < ${w.min_conviction}` };
  const minWr = ext.min_trader_win_rate as number | undefined;
  if (minWr != null && wr < minWr - 0.001) return { pass: false, rule: 'min_trader_win_rate', detail: `${wr} < ${minWr}` };
  const maxWr = ext.max_trader_win_rate as number | undefined;
  if (maxWr != null && wr > maxWr + 0.001) return { pass: false, rule: 'max_trader_win_rate', detail: `${wr} > ${maxWr}` };
  const maxEdge = ext.max_edge as number | undefined;
  if (maxEdge != null && edge > maxEdge + 0.001) return { pass: false, rule: 'max_edge', detail: `${edge} > ${maxEdge}` };
  const maxConv = ext.max_conviction as number | undefined;
  if (maxConv != null && conv > maxConv + 0.01) return { pass: false, rule: 'max_conviction', detail: `${conv} > ${maxConv}` };
  return { pass: true };
}

async function main() {
  console.log('=== FT orders qualification audit (last ' + LIMIT + ') ===\n');
  const { data: orders, error: e1 } = await supabase.from('ft_orders').select('order_id,wallet_id,entry_price,edge_pct,model_probability,conviction,trader_win_rate,trader_resolved_count,order_time').order('order_time', { ascending: false }).limit(LIMIT);
  if (e1 || !orders?.length) { console.error(e1?.message || 'no orders'); process.exit(1); }
  const wids = [...new Set((orders as Order[]).map(o => o.wallet_id))];
  const { data: wallets, error: e2 } = await supabase.from('ft_wallets').select('wallet_id,price_min,price_max,min_edge,use_model,model_threshold,min_conviction,min_trader_resolved_count,detailed_description').in('wallet_id', wids);
  if (e2 || !wallets) { console.error(e2?.message); process.exit(1); }
  const wMap = new Map<string, W>();
  for (const w of wallets as W[]) { wMap.set(w.wallet_id, { ...w, price_min: Number(w.price_min) ?? 0, price_max: Number(w.price_max) ?? 1, min_edge: Number(w.min_edge) ?? 0, min_conviction: Number(w.min_conviction) ?? 0, min_trader_resolved_count: Number(w.min_trader_resolved_count) ?? 30 }); }
  const violations: Array<{ order_id: string; wallet_id: string; order_time: string; rule: string; detail: string }> = [];
  for (const o of orders as Order[]) {
    const w = wMap.get(o.wallet_id);
    if (!w) continue;
    const r = check(o, w);
    if (!r.pass && r.rule && r.detail) violations.push({ order_id: o.order_id, wallet_id: o.wallet_id, order_time: o.order_time, rule: r.rule, detail: r.detail });
  }
  const audited = (orders as Order[]).filter(o => wMap.has(o.wallet_id)).length;
  console.log('Orders audited:', audited);
  console.log('Violations (non-qualifying trade taken):', violations.length);
  if (violations.length > 0) {
    const byRule: Record<string, number> = {};
    violations.forEach(v => { byRule[v.rule] = (byRule[v.rule] || 0) + 1; });
    console.log('By rule:', byRule);
    violations.slice(0, 25).forEach(v => console.log(v.order_time.slice(0, 19), v.wallet_id, v.rule, v.detail));
    if (violations.length > 25) console.log('... and', violations.length - 25, 'more');
  } else console.log('All audited orders passed their wallet filters.');
  console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
