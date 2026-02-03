-- URGENT: Disable Read-Only Mode and Clean Up Trades Table
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- 
-- IMPORTANT: Run commands ONE AT A TIME (not all together)
-- VACUUM cannot run inside a transaction block

-- ============================================
-- STEP 1: Disable Read-Only Mode (RUN THIS FIRST)
-- ============================================
SET session characteristics AS TRANSACTION READ WRITE;
SET default_transaction_read_only = 'off';

-- Verify the change (should show 'off')
SHOW default_transaction_read_only;

-- ============================================
-- STEP 2: Check trades table size (OPTIONAL - to see how much space it uses)
-- ============================================
-- SELECT 
--   pg_size_pretty(pg_total_relation_size('public.trades')) AS total_size,
--   pg_size_pretty(pg_relation_size('public.trades')) AS table_size,
--   pg_size_pretty(pg_indexes_size('public.trades')) AS indexes_size,
--   (SELECT COUNT(*) FROM public.trades) AS row_count;

-- ============================================
-- STEP 3: Delete trades table data (RUN THIS IN A NEW QUERY)
-- WARNING: This will DELETE ALL DATA from the trades table
-- ============================================
-- TRUNCATE TABLE public.trades CASCADE;

-- ============================================
-- STEP 4: Reclaim space with VACUUM (RUN THIS IN A SEPARATE QUERY AFTER STEP 3)
-- ============================================
-- VACUUM FULL public.trades;
