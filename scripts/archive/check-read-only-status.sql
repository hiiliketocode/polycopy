-- Check all read-only related settings
-- Run this to diagnose the read-only mode issue

-- Check default transaction read-only setting
SHOW default_transaction_read_only;

-- Check if database is in recovery mode
SELECT pg_is_in_recovery();

-- Check current transaction read-only status
SHOW transaction_read_only;

-- Check session characteristics
SHOW session_replication_role;

-- Check if there are any locks preventing writes
SELECT 
  locktype, 
  relation::regclass, 
  mode, 
  granted 
FROM pg_locks 
WHERE NOT granted 
LIMIT 10;

-- Check database size and limits
SELECT 
  pg_size_pretty(pg_database_size(current_database())) AS database_size,
  pg_size_pretty(sum(pg_database_size(datname))) AS total_size
FROM pg_database;
