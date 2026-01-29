-- Monitor Backfill Job Progress
-- Run this query to see current status

-- 1. Staging table count (trades being loaded)
SELECT 
  'Staging Table' as table_name,
  COUNT(*) as trade_count,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades_staging`

UNION ALL

-- 2. Production table count (final destination)
SELECT 
  'Production Table' as table_name,
  COUNT(*) as trade_count,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades`

UNION ALL

-- 3. Completed wallets count
SELECT 
  'Completed Wallets' as table_name,
  COUNT(*) as trade_count,
  NULL as earliest_trade,
  NULL as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint`
WHERE completed = true

ORDER BY table_name;
