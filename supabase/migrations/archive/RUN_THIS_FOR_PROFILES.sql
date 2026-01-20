-- ============================================
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR
-- ============================================
-- This will fix the RLS policies on the profiles table
-- so users can view all profiles and manage their own

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view all profiles (public data for trader discovery)
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Verify it worked (you should see 3 policies)
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

