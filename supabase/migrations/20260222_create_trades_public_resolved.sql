-- Resolved trades from trades_public for signals backtest (large-N, statistically significant).
-- Populated by joining trades_public with markets (closed + winning_side/resolved_outcome).
-- One row per trade; backtest runs on this table instead of ft_orders.

CREATE TABLE IF NOT EXISTS public.trades_public_resolved (
  trade_id TEXT NOT NULL PRIMARY KEY,
  trader_wallet TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  price NUMERIC NOT NULL,
  size NUMERIC,
  trade_timestamp TIMESTAMPTZ NOT NULL,
  outcome_side TEXT NOT NULL,
  resolved TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_public_resolved_ts
  ON public.trades_public_resolved (trade_timestamp);

CREATE INDEX IF NOT EXISTS idx_trades_public_resolved_price
  ON public.trades_public_resolved (price);

CREATE INDEX IF NOT EXISTS idx_trades_public_resolved_trader
  ON public.trades_public_resolved (trader_wallet);

COMMENT ON TABLE public.trades_public_resolved IS 'Resolved trades from trades_public (joined with markets) for /v2/signals backtest. Populated in chunks by populate-trades-public-resolved.ts.';
