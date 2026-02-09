-- ============================================================================
-- ML STAGE 1.3: EFFICIENT POINT-IN-TIME STATS
-- ============================================================================
-- This approach uses window functions with a smart pre-computation step
-- 
-- Key insight: Instead of self-joining, we:
-- 1. Compute each trade's outcome and resolution time
-- 2. Use window functions to get running totals
-- 3. Adjust for trades that resolved AFTER the current trade
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` AS

WITH 
-- ============================================================================
-- Step 1: Prepare all trades with outcome data
-- ============================================================================
trades_prepared AS (
  SELECT
    t.wallet_address,
    t.timestamp as trade_time,
    t.condition_id,
    t.token_label,
    t.price as entry_price,
    t.price * t.shares_normalized as trade_size_usd,
    t.shares_normalized,
    m.winning_label,
    -- Resolution time (when we learn the outcome)
    COALESCE(m.completed_time, m.close_time, m.end_time) as resolution_time,
    -- Is this trade a win?
    LOWER(t.token_label) = LOWER(m.winning_label) as is_win,
    -- PnL for this trade
    CASE 
      WHEN LOWER(t.token_label) = LOWER(m.winning_label)
        THEN (1.0 - t.price) * t.shares_normalized
      ELSE (0.0 - t.price) * t.shares_normalized
    END as pnl_usd,
    -- Unique key
    CONCAT(t.wallet_address, '|', t.condition_id, '|', CAST(t.timestamp AS STRING)) as trade_key
  FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup` t
  JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
  WHERE m.winning_label IS NOT NULL  -- Only resolved markets
),

-- ============================================================================
-- Step 2: Add running totals using window functions
-- These are "naive" running totals that don't account for resolution timing
-- ============================================================================
trades_with_running_totals AS (
  SELECT
    *,
    -- Running count of all prior trades
    COUNT(*) OVER (
      PARTITION BY wallet_address 
      ORDER BY trade_time 
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) as naive_prior_count,
    
    -- Running sum of wins (naive - includes unresolved)
    SUM(CASE WHEN is_win THEN 1 ELSE 0 END) OVER (
      PARTITION BY wallet_address 
      ORDER BY trade_time 
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ) as naive_prior_wins,
    
    -- Row number for this trader
    ROW_NUMBER() OVER (
      PARTITION BY wallet_address 
      ORDER BY trade_time
    ) as trade_sequence
    
  FROM trades_prepared
),

-- ============================================================================
-- Step 3: For each trade, count how many prior trades had resolved
-- This is the key step that fixes the look-ahead bias
-- We need to subtract trades that resolved AFTER the current trade
-- ============================================================================
trades_with_resolved_adjustment AS (
  SELECT
    current_t.*,
    
    -- Count prior trades that resolved AFTER current trade (shouldn't be counted)
    -- These are trades where: prior.trade_time < current.trade_time 
    --                    AND prior.resolution_time >= current.trade_time
    (
      SELECT COUNT(*)
      FROM trades_prepared prior
      WHERE prior.wallet_address = current_t.wallet_address
        AND prior.trade_time < current_t.trade_time
        AND (
          prior.resolution_time >= current_t.trade_time
          OR (prior.resolution_time IS NULL AND prior.trade_time >= TIMESTAMP_SUB(current_t.trade_time, INTERVAL 30 DAY))
        )
    ) as unresolved_prior_count,
    
    -- Count prior WINS that resolved AFTER current trade
    (
      SELECT SUM(CASE WHEN prior.is_win THEN 1 ELSE 0 END)
      FROM trades_prepared prior
      WHERE prior.wallet_address = current_t.wallet_address
        AND prior.trade_time < current_t.trade_time
        AND (
          prior.resolution_time >= current_t.trade_time
          OR (prior.resolution_time IS NULL AND prior.trade_time >= TIMESTAMP_SUB(current_t.trade_time, INTERVAL 30 DAY))
        )
    ) as unresolved_prior_wins
    
  FROM trades_with_running_totals current_t
)

-- ============================================================================
-- Step 4: Calculate final point-in-time metrics
-- ============================================================================
SELECT
  trade_key,
  wallet_address,
  trade_time,
  condition_id,
  token_label,
  entry_price,
  trade_size_usd,
  winning_label,
  
  -- Outcome for THIS trade
  CASE WHEN is_win THEN 'WON' ELSE 'LOST' END as outcome,
  
  -- Prior trades count (all prior)
  COALESCE(naive_prior_count, 0) as L_trade_count,
  
  -- Resolved prior trades (subtract those that hadn't resolved yet)
  GREATEST(0, COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0)) as L_resolved_count,
  
  -- Wins among resolved
  GREATEST(0, COALESCE(naive_prior_wins, 0) - COALESCE(unresolved_prior_wins, 0)) as L_wins,
  
  -- Win rate
  CASE 
    WHEN COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0) > 0
    THEN (COALESCE(naive_prior_wins, 0) - COALESCE(unresolved_prior_wins, 0)) * 1.0 / 
         (COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0))
    ELSE 0.5
  END as L_win_rate,
  
  -- D30 stats (placeholder - would need similar logic)
  0 as D30_resolved_count,
  0 as D30_wins,
  CAST(NULL AS FLOAT64) as D30_win_rate,
  
  -- D7 stats (placeholder)
  0 as D7_resolved_count,
  0 as D7_wins,
  CAST(NULL AS FLOAT64) as D7_win_rate,
  
  -- ROI (simplified)
  0.0 as L_roi_pct,
  0.0 as L_total_pnl_usd,
  
  -- Confidence
  CASE 
    WHEN COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0) >= 100 THEN 'HIGH'
    WHEN COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0) >= 30 THEN 'MEDIUM'
    WHEN COALESCE(naive_prior_count, 0) - COALESCE(unresolved_prior_count, 0) >= 10 THEN 'LOW'
    ELSE 'INSUFFICIENT'
  END as stat_confidence

FROM trades_with_resolved_adjustment;
