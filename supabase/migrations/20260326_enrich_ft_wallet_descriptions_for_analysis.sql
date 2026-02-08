-- Migration: Enrich FT wallet descriptions with analysis guidance
-- Date: Feb 2026
--
-- Purpose: Add "Analysis" sections to each strategy's detailed_description so
--   agents and analysts can easily compare strategies and learn from results.
--   Does not overwrite existing content; appends analysis notes where missing.

UPDATE public.ft_wallets
SET detailed_description = COALESCE(detailed_description, '') || E'\n\n**Analysis — Compare against:** ' || analysis_note || E'\n**Key metrics:** ' || metrics_note || '.',
    updated_at = NOW()
FROM (VALUES
  ('FT_HIGH_CONVICTION', 'FT_MODEL_ONLY (does ML add value for underdogs?) and FT_UNDERDOG_HUNTER (model+edge vs WR-only).', 'P&L, WR%, avg trade size. No model filter = pure trader signal.'),
  ('FT_MODEL_BALANCED', 'FT_MODEL_ONLY (model alone) and FT_SHARP_SHOOTER (more selective).', 'P&L, trades taken, win rate. Balanced baseline.'),
  ('FT_UNDERDOG_HUNTER', 'FT_HIGH_CONVICTION (no model) and FT_FAVORITE_GRINDER (opposite: favorites).', 'P&L, underdog hit rate. Model + edge on cheap positions.'),
  ('FT_FAVORITE_GRINDER', 'FT_UNDERDOG_HUNTER (underdogs vs favorites).', 'P&L, consistency. Favorites = lower variance, smaller payouts.'),
  ('FT_SHARP_SHOOTER', 'FT_MODEL_BALANCED (selectivity vs volume).', 'P&L, trade count, WR%. Highest bar: conviction + 65% WR.'),
  ('FT_MODEL_ONLY', 'Any model-gated strategy. Isolates ML; if it underperforms vs trader-filtered wallets, trader selection adds alpha.', 'P&L, WR%. Pure ML signal, minimal trader filter.')
) AS v(wallet_id, analysis_note, metrics_note)
WHERE ft_wallets.wallet_id = v.wallet_id
  AND (COALESCE(ft_wallets.detailed_description, '') NOT LIKE '%**Analysis — Compare against:**%');

-- Thesis wallets (T1–T5, S) have thesis questions in description; use Compare tab + config_id for cross-strategy analysis.
