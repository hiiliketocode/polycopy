-- Migration: 005_copied_trades_and_notifications
-- Description: Create tables for tracking copied trades and notification preferences
-- Created: 2025-12-03

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. TABLE: copied_trades
-- Tracks when users copy trades from traders they follow
-- ============================================
CREATE TABLE IF NOT EXISTS copied_trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_wallet TEXT NOT NULL,
  trader_username TEXT,
  market_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  price_when_copied DECIMAL NOT NULL,
  amount_invested DECIMAL,
  copied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Status tracking
  trader_still_has_position BOOLEAN DEFAULT true,
  trader_closed_at TIMESTAMP WITH TIME ZONE,
  current_price DECIMAL,
  market_resolved BOOLEAN DEFAULT false,
  market_resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Performance
  roi DECIMAL,
  
  -- Notifications
  notification_closed_sent BOOLEAN DEFAULT false,
  notification_resolved_sent BOOLEAN DEFAULT false,
  
  -- Timestamps
  last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 2. TABLE: notification_preferences
-- User preferences for email notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_on_position_closed BOOLEAN DEFAULT true,
  email_on_market_resolved BOOLEAN DEFAULT true,
  email_daily_summary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. INDEXES for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_copied_trades_user ON copied_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_copied_trades_trader ON copied_trades(trader_wallet);
CREATE INDEX IF NOT EXISTS idx_copied_trades_status ON copied_trades(trader_still_has_position, market_resolved);
CREATE INDEX IF NOT EXISTS idx_copied_trades_market ON copied_trades(market_id);

-- ============================================
-- 4. FUNCTION: Auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for copied_trades
DROP TRIGGER IF EXISTS update_copied_trades_updated_at ON copied_trades;
CREATE TRIGGER update_copied_trades_updated_at
  BEFORE UPDATE ON copied_trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for notification_preferences
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on copied_trades
ALTER TABLE copied_trades ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own copied trades
CREATE POLICY "Users can view their own copied trades"
  ON copied_trades
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only INSERT their own copied trades
CREATE POLICY "Users can insert their own copied trades"
  ON copied_trades
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own copied trades
CREATE POLICY "Users can update their own copied trades"
  ON copied_trades
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only DELETE their own copied trades
CREATE POLICY "Users can delete their own copied trades"
  ON copied_trades
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only SELECT their own notification preferences
CREATE POLICY "Users can view their own notification preferences"
  ON notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only INSERT their own notification preferences
CREATE POLICY "Users can insert their own notification preferences"
  ON notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only UPDATE their own notification preferences
CREATE POLICY "Users can update their own notification preferences"
  ON notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 6. COMMENTS for documentation
-- ============================================
COMMENT ON TABLE copied_trades IS 'Tracks trades that users have copied from traders they follow';
COMMENT ON COLUMN copied_trades.trader_still_has_position IS 'Whether the trader still holds this position';
COMMENT ON COLUMN copied_trades.notification_closed_sent IS 'Whether user was notified when trader closed position';
COMMENT ON COLUMN copied_trades.notification_resolved_sent IS 'Whether user was notified when market resolved';

COMMENT ON TABLE notification_preferences IS 'User preferences for email notifications about copied trades';

