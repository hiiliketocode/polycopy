-- Add columns for trading wallet integration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trading_wallet_address TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wallet_created_at TIMESTAMPTZ;

-- Add index for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_profiles_trading_wallet ON profiles(trading_wallet_address);
