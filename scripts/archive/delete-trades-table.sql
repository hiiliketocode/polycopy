-- Delete Trades Table Data
-- WARNING: This will DELETE ALL DATA from the trades table
-- Run this AFTER disabling read-only mode
-- 
-- Option 1: TRUNCATE (faster, keeps table structure)
-- This removes all rows but keeps the table and indexes
TRUNCATE TABLE public.trades CASCADE;

-- Option 2: DELETE (slower, but can be more selective)
-- Uncomment if you want to delete specific data instead:
-- DELETE FROM public.trades WHERE timestamp < NOW() - INTERVAL '30 days';

-- After running TRUNCATE, run VACUUM in a separate query to reclaim space:
-- VACUUM FULL public.trades;
