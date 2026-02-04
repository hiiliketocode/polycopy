-- SQL query to identify wallets missing from trader_global_stats
-- Run this in BigQuery to see which wallets need stats calculated

-- Step 1: Get all wallets from traders table (if available in BigQuery)
-- OR get all unique wallets from trades table
WITH all_wallets AS (
  SELECT DISTINCT LOWER(wallet_address) as wallet_address
  FROM `gen-lang-client-0299056258.polycopy_v1.trades`
  WHERE wallet_address IS NOT NULL
),

existing_stats AS (
  SELECT DISTINCT LOWER(wallet_address) as wallet_address
  FROM `gen-lang-client-0299056258.polycopy_v1.trader_global_stats`
)

-- Find missing wallets
SELECT 
  a.wallet_address,
  COUNT(DISTINCT t.condition_id) as markets_traded,
  COUNT(*) as total_trades,
  COUNTIF(t.side = 'BUY') as buy_trades,
  MIN(t.timestamp) as first_trade,
  MAX(t.timestamp) as last_trade
FROM all_wallets a
LEFT JOIN existing_stats e ON a.wallet_address = e.wallet_address
LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t 
  ON LOWER(t.wallet_address) = a.wallet_address
WHERE e.wallet_address IS NULL  -- Missing from stats table
GROUP BY a.wallet_address
ORDER BY total_trades DESC
LIMIT 100;

-- This will show wallets that have trades but are missing from trader_global_stats
