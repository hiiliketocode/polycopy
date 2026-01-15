-- Track realized PnL time series per wallet (daily granularity, realized-only).

CREATE TABLE IF NOT EXISTS public.wallet_realized_pnl_daily (
  wallet_address text NOT NULL,
  date date NOT NULL,
  realized_pnl numeric(18,4) NOT NULL,
  pnl_to_date numeric(18,4),
  source text NOT NULL DEFAULT 'dome',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_realized_pnl_daily_pkey PRIMARY KEY (wallet_address, date)
);

CREATE INDEX IF NOT EXISTS idx_wallet_realized_pnl_daily_wallet
  ON public.wallet_realized_pnl_daily (wallet_address);

CREATE INDEX IF NOT EXISTS idx_wallet_realized_pnl_daily_date
  ON public.wallet_realized_pnl_daily (date);

COMMENT ON TABLE public.wallet_realized_pnl_daily IS
  'Daily realized PnL (90d window) ingested from Dome; no unrealized estimates.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.realized_pnl IS
  'Realized PnL for the given date; do not store unrealized PnL here.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.pnl_to_date IS
  'Optional cumulative realized PnL reported by the provider (if available).';
