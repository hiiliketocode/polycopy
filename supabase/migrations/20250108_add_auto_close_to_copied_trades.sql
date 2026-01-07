-- Store auto-close preference on executed orders
ALTER TABLE copied_trades
  DROP COLUMN IF EXISTS auto_close_on_trader_close;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auto_close_on_trader_close boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN orders.auto_close_on_trader_close IS 'User opted to auto-close their order when the trader closes the position';
