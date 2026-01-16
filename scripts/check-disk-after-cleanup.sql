-- Check disk usage after cleanup
-- Run this to see if cleanup worked

-- Check current disk usage
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- Check row counts for key tables
SELECT 
  'order_events_log' as table_name,
  COUNT(*) as row_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM public.order_events_log
UNION ALL
SELECT 
  'trades' as table_name,
  COUNT(*) as row_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM public.trades
UNION ALL
SELECT 
  'market_fetch_queue' as table_name,
  COUNT(*) as row_count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM public.market_fetch_queue;
