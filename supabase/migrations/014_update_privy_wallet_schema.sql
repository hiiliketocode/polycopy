-- Update schema documentation for Privy wallet integration
-- The privy_wallet_id column already exists from migration 010, but we're updating its purpose

-- Add comment to clarify the new security model
COMMENT ON COLUMN profiles.privy_wallet_id IS 'Privy wallet ID reference - Privy securely stores the private key on their infrastructure. We only store this reference ID to request signatures when executing trades.';

COMMENT ON COLUMN profiles.trading_wallet_address IS 'Public wallet address (imported from Polymarket). This is public information and safe to store.';

-- Ensure the column exists and is indexed
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS privy_wallet_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_privy_wallet_id ON profiles(privy_wallet_id);

-- Summary of current wallet security model:
-- 1. User imports their Polymarket wallet private key via Privy
-- 2. Privy encrypts and stores the private key securely (TEE storage)
-- 3. We store only: privy_wallet_id (reference) + wallet_address (public)
-- 4. For trades: We call Privy API to sign using the wallet ID
-- 5. Private keys NEVER stored in our database
