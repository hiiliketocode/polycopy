-- RLS Policies for Polycopy
-- Run this in your Supabase SQL Editor

-- 1. Enable RLS on follows table
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Users can read their own follows
CREATE POLICY "Users can read their own follows"
ON follows
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Policy: Users can insert their own follows
CREATE POLICY "Users can insert their own follows"
ON follows
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 4. Policy: Users can delete their own follows
CREATE POLICY "Users can delete their own follows"
ON follows
FOR DELETE
USING (auth.uid() = user_id);

-- 5. Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 6. Policy: Users can read all profiles (for trader discovery)
CREATE POLICY "Anyone can read profiles"
ON profiles
FOR SELECT
USING (true);

-- 7. Policy: Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- 8. Policy: Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('follows', 'profiles')
ORDER BY tablename, policyname;

