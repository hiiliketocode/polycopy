-- Migration: Fix RLS policies for profiles table
-- Created: 2024-11-21
-- Description: Add Row Level Security policies to allow users to view all profiles and manage their own

-- First, drop existing policies if they exist (in case this is a re-run)
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow everyone to view all profiles (needed for trader discovery)
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
USING (true);

-- Policy: Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Policy: Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Verify policies were created successfully
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

