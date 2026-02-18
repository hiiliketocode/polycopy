-- Track which markets are actively being viewed by users.
-- Updated by /api/polymarket/price as a side-effect.
-- Useful for future tiered refresh and analytics.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_requested_at TIMESTAMPTZ;
