-- Store auto-close preference on executed orders
ALTER TABLE copied_trades
  DROP COLUMN IF EXISTS auto_close_on_trader_close;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auto_close_on_trader_close boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_close_slippage_percent double precision,
  ADD COLUMN IF NOT EXISTS auto_close_triggered_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_close_order_id text,
  ADD COLUMN IF NOT EXISTS auto_close_error text,
  ADD COLUMN IF NOT EXISTS auto_close_attempted_at timestamptz;

COMMENT ON COLUMN orders.auto_close_on_trader_close IS 'User opted to auto-close their order when the trader closes the position';
COMMENT ON COLUMN orders.auto_close_slippage_percent IS 'Slippage percent to use when auto-closing this position';
COMMENT ON COLUMN orders.auto_close_triggered_at IS 'Timestamp when auto-close was successfully triggered';
COMMENT ON COLUMN orders.auto_close_order_id IS 'Order ID created for the auto-close order';
COMMENT ON COLUMN orders.auto_close_error IS 'Last auto-close error message';
COMMENT ON COLUMN orders.auto_close_attempted_at IS 'Last time auto-close was attempted for this order';
