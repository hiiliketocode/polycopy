-- =============================================================================
-- Top Trader Rotation Bots
-- =============================================================================
-- Creates 6 bots that follow yesterday's / last 7 days' top PnL traders.
-- The cron at /api/cron/rotate-pnl-winners (3am UTC daily) updates target_traders.
--
-- Variants test:
--   - Daily vs 7-day lookback
--   - With/without ML gating (55% and 60%)
--   - FIXED vs CONVICTION vs KELLY allocation
-- =============================================================================

-- 1. Daily Top 10 — CONVICTION allocation, no ML
-- Baseline: just follow yesterday's best traders, size by conviction
INSERT INTO public.ft_wallets (
  wallet_id, config_id, display_name, description,
  detailed_description,
  starting_balance, current_balance, bet_size,
  model_threshold, price_min, price_max, min_edge, use_model,
  allocation_method, kelly_fraction, min_bet, max_bet,
  min_trader_resolved_count, min_conviction,
  thesis_tier, hypothesis,
  start_date, end_date, is_active
) VALUES (
  'FT_TOP_DAILY_WINNERS', 'TOP_DAILY_WINNERS',
  'Top 10 Daily PnL',
  'Follows yesterday''s top 10 traders by realized PnL. Rotates daily at 3am UTC.',
  '{"target_traders":[],"market_categories":null}',
  1000.00, 1000.00, 8.00,
  NULL, 0.10, 0.80, 0.0, FALSE,
  'CONVICTION', NULL, 5.00, 25.00,
  10, 0.0,
  'ROTATION', 'Do yesterday''s top PnL traders predict today''s winners? Pure momentum test.',
  NOW(), NOW() + INTERVAL '10 years', TRUE
),
-- 2. 7-Day Top 10 — CONVICTION allocation, no ML
-- More stable than daily; tests weekly momentum
(
  'FT_TOP_7D_WINNERS', 'TOP_7D_WINNERS',
  'Top 10 Weekly PnL',
  'Follows the top 10 traders by 7-day rolling PnL. Rotates daily at 3am UTC.',
  '{"target_traders":[],"market_categories":null}',
  1000.00, 1000.00, 8.00,
  NULL, 0.10, 0.80, 0.0, FALSE,
  'CONVICTION', NULL, 5.00, 25.00,
  10, 0.0,
  'ROTATION', 'Is 7-day momentum more stable than daily? Tests weekly hot-hand hypothesis.',
  NOW(), NOW() + INTERVAL '10 years', TRUE
),
-- 3. Daily Top 10 + ML 55% — CONVICTION allocation
-- Layer ML on top of daily winners to filter out noise
(
  'FT_TOP_DAILY_ML55', 'TOP_DAILY_ML55',
  'Top 10 Daily + ML 55%',
  'Yesterday''s top 10 traders, filtered by ML model at 55%+.',
  '{"target_traders":[],"market_categories":null}',
  1000.00, 1000.00, 8.00,
  0.55, 0.10, 0.80, 0.0, TRUE,
  'CONVICTION', NULL, 5.00, 25.00,
  10, 0.0,
  'ROTATION', 'Does ML 55% improve daily top-trader selection by filtering bad signals?',
  NOW(), NOW() + INTERVAL '10 years', TRUE
),
-- 4. Daily Top 10 + ML 60% — KELLY allocation
-- Stricter ML + Kelly sizing; tests if high-confidence ML picks amplify returns
(
  'FT_TOP_DAILY_ML60_KELLY', 'TOP_DAILY_ML60_KELLY',
  'Top 10 Daily + ML 60% (Kelly)',
  'Yesterday''s top 10 traders, ML 60%+, Kelly-sized bets.',
  '{"target_traders":[],"market_categories":null}',
  1000.00, 1000.00, 1.20,
  0.60, 0.10, 0.80, 0.0, TRUE,
  'KELLY', 0.25, 0.50, 8.00,
  10, 0.0,
  'ROTATION', 'Does ML 60% + Kelly improve daily rotation? Tests if ML confidence improves sizing.',
  NOW(), NOW() + INTERVAL '10 years', TRUE
),
-- 5. 7-Day Top 10 + ML 55% + No Crypto — CONVICTION allocation
-- Combines best signals: weekly momentum + ML + crypto exclusion
(
  'FT_TOP_7D_ML55_NO_CRYPTO', 'TOP_7D_ML55_NO_CRYPTO',
  'Top 10 Weekly + ML 55% (No Crypto)',
  'Top 10 by 7-day PnL, ML 55%+, excludes crypto markets.',
  '{"target_traders":[],"market_categories":["politics","sports","finance","entertainment","science","weather","tech","elections","culture"]}',
  1000.00, 1000.00, 8.00,
  0.55, 0.10, 0.80, 0.0, TRUE,
  'CONVICTION', NULL, 5.00, 25.00,
  10, 0.0,
  'ROTATION', 'Triple signal: weekly momentum + ML filter + no crypto drag. Combines three strongest learnings.',
  NOW(), NOW() + INTERVAL '10 years', TRUE
),
-- 6. 7-Day Top 10 — FIXED allocation (A/B test vs CONVICTION)
-- Same as #2 but FIXED sizing to isolate allocation method impact
(
  'FT_TOP_7D_FIXED', 'TOP_7D_FIXED',
  'Top 10 Weekly (Fixed $8)',
  'Top 10 by 7-day PnL, fixed $8 bets. A/B test vs CONVICTION allocation.',
  '{"target_traders":[],"market_categories":null}',
  1000.00, 1000.00, 8.00,
  NULL, 0.10, 0.80, 0.0, FALSE,
  'FIXED', NULL, 8.00, 8.00,
  10, 0.0,
  'ROTATION', 'A/B test: Does CONVICTION allocation beat FIXED for top-trader rotation?',
  NOW(), NOW() + INTERVAL '10 years', TRUE
)
ON CONFLICT (wallet_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  hypothesis = EXCLUDED.hypothesis,
  thesis_tier = EXCLUDED.thesis_tier,
  updated_at = NOW();

-- Also update rotate-pnl-winners cron to populate the new ML variants
-- The cron currently only updates FT_TOP_DAILY_WINNERS and FT_TOP_7D_WINNERS.
-- We need to also populate the target_traders for the ML variants.
-- This will be done by extending the cron code (separate commit).
