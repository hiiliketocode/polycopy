-- Migration: Add resolved_outcome column to copied_trades
-- Created: 2024-12-03
-- Description: Stores the winning outcome when a market resolves

-- Add resolved_outcome column to store which outcome won when market resolves
ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS resolved_outcome TEXT;

-- Add comment for documentation
COMMENT ON COLUMN copied_trades.resolved_outcome IS 'The winning outcome when market resolves (YES, NO, or custom outcome name)';

-- Also ensure we have the notification tracking columns if they don't exist
ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS notification_closed_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS notification_resolved_sent BOOLEAN DEFAULT FALSE;

ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

-- Add comments for notification columns
COMMENT ON COLUMN copied_trades.notification_closed_sent IS 'Whether the trader-closed-position notification has been sent';
COMMENT ON COLUMN copied_trades.notification_resolved_sent IS 'Whether the market-resolved notification has been sent';
COMMENT ON COLUMN copied_trades.last_checked_at IS 'Timestamp of last status check by cron job';

