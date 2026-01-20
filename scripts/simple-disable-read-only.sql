-- Simple: Disable Read-Only Mode
-- Run these commands in Supabase SQL Editor
-- Run each command separately if needed

-- Step 1: Set session to read-write
SET session characteristics AS TRANSACTION READ WRITE;

-- Step 2: Disable read-only mode
SET default_transaction_read_only = 'off';

-- Step 3: Verify it's off
SHOW default_transaction_read_only;

-- Step 4: Test if writes work (uncomment to test)
-- INSERT INTO profiles (id, email) 
-- VALUES (gen_random_uuid(), 'test-write@example.com')
-- ON CONFLICT (id) DO NOTHING;

-- If the INSERT works, your database is writable!
-- The dashboard warning may just be delayed in updating.
