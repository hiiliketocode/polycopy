-- Migration: 037_add_profile_admin_flag
-- Purpose: Track an admin feature tier on profiles for fine-grained feature flagging.

-- Add the column with a sensible default and ensure it's always populated.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

UPDATE profiles
SET is_admin = FALSE
WHERE is_admin IS NULL;

ALTER TABLE profiles
  ALTER COLUMN is_admin SET NOT NULL,
  ALTER COLUMN is_admin SET DEFAULT FALSE;

COMMENT ON COLUMN profiles.is_admin IS 'Admin access flag used by feature gating';

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin);
