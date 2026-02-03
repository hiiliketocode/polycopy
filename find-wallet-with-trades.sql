-- Find a wallet that actually has trades to test with
-- Run this first to get a valid test wallet

SELECT 
  wallet_address,
  COUNT(*) as total_trades,
  COUNTIF(side = 'BUY') as buy_trades,
  COUNTIF(side = 'SELL') as sell_trades,
  COUNT(DISTINCT condition_id) as unique_markets,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE side = 'BUY'
  AND price IS NOT NULL
  AND shares_normalized IS NOT NULL
GROUP BY wallet_address
HAVING total_trades >= 5  -- At least 5 trades
ORDER BY total_trades DESC
LIMIT 10;
