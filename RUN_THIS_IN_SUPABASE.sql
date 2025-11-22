-- ============================================
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR
-- ============================================
-- This will fix the RLS policies on the follows table
-- so users can read/insert/delete their own follows

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

-- Verify it worked (you should see 3 policies)
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'follows'
ORDER BY policyname;

