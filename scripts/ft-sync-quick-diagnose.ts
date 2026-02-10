#!/usr/bin/env npx tsx
/**
 * Quick FT sync diagnose - minimal checks, fast.
 * Run: npx tsx scripts/ft-sync-quick-diagnose.ts
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const now = new Date();
  console.log('\n=== FT Sync Quick Diagnose ===\n');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. ML Sharp Shooter last_sync_time
  const { data: w } = await supabase.from('ft_wallets').select('last_sync_time, wallet_id').eq('wallet_id', 'FT_ML_SHARP_SHOOTER').single();
  const lastSync = w?.last_sync_time ? new Date(w.last_sync_time) : null;
  const ageMin = lastSync ? Math.round((now.getTime() - lastSync.getTime()) / 60000) : null;
  console.log('1. FT_ML_SHARP_SHOOTER last_sync_time:', w?.last_sync_time || 'null', ageMin != null ? `(${ageMin} min ago)` : '');

  // 2. Fetch 1 trader's recent trades from Polymarket
  const leaderboardRes = await fetch('https://data-api.polymarket.com/v1/leaderboard?timePeriod=month&orderBy=PNL&limit=3', { cache: 'no-store' });
  const lb = await leaderboardRes.json();
  const wallet = lb?.[0]?.proxyWallet?.toLowerCase();
  if (!wallet) {
    console.log('2. Could not fetch leaderboard');
    return;
  }

  const tradesRes = await fetch(`https://data-api.polymarket.com/trades?user=${wallet}&limit=20&offset=0`, { cache: 'no-store' });
  const trades = await tradesRes.json();
  const buys = Array.isArray(trades) ? trades.filter((t: { side?: string }) => t.side === 'BUY') : [];
  const newestTs = buys[0]?.timestamp;
  const newestDate = newestTs ? new Date(newestTs < 1e10 ? newestTs * 1000 : newestTs) : null;
  const newestAgeMin = newestDate ? Math.round((now.getTime() - newestDate.getTime()) / 60000) : null;
  console.log('2. Top trader', wallet.slice(0, 10) + '...', '| BUY trades:', buys.length, '| Newest:', newestAgeMin != null ? `${newestAgeMin} min ago` : 'N/A');

  // 3. How many trades since last_sync would we have?
  if (lastSync && newestDate) {
    const sinceLastSync = buys.filter((t: { timestamp?: number }) => {
      const ts = t.timestamp;
      const d = ts ? new Date(ts < 1e10 ? ts * 1000 : ts) : null;
      return d && d > lastSync;
    });
    console.log('3. Trades NEWER than last_sync (from this 1 trader):', sinceLastSync.length);
  }

  // 4. ft_seen_trades count for ML Sharp Shooter last 6h
  const sixHAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('ft_seen_trades')
    .select('*', { count: 'exact', head: true })
    .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
    .gte('seen_at', sixHAgo);
  console.log('4. ft_seen_trades (ML Sharp Shooter, last 6h):', count ?? 0);

  // 5. Last order for ML Sharp Shooter
  const { data: lastOrder } = await supabase
    .from('ft_orders')
    .select('order_time')
    .eq('wallet_id', 'FT_ML_SHARP_SHOOTER')
    .order('order_time', { ascending: false })
    .limit(1)
    .single();
  const lastOrderAge = lastOrder?.order_time ? Math.round((now.getTime() - new Date(lastOrder.order_time).getTime()) / 60000) : null;
  console.log('5. Last order:', lastOrder?.order_time || 'none', lastOrderAge != null ? `(${lastOrderAge} min ago)` : '');

  console.log('\n=== Done ===\n');
}

main().catch(console.error);
