-- AGGRESSIVE CLEANUP - Use when database is down due to disk space
-- This is more aggressive than emergency-cleanup.sql
-- Run these one at a time and check disk usage after each

-- Step 1: Delete old order_events_log (keep only last 3 days)
-- This is usually safe - it's just logging data
DELETE FROM public.order_events_log
WHERE created_at < NOW() - INTERVAL '3 days';

-- Step 2: Clean up market_fetch_queue aggressively
DELETE FROM public.market_fetch_queue
WHERE status IN ('completed', 'failed')
  OR error_count > 2
  OR updated_at < NOW() - INTERVAL '1 day';

-- Step 3: If trades table is huge, delete very old data
-- WARNING: Only run if you're sure you don't need old trade history
-- Uncomment and adjust date as needed:
-- DELETE FROM public.trades
-- WHERE created_at < NOW() - INTERVAL '14 days';

-- Step 4: Vacuum to reclaim space (this is critical!)
VACUUM FULL;

-- Step 5: After vacuum, check if you can connect
-- If still having issues, try these additional steps:

-- Option A: Delete even more order_events_log (last 24 hours only)
-- DELETE FROM public.order_events_log
-- WHERE created_at < NOW() - INTERVAL '1 day';

-- Option B: Truncate market_fetch_queue completely (if it's safe to lose queue)
-- TRUNCATE TABLE public.market_fetch_queue;
