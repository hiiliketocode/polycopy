-- ============================================
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR
-- ============================================
-- This adds profile_image_url column to the profiles table

-- Add profile_image_url column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

-- Add comment to document the column
COMMENT ON COLUMN profiles.profile_image_url IS 'Profile picture URL from Polymarket (synced when user connects wallet)';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'profile_image_url'
ORDER BY column_name;

-- You should see:
-- column_name         | data_type | is_nullable
-- profile_image_url   | text      | YES

