-- Fix Read-Only Mode in New Restored Project
-- Run these commands in the NEW project's SQL Editor
-- Run each command in a SEPARATE query

-- Step 1: Enable write transactions
SET session characteristics AS TRANSACTION READ WRITE;

-- Step 2: Disable read-only mode
SET default_transaction_read_only = 'off';

-- Step 3: Verify it's off
SHOW default_transaction_read_only;

-- Step 4: Test if writes work now
INSERT INTO profiles (id, email) 
VALUES (gen_random_uuid(), 'test-after-fix@example.com')
ON CONFLICT (id) DO NOTHING;
