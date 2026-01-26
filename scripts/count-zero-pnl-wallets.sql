-- Count wallets with all-zero realized PnL
-- This query efficiently counts wallets where all rows have zero PnL values

WITH wallet_stats AS (
  SELECT 
    wallet_address,
    COUNT(*) as total_rows,
    COUNT(CASE WHEN ABS(realized_pnl) >= 0.01 OR ABS(pnl_to_date) >= 0.01 THEN 1 END) as non_zero_rows
  FROM wallet_realized_pnl_daily
  GROUP BY wallet_address
)
SELECT 
  COUNT(*) FILTER (WHERE non_zero_rows = 0) as all_zero_wallets,
  COUNT(*) FILTER (WHERE non_zero_rows > 0) as wallets_with_non_zero,
  COUNT(*) as total_wallets,
  SUM(total_rows) FILTER (WHERE non_zero_rows = 0) as total_zero_rows,
  SUM(total_rows) FILTER (WHERE non_zero_rows > 0) as total_non_zero_rows,
  ROUND(
    (COUNT(*) FILTER (WHERE non_zero_rows = 0)::numeric / COUNT(*)::numeric) * 100, 
    2
  ) as percentage_all_zeros
FROM wallet_stats;

-- Optional: List the first 20 wallets with all zeros
-- Uncomment to see sample wallets:
/*
WITH wallet_stats AS (
  SELECT 
    wallet_address,
    COUNT(*) as total_rows,
    COUNT(CASE WHEN ABS(realized_pnl) >= 0.01 OR ABS(pnl_to_date) >= 0.01 THEN 1 END) as non_zero_rows
  FROM wallet_realized_pnl_daily
  GROUP BY wallet_address
)
SELECT 
  wallet_address,
  total_rows
FROM wallet_stats
WHERE non_zero_rows = 0
ORDER BY wallet_address
LIMIT 20;
*/
