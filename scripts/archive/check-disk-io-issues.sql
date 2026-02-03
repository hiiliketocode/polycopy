-- Check for Disk IO issues and missing indexes
-- Run this in Supabase SQL Editor

-- 1. Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- 2. Check indexes on trades_public
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'trades_public'
ORDER BY indexname;

-- 3. Check for missing indexes on frequently queried columns
-- (These are columns used in WHERE clauses in the codebase)
SELECT 
  'trades_public.trade_id' AS column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trades_public' 
    AND indexdef LIKE '%trade_id%'
  ) THEN '✅ Indexed' ELSE '❌ Missing index' END AS status
UNION ALL
SELECT 
  'trades_public.trader_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trades_public' 
    AND indexdef LIKE '%trader_id%'
  ) THEN '✅ Indexed' ELSE '❌ Missing index' END
UNION ALL
SELECT 
  'trades_public.market_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trades_public' 
    AND indexdef LIKE '%market_id%'
  ) THEN '✅ Indexed' ELSE '❌ Missing index' END
UNION ALL
SELECT 
  'trades_public.created_at',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'trades_public' 
    AND indexdef LIKE '%created_at%'
  ) THEN '✅ Indexed' ELSE '❌ Missing index' END;

-- 4. Check for slow queries (if pg_stat_statements is enabled)
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%trades_public%'
ORDER BY total_exec_time DESC
LIMIT 5;


