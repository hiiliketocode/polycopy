-- ============================================================================
-- ML STAGE 1.3: CREATE TRADER_STATS_AT_TRADE TABLE
-- ============================================================================
-- Purpose: For EACH trade, calculate the trader's stats using ONLY prior data
--
-- This is TRUE point-in-time data:
-- - Only uses trades that occurred BEFORE the current trade
-- - Only counts trades as "resolved" if they resolved BEFORE the current trade
-- - No look-ahead bias
--
-- Resolution time logic:
-- - Use COALESCE(completed_time, close_time, end_time) as resolution time
-- - For markets without timing data, assume resolved 30+ days after trade
--
-- This table replaces the biased trader_global_stats for ML training
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` AS

WITH 
-- ============================================================================
-- Step 1: Get all trades with outcome and resolution timing
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
    -- Use first available resolution time
    COALESCE(m.completed_time, m.close_time, m.end_time) as resolution_time,
    -- Create a unique trade key
    CONCAT(t.wallet_address, '|', t.condition_id, '|', CAST(t.timestamp AS STRING)) as trade_key
  FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup` t
  JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
  WHERE m.winning_label IS NOT NULL  -- Only resolved markets for training
),

-- ============================================================================
-- Step 2: Calculate point-in-time stats using self-join
-- For each trade, aggregate stats from all PRIOR trades
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
    
    -- LIFETIME STATS: all prior trades
    COUNT(prior.trade_key) as L_trade_count,
    
    -- Resolved count: prior trades where we KNOW they resolved before current trade
    -- Either has resolution_time before current trade
    -- OR no resolution_time but trade was 30+ days ago (assume resolved)
    COUNTIF(
      prior.winning_label IS NOT NULL 
      AND (
        (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
        OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
      )
    ) as L_resolved_count,
    
    -- Wins among resolved
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND (
          (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
          OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
        )
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as L_wins,
    
    -- Total PnL from resolved trades
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND (
          (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
          OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
        )
      THEN 
        CASE 
          WHEN LOWER(prior.token_label) = LOWER(prior.winning_label)
            THEN (1.0 - prior.price) * prior.shares_normalized
          ELSE (0.0 - prior.price) * prior.shares_normalized
        END
      ELSE 0 
    END) as L_total_pnl_usd,
    
    -- Invested in resolved trades
    SUM(CASE 
      WHEN prior.winning_label IS NOT NULL 
        AND (
          (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
          OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
        )
      THEN prior.trade_size_usd 
      ELSE 0 
    END) as L_resolved_invested_usd,
    
    -- D30 STATS: trades in last 30 days that resolved
    COUNTIF(
      prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY)
      AND prior.winning_label IS NOT NULL 
      AND (
        (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
        OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
      )
    ) as D30_resolved_count,
    
    SUM(CASE 
      WHEN prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY)
        AND prior.winning_label IS NOT NULL 
        AND (
          (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
          OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
        )
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as D30_wins,
    
    -- D7 STATS: trades in last 7 days that resolved
    COUNTIF(
      prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 7 DAY)
      AND prior.winning_label IS NOT NULL 
      AND (
        (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
        OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
      )
    ) as D7_resolved_count,
    
    SUM(CASE 
      WHEN prior.trade_time >= TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 7 DAY)
        AND prior.winning_label IS NOT NULL 
        AND (
          (prior.resolution_time IS NOT NULL AND prior.resolution_time < current_trade.trade_time)
          OR (prior.resolution_time IS NULL AND prior.trade_time < TIMESTAMP_SUB(current_trade.trade_time, INTERVAL 30 DAY))
        )
        AND LOWER(prior.token_label) = LOWER(prior.winning_label)
      THEN 1 ELSE 0 
    END) as D7_wins

  FROM trades_with_outcome current_trade
  LEFT JOIN trades_with_outcome prior
    ON current_trade.wallet_address = prior.wallet_address
    AND prior.trade_time < current_trade.trade_time  -- STRICTLY before
  GROUP BY ALL
)

-- ============================================================================
-- Step 3: Calculate final metrics
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
    ELSE 'LOST'
  END as outcome,
  
  -- Point-in-time stats (from prior trades ONLY)
  L_trade_count,
  L_resolved_count,
  D30_resolved_count,
  D7_resolved_count,
  
  -- Win rates (with sensible defaults)
  CASE WHEN L_resolved_count >= 10 THEN CAST(L_wins AS FLOAT64) / L_resolved_count 
       WHEN L_resolved_count > 0 THEN CAST(L_wins AS FLOAT64) / L_resolved_count
       ELSE 0.5 
  END as L_win_rate,
  
  CASE WHEN D30_resolved_count > 0 THEN CAST(D30_wins AS FLOAT64) / D30_resolved_count ELSE NULL END as D30_win_rate,
  CASE WHEN D7_resolved_count > 0 THEN CAST(D7_wins AS FLOAT64) / D7_resolved_count ELSE NULL END as D7_win_rate,
  
  -- ROI
  CASE WHEN L_resolved_invested_usd > 0 THEN L_total_pnl_usd / L_resolved_invested_usd ELSE 0 END as L_roi_pct,
  L_total_pnl_usd,
  
  -- Confidence indicator: do we have enough history?
  CASE 
    WHEN L_resolved_count >= 100 THEN 'HIGH'
    WHEN L_resolved_count >= 30 THEN 'MEDIUM'
    WHEN L_resolved_count >= 10 THEN 'LOW'
    ELSE 'INSUFFICIENT'
  END as stat_confidence

FROM stats_per_trade;
