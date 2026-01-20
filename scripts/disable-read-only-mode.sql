-- Disable Read-Only Mode in Supabase
-- Run these commands in Supabase Dashboard → SQL Editor → New Query
-- Reference: https://supabase.com/docs/guides/platform/database-size#disabling-read-only-mode

-- IMPORTANT: Run these commands ONE AT A TIME (not all together)
-- VACUUM cannot run inside a transaction block, so it must be separate

-- ============================================
-- STEP 1: Enable write transactions and disable read-only mode
-- Run this block first:
-- ============================================
SET session characteristics AS TRANSACTION READ WRITE;
SET default_transaction_read_only = 'off';

-- Verify the change
SHOW default_transaction_read_only;

-- ============================================
-- STEP 2: Run vacuum to reclaim space (OPTIONAL - run separately if needed)
-- This helps reduce database size after deleting data
-- Run this in a NEW QUERY (separate from the commands above)
-- ============================================
-- VACUUM;
