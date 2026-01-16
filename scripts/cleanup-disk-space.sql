-- Cleanup scripts to free up disk space
-- WARNING: Review these carefully before running!
-- Run in Supabase SQL Editor

-- Option 1: Delete old order_events_log entries (older than 30 days)
-- This is a logging table, safe to clean up old entries
DELETE FROM public.order_events_log
WHERE created_at < NOW() - INTERVAL '30 days';

-- Option 2: Delete old trades data (if you have a retention policy)
-- BE CAREFUL: Only run if you're sure you don't need this data
-- DELETE FROM public.trades
-- WHERE created_at < NOW() - INTERVAL '90 days';

-- Option 3: Clean up market_fetch_queue (completed/failed items older than 7 days)
DELETE FROM public.market_fetch_queue
WHERE (status = 'completed' OR status = 'failed' OR error_count > 5)
  AND updated_at < NOW() - INTERVAL '7 days';

-- Option 4: Vacuum to reclaim space after deletions
-- This will help free up the actual disk space
VACUUM FULL;

-- Option 5: Reindex to optimize indexes (can free up some space)
REINDEX DATABASE postgres;
