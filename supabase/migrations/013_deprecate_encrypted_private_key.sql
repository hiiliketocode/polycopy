-- Mark encrypted_private_key column as deprecated
-- We now use Turnkey for private key storage instead of storing encrypted keys in our database
-- This column is kept for backwards compatibility but should not be used going forward

COMMENT ON COLUMN profiles.encrypted_private_key IS 'DEPRECATED: Private keys are now stored by Turnkey. This column is kept for backwards compatibility only. Do not use for new implementations.';

-- Note: We do NOT drop the column to maintain backwards compatibility
-- and to avoid data loss, but it should not be written to anymore
