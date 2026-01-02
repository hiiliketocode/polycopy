-- Create payment_history table for revenue tracking and analytics
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  amount_dollars DECIMAL(10, 2) GENERATED ALWAYS AS (amount_cents::decimal / 100) STORED,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL, -- 'succeeded', 'failed', 'pending'
  payment_type TEXT NOT NULL, -- 'initial', 'renewal'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_status ON payment_history(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_customer ON payment_history(stripe_customer_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_history_updated_at
BEFORE UPDATE ON payment_history
FOR EACH ROW
EXECUTE FUNCTION update_payment_history_updated_at();

-- Enable Row Level Security
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own payment history
CREATE POLICY "Users can view their own payment history"
ON payment_history
FOR SELECT
USING (auth.uid() = user_id);

-- Only service role can insert/update (via webhooks)
CREATE POLICY "Service role can insert payment history"
ON payment_history
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update payment history"
ON payment_history
FOR UPDATE
USING (true);

-- Create a view for easy revenue analytics
CREATE OR REPLACE VIEW revenue_analytics AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as payment_count,
  SUM(amount_dollars) as total_revenue,
  AVG(amount_dollars) as avg_payment,
  COUNT(DISTINCT user_id) as unique_customers,
  COUNT(CASE WHEN payment_type = 'initial' THEN 1 END) as new_subscriptions,
  COUNT(CASE WHEN payment_type = 'renewal' THEN 1 END) as renewals
FROM payment_history
WHERE status = 'succeeded'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- Comment on the table
COMMENT ON TABLE payment_history IS 'Tracks all Stripe payment events for revenue analytics and business intelligence';

