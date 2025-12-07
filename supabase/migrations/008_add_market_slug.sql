-- Add market_slug column to copied_trades table
-- This allows us to link directly to markets on Polymarket

ALTER TABLE copied_trades
ADD COLUMN IF NOT EXISTS market_slug TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_copied_trades_slug ON copied_trades(market_slug);

-- Add comment to explain the column
COMMENT ON COLUMN copied_trades.market_slug IS 'The Polymarket market slug for direct linking (e.g., "hellas-verona-fc-vs-atalanta-bc")';
