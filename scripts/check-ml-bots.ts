#!/usr/bin/env npx tsx
/**
 * Check that ML bots are trading and receiving the ML signal.
 * Run: npx tsx scripts/check-ml-bots.ts
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

const LOOKBACK_DAYS = 14;

async function main() {
  console.log('=== ML bots check ===\n');

  const { data: mlWallets, error: walletsError } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, use_model, model_threshold, is_active, total_trades, last_sync_time')
    .eq('use_model', true);

  if (walletsError) {
    console.error('Error fetching ML wallets:', walletsError.message);
    process.exit(1);
  }

  if (!mlWallets || mlWallets.length === 0) {
    console.log('No ft_wallets with use_model = true found.');
    process.exit(0);
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceIso = since.toISOString();

  console.log('Found', mlWallets.length, 'ML wallets. Orders since', sinceIso.slice(0, 10), '\n');

  const issues: string[] = [];

  for (const w of mlWallets) {
    const threshold = w.model_threshold;
    const thresholdOk = threshold != null && typeof threshold === 'number';

    const { data: orders, error: ordersError } = await supabase
      .from('ft_orders')
      .select('order_id, model_probability, order_time')
      .eq('wallet_id', w.wallet_id)
      .gte('order_time', sinceIso)
      .order('order_time', { ascending: false })
      .limit(5000);

    if (ordersError) {
      console.log(w.wallet_id, 'Error:', ordersError.message);
      continue;
    }

    const total = orders?.length ?? 0;
    const withMl = orders?.filter((o: { model_probability?: number | null }) => o.model_probability != null)?.length ?? 0;

    const name = (w.display_name || w.wallet_id).slice(0, 40);
    if (!thresholdOk) {
      issues.push(w.wallet_id + ': model_threshold is null/undefined -> ML never runs');
    }
    if (thresholdOk && total > 0 && withMl === 0) {
      issues.push(w.wallet_id + ': has orders but none have model_probability');
    }

    console.log(w.wallet_id, name, thresholdOk ? '' : '[ML OFF - no threshold]');
    console.log('  model_threshold:', threshold ?? 'NULL');
    console.log('  total_trades:', w.total_trades ?? 0);
    console.log('  last ' + LOOKBACK_DAYS + 'd orders:', total, '| with model_probability:', withMl);
    if (orders && withMl > 0) {
      const probs = orders.filter((o: { model_probability?: number | null }) => o.model_probability != null).map((o: { model_probability: number }) => o.model_probability);
      console.log('  prob range:', (Math.min(...probs) * 100).toFixed(1) + '% - ' + (Math.max(...probs) * 100).toFixed(1) + '%');
    }
    console.log('');
  }

  if (issues.length > 0) {
    console.log('--- Issues ---');
    issues.forEach((i) => console.log(i));
  }
  console.log('Done.');
}

// Apply fix for 4 ML wallets with NULL model_threshold: run with --fix
async function applyMlThresholdFix() {
  const { error } = await supabase
    .from('ft_wallets')
    .update({ model_threshold: 0.55, updated_at: new Date().toISOString() })
    .eq('use_model', true)
    .is('model_threshold', null)
    .in('wallet_id', ['FT_MODEL_BALANCED', 'FT_UNDERDOG_HUNTER', 'FT_SHARP_SHOOTER', 'FT_MODEL_ONLY']);
  if (error) {
    console.error('Fix failed:', error.message);
    process.exit(1);
  }
  console.log('Updated model_threshold to 0.55 for FT_MODEL_BALANCED, FT_UNDERDOG_HUNTER, FT_SHARP_SHOOTER, FT_MODEL_ONLY');
}

const withFix = process.argv.includes('--fix');
if (withFix) {
  applyMlThresholdFix().then(() => main()).catch(e => { console.error(e); process.exit(1); });
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
