-- Fix Disk IO issues by adding missing indexes
-- Run this in Supabase SQL Editor

-- Indexes for trades_public (most queried table)
CREATE INDEX IF NOT EXISTS idx_trades_public_trader_id ON trades_public(trader_id);
CREATE INDEX IF NOT EXISTS idx_trades_public_market_id ON trades_public(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_public_created_at ON trades_public(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_public_timestamp ON trades_public(timestamp DESC);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_public_trader_created ON trades_public(trader_id, created_at DESC);

-- Indexes for positions_current
CREATE INDEX IF NOT EXISTS idx_positions_current_wallet_market ON positions_current(wallet_address, market_id);
CREATE INDEX IF NOT EXISTS idx_positions_current_wallet ON positions_current(wallet_address);

-- Indexes for wallet_poll_state
CREATE INDEX IF NOT EXISTS idx_wallet_poll_state_wallet ON wallet_poll_state(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_poll_state_updated ON wallet_poll_state(updated_at DESC);

-- Indexes for follows (if not already exists)
CREATE INDEX IF NOT EXISTS idx_follows_user_id ON follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_trader_wallet ON follows(trader_wallet);
CREATE INDEX IF NOT EXISTS idx_follows_active ON follows(active) WHERE active = true;

-- Indexes for traders
CREATE INDEX IF NOT EXISTS idx_traders_wallet_address ON traders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_traders_is_active ON traders(is_active) WHERE is_active = true;

-- Verify indexes were created
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('trades_public', 'positions_current', 'wallet_poll_state', 'follows', 'traders')
ORDER BY tablename, indexname;


