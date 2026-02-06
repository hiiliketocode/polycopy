-- Run this in Supabase SQL Editor to add Polymarket P&L columns

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS polymarket_realized_pnl NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_avg_price NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_total_bought NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_synced_at TIMESTAMPTZ;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_polymarket_synced 
ON orders(copy_user_id, polymarket_synced_at) 
WHERE polymarket_synced_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN orders.polymarket_realized_pnl IS 'Actual realized P&L from Polymarket Data API for closed positions (includes fees)';
COMMENT ON COLUMN orders.polymarket_avg_price IS 'Average entry price from Polymarket Data API';
COMMENT ON COLUMN orders.polymarket_total_bought IS 'Total shares bought from Polymarket Data API';
COMMENT ON COLUMN orders.polymarket_synced_at IS 'Last sync timestamp with Polymarket Data API';
