-- Add wallet_connected_at column to track when users connect/import their wallet
-- This is separate from wallet_created_at which tracks initial wallet creation
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wallet_connected_at TIMESTAMPTZ;

-- Add index for potential future queries on recently connected wallets
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_connected_at ON profiles(wallet_connected_at);

-- Add comment
COMMENT ON COLUMN profiles.wallet_connected_at IS 'Timestamp when user last connected/imported their wallet';
