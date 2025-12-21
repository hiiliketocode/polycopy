-- Migration: 023_remove_privy_columns
-- Purpose: Remove legacy wallet columns/indexes from profiles

-- Drop indexes if they exist
DROP INDEX IF EXISTS idx_profiles_privy_user_id;
DROP INDEX IF EXISTS idx_profiles_privy_wallet_id;

-- Drop columns if they exist
ALTER TABLE profiles DROP COLUMN IF EXISTS privy_user_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS privy_wallet_id;
