-- Add wallet_address and polymarket_username columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wallet_address TEXT,
ADD COLUMN IF NOT EXISTS polymarket_username TEXT;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS profiles_wallet_address_idx ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS profiles_polymarket_username_idx ON profiles(polymarket_username);

-- Add comments to document the columns
COMMENT ON COLUMN profiles.wallet_address IS 'Ethereum wallet address (0x...) for Polymarket trading activity';
COMMENT ON COLUMN profiles.polymarket_username IS 'Polymarket username for easy lookup and display';

