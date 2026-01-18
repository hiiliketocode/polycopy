-- Test Write Access (Database is Now Writable!)
-- The error changed from read-only to foreign key constraint - this means writes are working!

-- Option 1: Test with an existing user ID (if you have one)
-- First, get an existing user ID from auth.users:
SELECT id, email FROM auth.users LIMIT 1;

-- Then use that ID for the test:
-- INSERT INTO profiles (id, email) 
-- VALUES ('<existing-user-id-here>', 'test-write@example.com')
-- ON CONFLICT (id) DO UPDATE SET email = 'test-write@example.com';

-- Option 2: Test with a table that doesn't have foreign key constraints
-- Check if you have other tables you can test with:
-- INSERT INTO some_table (column1) VALUES ('test');

-- Option 3: Check what tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Option 4: Test with follows table (if it doesn't have strict FK constraints)
-- SELECT user_id FROM profiles LIMIT 1;
-- Then use that user_id:
-- INSERT INTO follows (user_id, trader_wallet) 
-- VALUES ('<user-id-from-profiles>', '0x0000000000000000000000000000000000000000')
-- ON CONFLICT DO NOTHING;
