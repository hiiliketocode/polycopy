-- Deep Diagnosis: Why Reads Work But Writes Fail Despite Setting 'off'
-- Run these in separate queries to diagnose the issue

-- 1. Check current transaction read-only status (session level)
SHOW transaction_read_only;

-- 2. Check if database is in recovery mode
SELECT pg_is_in_recovery();

-- 3. Check current session characteristics
SHOW session_replication_role;

-- 4. Try setting at session level explicitly
BEGIN;
SET LOCAL transaction_read_only = 'off';
SELECT current_setting('transaction_read_only');
-- Try insert here if possible
ROLLBACK;

-- 5. Check for any locks that might prevent writes
SELECT 
  locktype, 
  relation::regclass, 
  mode, 
  granted 
FROM pg_locks 
WHERE NOT granted 
LIMIT 10;

-- 6. Check database-level settings
SELECT name, setting 
FROM pg_settings 
WHERE name LIKE '%read_only%' OR name LIKE '%recovery%';

-- 7. Check if we can read from profiles table
SELECT COUNT(*) FROM profiles LIMIT 1;
