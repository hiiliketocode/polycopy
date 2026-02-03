-- Check ACTUAL Transaction Read-Only State
-- The key difference: default_transaction_read_only vs transaction_read_only
-- Based on PostgreSQL docs: https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-DEFAULT-TRANSACTION-READ-ONLY

-- 1. Check the DEFAULT setting (what you already checked)
SHOW default_transaction_read_only;

-- 2. Check the ACTUAL CURRENT TRANSACTION state (this is what matters!)
SHOW transaction_read_only;

-- 3. Check session characteristics
SHOW session_replication_role;

-- 4. If transaction_read_only shows 'on', try to explicitly set it OFF
-- This might work if default_transaction_read_only is 'off'
BEGIN;
SET LOCAL transaction_read_only = 'off';
SHOW transaction_read_only;
-- Try insert here
INSERT INTO profiles (id, email) 
VALUES (gen_random_uuid(), 'test-local-off@example.com')
ON CONFLICT (id) DO NOTHING;
COMMIT;
