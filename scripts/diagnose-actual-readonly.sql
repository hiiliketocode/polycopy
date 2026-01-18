-- Diagnose Actual Read-Only State
-- Check what's actually blocking writes

-- 1. Check the DEFAULT setting
SHOW default_transaction_read_only;

-- 2. Check the ACTUAL current transaction state (this is what matters!)
SHOW transaction_read_only;

-- 3. Check if database is in recovery mode
SELECT pg_is_in_recovery();

-- 4. Check session replication role
SHOW session_replication_role;

-- 5. Try to explicitly set session to read-write (if transaction_read_only shows 'on')
-- First check transaction_read_only, then if it's 'on', try:
-- SET transaction_read_only = 'off';

-- 6. Check database-level settings
SELECT name, setting, context 
FROM pg_settings 
WHERE name LIKE '%read_only%' OR name LIKE '%recovery%'
ORDER BY name;
