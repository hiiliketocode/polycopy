-- ============================================================================
-- DATA SPLITS FOR ML TRAINING
-- ============================================================================
-- 
-- Split structure:
--   Training:   Before Sep 2025 (learn patterns)
--   Validation: Sep 2025 (tune hyperparameters)
--   Holdout:    Oct 2025+ (SACRED - final evaluation only)
--
-- ============================================================================

-- Training set (before Sep 2025)
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_training_set` AS
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v12`
WHERE trade_time < '2025-09-01'
  AND stat_confidence IN ('HIGH', 'MEDIUM');  -- Only confident data for training

-- Validation set (Sep 2025)
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_validation_set` AS
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v12`
WHERE trade_time >= '2025-09-01' 
  AND trade_time < '2025-10-01'
  AND stat_confidence IN ('HIGH', 'MEDIUM');

-- Holdout set (Oct 2025+) - SACRED: DO NOT TRAIN ON THIS
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.ml_holdout_set` AS
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v12`
WHERE trade_time >= '2025-10-01'
  AND stat_confidence IN ('HIGH', 'MEDIUM');
