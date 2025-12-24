-- Quick verification queries to confirm RLS fix was applied
-- Copy and paste these into Supabase SQL Editor

-- ====================================
-- 1. VERIFY RLS IS ENABLED ON ALL TABLES
-- ====================================
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN (
  'clob_credentials',
  'turnkey_wallets',
  'trades_public',
  'metric_definitions'
)
AND schemaname = 'public'
ORDER BY tablename;

-- Expected: All 4 should show rls_enabled = true


-- ====================================
-- 2. VERIFY POLICIES WERE CREATED
-- ====================================
SELECT 
  tablename,
  policyname,
  cmd as operation
FROM pg_policies
WHERE tablename IN (
  'clob_credentials',
  'turnkey_wallets', 
  'trades_public',
  'metric_definitions'
)
ORDER BY tablename, cmd;

-- Expected results:
-- clob_credentials: 4 policies (DELETE, INSERT, SELECT, UPDATE)
-- turnkey_wallets: 4 policies (DELETE, INSERT, SELECT, UPDATE)
-- trades_public: 1 policy (SELECT)
-- metric_definitions: 1 policy (SELECT)


-- ====================================
-- 3. TEST PUBLIC READ ACCESS
-- ====================================
SELECT COUNT(*) as trades_public_count FROM trades_public;
SELECT COUNT(*) as metric_definitions_count FROM metric_definitions;

-- Expected: Both should return counts (not errors)


-- ====================================
-- 4. TEST SECURITY (if you have credentials)
-- ====================================
-- This should only return YOUR credentials, not other users'
SELECT COUNT(*) as my_credentials FROM clob_credentials WHERE user_id = auth.uid();
SELECT COUNT(*) as other_users_credentials FROM clob_credentials WHERE user_id != auth.uid();

-- Expected: 
-- my_credentials: Your count (0 or 1)
-- other_users_credentials: 0 (you can't see others)

