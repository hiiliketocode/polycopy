#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
];
for (const p of envPaths) { config({ path: p }); }

import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const noCrypto = ['politics','sports','finance','entertainment','science','weather','tech','elections','culture','esports'];

async function main() {
  // RESET ALPHA BOTS

  await s.from('ft_wallets').update({
    model_threshold: 0.55, use_model: true,
    price_min: 0.55, price_max: 0.85, min_edge: 0.03, min_conviction: 0,
    allocation_method: 'CONVICTION', kelly_fraction: null,
    bet_size: 1.2, min_bet: 1, max_bet: 10, min_trader_resolved_count: 30,
    market_categories: noCrypto,
    detailed_description: JSON.stringify({ agent_managed: true, bot_role: 'conservative', market_categories: noCrypto, hypothesis: 'Mirror FT_ML_CTX_FAVORITES: ML 55% + favorites 55-85c + no crypto. Locked 7 days.' }),
    hypothesis: 'Mirror FT_ML_CTX_FAVORITES: favorites + ML + no crypto. 7-day lock.',
    updated_at: new Date().toISOString(),
  }).eq('wallet_id', 'ALPHA_CONSERVATIVE');
  console.log('ALPHA_CONSERVATIVE: Reset');

  await s.from('ft_wallets').update({
    model_threshold: 0.55, use_model: true,
    price_min: 0.0, price_max: 0.50, min_edge: 0.05, min_conviction: 0,
    allocation_method: 'KELLY', kelly_fraction: 0.30,
    bet_size: 1.2, min_bet: 2, max_bet: 10, min_trader_resolved_count: 30,
    market_categories: noCrypto,
    detailed_description: JSON.stringify({ agent_managed: true, bot_role: 'optimizer', market_categories: noCrypto, hypothesis: 'Mirror FT_ML_UNDERDOG: underdogs + ML + no crypto. Locked 7 days.' }),
    hypothesis: 'Mirror FT_ML_UNDERDOG: underdogs + ML + no crypto. 7-day lock.',
    updated_at: new Date().toISOString(),
  }).eq('wallet_id', 'ALPHA_OPTIMIZER');
  console.log('ALPHA_OPTIMIZER: Reset');

  await s.from('ft_wallets').update({
    model_threshold: null, use_model: false,
    price_min: 0.10, price_max: 0.70, min_edge: 0.0, min_conviction: 2.0,
    allocation_method: 'CONVICTION', kelly_fraction: null,
    bet_size: 1.2, min_bet: 5, max_bet: 25, min_trader_resolved_count: 30,
    market_categories: noCrypto,
    detailed_description: JSON.stringify({ agent_managed: true, bot_role: 'explorer', market_categories: noCrypto, hypothesis: 'Mirror T4_CONTR_CONV: conviction 2x + no crypto. Locked 7 days.' }),
    hypothesis: 'Mirror T4_CONTR_CONV: conviction 2x + no crypto. 7-day lock.',
    updated_at: new Date().toISOString(),
  }).eq('wallet_id', 'ALPHA_EXPLORER');
  console.log('ALPHA_EXPLORER: Reset');

  for (const botId of ['ALPHA_CONSERVATIVE', 'ALPHA_EXPLORER', 'ALPHA_OPTIMIZER']) {
    await s.from('alpha_agent_bots').update({
      current_hypothesis: 'Reset to fleet-proven strategy. 7-day evaluation lock.',
      total_config_changes: 0, last_config_change: new Date().toISOString(),
    }).eq('bot_id', botId);
  }
  console.log('Reset counters');

  // CREATE 5 CURSOR ALPHA STRATEGIES
  const base = {
    starting_balance: 1000, current_balance: 1000, kelly_fraction: null,
    thesis_tier: 'CURSOR_ALPHA', is_active: true,
    start_date: new Date().toISOString(), end_date: '2036-02-12T00:00:00Z',
  };

  const bots = [
    { wallet_id: 'CURSOR_WHALE_WHISPERER', config_id: 'WHALE_WHISPERER', display_name: 'Cursor: Whale Whisperer', description: 'Top weekly traders + 3x conviction + ML 55% + no crypto.', hypothesis: 'When the best traders make their biggest bets and ML agrees, strongest signal. No crypto removes noise.', use_model: true, model_threshold: 0.55, price_min: 0.15, price_max: 0.70, min_edge: 0.03, min_conviction: 3.0, allocation_method: 'CONVICTION', min_bet: 8, max_bet: 35, bet_size: 1.2, min_trader_resolved_count: 30, market_categories: noCrypto, detailed_description: JSON.stringify({ market_categories: noCrypto }) },
    { wallet_id: 'CURSOR_FAV_SCALPER', config_id: 'FAV_SCALPER', display_name: 'Cursor: Favorites Scalper', description: 'ML favorites with aggressive sizing. 80%+ WR compounding.', hypothesis: 'Favorites 82.7% WR + ML + conviction sizing at $5-20 = outsized compounding returns.', use_model: true, model_threshold: 0.55, price_min: 0.60, price_max: 0.85, min_edge: 0.02, min_conviction: 0, allocation_method: 'CONVICTION', min_bet: 5, max_bet: 20, bet_size: 5, min_trader_resolved_count: 30, market_categories: noCrypto },
    { wallet_id: 'CURSOR_CONTRARIAN_SNIPER', config_id: 'CONTRARIAN_SNIPER', display_name: 'Cursor: Contrarian Sniper', description: 'ML-enhanced T4_CONTR_CONV. #1 strategy + ML to cut losers.', hypothesis: 'T4_CONTR_CONV is #1 without ML. ML 55% eliminates losing bets, preserves $35 avg winners.', use_model: true, model_threshold: 0.55, price_min: 0.10, price_max: 0.55, min_edge: 0.03, min_conviction: 2.0, allocation_method: 'CONVICTION', min_bet: 8, max_bet: 30, bet_size: 1.2, min_trader_resolved_count: 30, market_categories: noCrypto },
    { wallet_id: 'CURSOR_TRADER_STALKER', config_id: 'TRADER_STALKER', display_name: 'Cursor: Trader Stalker', description: 'Follow WBS+FEATHER+WEFLYHIGH with ML filter.', hypothesis: 'Best traders (WBS $2,942 + FEATHER $939 + WEFLYHIGH $77) combined, ML-gated.', use_model: true, model_threshold: 0.55, price_min: 0.10, price_max: 0.80, min_edge: 0.0, min_conviction: 0, allocation_method: 'CONVICTION', min_bet: 5, max_bet: 20, bet_size: 8, min_trader_resolved_count: 1, market_categories: noCrypto },
    { wallet_id: 'CURSOR_SWEET_SPOT', config_id: 'SWEET_SPOT_HUNTER', display_name: 'Cursor: Sweet Spot Hunter', description: 'WR 55-60% traders + 2x conviction + favorites. Selective.', hypothesis: 'WR band 55-65% + favorites price band + conviction 2x+; relaxed from 5x so bot can get trades.', use_model: true, model_threshold: 0.55, price_min: 0.55, price_max: 0.80, min_edge: 0.0, min_conviction: 2.0, allocation_method: 'CONVICTION', min_bet: 10, max_bet: 40, bet_size: 1.2, min_trader_resolved_count: 30, market_categories: noCrypto, detailed_description: JSON.stringify({ market_categories: noCrypto, min_trader_win_rate: 0.55, max_trader_win_rate: 0.65 }) },
  ];

  for (const b of bots) {
    const { error } = await s.from('ft_wallets').upsert({ ...base, ...b }, { onConflict: 'wallet_id' });
    console.log(b.wallet_id + ': ' + (error ? 'ERROR ' + error.message : 'OK'));
  }

  // Set target traders for STALKER
  const addrs: string[] = [];
  for (const tid of ['TRADER_WBS', 'TRADER_FEATHER', 'TRADER_WEFLYHIGH']) {
    const { data: tw } = await s.from('ft_wallets').select('detailed_description').eq('wallet_id', tid).single();
    if (tw?.detailed_description) {
      try {
        const ext = JSON.parse(tw.detailed_description);
        if (ext.target_trader) addrs.push(ext.target_trader.toLowerCase());
        if (ext.target_traders) addrs.push(...ext.target_traders.map((t: string) => t.toLowerCase()));
      } catch { /* skip */ }
    }
  }
  const unique = [...new Set(addrs.filter(Boolean))];
  if (unique.length > 0) {
    await s.from('ft_wallets').update({
      detailed_description: JSON.stringify({ target_traders: unique, market_categories: noCrypto }),
    }).eq('wallet_id', 'CURSOR_TRADER_STALKER');
    console.log('CURSOR_TRADER_STALKER: ' + unique.length + ' target traders set');
  }

  console.log('\nDone.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
