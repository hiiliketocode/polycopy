-- ============================================================================
-- ML STAGE 1.3: CREATE TRADER_STATS_DAILY TABLE
-- ============================================================================
-- Purpose: Daily snapshots of each trader's cumulative stats
-- This enables point-in-time feature calculation for any historical trade
--
-- For a trade on 2024-06-15, we can look up what the trader's stats were
-- as of 2024-06-14 (the day before) - this is TRUE point-in-time data
--
-- Estimated rows: ~1,408 traders × ~814 days = ~188K rows
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_daily` AS

WITH 
-- ============================================================================
-- Step 1: Get all unique dates we have trades for
-- ============================================================================
all_dates AS (
  SELECT DISTINCT DATE(timestamp) as stat_date
  FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup`
),

-- ============================================================================
-- Step 2: Get all trades with outcome information (resolved markets only)
-- ============================================================================
trades_with_outcome AS (
  SELECT
    t.wallet_address,
    DATE(t.timestamp) as trade_date,
    t.timestamp,
    t.condition_id,
    t.price,
    t.shares_normalized,
    t.price * t.shares_normalized as trade_size_usd,
    m.winning_label,
    m.end_time as resolution_time,
    -- Is this a winning trade?
    CASE 
      WHEN LOWER(t.token_label) = LOWER(m.winning_label) THEN 1 
      ELSE 0 
    END as is_win,
    -- PnL for this trade (only if market resolved)
    CASE 
      WHEN m.winning_label IS NOT NULL THEN
        CASE 
          WHEN LOWER(t.token_label) = LOWER(m.winning_label) 
            THEN (1.0 - t.price) * t.shares_normalized
          ELSE (0.0 - t.price) * t.shares_normalized
        END
      ELSE NULL
    END as pnl_usd
  FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup` t
  JOIN `gen-lang-client-0299056258.polycopy_v1.markets_dedup` m
    ON t.condition_id = m.condition_id
),

-- ============================================================================
-- Step 3: For each trader, get all dates they were active on or before
-- ============================================================================
trader_dates AS (
  SELECT DISTINCT
    t.wallet_address,
    d.stat_date
  FROM trades_with_outcome t
  CROSS JOIN all_dates d
  WHERE d.stat_date >= DATE(t.timestamp)  -- Only dates after first trade
),

-- ============================================================================
-- Step 4: Calculate cumulative stats for each trader as of each date
-- This is the point-in-time calculation
-- ============================================================================
daily_stats AS (
  SELECT
    td.wallet_address,
    td.stat_date,
    
    -- LIFETIME STATS (all trades before this date, resolved before this date)
    -- Note: We only count resolved trades for win rate
    COUNT(CASE WHEN DATE(t.timestamp) < td.stat_date THEN 1 END) as L_trade_count,
    
    COUNTIF(
      DATE(t.timestamp) < td.stat_date 
      AND t.winning_label IS NOT NULL 
      AND DATE(t.resolution_time) < td.stat_date
    ) as L_resolved_count,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) < td.stat_date 
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.is_win 
      ELSE 0 
    END) as L_wins,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) < td.stat_date 
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.pnl_usd 
      ELSE 0 
    END) as L_total_pnl_usd,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) < td.stat_date 
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.trade_size_usd 
      ELSE 0 
    END) as L_resolved_invested_usd,
    
    -- D30 STATS (trades in 30 days before this date, resolved before this date)
    COUNTIF(
      DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 30 DAY)
      AND DATE(t.timestamp) < td.stat_date
      AND t.winning_label IS NOT NULL 
      AND DATE(t.resolution_time) < td.stat_date
    ) as D30_resolved_count,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 30 DAY)
        AND DATE(t.timestamp) < td.stat_date
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.is_win 
      ELSE 0 
    END) as D30_wins,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 30 DAY)
        AND DATE(t.timestamp) < td.stat_date
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.pnl_usd 
      ELSE 0 
    END) as D30_total_pnl_usd,
    
    -- D7 STATS (trades in 7 days before this date, resolved before this date)
    COUNTIF(
      DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 7 DAY)
      AND DATE(t.timestamp) < td.stat_date
      AND t.winning_label IS NOT NULL 
      AND DATE(t.resolution_time) < td.stat_date
    ) as D7_resolved_count,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 7 DAY)
        AND DATE(t.timestamp) < td.stat_date
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.is_win 
      ELSE 0 
    END) as D7_wins,
    
    SUM(CASE 
      WHEN DATE(t.timestamp) >= DATE_SUB(td.stat_date, INTERVAL 7 DAY)
        AND DATE(t.timestamp) < td.stat_date
        AND t.winning_label IS NOT NULL 
        AND DATE(t.resolution_time) < td.stat_date
      THEN t.pnl_usd 
      ELSE 0 
    END) as D7_total_pnl_usd
    
  FROM trader_dates td
  LEFT JOIN trades_with_outcome t ON t.wallet_address = td.wallet_address
  GROUP BY td.wallet_address, td.stat_date
)

-- ============================================================================
-- Step 5: Calculate final metrics
-- ============================================================================
SELECT
  wallet_address,
  stat_date,
  
  -- Trade counts
  L_trade_count,
  L_resolved_count,
  D30_resolved_count,
  D7_resolved_count,
  
  -- Win rates (avoid division by zero)
  CASE WHEN L_resolved_count > 0 THEN L_wins / L_resolved_count ELSE NULL END as L_win_rate,
  CASE WHEN D30_resolved_count > 0 THEN D30_wins / D30_resolved_count ELSE NULL END as D30_win_rate,
  CASE WHEN D7_resolved_count > 0 THEN D7_wins / D7_resolved_count ELSE NULL END as D7_win_rate,
  
  -- ROI (PnL / invested, only for resolved trades)
  CASE WHEN L_resolved_invested_usd > 0 THEN L_total_pnl_usd / L_resolved_invested_usd ELSE NULL END as L_roi_pct,
  
  -- Raw PnL
  L_total_pnl_usd,
  D30_total_pnl_usd,
  D7_total_pnl_usd

FROM daily_stats
WHERE L_trade_count > 0  -- Only keep dates where trader had prior trades
ORDER BY wallet_address, stat_date;
