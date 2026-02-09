#!/usr/bin/env npx ts-node
/**
 * Insert ML threshold sweep strategies into ft_wallets.
 * Use when migration 20260327_add_ml_threshold_sweep_strategies.sql hasn't been run.
 *
 * Run: npx ts-node scripts/insert-ml-sweep-strategies.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

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

const ML_SWEEP_WALLETS = [
  { wallet_id: 'FT_ML_SWEEP_50', config_id: 'ML_SWEEP_50', display_name: 'ML Sweep: 50%', description: 'Pure ML 50%+, full price range. Conviction-based sizing.', model_threshold: 0.50, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'CONVICTION', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 15, min_trader_resolved_count: 10, min_conviction: 0, thesis_tier: 'ML_SWEEP', hypothesis: 'Does a loose ML 50% threshold add or destroy value vs higher gates? Baseline for sweep comparison.' },
  { wallet_id: 'FT_ML_SWEEP_55', config_id: 'ML_SWEEP_55', display_name: 'ML Sweep: 55%', description: 'Pure ML 55%+, full price range. Conviction-based sizing.', model_threshold: 0.55, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'CONVICTION', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 15, min_trader_resolved_count: 10, min_conviction: 0, thesis_tier: 'ML_SWEEP', hypothesis: 'FT data: 55-60% ML band had 34.9% WR (worst). Is 55% floor too loose? Compare vs 60/65/70.' },
  { wallet_id: 'FT_ML_SWEEP_60', config_id: 'ML_SWEEP_60', display_name: 'ML Sweep: 60%', description: 'Pure ML 60%+, full price range. Conviction-based sizing.', model_threshold: 0.60, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'CONVICTION', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 15, min_trader_resolved_count: 10, min_conviction: 0, thesis_tier: 'ML_SWEEP', hypothesis: 'FT data: 60-65% ML band had 73.5% WR. Is 60% the inflection point where ML adds real value?' },
  { wallet_id: 'FT_ML_SWEEP_65', config_id: 'ML_SWEEP_65', display_name: 'ML Sweep: 65%', description: 'Pure ML 65%+, full price range. Conviction-based sizing.', model_threshold: 0.65, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'CONVICTION', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 15, min_trader_resolved_count: 10, min_conviction: 0, thesis_tier: 'ML_SWEEP', hypothesis: 'Fewer trades but higher model confidence. Does 65% improve precision vs 60%?' },
  { wallet_id: 'FT_ML_SWEEP_70', config_id: 'ML_SWEEP_70', display_name: 'ML Sweep: 70%', description: 'Pure ML 70%+, full price range. Conviction-based sizing.', model_threshold: 0.70, price_min: 0, price_max: 1, min_edge: 0, use_model: true, allocation_method: 'CONVICTION', kelly_fraction: 0.25, min_bet: 0.5, max_bet: 15, min_trader_resolved_count: 10, min_conviction: 0, thesis_tier: 'ML_SWEEP', hypothesis: 'Highest confidence trades only. Does extreme selectivity improve Sharpe or starve the strategy?' },
];

async function main() {
  const rows = ML_SWEEP_WALLETS.map(w => ({
    ...w,
    starting_balance: 1000,
    current_balance: 1000,
    bet_size: 1.2,
    bet_allocation_weight: 1,
    is_active: true,
  }));

  const { data, error } = await supabase.from('ft_wallets').upsert(rows, { onConflict: 'wallet_id' });

  if (error) {
    console.error('Error inserting ML sweep strategies:', error);
    process.exit(1);
  }

  console.log(`Inserted/updated ${ML_SWEEP_WALLETS.length} ML sweep strategies`);
}

main();
