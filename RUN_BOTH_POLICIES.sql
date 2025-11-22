-- ============================================
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR
-- ============================================
-- This will fix BOTH the follows AND profiles table RLS policies
-- Run this instead of running the two files separately

-- ====================================
-- FOLLOWS TABLE POLICIES
-- ====================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can read their own follows" ON follows;
DROP POLICY IF EXISTS "Users can insert their own follows" ON follows;
DROP POLICY IF EXISTS "Users can delete their own follows" ON follows;

-- Enable RLS
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own follows"
ON follows
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follows"
ON follows
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follows"
ON follows
FOR DELETE
USING (auth.uid() = user_id);

-- ====================================
-- PROFILES TABLE POLICIES
-- ====================================

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- ====================================
-- VERIFY ALL POLICIES WERE CREATED
-- ====================================

SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('follows', 'profiles')
ORDER BY tablename, policyname;

-- You should see 6 policies total:
-- 3 for follows (DELETE, INSERT, SELECT)
-- 3 for profiles (INSERT, SELECT, UPDATE)

