-- ============================================================================
-- ML STAGE 1.3: CREATE POINT-IN-TIME STATS (BATCHED APPROACH)
-- ============================================================================
-- Process year by year to avoid expensive full self-join
-- This version uses an optimized window function approach
-- ============================================================================

-- First, create the base table (empty)
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_stats_at_trade` (
  trade_key STRING,
  wallet_address STRING,
  trade_time TIMESTAMP,
  condition_id STRING,
  token_label STRING,
  entry_price FLOAT64,
  trade_size_usd FLOAT64,
  winning_label STRING,
  outcome STRING,
  L_trade_count INT64,
  L_resolved_count INT64,
  L_wins INT64,
  L_win_rate FLOAT64,
  D30_resolved_count INT64,
  D30_wins INT64,
  D30_win_rate FLOAT64,
  D7_resolved_count INT64,
  D7_wins INT64,
  D7_win_rate FLOAT64,
  L_roi_pct FLOAT64,
  L_total_pnl_usd FLOAT64,
  stat_confidence STRING
);
