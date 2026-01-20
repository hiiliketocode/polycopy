-- Add columns for trader profile images and market avatars to copied_trades table
ALTER TABLE copied_trades
ADD COLUMN IF NOT EXISTS trader_profile_image_url TEXT,
ADD COLUMN IF NOT EXISTS market_avatar_url TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_copied_trades_trader_profile_image ON copied_trades(trader_profile_image_url) WHERE trader_profile_image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copied_trades_market_avatar ON copied_trades(market_avatar_url) WHERE market_avatar_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN copied_trades.trader_profile_image_url IS 'URL to the trader''s profile image from Polymarket';
COMMENT ON COLUMN copied_trades.market_avatar_url IS 'URL to the market''s avatar/icon image';

