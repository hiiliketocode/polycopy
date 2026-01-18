-- Check read-only status in the new restored project
-- Run these in the NEW project's SQL Editor

-- Check current read-only setting
SHOW default_transaction_read_only;

-- Check if writes work (test)
INSERT INTO profiles (id, email) 
VALUES (gen_random_uuid(), 'test-new-project@example.com')
ON CONFLICT (id) DO NOTHING;

-- Check database usage
SELECT 
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- Check disk usage status
SELECT 
  pg_database_size(current_database()) AS size_bytes,
  pg_size_pretty(pg_database_size(current_database())) AS size_pretty;
