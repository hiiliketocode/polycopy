-- Analyze disk usage by table
-- Run this in Supabase SQL Editor to identify what's consuming space

-- Get table sizes (including indexes)
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size,
  (SELECT COUNT(*) FROM information_schema.tables t WHERE t.table_schema = schemaname AND t.table_name = tablename) as row_count_estimate
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- Get row counts for large tables
SELECT 
  'trades' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.trades')) as total_size
FROM public.trades
UNION ALL
SELECT 
  'order_events_log' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.order_events_log')) as total_size
FROM public.order_events_log
UNION ALL
SELECT 
  'market_fetch_queue' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.market_fetch_queue')) as total_size
FROM public.market_fetch_queue
UNION ALL
SELECT 
  'orders' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.orders')) as total_size
FROM public.orders
UNION ALL
SELECT 
  'orders_copy_enriched' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('public.orders_copy_enriched')) as total_size
FROM public.orders_copy_enriched
ORDER BY row_count DESC;

-- Check for old data that can be cleaned up
SELECT 
  'trades' as table_name,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  COUNT(*) as total_rows
FROM public.trades
UNION ALL
SELECT 
  'order_events_log' as table_name,
  MIN(created_at) as oldest_record,
  MAX(created_at) as newest_record,
  COUNT(*) as total_rows
FROM public.order_events_log;
