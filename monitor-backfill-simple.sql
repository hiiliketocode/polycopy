SELECT 
  'Staging Table' as table_name,
  COUNT(*) as trade_count,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades_staging`

UNION ALL

SELECT 
  'Production Table' as table_name,
  COUNT(*) as trade_count,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades`

UNION ALL

SELECT 
  'Completed Wallets' as table_name,
  COUNT(*) as trade_count,
  NULL as earliest_trade,
  NULL as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint`
WHERE completed = true

ORDER BY table_name;
