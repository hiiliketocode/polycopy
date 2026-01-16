-- QUICK TRADES CLEANUP - Faster but less safe
-- Use this if you need immediate space and can't wait for full archive process

-- Step 1: Create archive table
CREATE TABLE IF NOT EXISTS public.trades_archive (
  LIKE public.trades INCLUDING ALL
);

ALTER TABLE public.trades_archive 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Move old trades to archive (all at once - may take time)
INSERT INTO public.trades_archive
SELECT *, NOW() as archived_at
FROM public.trades
WHERE created_at < NOW() - INTERVAL '60 days';  -- Adjust days as needed

-- Step 3: Verify count matches
-- SELECT 
--   (SELECT COUNT(*) FROM public.trades WHERE created_at < NOW() - INTERVAL '60 days') as should_be_archived,
--   (SELECT COUNT(*) FROM public.trades_archive) as actually_archived;

-- Step 4: Delete from main table (ONLY after verifying archive is complete)
DELETE FROM public.trades
WHERE created_at < NOW() - INTERVAL '60 days';

-- Step 5: Vacuum
VACUUM FULL public.trades;
