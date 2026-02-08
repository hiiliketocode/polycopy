-- ML Models v2: Trained on ml_training_set_v2 with recency weighting
-- Using sample_weight column for exponential recency weighting (lambda=0.007)

-- Model 1: Logistic Regression with moderate regularization
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_logistic_v2`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  l2_reg=0.1,
  data_split_method='NO_SPLIT'
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
  stat_confidence,
  -- Sample weight for recency
  sample_weight
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set_v2`
WHERE L_win_rate_z IS NOT NULL;

-- Model 2: Boosted Tree (XGBoost-style) - often better for complex patterns
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_boosted_tree_v2`
OPTIONS(
  model_type='BOOSTED_TREE_CLASSIFIER',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  num_parallel_tree=1,
  max_tree_depth=6,
  subsample=0.8,
  min_tree_child_weight=1,
  data_split_method='NO_SPLIT'
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
  stat_confidence,
  -- Sample weight for recency
  sample_weight
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set_v2`
WHERE L_win_rate_z IS NOT NULL;

-- Model 3: Logistic Regression with stronger regularization (simpler model)
CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.model_logistic_strong_reg_v2`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  l2_reg=1.0,
  data_split_method='NO_SPLIT'
) AS
SELECT
  outcome,
  -- Core features only (simpler model)
  L_win_rate_z,
  L_roi_z,
  entry_price_z,
  experience_z,
  stat_confidence,
  -- Sample weight
  sample_weight
FROM `gen-lang-client-0299056258.polycopy_v1.ml_training_set_v2`
WHERE L_win_rate_z IS NOT NULL;
