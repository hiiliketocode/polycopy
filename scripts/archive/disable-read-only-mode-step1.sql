-- STEP 1: Disable Read-Only Mode
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Reference: https://supabase.com/docs/guides/platform/database-size#disabling-read-only-mode

-- Enable write transactions for this session
SET session characteristics AS TRANSACTION READ WRITE;

-- Disable read-only mode globally
SET default_transaction_read_only = 'off';

-- Verify the change (should show 'off')
SHOW default_transaction_read_only;
