-- SMART TRADES CLEANUP - Preserves data while freeing space
-- This script helps you safely reduce trades table size

-- ============================================================================
-- STEP 1: ANALYZE CURRENT SITUATION
-- ============================================================================
-- Run this first to understand your data:

SELECT 
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') as trades_90_days_old,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '60 days') as trades_60_days_old,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as trades_30_days_old,
  MIN(created_at) as oldest_trade,
  MAX(created_at) as newest_trade,
  pg_size_pretty(pg_total_relation_size('public.trades')) as table_size
FROM public.trades;

-- ============================================================================
-- STEP 2: CREATE ARCHIVE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trades_archive (
  LIKE public.trades INCLUDING ALL
);

ALTER TABLE public.trades_archive 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes on archive table for future queries
CREATE INDEX IF NOT EXISTS idx_trades_archive_wallet_timestamp 
ON public.trades_archive (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trades_archive_created_at 
ON public.trades_archive (created_at DESC);

-- ============================================================================
-- STEP 3: ARCHIVE OLD TRADES (Run in batches)
-- ============================================================================
-- Archive trades older than 60 days (adjust as needed)
-- Run this INSERT multiple times until it returns 0 rows

DO $$
DECLARE
  batch_size INTEGER := 10000;
  rows_moved INTEGER;
BEGIN
  LOOP
    -- Move one batch
    INSERT INTO public.trades_archive
    SELECT *, NOW() as archived_at
    FROM public.trades
    WHERE created_at < NOW() - INTERVAL '60 days'
      AND id NOT IN (SELECT id FROM public.trades_archive WHERE id IS NOT NULL)
    LIMIT batch_size;
    
    GET DIAGNOSTICS rows_moved = ROW_COUNT;
    
    -- Exit if no more rows
    EXIT WHEN rows_moved = 0;
    
    -- Log progress (you'll see this in the query result)
    RAISE NOTICE 'Moved % rows to archive', rows_moved;
    
    -- Small delay to avoid overwhelming the database
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- ============================================================================
-- STEP 4: VERIFY ARCHIVE COMPLETE
-- ============================================================================
-- Run this to verify all old trades are archived:

SELECT 
  (SELECT COUNT(*) FROM public.trades WHERE created_at < NOW() - INTERVAL '60 days') as remaining_old_trades,
  (SELECT COUNT(*) FROM public.trades_archive) as archived_trades,
  (SELECT COUNT(*) FROM public.trades) as total_current_trades;

-- If remaining_old_trades is 0, proceed to Step 5

-- ============================================================================
-- STEP 5: DELETE ARCHIVED TRADES FROM MAIN TABLE
-- ============================================================================
-- ONLY RUN THIS AFTER VERIFYING STEP 4 SHOWS 0 remaining_old_trades!

-- Delete in batches to avoid long locks
DO $$
DECLARE
  batch_size INTEGER := 10000;
  rows_deleted INTEGER;
BEGIN
  LOOP
    DELETE FROM public.trades
    WHERE id IN (
      SELECT id FROM public.trades_archive
      WHERE id NOT IN (SELECT id FROM public.trades WHERE id IS NOT NULL)
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    
    EXIT WHEN rows_deleted = 0;
    
    RAISE NOTICE 'Deleted % rows from main table', rows_deleted;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- ============================================================================
-- STEP 6: RECLAIM DISK SPACE
-- ============================================================================

-- Vacuum the main table to reclaim space
VACUUM FULL public.trades;

-- Vacuum the archive table too
VACUUM FULL public.trades_archive;

-- ============================================================================
-- STEP 7: VERIFY SPACE FREED
-- ============================================================================

SELECT 
  pg_size_pretty(pg_total_relation_size('public.trades')) as trades_table_size,
  pg_size_pretty(pg_total_relation_size('public.trades_archive')) as archive_table_size,
  (SELECT COUNT(*) FROM public.trades) as trades_count,
  (SELECT COUNT(*) FROM public.trades_archive) as archive_count;
