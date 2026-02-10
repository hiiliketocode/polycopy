#!/usr/bin/env npx tsx
/**
 * Diagnose FT Sync - Investigate why ML Sharp Shooter (and others) may not be getting trades.
 * Run: npx tsx scripts/diagnose-ft-sync.ts
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();
import { createClient } from '@supabase/supabase-js';
import { fetchPolymarketLeaderboard } from '../lib/polymarket-leaderboard';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseTimestamp(value: number | string | undefined): Date | null {
  if (value === undefined || value === null) return null;
  let ts = Number(value);
  if (!Number.isFinite(ts)) return null;
  if (ts < 10000000000) ts *= 1000;
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const now = new Date();
  console.log('\n=== FT Sync Diagnostic ===');
  console.log(`Run at: ${now.toISOString()}\n`);

  // 1. Get ML Sharp Shooter and other active wallets
  const { data: wallets, error: wErr } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, last_sync_time, start_date, is_active, use_model, model_threshold, min_conviction, min_trader_resolved_count')
    .eq('is_active', true)
    .in('wallet_id', ['FT_ML_SHARP_SHOOTER', 'FT_ML_UNDERDOG', 'FT_LIVE_SHARP_SHOOTER']);

  if (wErr || !wallets?.length) {
    console.log('1. Wallets: Could not fetch or ML Sharp Shooter not found');
  } else {
    console.log('1. Active Wallets (sample):');
    for (const w of wallets) {
      const lastSync = w.last_sync_time ? new Date(w.last_sync_time) : null;
      const ageMin = lastSync ? Math.round((now.getTime() - lastSync.getTime()) / 60000) : null;
      console.log(`   ${w.wallet_id}: last_sync=${w.last_sync_time || 'never'} (${ageMin !== null ? ageMin + ' min ago' : 'N/A'})`);
    }
    const minLastSync = wallets.reduce((min, w) => {
      const t = w.last_sync_time ? new Date(w.last_sync_time) : new Date(w.start_date);
      return !min || t < min ? t : min;
    }, null as Date | null);
    console.log(`   minLastSyncTime (used for fetch): ${minLastSync?.toISOString()}`);
  }

  // 2. Fetch leaderboard and a few traders' recent trades from Polymarket API
  console.log('\n2. Polymarket API - Fetching leaderboard...');
  let topTraders: { wallet: string }[] = [];
  try {
    topTraders = await fetchPolymarketLeaderboard({
      timePeriod: 'month',
      orderBy: 'PNL',
      limit: 5,
    });
    console.log(`   Got ${topTraders.length} traders (sample: first 5 by PnL)`);
  } catch (e) {
    console.log('   Error:', (e as Error).message);
  }

  if (topTraders.length === 0) {
    console.log('   Cannot proceed without traders');
    return;
  }

  // 3. Fetch trades from first 3 traders - see what the API returns
  console.log('\n3. Polymarket trades API - Fetching from first 3 traders...');
  const TRADES_PAGE_SIZE = 50;
  for (let i = 0; i < Math.min(3, topTraders.length); i++) {
    const trader = topTraders[i];
    const wallet = trader.wallet.toLowerCase();
    try {
      const url = `https://data-api.polymarket.com/trades?user=${wallet}&limit=${TRADES_PAGE_SIZE}&offset=0`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        console.log(`   ${wallet.slice(0, 8)}...: API ${res.status}`);
        continue;
      }
      const trades: Array<{ timestamp?: number; side?: string; conditionId?: string; price?: number }> = await res.json();
      if (!Array.isArray(trades) || trades.length === 0) {
        console.log(`   ${wallet.slice(0, 8)}...: 0 trades`);
        continue;
      }
      const buyTrades = trades.filter((t) => t.side === 'BUY' && t.conditionId);
      const newest = parseTimestamp(trades[0]?.timestamp);
      const oldest = parseTimestamp(trades[trades.length - 1]?.timestamp);
      const newestBuy = buyTrades.length > 0 ? parseTimestamp(buyTrades[0]?.timestamp ?? buyTrades.map((t) => (t as { timestamp?: number }).timestamp).find(Boolean)) : null;
      console.log(`   ${wallet.slice(0, 8)}...: ${trades.length} total, ${buyTrades.length} BUY. Newest: ${newest?.toISOString()}, Oldest: ${oldest?.toISOString()}`);
      if (newestBuy) {
        const ageMin = Math.round((now.getTime() - newestBuy.getTime()) / 60000);
        console.log(`      Newest BUY: ${ageMin} min ago`);
      }
    } catch (e) {
      console.log(`   ${wallet.slice(0, 8)}...: Error ${(e as Error).message}`);
    }
  }

  // 4. Check ft_seen_trades - any activity in last 6 hours for ML Sharp Shooter?
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const { data: seenRecent, count: seenCount } = await supabase
    .from('ft_seen_trades')
    .select('source_trade_id, outcome, skip_reason, seen_at', { count: 'exact' })
    .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
    .gte('seen_at', sixHoursAgo)
    .order('seen_at', { ascending: false })
    .limit(20);

  console.log('\n4. ft_seen_trades for FT_ML_SHARP_SHOOTER (last 6h):');
  console.log(`   Total evaluated: ${seenCount ?? 0}`);
  if (seenRecent && seenRecent.length > 0) {
    const byReason: Record<string, number> = {};
    for (const r of seenRecent) {
      const key = r.skip_reason || r.outcome || 'unknown';
      byReason[key] = (byReason[key] || 0) + 1;
    }
    console.log('   Skip reasons (sample):', byReason);
    console.log('   Most recent:', seenRecent[0]?.seen_at);
  } else {
    console.log('   No evaluations in last 6h - sync may not be processing any trades for this wallet');
  }

  // 5. Check ft_orders - last order for ML Sharp Shooter
  const { data: lastOrder } = await supabase
    .from('ft_orders')
    .select('order_id, order_time, created_at, outcome')
    .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
    .order('order_time', { ascending: false })
    .limit(1)
    .single();

  console.log('\n5. Last order for FT_ML_SHARP_SHOOTER:');
  if (lastOrder) {
    const ageMin = Math.round((now.getTime() - new Date(lastOrder.order_time).getTime()) / 60000);
    console.log(`   ${lastOrder.order_time} (${ageMin} min ago)`);
  } else {
    console.log('   None found');
  }

  // 6. Check trader_global_stats - do we have stats for leaderboard traders?
  const traderWallets = topTraders.slice(0, 5).map((t) => t.wallet.toLowerCase());
  const { data: stats } = await supabase
    .from('trader_global_stats')
    .select('wallet_address, l_count, d30_count, l_win_rate')
    .in('wallet_address', traderWallets);

  console.log('\n6. trader_global_stats for top 5:');
  const statsMap = new Map((stats || []).map((s) => [s.wallet_address.toLowerCase(), s]));
  for (const w of traderWallets) {
    const s = statsMap.get(w);
    const count = s?.d30_count ?? s?.l_count ?? 0;
    const below30 = typeof count === 'number' ? count < 30 : true;
    console.log(`   ${w.slice(0, 8)}...: count=${count}${below30 ? ' (SKIPPED - < 30)' : ''}`);
  }

  console.log('\n=== End diagnostic ===\n');
}

main().catch(console.error);
