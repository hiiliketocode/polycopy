-- =============================================================================
-- FT Model Only: 55% min vs low ML trades - Investigation
-- =============================================================================
-- Run this against your Supabase DB to quantify orders with model_probability < 55%
-- that exist in use_model wallets (e.g. FT_MODEL_ONLY).
-- =============================================================================

-- 1. Count FT_MODEL_ONLY orders with model_probability < 0.55 or null
SELECT
  wallet_id,
  COUNT(*) FILTER (WHERE model_probability IS NULL) AS null_ml,
  COUNT(*) FILTER (WHERE model_probability < 0.55) AS below_55,
  COUNT(*) FILTER (WHERE model_probability >= 0.55) AS at_or_above_55,
  COUNT(*) AS total
FROM ft_orders
WHERE wallet_id = 'FT_MODEL_ONLY'
GROUP BY wallet_id;

-- 2. Sample of low-ML trades (for inspection)
SELECT
  order_id,
  wallet_id,
  market_title,
  entry_price,
  model_probability,
  ROUND((model_probability * 100)::numeric, 1) AS ml_pct,
  trader_win_rate,
  order_time,
  outcome
FROM ft_orders
WHERE wallet_id = 'FT_MODEL_ONLY'
  AND (model_probability < 0.55 OR model_probability IS NULL)
ORDER BY order_time DESC
LIMIT 20;

-- 3. Same check for other use_model wallets with 55% threshold
SELECT
  w.wallet_id,
  w.model_threshold,
  w.use_model,
  COUNT(*) FILTER (WHERE o.model_probability IS NULL) AS null_ml,
  COUNT(*) FILTER (WHERE o.model_probability < COALESCE(w.model_threshold, 0.55)) AS below_threshold,
  COUNT(*) FILTER (WHERE o.model_probability >= COALESCE(w.model_threshold, 0.55)) AS at_or_above,
  COUNT(*) AS total
FROM ft_wallets w
JOIN ft_orders o ON o.wallet_id = w.wallet_id
WHERE w.use_model = TRUE
  AND w.model_threshold IS NOT NULL
GROUP BY w.wallet_id, w.model_threshold, w.use_model
ORDER BY below_threshold DESC, null_ml DESC;
