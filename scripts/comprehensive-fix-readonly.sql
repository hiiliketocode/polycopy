-- Comprehensive Fix for Read-Only Mode
-- Run these commands ONE AT A TIME in separate queries
-- Based on PostgreSQL docs: https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-DEFAULT-TRANSACTION-READ-ONLY

-- ============================================
-- STEP 1: Diagnose the Current State
-- ============================================
-- Check the default setting
SHOW default_transaction_read_only;

-- Check the ACTUAL current transaction state (this is what matters!)
SHOW transaction_read_only;

-- Check if database is in recovery mode
SELECT pg_is_in_recovery();

-- ============================================
-- STEP 2: Try to Set Default First
-- ============================================
-- Set default for new transactions
SET default_transaction_read_only = 'off';

-- Verify it's off
SHOW default_transaction_read_only;

-- ============================================
-- STEP 3: Try to Set Session Characteristics
-- ============================================
-- Set session to read-write for future transactions
SET session characteristics AS TRANSACTION READ WRITE;

-- ============================================
-- STEP 4: Try to Set Current Transaction (if in a transaction)
-- ============================================
-- If transaction_read_only shows 'on', try:
SET transaction_read_only = 'off';

-- ============================================
-- STEP 5: If SET doesn't work, try in a transaction
-- ============================================
-- Start a new transaction and set it there
BEGIN;
SET LOCAL transaction_read_only = 'off';
-- Now try your test
CREATE TABLE IF NOT EXISTS test_write_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO test_write_check (test_message) VALUES ('Write test');
SELECT * FROM test_write_check;
DROP TABLE IF EXISTS test_write_check;
COMMIT;

-- ============================================
-- STEP 6: If all above fail, check database-level settings
-- ============================================
-- Check all read-only related settings
SELECT name, setting, context, unit
FROM pg_settings 
WHERE name LIKE '%read_only%' OR name LIKE '%recovery%' OR name LIKE '%transaction%'
ORDER BY name;
