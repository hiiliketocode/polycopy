-- ============================================================================
-- ENRICHED TRADES V12 - CLEAN TRAINING DATA
-- ============================================================================
-- 
-- This table combines:
-- 1. Point-in-time trader stats (NO look-ahead bias)
-- 2. Behavioral features from v11 (calculated at trade time - safe)
-- 3. Market context from markets table
-- 4. Win streak calculations
-- 5. Normalized features (z-scores)
-- 6. Clean trend calculations
--
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.enriched_trades_v12` AS

WITH 
-- ============================================================================
-- Step 1: Calculate win streaks using window functions
-- ============================================================================
trades_with_streaks AS (
  SELECT
    pit.*,
    
    -- Calculate streak by looking at consecutive outcomes
    -- This uses a gaps-and-islands approach
    ROW_NUMBER() OVER (
      PARTITION BY pit.wallet_address 
      ORDER BY pit.trade_time
    ) as trade_seq,
    
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
    
    -- Previous trade outcome for streak calculation
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
),

-- ============================================================================
-- Step 2: Calculate clean streak features
-- ============================================================================
trades_with_streak_features AS (
  SELECT
    t.*,
    
    -- Win streak: count of consecutive prior wins
    CASE 
      WHEN prev_outcome_1 = 'WON' AND prev_outcome_2 = 'WON' AND prev_outcome_3 = 'WON' THEN 3
      WHEN prev_outcome_1 = 'WON' AND prev_outcome_2 = 'WON' THEN 2
      WHEN prev_outcome_1 = 'WON' THEN 1
      ELSE 0
    END as current_win_streak,
    
    -- Loss streak: count of consecutive prior losses
    CASE 
      WHEN prev_outcome_1 = 'LOST' AND prev_outcome_2 = 'LOST' AND prev_outcome_3 = 'LOST' THEN 3
      WHEN prev_outcome_1 = 'LOST' AND prev_outcome_2 = 'LOST' THEN 2
      WHEN prev_outcome_1 = 'LOST' THEN 1
      ELSE 0
    END as current_loss_streak,
    
    -- Hot/cold streak indicators
    CASE WHEN wins_last_5 >= 4 THEN 1 ELSE 0 END as is_on_hot_streak,
    CASE WHEN losses_last_5 >= 4 THEN 1 ELSE 0 END as is_on_cold_streak,
    
    -- Recent momentum (wins - losses in last 5)
    COALESCE(wins_last_5, 0) - COALESCE(losses_last_5, 0) as recent_momentum
    
  FROM trades_with_streaks t
),

-- ============================================================================
-- Step 3: Join with v11 for behavioral features (the safe ones)
-- ============================================================================
trades_with_behavior AS (
  SELECT
    t.trade_key,
    t.wallet_address,
    t.trade_time,
    t.condition_id,
    t.token_label,
    t.entry_price,
    t.trade_size_usd,
    t.outcome,
    
    -- PIT trader stats (CLEAN - no leakage)
    t.L_win_rate,
    t.D30_win_rate,
    t.D7_win_rate,
    t.L_roi_pct,
    t.L_trade_count,
    t.L_resolved_count,
    t.stat_confidence,
    
    -- Streak features (calculated above)
    t.current_win_streak,
    t.current_loss_streak,
    t.is_on_hot_streak,
    t.is_on_cold_streak,
    t.recent_momentum,
    
    -- Clean trend calculations using PIT data
    CASE 
      WHEN t.D30_win_rate IS NOT NULL AND t.L_win_rate IS NOT NULL 
      THEN t.D30_win_rate - t.L_win_rate 
      ELSE 0 
    END as win_rate_trend_long,  -- D30 vs Lifetime (positive = improving)
    
    CASE 
      WHEN t.D7_win_rate IS NOT NULL AND t.D30_win_rate IS NOT NULL 
      THEN t.D7_win_rate - t.D30_win_rate 
      ELSE 0 
    END as win_rate_trend_short,  -- D7 vs D30 (positive = improving)
    
    -- Behavioral features from v11 (these are SAFE - calculated at trade time)
    v11.conviction_z_score,
    v11.trader_selectivity,
    v11.is_chasing_price_up,
    v11.is_averaging_down,
    v11.is_hedging,
    v11.is_with_crowd,
    v11.trade_size_tier,
    v11.final_niche,
    v11.bet_structure,
    v11.position_direction
    
  FROM trades_with_streak_features t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.enriched_trades_training_v11` v11
    ON t.wallet_address = v11.wallet_address 
    AND t.condition_id = v11.condition_id
    AND DATE(t.trade_time) = DATE(v11.timestamp)
),

-- ============================================================================
-- Step 4: Join with markets table for market context
-- ============================================================================
trades_with_market AS (
  SELECT
    t.*,
    
    -- Market context
    m.market_type,
    m.liquidity as market_liquidity,
    m.bet_structure as market_bet_structure,  -- Backup if v11 missing
    
    -- Time to market close (at time of trade)
    TIMESTAMP_DIFF(m.close_time, t.trade_time, HOUR) as hours_to_close,
    TIMESTAMP_DIFF(m.end_time, t.trade_time, DAY) as days_to_end,
    
    -- Market age at time of trade
    TIMESTAMP_DIFF(t.trade_time, m.start_time, DAY) as market_age_days,
    
    -- Volume context (total volume as proxy for market importance)
    m.volume_total as market_volume_total
    
  FROM trades_with_behavior t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
),

-- ============================================================================
-- Step 5: Calculate population statistics for normalization
-- ============================================================================
population_stats AS (
  SELECT
    AVG(L_win_rate) as avg_L_win_rate,
    STDDEV(L_win_rate) as std_L_win_rate,
    AVG(L_roi_pct) as avg_L_roi_pct,
    STDDEV(L_roi_pct) as std_L_roi_pct,
    AVG(entry_price) as avg_entry_price,
    STDDEV(entry_price) as std_entry_price,
    AVG(trade_size_usd) as avg_trade_size,
    STDDEV(trade_size_usd) as std_trade_size,
    AVG(L_trade_count) as avg_trade_count,
    STDDEV(L_trade_count) as std_trade_count,
    AVG(conviction_z_score) as avg_conviction,
    STDDEV(conviction_z_score) as std_conviction,
    AVG(hours_to_close) as avg_hours_to_close,
    STDDEV(hours_to_close) as std_hours_to_close,
    AVG(market_age_days) as avg_market_age,
    STDDEV(market_age_days) as std_market_age
  FROM trades_with_market
  WHERE L_win_rate IS NOT NULL
)

-- ============================================================================
-- Step 6: Final output with normalized features
-- ============================================================================
SELECT
  t.trade_key,
  t.wallet_address,
  t.trade_time,
  t.condition_id,
  t.outcome,
  
  -- ========== RAW FEATURES (for reference) ==========
  t.entry_price,
  t.trade_size_usd,
  t.L_win_rate,
  t.D30_win_rate,
  t.D7_win_rate,
  t.L_roi_pct,
  t.L_trade_count,
  t.L_resolved_count,
  t.stat_confidence,
  
  -- ========== NORMALIZED FEATURES (for model) ==========
  -- Win rate z-score (how does this trader compare to average?)
  SAFE_DIVIDE(t.L_win_rate - s.avg_L_win_rate, s.std_L_win_rate) as L_win_rate_z,
  
  -- ROI z-score
  SAFE_DIVIDE(t.L_roi_pct - s.avg_L_roi_pct, s.std_L_roi_pct) as L_roi_z,
  
  -- Entry price z-score (contrarian vs favorite)
  SAFE_DIVIDE(t.entry_price - s.avg_entry_price, s.std_entry_price) as entry_price_z,
  
  -- Trade size z-score (whale vs retail)
  SAFE_DIVIDE(t.trade_size_usd - s.avg_trade_size, s.std_trade_size) as trade_size_z,
  
  -- Experience z-score (veteran vs newbie)
  SAFE_DIVIDE(t.L_trade_count - s.avg_trade_count, s.std_trade_count) as experience_z,
  
  -- Conviction (already normalized in v11, but re-normalize for consistency)
  COALESCE(SAFE_DIVIDE(t.conviction_z_score - s.avg_conviction, s.std_conviction), 0) as conviction_z,
  
  -- Time urgency z-score
  SAFE_DIVIDE(t.hours_to_close - s.avg_hours_to_close, s.std_hours_to_close) as time_urgency_z,
  
  -- Market age z-score
  SAFE_DIVIDE(t.market_age_days - s.avg_market_age, s.std_market_age) as market_age_z,
  
  -- ========== STREAK FEATURES ==========
  t.current_win_streak,
  t.current_loss_streak,
  t.is_on_hot_streak,
  t.is_on_cold_streak,
  t.recent_momentum,
  
  -- ========== TREND FEATURES (clean, using PIT data) ==========
  t.win_rate_trend_long,
  t.win_rate_trend_short,
  
  -- Performance regime (derived from clean trends)
  CASE
    WHEN t.win_rate_trend_short > 0.05 AND t.win_rate_trend_long > 0.05 THEN 'IMPROVING'
    WHEN t.win_rate_trend_short < -0.05 AND t.win_rate_trend_long < -0.05 THEN 'DECLINING'
    WHEN t.win_rate_trend_short > 0.05 AND t.win_rate_trend_long < 0 THEN 'RECOVERING'
    WHEN t.win_rate_trend_short < -0.05 AND t.win_rate_trend_long > 0 THEN 'SLIPPING'
    ELSE 'STABLE'
  END as performance_regime,
  
  -- ========== BEHAVIORAL FEATURES (from v11 - safe) ==========
  COALESCE(t.conviction_z_score, 0) as conviction_z_score_raw,
  COALESCE(t.trader_selectivity, 0) as trader_selectivity,
  COALESCE(t.is_chasing_price_up, 0) as is_chasing_price_up,
  COALESCE(t.is_averaging_down, 0) as is_averaging_down,
  COALESCE(t.is_hedging, 0) as is_hedging,
  COALESCE(t.is_with_crowd, 0) as is_with_crowd,
  COALESCE(t.trade_size_tier, 'UNKNOWN') as trade_size_tier,
  COALESCE(t.position_direction, 'UNKNOWN') as position_direction,
  
  -- ========== MARKET CONTEXT ==========
  COALESCE(t.final_niche, t.market_type, 'UNKNOWN') as market_niche,
  COALESCE(t.bet_structure, t.market_bet_structure, 'UNKNOWN') as bet_structure,
  t.market_type,
  t.market_liquidity,
  t.hours_to_close,
  t.days_to_end,
  t.market_age_days,
  t.market_volume_total,
  
  -- ========== TIME FEATURES ==========
  EXTRACT(HOUR FROM t.trade_time) as trade_hour,
  EXTRACT(DAYOFWEEK FROM t.trade_time) as trade_day_of_week

FROM trades_with_market t
CROSS JOIN population_stats s
WHERE t.outcome IS NOT NULL;  -- Only trades with known outcomes
