-- ============================================================================
-- ML MODEL TRAINING
-- ============================================================================
-- 
-- Training multiple model variants on the training set:
--   1. Logistic Regression with L2 = 0.001
--   2. Logistic Regression with L2 = 0.01
--   3. Logistic Regression with L2 = 0.1
--   4. Boosted Trees (XGBoost-style)
--
-- ============================================================================

-- Model 1: Logistic Regression with light regularization (L2 = 0.001)
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_logreg_l2_001`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  l2_reg=0.001,
  max_iterations=50
) AS
SELECT
  outcome,
  -- Normalized features
  L_win_rate_z,
  L_roi_z,
  entry_price_z,
  trade_size_z,
  experience_z,
  -- Streak features
  current_win_streak,
  current_loss_streak,
  is_on_hot_streak,
  is_on_cold_streak,
  recent_momentum,
  -- Trend features
  win_rate_trend_long,
  win_rate_trend_short,
  -- Categorical features
  performance_regime,
  stat_confidence
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set`
WHERE L_win_rate_z IS NOT NULL;

-- Model 2: Logistic Regression with medium regularization (L2 = 0.01)
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_logreg_l2_01`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  l2_reg=0.01,
  max_iterations=50
) AS
SELECT
  outcome,
  L_win_rate_z,
  L_roi_z,
  entry_price_z,
  trade_size_z,
  experience_z,
  current_win_streak,
  current_loss_streak,
  is_on_hot_streak,
  is_on_cold_streak,
  recent_momentum,
  win_rate_trend_long,
  win_rate_trend_short,
  performance_regime,
  stat_confidence
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set`
WHERE L_win_rate_z IS NOT NULL;

-- Model 3: Logistic Regression with strong regularization (L2 = 0.1)
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_logreg_l2_1`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  l2_reg=0.1,
  max_iterations=50
) AS
SELECT
  outcome,
  L_win_rate_z,
  L_roi_z,
  entry_price_z,
  trade_size_z,
  experience_z,
  current_win_streak,
  current_loss_streak,
  is_on_hot_streak,
  is_on_cold_streak,
  recent_momentum,
  win_rate_trend_long,
  win_rate_trend_short,
  performance_regime,
  stat_confidence
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set`
WHERE L_win_rate_z IS NOT NULL;

-- Model 4: Boosted Trees (XGBoost-style)
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_boosted_tree`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  num_parallel_tree=1,
  max_tree_depth=6,
  subsample=0.8,
  min_tree_child_weight=1
) AS
SELECT
  outcome,
  L_win_rate_z,
  L_roi_z,
  entry_price_z,
  trade_size_z,
  experience_z,
  current_win_streak,
  current_loss_streak,
  is_on_hot_streak,
  is_on_cold_streak,
  recent_momentum,
  win_rate_trend_long,
  win_rate_trend_short,
  performance_regime,
  stat_confidence
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set`
WHERE L_win_rate_z IS NOT NULL;
