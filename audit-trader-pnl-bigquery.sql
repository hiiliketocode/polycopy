-- BigQuery Audit Query for Trader P&L Discrepancy
-- Trader: 0xc257ea7e3a81ca8e16df8935d44d513959fa358e
-- Purpose: Calculate realized P&L from trades and compare with frontend display

DECLARE trader_wallet STRING DEFAULT '0xc257ea7e3a81ca8e16df8935d44d513959fa358e';

-- Get all trades with market resolution info
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

-- Calculate realized P&L from resolved BUY positions
resolved_buy_pnl AS (
  SELECT 
    condition_id,
    token_label,
    price as entry_price,
    size,
    market_status,
    winning_label,
    CASE 
      WHEN market_status = 'resolved' AND token_label = winning_label THEN 
        (1.0 - price) * size  -- Win: exit at 1.0
      WHEN market_status = 'resolved' AND token_label != winning_label THEN 
        (0.0 - price) * size  -- Loss: exit at 0.0
      ELSE NULL
    END as resolved_pnl
  FROM all_trades
  WHERE side = 'BUY'
    AND market_status = 'resolved'
),

-- Summary statistics
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

resolved_summary AS (
  SELECT 
    COUNT(*) as resolved_positions,
    SUM(resolved_pnl) as total_resolved_pnl,
    COUNTIF(resolved_pnl > 0) as winning_positions,
    COUNTIF(resolved_pnl <= 0 AND resolved_pnl IS NOT NULL) as losing_positions,
    MAX(resolved_pnl) as biggest_win,
    MIN(resolved_pnl) as biggest_loss
  FROM resolved_buy_pnl
  WHERE resolved_pnl IS NOT NULL
),

-- Calculate open positions (BUYs minus SELLs)
position_summary AS (
  SELECT 
    condition_id,
    token_label,
    SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_position_size,
    SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_cost,
    MAX(market_status) as current_market_status,
    MAX(winning_label) as current_winning_label,
    MAX(market_title) as market_title
  FROM all_trades
  GROUP BY condition_id, token_label
  HAVING SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) > 0.0001
)

-- Output results
SELECT '=== TRADE SUMMARY ===' as section, '' as metric, NULL as value
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Trades', CAST(total_trades AS FLOAT64) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Buy Trades', CAST(buy_trades AS FLOAT64) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Sell Trades', CAST(sell_trades AS FLOAT64) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Volume (USD)', total_volume FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Sell Value (USD)', total_sell_value FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'First Trade', NULL FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Last Trade', NULL FROM trade_summary

UNION ALL
SELECT '=== REALIZED P&L (FROM RESOLVED MARKETS) ===' as section, '' as metric, NULL as value
UNION ALL
SELECT 'REALIZED P&L', 'Resolved Positions', CAST(resolved_positions AS FLOAT64) FROM resolved_summary
UNION ALL
SELECT 'REALIZED P&L', 'Total Realized P&L (USD)', total_resolved_pnl FROM resolved_summary
UNION ALL
SELECT 'REALIZED P&L', 'Winning Positions', CAST(winning_positions AS FLOAT64) FROM resolved_summary
UNION ALL
SELECT 'REALIZED P&L', 'Losing Positions', CAST(losing_positions AS FLOAT64) FROM resolved_summary
UNION ALL
SELECT 'REALIZED P&L', 'Biggest Win (USD)', biggest_win FROM resolved_summary
UNION ALL
SELECT 'REALIZED P&L', 'Biggest Loss (USD)', biggest_loss FROM resolved_summary

UNION ALL
SELECT '=== OPEN POSITIONS ===' as section, '' as metric, NULL as value
UNION ALL
SELECT 'OPEN POSITIONS', 'Open Positions Count', CAST(COUNT(*) AS FLOAT64) FROM position_summary
UNION ALL
SELECT 'OPEN POSITIONS', 'Total Open Cost (USD)', SUM(total_cost) FROM position_summary

ORDER BY section, metric;
