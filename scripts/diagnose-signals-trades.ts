#!/usr/bin/env npx tsx
/**
 * Diagnose trades_public vs ft_orders vs markets for signals backtest.
 * Run to see why we get 0 or few resolved trades and how to fix it.
 *
 * Run: npx tsx scripts/diagnose-signals-trades.ts
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

async function main() {
  console.log('=== Signals backtest data diagnosis ===\n');

  // 1. trades_public
  const { count: tpCount, error: tpCountErr } = await supabase
    .from('trades_public')
    .select('*', { count: 'exact', head: true });
  if (tpCountErr) {
    console.error('trades_public count error:', tpCountErr.message);
  } else {
    console.log('1. trades_public');
    console.log('   Total rows:', tpCount ?? 0);
  }

  const { data: tpRange } = await supabase
    .from('trades_public')
    .select('trade_timestamp')
    .order('trade_timestamp', { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: tpRangeEnd } = await supabase
    .from('trades_public')
    .select('trade_timestamp')
    .order('trade_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  const tpStart = tpRange?.trade_timestamp ? String(tpRange.trade_timestamp).slice(0, 19) : 'N/A';
  const tpEnd = tpRangeEnd?.trade_timestamp ? String(tpRangeEnd.trade_timestamp).slice(0, 19) : 'N/A';
  console.log('   Date range:', tpStart, '→', tpEnd);

  const { data: tpSample } = await supabase
    .from('trades_public')
    .select('trade_id, trader_wallet, condition_id, trade_timestamp, price, outcome')
    .order('trade_timestamp', { ascending: false })
    .limit(5);
  if (tpSample?.length) {
    console.log('   Sample trade_id format (latest 5):');
    for (const r of tpSample as Array<{ trade_id: string; trader_wallet: string; condition_id: string; trade_timestamp: string }>) {
      console.log('     ', r.trade_id?.slice(0, 60) + (r.trade_id && r.trade_id.length > 60 ? '...' : ''));
    }
  }
  console.log('');

  // 2. ft_orders resolved
  const { count: ftResolvedCount, error: ftResErr } = await supabase
    .from('ft_orders')
    .select('*', { count: 'exact', head: true })
    .in('outcome', ['WON', 'LOST']);
  if (ftResErr) {
    console.error('ft_orders (WON/LOST) count error:', ftResErr.message);
  } else {
    console.log('2. ft_orders (outcome WON/LOST)');
    console.log('   Total rows:', ftResolvedCount ?? 0);
  }

  const { data: ftRange } = await supabase
    .from('ft_orders')
    .select('order_time')
    .in('outcome', ['WON', 'LOST'])
    .order('order_time', { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: ftRangeEnd } = await supabase
    .from('ft_orders')
    .select('order_time')
    .in('outcome', ['WON', 'LOST'])
    .order('order_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ftStart = ftRange?.order_time ? String(ftRange.order_time).slice(0, 19) : 'N/A';
  const ftEnd = ftRangeEnd?.order_time ? String(ftRangeEnd.order_time).slice(0, 19) : 'N/A';
  console.log('   Date range:', ftStart, '→', ftEnd);

  const { data: ftSample } = await supabase
    .from('ft_orders')
    .select('source_trade_id, trader_address, condition_id, order_time, outcome')
    .in('outcome', ['WON', 'LOST'])
    .order('order_time', { ascending: false })
    .limit(5);
  if (ftSample?.length) {
    console.log('   Sample source_trade_id format (latest 5):');
    for (const r of ftSample as Array<{ source_trade_id: string; trader_address: string; condition_id: string }>) {
      console.log('     ', (r.source_trade_id ?? '').slice(0, 60) + (r.source_trade_id && r.source_trade_id.length > 60 ? '...' : ''));
    }
  }
  console.log('');

  // 3. Overlap: trades_public.trade_id in ft_orders.source_trade_id
  const { data: tpIds } = await supabase
    .from('trades_public')
    .select('trade_id')
    .limit(5000);
  const tpIdSet = new Set((tpIds ?? []).map((r: { trade_id: string }) => r.trade_id));

  const { data: ftIds } = await supabase
    .from('ft_orders')
    .select('source_trade_id')
    .in('outcome', ['WON', 'LOST']);
  const ftIdSet = new Set((ftIds ?? []).map((r: { source_trade_id: string }) => r.source_trade_id).filter(Boolean));

  let overlapExact = 0;
  for (const id of tpIdSet) {
    if (ftIdSet.has(id)) overlapExact++;
  }
  console.log('3. Overlap (trade_id = source_trade_id)');
  console.log('   Sampled trades_public trade_ids:', tpIdSet.size);
  console.log('   ft_orders (WON/LOST) source_trade_ids:', ftIdSet.size);
  console.log('   Overlap (in sampled 5k):', overlapExact);
  console.log('');

  // 4. markets
  const { count: mClosedCount, error: mClosedErr } = await supabase
    .from('markets')
    .select('*', { count: 'exact', head: true })
    .eq('closed', true);
  const { count: mTotalCount } = await supabase
    .from('markets')
    .select('*', { count: 'exact', head: true });
  console.log('4. markets');
  console.log('   Total rows:', mTotalCount ?? 0);
  console.log('   With closed=true:', mClosedCount ?? 0, mClosedErr ? `(${mClosedErr.message})` : '');

  const { data: mWithWinner } = await supabase
    .from('markets')
    .select('condition_id, winning_side, resolved_outcome')
    .eq('closed', true)
    .limit(500);
  let withWinner = 0;
  for (const m of mWithWinner ?? []) {
    const ws = (m as { winning_side?: unknown }).winning_side;
    const ro = (m as { resolved_outcome?: string }).resolved_outcome;
    if ((ws != null && String(ws).trim()) || (ro != null && String(ro).trim())) withWinner++;
  }
  console.log('   With closed=true and (winning_side or resolved_outcome) set:', withWinner, '(sample 500)');
  console.log('');

  // 5. How many trades_public condition_ids have closed markets with resolution?
  const { data: tpCids } = await supabase
    .from('trades_public')
    .select('condition_id')
    .limit(10000);
  const uniqueCids = [...new Set((tpCids ?? []).map((r: { condition_id: string }) => r.condition_id).filter(Boolean))];
  const { data: marketsForTrades } = await supabase
    .from('markets')
    .select('condition_id, closed, winning_side, resolved_outcome')
    .in('condition_id', uniqueCids)
    .eq('closed', true);
  let cidsWithResolution = 0;
  for (const m of marketsForTrades ?? []) {
    const ws = (m as { winning_side?: unknown }).winning_side;
    const ro = (m as { resolved_outcome?: string }).resolved_outcome;
    if ((ws != null && String(ws).trim()) || (ro != null && String(ro).trim())) cidsWithResolution++;
  }
  console.log('5. trades_public condition_ids vs markets');
  console.log('   Unique condition_ids in trades_public (sample 10k rows):', uniqueCids.length);
  console.log('   Of those, markets closed=true with resolution:', cidsWithResolution);
  console.log('');

  // 6. Match by (trader_wallet, condition_id, time): can we resolve more via ft_orders?
  const { data: ftForMatch } = await supabase
    .from('ft_orders')
    .select('trader_address, condition_id, order_time, outcome')
    .in('outcome', ['WON', 'LOST']);
  const ftByTraderCid = new Map<string, Array<{ order_time: string; outcome: string }>>();
  for (const r of ftForMatch ?? []) {
    const key = `${(r.trader_address ?? '').toLowerCase()}:${r.condition_id ?? ''}`;
    if (!ftByTraderCid.has(key)) ftByTraderCid.set(key, []);
    ftByTraderCid.get(key)!.push({ order_time: String(r.order_time), outcome: String(r.outcome) });
  }
  const { data: tpBatch } = await supabase
    .from('trades_public')
    .select('trade_id, trader_wallet, condition_id, trade_timestamp, outcome')
    .order('trade_timestamp', { ascending: false })
    .limit(2000);
  const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 min
  let matchByTraderCidTime = 0;
  for (const t of tpBatch ?? []) {
    const key = `${(t.trader_wallet ?? '').toLowerCase()}:${t.condition_id ?? ''}`;
    const list = ftByTraderCid.get(key);
    if (!list?.length) continue;
    const tradeTs = new Date((t as { trade_timestamp: string }).trade_timestamp).getTime();
    for (const o of list) {
      const orderTs = new Date(o.order_time).getTime();
      if (Math.abs(orderTs - tradeTs) <= TIME_WINDOW_MS) {
        matchByTraderCidTime++;
        break;
      }
    }
  }
  console.log('6. Resolution via (trader_wallet, condition_id, order_time ~ trade_timestamp)');
  console.log('   ft_orders (WON/LOST) grouped by (trader_address, condition_id):', ftByTraderCid.size, 'keys');
  console.log('   trades_public sample 2k: matches within 5 min:', matchByTraderCidTime);
  console.log('');

  console.log('=== Summary ===');
  if ((tpCount ?? 0) === 0) {
    console.log('- trades_public is empty. Populate it via polymarket-trade-stream worker or sync-public-trades cron.');
  } else {
    console.log('- trades_public has', tpCount, 'rows. Use it as the main backtest source.');
    if (overlapExact === 0 && matchByTraderCidTime > 0) {
      console.log('- trade_id rarely equals source_trade_id; matching by (trader, condition_id, time) resolves more.');
    }
    if (cidsWithResolution === 0 && (mClosedCount ?? 0) === 0) {
      console.log('- markets has no closed/resolution data. Rely on ft_orders resolution (by trade_id or by trader+condition_id+time).');
    }
  }
  console.log('- Run populate-trades-public-resolved with fallback by (trader, condition_id, time) to fill from trades_public.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
