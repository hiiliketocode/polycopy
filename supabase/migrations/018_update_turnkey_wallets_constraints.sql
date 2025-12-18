-- Migration: Update Turnkey Wallets Constraints
-- Purpose: 
--   1. Remove single-wallet-per-user constraint
--   2. Add unique index on (user_id, polymarket_account_address, wallet_type)
--   3. Allow multiple wallets per user for future flows

-- Drop the existing unique constraint on user_id
-- This allows users to have multiple wallets
ALTER TABLE turnkey_wallets 
  DROP CONSTRAINT IF EXISTS turnkey_wallets_user_id_key;

-- Add a unique index on (user_id, polymarket_account_address, wallet_type)
-- This ensures a user can't import the same wallet twice, but can have multiple different wallets
CREATE UNIQUE INDEX IF NOT EXISTS turnkey_wallets_user_account_type_unique 
  ON turnkey_wallets(user_id, polymarket_account_address, wallet_type)
  WHERE polymarket_account_address != '';

-- Add comment explaining the constraint
COMMENT ON INDEX turnkey_wallets_user_account_type_unique IS 
  'Ensures each user can only have one wallet entry per (polymarket_account, wallet_type) combination. Allows multiple wallets per user.';

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Migration 018: Turnkey wallets constraints updated';
  RAISE NOTICE '  - Removed unique(user_id) constraint';
  RAISE NOTICE '  - Added unique index on (user_id, polymarket_account_address, wallet_type)';
  RAISE NOTICE '  - Users can now have multiple wallets';
END $$;

