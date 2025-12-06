-- Add columns for user-closed trades
-- This allows users to manually mark trades as closed and record their exit price

ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS user_closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS user_exit_price DECIMAL(10,4);

-- Add comment to explain the columns
COMMENT ON COLUMN copied_trades.user_closed_at IS 'Timestamp when the user manually marked this trade as closed';
COMMENT ON COLUMN copied_trades.user_exit_price IS 'The price the user exited at (in decimal format, e.g., 0.65 for 65 cents)';
