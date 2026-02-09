-- Data splits v2: Using enriched_trades_v13 with updated time windows
-- Training: Dec 2024 - Nov 2025 (with recency weights for ML training)
-- Validation: Dec 2025 (for hyperparameter tuning)
-- Holdout: Jan 2026+ (SACRED - never train on this)

-- Training set with recency weights
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_training_set_v2` AS
SELECT 
  *,
  -- Rename recency_weight to sample_weight for BigQuery ML
  recency_weight as sample_weight
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v13`
WHERE trade_time >= '2024-12-01' AND trade_time < '2025-12-01';

-- Validation set (no weights needed - just for evaluation)
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_validation_set_v2` AS
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v13`
WHERE trade_time >= '2025-12-01' AND trade_time < '2026-01-01';

-- Holdout set (SACRED - never train on this)
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_holdout_set_v2` AS
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v13`
WHERE trade_time >= '2026-01-01';
