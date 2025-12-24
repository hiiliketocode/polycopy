-- ============================================
-- CRITICAL SECURITY FIX: Enable RLS on exposed tables
-- ============================================
-- Run this IMMEDIATELY in Supabase SQL Editor
-- 
-- Issue: 4 tables are exposed to PostgREST without RLS protection
-- Risk: Unauthorized access to credentials, wallets, and data
-- 
-- Tables to fix:
-- 1. clob_credentials (CRITICAL - API keys/secrets)
-- 2. turnkey_wallets (CRITICAL - wallet data)
-- 3. trades_public (HIGH - public trade data)
-- 4. metric_definitions (MEDIUM - reference data)

-- ====================================
-- 1. CLOB_CREDENTIALS (CRITICAL)
-- ====================================
-- Contains Polymarket CLOB API credentials
-- Users should ONLY access their own credentials
-- Backend uses service role key to bypass RLS

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can read their own clob credentials" ON clob_credentials;
DROP POLICY IF EXISTS "Users can insert their own clob credentials" ON clob_credentials;
DROP POLICY IF EXISTS "Users can update their own clob credentials" ON clob_credentials;
DROP POLICY IF EXISTS "Users can delete their own clob credentials" ON clob_credentials;

-- Enable RLS
ALTER TABLE clob_credentials ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own credentials
CREATE POLICY "Users can read their own clob credentials"
ON clob_credentials
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own credentials
CREATE POLICY "Users can insert their own clob credentials"
ON clob_credentials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own credentials
CREATE POLICY "Users can update their own clob credentials"
ON clob_credentials
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own credentials
CREATE POLICY "Users can delete their own clob credentials"
ON clob_credentials
FOR DELETE
USING (auth.uid() = user_id);

-- ====================================
-- 2. TURNKEY_WALLETS (CRITICAL)
-- ====================================
-- Contains Turnkey wallet information
-- Users should ONLY access their own wallet
-- Backend uses service role key to bypass RLS

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can read their own wallet" ON turnkey_wallets;
DROP POLICY IF EXISTS "Users can insert their own wallet" ON turnkey_wallets;
DROP POLICY IF EXISTS "Users can update their own wallet" ON turnkey_wallets;
DROP POLICY IF EXISTS "Users can delete their own wallet" ON turnkey_wallets;

-- Enable RLS
ALTER TABLE turnkey_wallets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own wallet
CREATE POLICY "Users can read their own wallet"
ON turnkey_wallets
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own wallet
CREATE POLICY "Users can insert their own wallet"
ON turnkey_wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own wallet
CREATE POLICY "Users can update their own wallet"
ON turnkey_wallets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own wallet
CREATE POLICY "Users can delete their own wallet"
ON turnkey_wallets
FOR DELETE
USING (auth.uid() = user_id);

-- ====================================
-- 3. TRADES_PUBLIC (PUBLIC READ-ONLY)
-- ====================================
-- Contains public trade data for the feed
-- Should be readable by everyone (it's public data)
-- Only backend should write to it (via service role)

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Anyone can read public trades" ON trades_public;

-- Enable RLS
ALTER TABLE trades_public ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read public trades (needed for feed/discovery)
CREATE POLICY "Anyone can read public trades"
ON trades_public
FOR SELECT
USING (true);

-- Note: No INSERT/UPDATE/DELETE policies - only service role can write
-- Backend API routes use service role key to bypass RLS for writes

-- ====================================
-- 4. METRIC_DEFINITIONS (PUBLIC READ-ONLY)
-- ====================================
-- Contains metric definitions/reference data
-- Should be readable by everyone
-- Only backend/admin should write to it

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Anyone can read metric definitions" ON metric_definitions;

-- Enable RLS
ALTER TABLE metric_definitions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read metric definitions
CREATE POLICY "Anyone can read metric definitions"
ON metric_definitions
FOR SELECT
USING (true);

-- Note: No INSERT/UPDATE/DELETE policies - only service role can write
-- This is reference data managed by backend/migrations

-- ====================================
-- VERIFY ALL POLICIES WERE CREATED
-- ====================================

SELECT 
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'SELECT' THEN 'Read'
    WHEN cmd = 'INSERT' THEN 'Create'
    WHEN cmd = 'UPDATE' THEN 'Update'
    WHEN cmd = 'DELETE' THEN 'Delete'
    ELSE cmd
  END as action
FROM pg_policies
WHERE tablename IN (
  'clob_credentials',
  'turnkey_wallets', 
  'trades_public',
  'metric_definitions'
)
ORDER BY tablename, cmd;

-- Expected results:
-- clob_credentials: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- turnkey_wallets: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- trades_public: 1 policy (SELECT only)
-- metric_definitions: 1 policy (SELECT only)

-- ====================================
-- VERIFY RLS IS ENABLED
-- ====================================

SELECT 
  schemaname,
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

-- All 4 tables should show rls_enabled = true

-- ====================================
-- IMPORTANT NOTES
-- ====================================

-- 1. Backend API routes should use the service role key (not anon key)
--    to bypass RLS when they need to write data
--
--    Example:
--    const supabase = createClient(
--      process.env.NEXT_PUBLIC_SUPABASE_URL!,
--      process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service role bypasses RLS
--      { auth: { persistSession: false } }
--    )
--
-- 2. For user-facing operations (frontend), use the anon key which
--    respects RLS policies
--
-- 3. Test the policies:
--    - Try accessing another user's credentials (should fail)
--    - Try reading trades_public as anonymous user (should work)
--    - Try writing to trades_public as regular user (should fail)
--
-- 4. If you need to adjust policies later, you can:
--    - DROP POLICY "policy_name" ON table_name;
--    - CREATE POLICY ... (new policy)

-- ====================================
-- SECURITY VERIFICATION TESTS
-- ====================================

-- Test 1: Verify you can't see other users' data
-- (Run this logged in as a test user, should return 0 rows if no other users exist)
SELECT COUNT(*) as other_users_credentials 
FROM clob_credentials 
WHERE user_id != auth.uid();

SELECT COUNT(*) as other_users_wallets 
FROM turnkey_wallets 
WHERE user_id != auth.uid();

-- Test 2: Verify public tables are readable
SELECT COUNT(*) as public_trades_count FROM trades_public;
SELECT COUNT(*) as metric_definitions_count FROM metric_definitions;

-- If these queries work as expected, your RLS is properly configured! ✅

