-- Query trades added today to BigQuery
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade,
  COUNT(DISTINCT DATE(timestamp)) as unique_dates
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = CURRENT_DATE()
  OR DATE(_PARTITIONTIME) = CURRENT_DATE()
