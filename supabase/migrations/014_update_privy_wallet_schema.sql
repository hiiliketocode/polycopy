-- Update schema documentation for Turnkey wallet integration

-- Add comment to clarify the new security model
COMMENT ON COLUMN profiles.trading_wallet_address IS 'Public wallet address (imported from Polymarket). This is public information and safe to store.';

-- Summary of current wallet security model:
-- 1. User imports their Polymarket wallet private key via Turnkey
-- 2. Turnkey encrypts and stores the private key securely (TEE storage)
-- 3. We store only: wallet_address (public)
-- 4. For trades: We call Turnkey API to sign using the wallet ID
-- 5. Private keys NEVER stored in our database
