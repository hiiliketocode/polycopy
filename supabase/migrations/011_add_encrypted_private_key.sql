-- Add column for encrypted private key
-- This will store the user's Polymarket wallet private key in encrypted form
-- Only used for executing trades on their behalf
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

-- Add comment explaining the security model
COMMENT ON COLUMN profiles.encrypted_private_key IS 'Encrypted private key for user Polymarket wallet - only decrypted server-side for trade execution';
