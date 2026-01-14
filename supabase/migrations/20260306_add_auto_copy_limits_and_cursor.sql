-- Expand auto_copy_configs with USD sizing, price filters, and a trade cursor for Polymarket ingestion.

ALTER TABLE public.auto_copy_configs
  ADD COLUMN IF NOT EXISTS min_trade_usd numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_trade_usd numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS min_price numeric,
  ADD COLUMN IF NOT EXISTS max_price numeric,
  ADD COLUMN IF NOT EXISTS last_trader_trade_ts timestamptz,
  ADD COLUMN IF NOT EXISTS last_trader_trade_id text;

CREATE INDEX IF NOT EXISTS idx_auto_copy_configs_last_trade_ts
  ON public.auto_copy_configs (last_trader_trade_ts DESC);

COMMENT ON COLUMN public.auto_copy_configs.min_trade_usd IS
  'Minimum USD amount to copy per trade (clamped on follower order).';
COMMENT ON COLUMN public.auto_copy_configs.max_trade_usd IS
  'Maximum USD amount to copy per trade (applied before allocation cap).';
COMMENT ON COLUMN public.auto_copy_configs.min_price IS
  'Optional lower bound for accepted trade prices.';
COMMENT ON COLUMN public.auto_copy_configs.max_price IS
  'Optional upper bound for accepted trade prices.';
COMMENT ON COLUMN public.auto_copy_configs.last_trader_trade_ts IS
  'Cursor timestamp of the last Polymarket trade processed for this trader.';
COMMENT ON COLUMN public.auto_copy_configs.last_trader_trade_id IS
  'Optional cursor identifier for the last processed trade.';

