-- Create subscription_cancellations table for tracking why users cancel
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS subscription_cancellations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL,
  reason TEXT,
  feedback TEXT,
  canceled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_user ON subscription_cancellations(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_date ON subscription_cancellations(canceled_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_reason ON subscription_cancellations(reason);

-- Enable RLS
ALTER TABLE subscription_cancellations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own cancellations"
ON subscription_cancellations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert cancellations"
ON subscription_cancellations FOR INSERT WITH CHECK (true);

-- Comments
COMMENT ON TABLE subscription_cancellations IS 'Tracks subscription cancellations for analytics and retention insights';
COMMENT ON COLUMN subscription_cancellations.reason IS 'Predefined cancellation reason (e.g., "Too expensive")';
COMMENT ON COLUMN subscription_cancellations.feedback IS 'Additional user feedback about cancellation';
COMMENT ON COLUMN subscription_cancellations.access_until IS 'When the user will lose premium access';

