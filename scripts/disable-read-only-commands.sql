-- Commands to Disable Read-Only Mode
-- Run these in Supabase SQL Editor, ONE AT A TIME in separate queries

-- Step 1: Enable write transactions for this session
SET session characteristics AS TRANSACTION READ WRITE;

-- Step 2: Disable read-only mode globally
SET default_transaction_read_only = 'off';

-- Step 3: Verify it's off (should show 'off')
SHOW default_transaction_read_only;

-- Step 4: Test if writes work
INSERT INTO profiles (id, email) 
VALUES (gen_random_uuid(), 'test-write@example.com')
ON CONFLICT (id) DO NOTHING;
