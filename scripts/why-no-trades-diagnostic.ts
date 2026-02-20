#!/usr/bin/env npx tsx
/**
 * Audit: why no trades in the last N hours?
 * Reports: FT wallets (active period, last_sync), ft_orders, lt_strategies, lt_orders, rejection reasons.
 * Run: npx tsx scripts/why-no-trades-diagnostic.ts [hours]
 * Example: npx tsx scripts/why-no-trades-diagnostic.ts 2
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
];
for (const p of envPaths) config({ path: p });
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

const HOURS = Math.max(0.5, Math.min(48, parseFloat(process.argv[2] || '2') || 2));

async function main() {
  const now = new Date();
  const since = new Date(now.getTime() - HOURS * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  console.log('\n=== NO-TRADES AUDIT (last ' + HOURS + 'h, since ' + sinceIso + ') ===\n');

  // 1) FT wallets: total, in active test period, last_sync_time
  const { data: wallets, error: eW } = await supabase
    .from('ft_wallets')
    .select('wallet_id, is_active, start_date, end_date, last_sync_time')
    .eq('is_active', true);
  if (eW) {
    console.log('1) FT wallets: ERROR', eW.message);
  } else {
    const activePeriod = (wallets || []).filter((w: { start_date: string; end_date: string }) => {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      return start <= now && end >= now;
    });
    const lastSyncs = (wallets || []).map((w: { last_sync_time: string | null }) => w.last_sync_time).filter(Boolean);
    const newestSync = lastSyncs.length ? lastSyncs.sort().reverse()[0] : null;
    const oldestSync = lastSyncs.length ? lastSyncs.sort()[0] : null;
    console.log('1) FT wallets: total_active=' + (wallets?.length ?? 0) + ' in_test_period=' + activePeriod.length);
    console.log('   last_sync_time: newest=' + (newestSync ?? 'null') + ' oldest=' + (oldestSync ?? 'null'));
    if (activePeriod.length === 0) {
      console.log('   >>> NO WALLETS IN ACTIVE TEST PERIOD — FT sync will return early and insert 0 ft_orders. Check start_date/end_date.');
    }
  }

  // 2) ft_orders in window
  const { data: ftOrders, error: eFt } = await supabase
    .from('ft_orders')
    .select('order_id, wallet_id, outcome, order_time')
    .gte('order_time', sinceIso);
  if (eFt) console.log('2) ft_orders: ERROR', eFt.message);
  else {
    const byOutcome: Record<string, number> = {};
    (ftOrders || []).forEach((o: { outcome: string }) => {
      byOutcome[o.outcome] = (byOutcome[o.outcome] || 0) + 1;
    });
    const openCount = (ftOrders || []).filter((o: { outcome: string }) => o.outcome === 'OPEN').length;
    console.log('2) ft_orders in window: total=' + (ftOrders?.length ?? 0) + ' OPEN=' + openCount + ' by_outcome=' + JSON.stringify(byOutcome));
    if ((ftOrders?.length ?? 0) === 0) {
      console.log('   >>> No ft_orders in window — FT sync may not be running, or no trades passed filters.');
    }
  }

  // 3) lt_strategies: active, unpaused, circuit_breaker
  const { data: strategies, error: eSt } = await supabase
    .from('lt_strategies')
    .select('strategy_id, ft_wallet_id, is_active, is_paused, available_cash, locked_capital, last_sync_time');
  if (eSt) console.log('3) lt_strategies: ERROR', eSt.message);
  else {
    const active = (strategies || []).filter((s: { is_active: boolean }) => s.is_active);
    const unpaused = active.filter((s: { is_paused: boolean }) => !s.is_paused);
    const zeroCash = unpaused.filter((s: { available_cash?: number }) => Number(s.available_cash ?? 0) < 1);
    console.log('3) lt_strategies: total=' + (strategies?.length ?? 0) + ' active=' + active.length + ' unpaused=' + unpaused.length + ' zero_cash=' + zeroCash.length);
    if (unpaused.length === 0) {
      console.log('   >>> NO UNPAUSED ACTIVE STRATEGIES — LT execute will do nothing. Check is_active and is_paused.');
    }
    if (zeroCash.length > 0 && zeroCash.length === unpaused.length) {
      console.log('   >>> ALL UNPAUSED STRATEGIES HAVE ~$0 available_cash — every attempt will fail CASH_CHECK.');
    }
    unpaused.slice(0, 5).forEach((s: { strategy_id: string; available_cash: number; last_sync_time: string | null }) => {
      console.log('   ' + s.strategy_id + ' cash=$' + Number(s.available_cash).toFixed(2) + ' last_sync=' + (s.last_sync_time ?? 'null'));
    });
  }

  // 4) lt_orders in window: by status, rejection_reason
  const { data: ltOrders, error: eLt } = await supabase
    .from('lt_orders')
    .select('lt_order_id, strategy_id, status, rejection_reason, order_placed_at')
    .gte('order_placed_at', sinceIso)
    .limit(1000);
  if (eLt) console.log('4) lt_orders: ERROR', eLt.message);
  else {
    const byStatus: Record<string, number> = {};
    const rejectReasons: Record<string, number> = {};
    (ltOrders || []).forEach((o: { status: string; rejection_reason: string | null }) => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      if (o.status === 'REJECTED' && o.rejection_reason) {
        const r = String(o.rejection_reason).slice(0, 60);
        rejectReasons[r] = (rejectReasons[r] || 0) + 1;
      }
    });
    console.log('4) lt_orders in window: total=' + (ltOrders?.length ?? 0) + ' by_status=' + JSON.stringify(byStatus));
    if (Object.keys(rejectReasons).length > 0) {
      console.log('   rejection_reason samples:', JSON.stringify(rejectReasons).slice(0, 500));
    }
  }

  // 5) Recent lt_execute_logs
  const { data: logs, error: eLog } = await supabase
    .from('lt_execute_logs')
    .select('stage, message, created_at')
    .order('created_at', { ascending: false })
    .limit(25);
  if (eLog) console.log('5) lt_execute_logs: ERROR (table may not exist)', eLog.message);
  else if (logs?.length) {
    const first = (logs[logs.length - 1] as { created_at: string }).created_at;
    const last = (logs[0] as { created_at: string }).created_at;
    console.log('5) lt_execute_logs: count=' + logs.length + ' range ' + first + ' .. ' + last);
    logs.slice(0, 8).forEach((l: { stage: string; message: string }) => {
      console.log('   [' + l.stage + '] ' + (l.message || '').slice(0, 72));
    });
  } else console.log('5) lt_execute_logs: none');

  console.log('\n--- SUMMARY ---');
  console.log('If no trades: check (1) wallets in test period, (2) ft_orders OPEN, (3) lt_strategies unpaused + cash, (4) rejection reasons.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
