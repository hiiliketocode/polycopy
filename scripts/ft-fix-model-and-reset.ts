#!/usr/bin/env npx tsx
/**
 * Fix use_model for model strategies and reset them for clean results.
 * Run: npx tsx scripts/ft-fix-model-and-reset.ts
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();
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

const MODEL_WALLET_IDS = [
  'FT_MODEL_BALANCED', 'FT_MODEL_ONLY', 'FT_SHARP_SHOOTER', 'FT_UNDERDOG_HUNTER',
  'FT_T1_PURE_ML', 'FT_T3_POLITICS', 'FT_T4_ML_EDGE', 'FT_T4_FULL_STACK',
  'FT_ML_SHARP_SHOOTER', 'FT_ML_UNDERDOG', 'FT_ML_FAVORITES', 'FT_ML_HIGH_CONV',
  'FT_ML_EDGE', 'FT_ML_MIDRANGE', 'FT_ML_STRICT', 'FT_ML_LOOSE',
  'FT_ML_CONTRARIAN', 'FT_ML_HEAVY_FAV',
];

async function main() {
  console.log('1. Fixing use_model=TRUE for model strategies...');
  const { data: updated, error: updateErr } = await supabase
    .from('ft_wallets')
    .update({ use_model: true })
    .in('wallet_id', MODEL_WALLET_IDS)
    .select('wallet_id');

  if (updateErr) {
    console.error('Update error:', updateErr.message);
    process.exit(1);
  }
  console.log(`   Updated ${updated?.length ?? 0} wallets to use_model=TRUE`);

  // Fetch wallets that exist and now have use_model=true (for reset)
  const { data: toReset } = await supabase
    .from('ft_wallets')
    .select('wallet_id, starting_balance')
    .in('wallet_id', MODEL_WALLET_IDS)
    .eq('use_model', true);

  const walletIds = (toReset || []).map((w) => w.wallet_id);
  if (walletIds.length === 0) {
    console.log('No model wallets to reset.');
    return;
  }

  console.log(`2. Resetting ${walletIds.length} model wallets...`);

  const { data: deletedOrders, error: ordersError } = await supabase
    .from('ft_orders')
    .delete()
    .in('wallet_id', walletIds)
    .select('order_id');

  if (ordersError) {
    console.error('Orders delete error:', ordersError.message);
    process.exit(1);
  }
  const ordersDeleted = deletedOrders?.length ?? 0;

  let seenDeleted = 0;
  const { data: deletedSeen, error: seenError } = await supabase
    .from('ft_seen_trades')
    .delete()
    .in('wallet_id', walletIds)
    .select('source_trade_id');

  if (seenError) {
    if (seenError.message.includes('does not exist') || seenError.message.includes('schema cache')) {
      console.log('   (ft_seen_trades table not present, skipping)');
    } else {
      console.error('Seen trades delete error:', seenError.message);
      process.exit(1);
    }
  } else {
    seenDeleted = deletedSeen?.length ?? 0;
  }

  const today = new Date().toISOString().split('T')[0];
  for (const w of toReset || []) {
    await supabase
      .from('ft_wallets')
      .update({
        current_balance: w.starting_balance ?? 1000,
        trades_seen: 0,
        trades_skipped: 0,
        last_sync_time: null,
        start_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_id', w.wallet_id);
  }

  console.log(`   Orders deleted: ${ordersDeleted}`);
  console.log(`   Seen trades deleted: ${seenDeleted}`);
  console.log(`   Wallets reset: ${walletIds.length} (start_date=${today})`);
  console.log('   Sync will repopulate from scratch.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
