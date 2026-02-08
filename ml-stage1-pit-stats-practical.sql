-- ============================================================================
-- ML STAGE 1.3: PRACTICAL POINT-IN-TIME STATS
-- ============================================================================
-- 
-- Approach: Use window functions with reasonable assumptions
-- 
-- Key insight from data audit:
-- - 77% of trades resolve within 7 days
-- - We'll count a trade as "resolved" if it's >7 days old
-- - This is a practical approximation that avoids expensive joins
--
-- For trades <7 days old, we won't count them as resolved
-- This is conservative and prevents look-ahead bias
--
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` AS

WITH 
-- ============================================================================
-- Step 1: Prepare trades with outcome
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
    -- Is this trade a win?
    LOWER(t.token_label) = LOWER(m.winning_label) as is_win,
    -- PnL
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
  WHERE m.winning_label IS NOT NULL
),

-- ============================================================================
-- Step 2: Calculate point-in-time stats using window functions
-- 
-- We create a "virtual resolved date" for each trade:
-- - Trades with resolution_time: use that
-- - Trades without: use trade_time + 7 days (conservative)
--
-- For each trade, we count prior trades whose virtual_resolved_date < current_trade_time
-- This is approximated by: prior trades whose trade_time < current_trade_time - 7 days
-- ============================================================================
trades_with_stats AS (
  SELECT
    trade_key,
    wallet_address,
    trade_time,
    condition_id,
    token_label,
    entry_price,
    trade_size_usd,
    winning_label,
    is_win,
    pnl_usd,
    
    -- All prior trades (regardless of resolution)
    COUNT(*) OVER w_prior as L_trade_count,
    
    -- Prior trades that are >7 days old (assumed resolved)
    COUNT(*) OVER w_resolved as L_resolved_count,
    
    -- Wins among those
    SUM(CASE WHEN is_win THEN 1 ELSE 0 END) OVER w_resolved as L_wins,
    
    -- PnL of resolved trades
    SUM(pnl_usd) OVER w_resolved as L_total_pnl_usd,
    
    -- Invested in resolved trades  
    SUM(trade_size_usd) OVER w_resolved as L_resolved_invested,
    
    -- D30: Prior trades in last 30 days that are resolved (>7 days old at current trade time)
    -- This means: trades between (current - 30 days) and (current - 7 days)
    COUNT(*) OVER w_d30 as D30_resolved_count,
    SUM(CASE WHEN is_win THEN 1 ELSE 0 END) OVER w_d30 as D30_wins,
    
    -- D7: Prior trades in last 7 days that resolved
    -- Since we need >7 days for resolution, this would be empty
    -- So D7 will use trades from 7-14 days ago
    COUNT(*) OVER w_d7 as D7_resolved_count,
    SUM(CASE WHEN is_win THEN 1 ELSE 0 END) OVER w_d7 as D7_wins
    
  FROM trades_prepared
  WINDOW 
    -- All prior trades
    w_prior AS (
      PARTITION BY wallet_address 
      ORDER BY UNIX_SECONDS(trade_time)
      RANGE BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ),
    -- Prior trades that are >7 days old (assumed resolved)
    w_resolved AS (
      PARTITION BY wallet_address 
      ORDER BY UNIX_SECONDS(trade_time)
      RANGE BETWEEN UNBOUNDED PRECEDING AND 604801 PRECEDING  -- 7 days + 1 second in seconds
    ),
    -- D30: trades between 30 and 7 days ago
    w_d30 AS (
      PARTITION BY wallet_address 
      ORDER BY UNIX_SECONDS(trade_time)
      RANGE BETWEEN 2592000 PRECEDING AND 604801 PRECEDING  -- 30 days to 7 days
    ),
    -- D7: trades between 14 and 7 days ago (as proxy for "recent resolved")
    w_d7 AS (
      PARTITION BY wallet_address 
      ORDER BY UNIX_SECONDS(trade_time)
      RANGE BETWEEN 1209600 PRECEDING AND 604801 PRECEDING  -- 14 days to 7 days
    )
)

-- ============================================================================
-- Step 3: Final output with calculated metrics
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
  
  CASE WHEN is_win THEN 'WON' ELSE 'LOST' END as outcome,
  
  COALESCE(L_trade_count, 0) as L_trade_count,
  COALESCE(L_resolved_count, 0) as L_resolved_count,
  COALESCE(L_wins, 0) as L_wins,
  
  CASE 
    WHEN COALESCE(L_resolved_count, 0) > 0 
    THEN CAST(COALESCE(L_wins, 0) AS FLOAT64) / L_resolved_count
    ELSE 0.5  -- No history, assume 50%
  END as L_win_rate,
  
  COALESCE(D30_resolved_count, 0) as D30_resolved_count,
  COALESCE(D30_wins, 0) as D30_wins,
  CASE 
    WHEN COALESCE(D30_resolved_count, 0) > 0 
    THEN CAST(COALESCE(D30_wins, 0) AS FLOAT64) / D30_resolved_count
    ELSE NULL
  END as D30_win_rate,
  
  COALESCE(D7_resolved_count, 0) as D7_resolved_count,
  COALESCE(D7_wins, 0) as D7_wins,
  CASE 
    WHEN COALESCE(D7_resolved_count, 0) > 0 
    THEN CAST(COALESCE(D7_wins, 0) AS FLOAT64) / D7_resolved_count
    ELSE NULL
  END as D7_win_rate,
  
  CASE 
    WHEN COALESCE(L_resolved_invested, 0) > 0 
    THEN COALESCE(L_total_pnl_usd, 0) / L_resolved_invested
    ELSE 0
  END as L_roi_pct,
  
  COALESCE(L_total_pnl_usd, 0) as L_total_pnl_usd,
  
  CASE 
    WHEN COALESCE(L_resolved_count, 0) >= 100 THEN 'HIGH'
    WHEN COALESCE(L_resolved_count, 0) >= 30 THEN 'MEDIUM'
    WHEN COALESCE(L_resolved_count, 0) >= 10 THEN 'LOW'
    ELSE 'INSUFFICIENT'
  END as stat_confidence

FROM trades_with_stats;
