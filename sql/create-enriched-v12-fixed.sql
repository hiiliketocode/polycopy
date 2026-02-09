-- ============================================================================
-- ENRICHED TRADES V12 - CLEAN TRAINING DATA (FIXED)
-- ============================================================================
-- 
-- Simpler approach: Start with PIT data, add streaks and normalization
-- Skip the v11 join (too many duplicates) - we'll add behavioral features later
--
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v12` AS

WITH 
-- ============================================================================
-- Step 1: Add streak features to PIT data
-- ============================================================================
trades_with_streaks AS (
  SELECT
    pit.*,
    
    -- Count wins/losses in rolling window of last 5 trades
    SUM(CASE WHEN pit.outcome = 'WON' THEN 1 ELSE 0 END) OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time 
      ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
    ) as wins_last_5,
    
    SUM(CASE WHEN pit.outcome = 'LOST' THEN 1 ELSE 0 END) OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time 
      ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
    ) as losses_last_5,
    
    -- Previous outcomes for streak calculation
    LAG(pit.outcome, 1) OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time
    ) as prev_outcome_1,
    LAG(pit.outcome, 2) OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time
    ) as prev_outcome_2,
    LAG(pit.outcome, 3) OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time
    ) as prev_outcome_3
    
  FROM `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` pit
  WHERE pit.outcome IS NOT NULL
),

-- ============================================================================
-- Step 2: Calculate streak features
-- ============================================================================
trades_with_streak_features AS (
  SELECT
    t.*,
    
    -- Current win streak
    CASE 
      WHEN prev_outcome_1 = 'WON' AND prev_outcome_2 = 'WON' AND prev_outcome_3 = 'WON' THEN 3
      WHEN prev_outcome_1 = 'WON' AND prev_outcome_2 = 'WON' THEN 2
      WHEN prev_outcome_1 = 'WON' THEN 1
      ELSE 0
    END as current_win_streak,
    
    -- Current loss streak
    CASE 
      WHEN prev_outcome_1 = 'LOST' AND prev_outcome_2 = 'LOST' AND prev_outcome_3 = 'LOST' THEN 3
      WHEN prev_outcome_1 = 'LOST' AND prev_outcome_2 = 'LOST' THEN 2
      WHEN prev_outcome_1 = 'LOST' THEN 1
      ELSE 0
    END as current_loss_streak,
    
    -- Streak indicators
    CASE WHEN wins_last_5 >= 4 THEN 1 ELSE 0 END as is_on_hot_streak,
    CASE WHEN losses_last_5 >= 4 THEN 1 ELSE 0 END as is_on_cold_streak,
    COALESCE(wins_last_5, 0) - COALESCE(losses_last_5, 0) as recent_momentum
    
  FROM trades_with_streaks t
),

-- ============================================================================
-- Step 3: Join with markets for context
-- ============================================================================
trades_with_market AS (
  SELECT
    t.trade_key,
    t.wallet_address,
    t.trade_time,
    t.condition_id,
    t.token_label,
    t.entry_price,
    t.trade_size_usd,
    t.outcome,
    
    -- PIT trader stats
    t.L_win_rate,
    t.D30_win_rate,
    t.D7_win_rate,
    t.L_roi_pct,
    t.L_trade_count,
    t.L_resolved_count,
    t.L_wins,
    t.stat_confidence,
    
    -- Streak features
    t.current_win_streak,
    t.current_loss_streak,
    t.is_on_hot_streak,
    t.is_on_cold_streak,
    t.recent_momentum,
    
    -- Trend features (using clean PIT data)
    CASE 
      WHEN t.D30_win_rate IS NOT NULL AND t.L_win_rate IS NOT NULL 
      THEN t.D30_win_rate - t.L_win_rate 
      ELSE 0 
    END as win_rate_trend_long,
    
    CASE 
      WHEN t.D7_win_rate IS NOT NULL AND t.D30_win_rate IS NOT NULL 
      THEN t.D7_win_rate - t.D30_win_rate 
      ELSE 0 
    END as win_rate_trend_short,
    
    -- Market context
    m.market_type,
    m.bet_structure,
    m.liquidity as market_liquidity,
    TIMESTAMP_DIFF(m.close_time, t.trade_time, HOUR) as hours_to_close,
    TIMESTAMP_DIFF(t.trade_time, m.start_time, DAY) as market_age_days
    
  FROM trades_with_streak_features t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
),

-- ============================================================================
-- Step 4: Calculate population stats for normalization
-- ============================================================================
pop_stats AS (
  SELECT
    AVG(L_win_rate) as avg_wr, STDDEV(L_win_rate) as std_wr,
    AVG(L_roi_pct) as avg_roi, STDDEV(L_roi_pct) as std_roi,
    AVG(entry_price) as avg_price, STDDEV(entry_price) as std_price,
    AVG(trade_size_usd) as avg_size, STDDEV(trade_size_usd) as std_size,
    AVG(L_trade_count) as avg_exp, STDDEV(L_trade_count) as std_exp
  FROM trades_with_market
  WHERE L_win_rate IS NOT NULL
)

-- ============================================================================
-- Final output with normalized features
-- ============================================================================
SELECT
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
  
  -- Normalized features (z-scores)
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
    WHEN t.win_rate_trend_short > 0.05 AND t.win_rate_trend_long < 0 THEN 'RECOVERING'
    WHEN t.win_rate_trend_short < -0.05 AND t.win_rate_trend_long > 0 THEN 'SLIPPING'
    ELSE 'STABLE'
  END as performance_regime,
  
  -- Market context
  COALESCE(t.market_type, 'UNKNOWN') as market_type,
  COALESCE(t.bet_structure, 'UNKNOWN') as bet_structure,
  t.market_liquidity,
  t.hours_to_close,
  t.market_age_days,
  
  -- Time features
  EXTRACT(HOUR FROM t.trade_time) as trade_hour,
  EXTRACT(DAYOFWEEK FROM t.trade_time) as trade_day_of_week

FROM trades_with_market t
CROSS JOIN pop_stats s;
