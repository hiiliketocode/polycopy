-- Fix Read-Only Mode After Cooldown Period Ended
-- Run these in the ORIGINAL project's SQL Editor (not the restored one)
-- Run each command in a SEPARATE query

-- Step 1: Enable write transactions
SET session characteristics AS TRANSACTION READ WRITE;

-- Step 2: Disable read-only mode globally
SET default_transaction_read_only = 'off';

-- Step 3: Verify it's off
SHOW default_transaction_read_only;

-- Step 4: Test if writes work now
INSERT INTO profiles (id, email) 
VALUES (gen_random_uuid(), 'test-after-cooldown@example.com')
ON CONFLICT (id) DO NOTHING;

-- Step 5: Check disk usage (should be well below 95%)
SELECT 
  pg_size_pretty(pg_database_size(current_database())) AS database_size;
