-- Add columns for Privy embedded wallet integration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trading_wallet_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privy_user_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ;

-- Add index for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_profiles_trading_wallet ON profiles(trading_wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_privy_user_id ON profiles(privy_user_id);
