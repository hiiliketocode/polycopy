-- EMERGENCY CLEANUP - Use only if database is completely down
-- These are aggressive cleanup steps to free up space immediately

-- Step 1: Delete very old order_events_log (older than 7 days)
-- This is usually the safest table to clean aggressively
DELETE FROM public.order_events_log
WHERE created_at < NOW() - INTERVAL '7 days';

-- Step 2: Clean up market_fetch_queue aggressively
DELETE FROM public.market_fetch_queue
WHERE status IN ('completed', 'failed')
  OR error_count > 3
  OR updated_at < NOW() - INTERVAL '3 days';

-- Step 3: If trades table is huge, consider keeping only recent data
-- UNCOMMENT ONLY IF ABSOLUTELY NECESSARY:
-- DELETE FROM public.trades
-- WHERE created_at < NOW() - INTERVAL '30 days';

-- Step 4: Vacuum to reclaim space
VACUUM FULL;
