-- Migration: Fix RLS policies for follows table
-- Created: 2024-11-21
-- Description: Add Row Level Security policies to allow users to manage their own follows

-- First, drop existing policies if they exist (in case this is a re-run)
DROP POLICY IF EXISTS "Users can read their own follows" ON follows;
DROP POLICY IF EXISTS "Users can insert their own follows" ON follows;
DROP POLICY IF EXISTS "Users can delete their own follows" ON follows;

-- Enable RLS on follows table
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to read their own follows
CREATE POLICY "Users can read their own follows"
ON follows
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Allow users to insert their own follows
CREATE POLICY "Users can insert their own follows"
ON follows
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to delete their own follows
CREATE POLICY "Users can delete their own follows"
ON follows
FOR DELETE
USING (auth.uid() = user_id);

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
WHERE tablename = 'follows'
ORDER BY policyname;

