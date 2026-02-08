#!/usr/bin/env npx tsx
/**
 * Insert the 10 model-mix strategies (FT_ML_*) into ft_wallets.
 * Run when migration 20260210 hasn't been applied.
 *
 * Prerequisites: Migrations 20260207 and 20260209 must be run (adds thesis_tier, hypothesis).
 *
 * Usage: npx tsx scripts/insert-ml-mix-strategies.ts
 */
import { config } from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

config({ path: path.resolve(process.cwd(), '.env.local') });
config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ML_MIX_WALLETS = [
  { wallet_id: 'FT_ML_SHARP_SHOOTER', config_id: 'ML_SHARP_SHOOTER', display_name: 'ML: Sharp Shooter', description: 'ML 55% + 1.5x conviction, elite sniper (based on best performer)', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.4, min_bet: 15, max_bet: 75, min_trader_resolved_count: 30, min_conviction: 1.5 },
  { wallet_id: 'FT_ML_UNDERDOG', config_id: 'ML_UNDERDOG', display_name: 'ML: Underdog Hunter', description: 'ML 55% + underdogs 0-50¢, 5% edge', model_threshold: 0.55, price_min: 0, price_max: 0.5, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 30, min_conviction: 0 },
  { wallet_id: 'FT_ML_FAVORITES', config_id: 'ML_FAVORITES', display_name: 'ML: Favorite Grinder', description: 'ML 55% + favorites 60-90¢, 3% edge', model_threshold: 0.55, price_min: 0.6, price_max: 0.9, min_edge: 0.03, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 30, min_conviction: 0 },
  { wallet_id: 'FT_ML_HIGH_CONV', config_id: 'ML_HIGH_CONV', display_name: 'ML: High Conviction', description: 'ML 55% + 2x conviction, double confirmation', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'FIXED', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 5, min_trader_resolved_count: 30, min_conviction: 2 },
  { wallet_id: 'FT_ML_EDGE', config_id: 'ML_EDGE', display_name: 'ML: Model + Edge', description: 'ML 55% + 5% min edge, quantitative combo', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.35, min_bet: 1, max_bet: 15, min_trader_resolved_count: 30, min_conviction: 0 },
  { wallet_id: 'FT_ML_MIDRANGE', config_id: 'ML_MIDRANGE', display_name: 'ML: Mid-Range', description: 'ML 55% + 25-75¢ only, avoid extremes', model_threshold: 0.55, price_min: 0.25, price_max: 0.75, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 10, min_trader_resolved_count: 30, min_conviction: 0 },
  { wallet_id: 'FT_ML_STRICT', config_id: 'ML_STRICT', display_name: 'ML: Strict (65%)', description: 'ML 65% only, highest confidence trades', model_threshold: 0.65, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.35, min_bet: 1, max_bet: 20, min_trader_resolved_count: 10, min_conviction: 0 },
  { wallet_id: 'FT_ML_LOOSE', config_id: 'ML_LOOSE', display_name: 'ML: Loose (50%)', description: 'ML 50% only, more trades, lower bar', model_threshold: 0.5, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 8, min_trader_resolved_count: 10, min_conviction: 0 },
  { wallet_id: 'FT_ML_CONTRARIAN', config_id: 'ML_CONTRARIAN', display_name: 'ML: Contrarian', description: 'ML 55% + 10-40¢ contrarian, 5% edge', model_threshold: 0.55, price_min: 0.1, price_max: 0.4, min_edge: 0.05, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.3, min_bet: 0.5, max_bet: 12, min_trader_resolved_count: 30, min_conviction: 0 },
  { wallet_id: 'FT_ML_HEAVY_FAV', config_id: 'ML_HEAVY_FAV', display_name: 'ML: Heavy Favorites', description: 'ML 55% + 75-95¢ near-certain, 2% edge', model_threshold: 0.55, price_min: 0.75, price_max: 0.95, min_edge: 0.02, use_model: true, allocation_method: 'KELLY', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 10, min_trader_resolved_count: 30, min_conviction: 0 },
];

async function main() {
  const { data: existing } = await supabase.from('ft_wallets').select('wallet_id').in('wallet_id', ML_MIX_WALLETS.map(w => w.wallet_id));
  const existingIds = new Set((existing || []).map((r: { wallet_id: string }) => r.wallet_id));
  const toInsert = ML_MIX_WALLETS.filter(w => !existingIds.has(w.wallet_id));

  if (toInsert.length === 0) {
    console.log('All 10 ML mix strategies already exist.');
    return;
  }

  const { data, error } = await supabase.from('ft_wallets').upsert(
    toInsert.map(w => ({
      ...w,
      starting_balance: 1000,
      current_balance: 1000,
      bet_size: 1.2,
      is_active: true,
    })),
    { onConflict: 'wallet_id', ignoreDuplicates: true }
  );

  if (error) {
    console.error('Insert failed:', error.message);
    process.exit(1);
  }

  console.log(`Inserted ${toInsert.length} ML mix strategies: ${toInsert.map(w => w.display_name).join(', ')}`);
}

main();
