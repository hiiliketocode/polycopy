-- Add columns to orders table to store Polymarket's realized P&L
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS polymarket_realized_pnl NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_avg_price NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_total_bought NUMERIC,
ADD COLUMN IF NOT EXISTS polymarket_synced_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_polymarket_synced 
ON orders(copy_user_id, polymarket_synced_at) 
WHERE polymarket_synced_at IS NOT NULL;

COMMENT ON COLUMN orders.polymarket_realized_pnl IS 'Actual realized P&L from Polymarket API for closed positions';
COMMENT ON COLUMN orders.polymarket_avg_price IS 'Average entry price from Polymarket API';
COMMENT ON COLUMN orders.polymarket_total_bought IS 'Total shares bought from Polymarket API';
COMMENT ON COLUMN orders.polymarket_synced_at IS 'When this position was last synced with Polymarket API';
