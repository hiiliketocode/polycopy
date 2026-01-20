-- Force Disable Read-Only Mode
-- Try these commands in order
-- Run each block in a SEPARATE query

-- ============================================
-- Method 1: Set at session level (you already tried this)
-- ============================================
SET session characteristics AS TRANSACTION READ WRITE;
SET default_transaction_read_only = 'off';

-- ============================================
-- Method 2: Try setting it at the database level
-- Note: Replace 'postgres' with your actual database name if different
-- ============================================
-- First, find your database name:
SELECT current_database();

-- Then use that name (usually 'postgres' in Supabase):
-- ALTER DATABASE postgres SET default_transaction_read_only = 'off';

-- ============================================
-- Method 3: Check if you need to reconnect
-- After running the above, close and reopen the SQL Editor
-- Then try a test write:
-- ============================================
-- Test write (uncomment to test):
-- INSERT INTO profiles (id, email) 
-- VALUES (gen_random_uuid(), 'test@example.com')
-- ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Method 4: If still in read-only, check Supabase Dashboard
-- Go to: Settings → Database → Check for "Read-only mode" toggle
-- ============================================
