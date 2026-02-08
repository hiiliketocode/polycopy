-- ============================================================================
-- ML STAGE 1.3: CREATE TRADER_STATS_DAILY TABLE (Efficient Version)
-- ============================================================================
-- Purpose: Calculate point-in-time trader stats for every trade
-- 
-- Instead of calculating for every (trader, date) combination, we calculate
-- stats at the time of each trade. This is what we actually need for training.
--
-- For each trade, we calculate stats using ONLY:
-- 1. Trades that occurred BEFORE this trade
-- 2. Market resolutions that occurred BEFORE this trade
--
-- This properly handles the temporal aspect without look-ahead bias.
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` AS

WITH 
-- ============================================================================
-- Step 1: Get all trades with outcome and resolution time
-- ============================================================================
trades_with_outcome AS (
  SELECT
    t.wallet_address,
    t.timestamp as trade_time,
    t.condition_id,
    t.token_label,
    t.price,
    t.shares_normalized,
    t.price * t.shares_normalized as trade_size_usd,
    m.winning_label,
    m.end_time as resolution_time,
    -- Create a unique trade key for self-join
    CONCAT(t.wallet_address, '|', t.condition_id, '|', CAST(t.timestamp AS STRING)) as trade_key
  FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup` t
  JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
),

-- ============================================================================
-- Step 2: For each trade, calculate stats from all PRIOR trades
-- We use a self-join approach for clarity
-- ============================================================================
stats_per_trade AS (
  SELECT
    current_trade.trade_key,
    current_trade.wallet_address,
    current_trade.trade_time,
    current_trade.condition_id,
    current_trade.token_label,
    current_trade.price as entry_price,
    current_trade.trade_size_usd,
    current_trade.winning_label,
    current_trade.resolution_time,
    
    -- ========================================================================
    -- LIFETIME STATS (all prior trades that resolved before current trade)
    -- ========================================================================
    COUNT(prior.trade_key) as L_trade_count,
    
    -- Resolved count: prior trades where market resolved before current trade
    COUNTIF(
      prior.winning_label IS NOT NULL 
      AND prior.resolution_time < current_trade.trade_time
    ) as L_resolved_count,
    
    -- Wins: prior resolved trades that won
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND prior.resolution_time < current_trade.trade_time
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as L_wins,
    
    -- PnL sum for resolved trades
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND prior.resolution_time < current_trade.trade_time
      THEN 
        CASE 
          WHEN LOWER(prior.token_label) = LOWER(prior.winning_label)
            THEN (1.0 - prior.price) * prior.shares_normalized
          ELSE (0.0 - prior.price) * prior.shares_normalized
        END
      ELSE 0 
    END) as L_total_pnl_usd,
    
    -- Invested amount for resolved trades
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND prior.resolution_time < current_trade.trade_time
      THEN prior.trade_size_usd 
      ELSE 0 
    END) as L_resolved_invested_usd,
    
    -- ========================================================================
    -- D30 STATS (prior trades in last 30 days that resolved)
    -- ========================================================================
    COUNTIF(
      prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY)
      AND prior.winning_label IS NOT NULL 
      AND prior.resolution_time < current_trade.trade_time
    ) as D30_resolved_count,
    
    SUM(CASE 
      WHEN prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY)
        AND prior.winning_label IS NOT NULL 
        AND prior.resolution_time < current_trade.trade_time
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as D30_wins,
    
    -- ========================================================================
    -- D7 STATS (prior trades in last 7 days that resolved)
    -- ========================================================================
    COUNTIF(
      prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 7 DAY)
      AND prior.winning_label IS NOT NULL 
      AND prior.resolution_time < current_trade.trade_time
    ) as D7_resolved_count,
    
    SUM(CASE 
      WHEN prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 7 DAY)
        AND prior.winning_label IS NOT NULL 
        AND prior.resolution_time < current_trade.trade_time
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as D7_wins

  FROM trades_with_outcome current_trade
  LEFT JOIN trades_with_outcome prior
    ON current_trade.wallet_address = prior.wallet_address
    AND prior.trade_time < current_trade.trade_time  -- STRICTLY before current trade
  GROUP BY 
    current_trade.trade_key,
    current_trade.wallet_address,
    current_trade.trade_time,
    current_trade.condition_id,
    current_trade.token_label,
    current_trade.price,
    current_trade.trade_size_usd,
    current_trade.winning_label,
    current_trade.resolution_time
)

-- ============================================================================
-- Step 3: Calculate final metrics and add outcome
-- ============================================================================
SELECT
  trade_key,
  wallet_address,
  trade_time,
  condition_id,
  token_label,
  entry_price,
  trade_size_usd,
  
  -- Outcome for THIS trade
  winning_label,
  CASE 
    WHEN LOWER(token_label) = LOWER(winning_label) THEN 'WON'
    WHEN winning_label IS NOT NULL THEN 'LOST'
    ELSE 'UNRESOLVED'
  END as outcome,
  
  -- Point-in-time stats (calculated from prior trades only)
  L_trade_count,
  L_resolved_count,
  D30_resolved_count,
  D7_resolved_count,
  
  -- Win rates
  CASE WHEN L_resolved_count > 0 THEN CAST(L_wins AS FLOAT64) / L_resolved_count ELSE 0.5 END as L_win_rate,
  CASE WHEN D30_resolved_count > 0 THEN CAST(D30_wins AS FLOAT64) / D30_resolved_count ELSE NULL END as D30_win_rate,
  CASE WHEN D7_resolved_count > 0 THEN CAST(D7_wins AS FLOAT64) / D7_resolved_count ELSE NULL END as D7_win_rate,
  
  -- ROI
  CASE WHEN L_resolved_invested_usd > 0 THEN L_total_pnl_usd / L_resolved_invested_usd ELSE 0 END as L_roi_pct,
  
  -- Raw values
  L_total_pnl_usd

FROM stats_per_trade
ORDER BY wallet_address, trade_time;
