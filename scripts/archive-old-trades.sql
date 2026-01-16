-- ARCHIVE OLD TRADES - Preserves data while freeing disk space
-- Strategy: Move old trades to an archive table, then delete from main table
-- This preserves all data while freeing up space

-- Step 1: Create archive table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.trades_archive (
  LIKE public.trades INCLUDING ALL
);

-- Add archive timestamp
ALTER TABLE public.trades_archive 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Check how much data we're about to archive
-- Run this first to see what will be archived:
SELECT 
  COUNT(*) as trades_to_archive,
  MIN(created_at) as oldest_trade,
  MAX(created_at) as newest_trade,
  pg_size_pretty(SUM(pg_column_size(t.*))) as estimated_size
FROM public.trades t
WHERE created_at < NOW() - INTERVAL '30 days';  -- Adjust days as needed

-- Step 3: Move old trades to archive (in batches to avoid timeouts)
-- Archive trades older than 30 days (adjust as needed)
-- Run this in batches of 10,000 rows at a time

-- Batch 1: Insert into archive
INSERT INTO public.trades_archive
SELECT *, NOW() as archived_at
FROM public.trades
WHERE created_at < NOW() - INTERVAL '30 days'
  AND id NOT IN (SELECT id FROM public.trades_archive)
LIMIT 10000;

-- After each batch, check progress:
-- SELECT COUNT(*) FROM public.trades_archive;

-- Repeat the INSERT above until no more rows are moved
-- Then delete from main table:

-- Step 4: Delete archived trades from main table (ONLY after confirming archive is complete!)
-- WARNING: Only run this after you've verified all data is in trades_archive
-- DELETE FROM public.trades
-- WHERE id IN (SELECT id FROM public.trades_archive);

-- Step 5: Vacuum to reclaim space
-- VACUUM FULL public.trades;
