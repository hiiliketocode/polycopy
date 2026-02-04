-- Comprehensive BigQuery Audit Query for Trader P&L
-- Trader: 0xc257ea7e3a81ca8e16df8935d44d513959fa358e
-- Purpose: Calculate realized P&L using FIFO logic (matching SELLs to BUYs) and resolved markets
-- Correct approach: Aggregate positions first, then calculate P&L from resolved markets

DECLARE trader_wallet STRING DEFAULT '0xc257ea7e3a81ca8e16df8935d44d513959fa358e';

-- Step 1: Get all trades with market resolution info
WITH all_trades AS (
  SELECT 
    t.timestamp,
    t.side,
    t.price,
    t.shares_normalized as size,
    t.condition_id,
    t.token_label,
    t.token_id,
    t.tx_hash,
    t.order_hash,
    m.status as market_status,
    m.winning_label,
    m.title as market_title,
    t.price * t.shares_normalized as trade_value_usd
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
    ON t.condition_id = m.condition_id
  WHERE LOWER(t.wallet_address) = LOWER(trader_wallet)
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
  ORDER BY t.timestamp ASC
),

-- Step 2: Calculate net positions per condition_id + token_label
-- This aggregates all BUYs and SELLs to get the final position
position_summary AS (
  SELECT 
    condition_id,
    token_label,
    -- Net position size (BUYs - SELLs)
    SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_position_size,
    -- Total cost basis (from BUYs only)
    SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_cost,
    -- Total proceeds (from SELLs only)
    SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_proceeds,
    -- Average entry price (weighted by size)
    CASE 
      WHEN SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END) > 0 THEN
        SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) / 
        SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END)
      ELSE NULL
    END as avg_entry_price,
    -- Market resolution info (take from any trade, they should all have the same)
    MAX(market_status) as market_status,
    MAX(winning_label) as winning_label,
    MAX(market_title) as market_title,
    COUNT(*) as total_trades,
    COUNTIF(side = 'BUY') as buy_count,
    COUNTIF(side = 'SELL') as sell_count
  FROM all_trades
  GROUP BY condition_id, token_label
),

-- Step 3: Calculate realized P&L from SELL trades
-- For each SELL, match against BUYs using FIFO/average cost basis
sell_realized_pnl AS (
  SELECT 
    s.condition_id,
    s.token_label,
    s.timestamp,
    s.price as sell_price,
    s.size as sell_size,
    s.trade_value_usd as sell_proceeds,
    -- Get average cost basis from all BUYs up to this point
    (
      SELECT AVG(b.price)
      FROM all_trades b
      WHERE b.condition_id = s.condition_id
        AND b.token_label = s.token_label
        AND b.side = 'BUY'
        AND b.timestamp <= s.timestamp
    ) as avg_cost_basis,
    -- Calculate realized P&L
    (s.price - COALESCE((
      SELECT AVG(b.price)
      FROM all_trades b
      WHERE b.condition_id = s.condition_id
        AND b.token_label = s.token_label
        AND b.side = 'BUY'
        AND b.timestamp <= s.timestamp
    ), s.price)) * s.size as realized_pnl
  FROM all_trades s
  WHERE s.side = 'SELL'
),

-- Step 4: Calculate realized P&L from resolved markets
-- For positions that resolved (went to $0 or $1), calculate P&L on net position
resolved_realized_pnl AS (
  SELECT 
    condition_id,
    token_label,
    net_position_size,
    total_cost,
    avg_entry_price,
    market_status,
    winning_label,
    market_title,
    -- Calculate P&L if market is closed/resolved and we have a net position
    -- Market is resolved if status = 'closed' AND winning_label IS NOT NULL
    CASE 
      WHEN market_status = 'closed' 
        AND winning_label IS NOT NULL
        AND net_position_size > 0.0001  -- Has remaining position
        AND avg_entry_price IS NOT NULL THEN
        CASE 
          WHEN token_label = winning_label THEN 
            -- Win: exit at $1.00, P&L = (1.0 - entry_price) * net_position_size
            (1.0 - avg_entry_price) * net_position_size
          ELSE 
            -- Loss: exit at $0.00, P&L = (0.0 - entry_price) * net_position_size
            (0.0 - avg_entry_price) * net_position_size
        END
      ELSE NULL
    END as resolved_pnl
  FROM position_summary
  WHERE market_status = 'closed' AND winning_label IS NOT NULL
),

-- Step 5: Aggregate summaries
trade_summary AS (
  SELECT 
    COUNT(*) as total_trades,
    COUNTIF(side = 'BUY') as buy_trades,
    COUNTIF(side = 'SELL') as sell_trades,
    SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_volume,
    SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_sell_value,
    MIN(timestamp) as first_trade,
    MAX(timestamp) as last_trade
  FROM all_trades
),

sell_pnl_summary AS (
  SELECT 
    COUNT(*) as sell_count,
    SUM(realized_pnl) as total_sell_pnl,
    COUNTIF(realized_pnl > 0) as profitable_sells,
    COUNTIF(realized_pnl <= 0) as unprofitable_sells
  FROM sell_realized_pnl
  WHERE realized_pnl IS NOT NULL
),

resolved_pnl_summary AS (
  SELECT 
    COUNT(*) as resolved_count,
    SUM(resolved_pnl) as total_resolved_pnl,
    COUNTIF(resolved_pnl > 0) as winning_resolutions,
    COUNTIF(resolved_pnl <= 0 AND resolved_pnl IS NOT NULL) as losing_resolutions,
    MAX(resolved_pnl) as biggest_win,
    MIN(resolved_pnl) as biggest_loss,
    -- Also show breakdown
    SUM(CASE WHEN token_label = winning_label THEN resolved_pnl ELSE 0 END) as wins_total,
    SUM(CASE WHEN token_label != winning_label THEN resolved_pnl ELSE 0 END) as losses_total
  FROM resolved_realized_pnl
  WHERE resolved_pnl IS NOT NULL
),

-- Step 6: Calculate open positions (not resolved)
open_positions AS (
  SELECT 
    condition_id,
    token_label,
    net_position_size,
    total_cost,
    market_status,
    winning_label,
    market_title
  FROM position_summary
  WHERE (market_status IS NULL OR market_status = 'open' OR (market_status = 'closed' AND winning_label IS NULL))
    AND net_position_size > 0.0001
)

-- Final output
SELECT '=== TRADE SUMMARY ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Trades', CAST(total_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Buy Trades', CAST(buy_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Sell Trades', CAST(sell_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Volume (USD)', CAST(ROUND(total_volume, 2) AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Sell Value (USD)', CAST(ROUND(total_sell_value, 2) AS STRING) FROM trade_summary

UNION ALL
SELECT '=== REALIZED P&L FROM SELLS ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'SELL P&L', 'Sell Count', CAST(sell_count AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Total Realized P&L from Sells (USD)', CAST(ROUND(total_sell_pnl, 2) AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Profitable Sells', CAST(profitable_sells AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Unprofitable Sells', CAST(unprofitable_sells AS STRING) FROM sell_pnl_summary

UNION ALL
SELECT '=== REALIZED P&L FROM RESOLVED MARKETS ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'RESOLVED P&L', 'Resolved Positions', CAST(resolved_count AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Total Realized P&L from Resolutions (USD)', CAST(ROUND(total_resolved_pnl, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Winning Resolutions', CAST(winning_resolutions AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Losing Resolutions', CAST(losing_resolutions AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Wins Total (USD)', CAST(ROUND(wins_total, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Losses Total (USD)', CAST(ROUND(losses_total, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Biggest Win (USD)', CAST(ROUND(biggest_win, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Biggest Loss (USD)', CAST(ROUND(biggest_loss, 2) AS STRING) FROM resolved_pnl_summary

UNION ALL
SELECT '=== TOTAL REALIZED P&L ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'TOTAL REALIZED', 'Total Realized P&L (USD)', CAST(ROUND(
  COALESCE((SELECT total_sell_pnl FROM sell_pnl_summary), 0) + 
  COALESCE((SELECT total_resolved_pnl FROM resolved_pnl_summary), 0), 
  2
) AS STRING)

UNION ALL
SELECT '=== OPEN POSITIONS ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'OPEN POSITIONS', 'Open Positions Count', CAST(COUNT(*) AS STRING) FROM open_positions
UNION ALL
SELECT 'OPEN POSITIONS', 'Total Open Cost (USD)', CAST(ROUND(SUM(total_cost), 2) AS STRING) FROM open_positions

ORDER BY category, metric;
