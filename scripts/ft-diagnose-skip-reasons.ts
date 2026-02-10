#!/usr/bin/env npx tsx
/**
 * Query ft_seen_trades for skip reasons (last 24h) for a wallet.
 * Run: npx tsx scripts/ft-diagnose-skip-reasons.ts [wallet_id]
 * Default wallet: FT_ML_MIDRANGE
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const walletId = process.argv[2] || 'FT_ML_MIDRANGE';
const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const { data: rows, error } = await supabase
    .from('ft_seen_trades')
    .select('skip_reason, outcome, seen_at')
    .eq('wallet_id', walletId)
    .gte('seen_at', since);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  const skipped = (rows || []).filter((r: { outcome?: string }) => r.outcome === 'skipped');
  const byReason: Record<string, number> = {};
  for (const r of skipped) {
    const reason = (r as { skip_reason?: string | null }).skip_reason ?? 'null';
    byReason[reason] = (byReason[reason] || 0) + 1;
  }

  console.log(`\n=== ${walletId} – skip reasons (last 24h) ===\n`);
  console.log(`Total skipped: ${skipped.length}`);
  console.log('\nBy reason (desc):');
  const sorted = Object.entries(byReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sorted) {
    console.log(`  ${reason}: ${count}`);
  }
  if (sorted.length === 0) {
    console.log('  (none)');
  }
  console.log('');
}

main();
