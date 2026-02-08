-- enriched_trades_v13: Updated training data with:
-- 1. Data from Dec 2024 onwards only
-- 2. Z-scores computed from training window (Dec 2024 - Nov 2025) only
-- 3. Recency weight column for sample weighting (lambda=0.007, 99-day half-life)

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v13` AS

WITH
-- Step 1: Get base data from trader_stats_at_trade (Dec 2024+)
base_trades AS (
  SELECT *
  FROM `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade`
  WHERE trade_time >= '2024-12-01'
    AND outcome IS NOT NULL
    AND stat_confidence IN ('HIGH', 'MEDIUM')
),

-- Step 2: Add streak features
trades_with_streaks AS (
  SELECT
    t.*,
    -- Recent outcomes for streak calculation
    LAG(t.outcome, 1) OVER (PARTITION BY t.wallet_address ORDER BY t.trade_time) as prev_outcome_1,
    LAG(t.outcome, 2) OVER (PARTITION BY t.wallet_address ORDER BY t.trade_time) as prev_outcome_2,
    LAG(t.outcome, 3) OVER (PARTITION BY t.wallet_address ORDER BY t.trade_time) as prev_outcome_3,
    LAG(t.outcome, 4) OVER (PARTITION BY t.wallet_address ORDER BY t.trade_time) as prev_outcome_4,
    LAG(t.outcome, 5) OVER (PARTITION BY t.wallet_address ORDER BY t.trade_time) as prev_outcome_5,
    -- Wins/losses in last 5 trades
    SUM(CASE WHEN t.outcome = 'WON' THEN 1 ELSE 0 END) OVER (
      PARTITION BY t.wallet_address ORDER BY t.trade_time
      ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
    ) as wins_last_5
  FROM base_trades t
),

-- Step 3: Calculate streak features
trades_with_streak_features AS (
  SELECT
    t.*,
    -- Current win streak (how many consecutive wins before this trade)
    CASE
      WHEN prev_outcome_1 != 'WON' OR prev_outcome_1 IS NULL THEN 0
      WHEN prev_outcome_2 != 'WON' OR prev_outcome_2 IS NULL THEN 1
      WHEN prev_outcome_3 != 'WON' OR prev_outcome_3 IS NULL THEN 2
      WHEN prev_outcome_4 != 'WON' OR prev_outcome_4 IS NULL THEN 3
      WHEN prev_outcome_5 != 'WON' OR prev_outcome_5 IS NULL THEN 4
      ELSE 5
    END as current_win_streak,
    -- Current loss streak
    CASE
      WHEN prev_outcome_1 != 'LOST' OR prev_outcome_1 IS NULL THEN 0
      WHEN prev_outcome_2 != 'LOST' OR prev_outcome_2 IS NULL THEN 1
      WHEN prev_outcome_3 != 'LOST' OR prev_outcome_3 IS NULL THEN 2
      WHEN prev_outcome_4 != 'LOST' OR prev_outcome_4 IS NULL THEN 3
      WHEN prev_outcome_5 != 'LOST' OR prev_outcome_5 IS NULL THEN 4
      ELSE 5
    END as current_loss_streak,
    -- Hot/cold streak indicators
    CASE WHEN wins_last_5 >= 4 THEN 1 ELSE 0 END as is_on_hot_streak,
    CASE WHEN wins_last_5 <= 1 THEN 1 ELSE 0 END as is_on_cold_streak,
    -- Recent momentum (-5 to +5)
    COALESCE(wins_last_5, 0) - COALESCE(5 - wins_last_5, 0) as recent_momentum
  FROM trades_with_streaks t
),

-- Step 4: Join with markets for context
trades_with_market AS (
  SELECT
    t.*,
    COALESCE(m.market_type, 'UNKNOWN') as market_type,
    COALESCE(m.bet_structure, 'UNKNOWN') as bet_structure,
    m.liquidity as market_liquidity,
    TIMESTAMP_DIFF(m.close_time, t.trade_time, HOUR) as hours_to_close,
    TIMESTAMP_DIFF(t.trade_time, m.start_time, DAY) as market_age_days
  FROM trades_with_streak_features t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
),

-- Step 5: Calculate population stats FROM TRAINING WINDOW ONLY (Dec 2024 - Nov 2025)
-- This is critical: we normalize ALL data using stats from training window only
training_stats AS (
  SELECT
    AVG(L_win_rate) as avg_wr,
    STDDEV(L_win_rate) as std_wr,
    AVG(L_roi_pct) as avg_roi,
    STDDEV(L_roi_pct) as std_roi,
    AVG(entry_price) as avg_price,
    STDDEV(entry_price) as std_price,
    AVG(trade_size_usd) as avg_size,
    STDDEV(trade_size_usd) as std_size,
    AVG(L_trade_count) as avg_exp,
    STDDEV(L_trade_count) as std_exp
  FROM trades_with_market
  WHERE trade_time >= '2024-12-01' AND trade_time < '2025-12-01'
),

-- Step 6: Calculate trend features
trades_with_trends AS (
  SELECT
    t.*,
    -- Win rate trends (comparing short-term to long-term)
    CASE 
      WHEN t.L_win_rate > 0 THEN (COALESCE(t.D30_win_rate, t.L_win_rate) - t.L_win_rate) / t.L_win_rate
      ELSE 0 
    END as win_rate_trend_long,
    CASE 
      WHEN COALESCE(t.D30_win_rate, t.L_win_rate) > 0 
      THEN (COALESCE(t.D7_win_rate, t.D30_win_rate, t.L_win_rate) - COALESCE(t.D30_win_rate, t.L_win_rate)) / COALESCE(t.D30_win_rate, t.L_win_rate)
      ELSE 0 
    END as win_rate_trend_short
  FROM trades_with_market t
)

-- Final output with normalized features and recency weight
SELECT
  -- Core identifiers
  t.trade_key,
  t.wallet_address,
  t.trade_time,
  t.condition_id,
  t.outcome,
  
  -- Raw features
  t.entry_price,
  t.trade_size_usd,
  t.L_win_rate,
  t.D30_win_rate,
  t.D7_win_rate,
  t.L_roi_pct,
  t.L_trade_count,
  t.L_resolved_count,
  t.stat_confidence,
  
  -- Normalized features (z-scores based on TRAINING WINDOW stats)
  SAFE_DIVIDE(t.L_win_rate - s.avg_wr, s.std_wr) as L_win_rate_z,
  SAFE_DIVIDE(t.L_roi_pct - s.avg_roi, s.std_roi) as L_roi_z,
  SAFE_DIVIDE(t.entry_price - s.avg_price, s.std_price) as entry_price_z,
  SAFE_DIVIDE(t.trade_size_usd - s.avg_size, s.std_size) as trade_size_z,
  SAFE_DIVIDE(t.L_trade_count - s.avg_exp, s.std_exp) as experience_z,
  
  -- Streak features
  t.current_win_streak,
  t.current_loss_streak,
  t.is_on_hot_streak,
  t.is_on_cold_streak,
  t.recent_momentum,
  
  -- Trend features
  t.win_rate_trend_long,
  t.win_rate_trend_short,
  CASE 
    WHEN t.win_rate_trend_short > 0.05 AND t.win_rate_trend_long > 0.05 THEN 'IMPROVING'
    WHEN t.win_rate_trend_short < -0.05 AND t.win_rate_trend_long < -0.05 THEN 'DECLINING'
    ELSE 'STABLE'
  END as performance_regime,
  
  -- Market context
  t.market_type,
  t.bet_structure,
  t.market_liquidity,
  t.hours_to_close,
  t.market_age_days,
  
  -- Time features
  EXTRACT(HOUR FROM t.trade_time) as trade_hour,
  EXTRACT(DAYOFWEEK FROM t.trade_time) as trade_day_of_week,
  
  -- RECENCY WEIGHT: exponential decay with lambda=0.007 (99-day half-life)
  -- Weight is relative to training cutoff date (Dec 1, 2025)
  EXP(-0.007 * DATE_DIFF(DATE '2025-12-01', DATE(t.trade_time), DAY)) as recency_weight

FROM trades_with_trends t
CROSS JOIN training_stats s;
