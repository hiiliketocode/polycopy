-- ============================================================================
-- CREATE POLY PREDICTOR V8 MODEL
-- Enhanced ML model with new features
-- ============================================================================
--
-- Model type: Logistic Regression (for probability outputs)
-- Target: outcome (WON/LOST)
-- 
-- NEW FEATURES in v8:
-- - D7_win_rate, D30_win_rate (time-bucketed momentum)
-- - lifetime_roi_pct, D30_roi_pct, D7_roi_pct (ROI metrics)
-- - bracket_win_rate, niche_bracket_win_rate (price bracket specific)
-- - bet_size_vs_avg (deviation from trader norm)
-- - trader_experience_bucket (experience level)
-- ============================================================================

CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v8`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['outcome'],
  auto_class_weights=TRUE,
  enable_global_explain=TRUE,
  max_iterations=50,
  l2_reg=0.01
) AS

SELECT
  -- TARGET
  outcome,
  
  -- TRADER SKILL FEATURES (core predictors)
  global_win_rate,
  D30_win_rate,
  D7_win_rate,
  niche_win_rate_history,
  bracket_win_rate,
  recent_win_rate,
  
  -- ROI FEATURES (new in v8)
  lifetime_roi_pct,
  D30_roi_pct,
  D7_roi_pct,
  
  -- EXPERIENCE FEATURES
  total_lifetime_trades,
  trader_experience_bucket,
  
  -- CONVICTION FEATURES
  conviction_z_score,
  trade_sequence,
  bet_size_vs_avg,
  
  -- BEHAVIORAL FEATURES
  trader_tempo_seconds,
  is_chasing_price_up,
  is_averaging_down,
  stddev_bet_size,
  is_hedged,
  
  -- TRADE FEATURES
  final_niche,
  bet_structure,
  position_direction,
  entry_price,
  price_bracket,
  trade_size_log,
  total_exposure_log,
  
  -- MARKET FEATURES
  volume_momentum_ratio,
  liquidity_impact_ratio,
  
  -- TIMING FEATURES
  minutes_to_start,
  hours_to_close,
  market_age_days

FROM `polycopy_v1.enriched_trades_training_v8`
WHERE 
  -- Filter out extreme outliers
  ABS(conviction_z_score) < 10
  AND trader_tempo_seconds < 86400  -- Less than 1 day
  AND entry_price > 0.01 AND entry_price < 0.99
  -- Sample for faster training (optional - remove for full training)
  -- AND RAND() < 0.5
;
