-- RUN THIS IN SUPABASE SQL EDITOR
-- Add support for user-closed trades

-- Add columns for tracking when users manually close their copied trades
ALTER TABLE copied_trades 
ADD COLUMN IF NOT EXISTS user_closed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS user_exit_price DECIMAL(10,4);

-- Add helpful comments
COMMENT ON COLUMN copied_trades.user_closed_at IS 'Timestamp when the user manually marked this trade as closed';
COMMENT ON COLUMN copied_trades.user_exit_price IS 'The price the user exited at (in decimal format, e.g., 0.65 for 65 cents)';

-- Verify the columns were added successfully
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'copied_trades'
AND column_name IN ('user_closed_at', 'user_exit_price');
