-- Single enriched table for signals backtest: resolution + trader stats (rolling) + ML when available.
-- Populated from trades_public + markets (resolution) + rolling WR/ROI/count/conviction + ft_orders (model_probability).
-- Use a 15-day (or configurable) lookback. Enables combo backtests (e.g. ML+WR, ML+conviction).

CREATE TABLE IF NOT EXISTS public.signals_backtest_enriched (
  trade_id TEXT NOT NULL PRIMARY KEY,
  trader_wallet TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  price NUMERIC NOT NULL,
  size NUMERIC,
  trade_timestamp TIMESTAMPTZ NOT NULL,
  outcome_side TEXT NOT NULL,
  resolved TEXT NOT NULL,
  -- Trader stats at time of trade (from rolling prior trades in same dataset)
  trader_win_rate NUMERIC,
  trader_roi NUMERIC,
  trader_resolved_count BIGINT,
  conviction NUMERIC,
  -- ML score when we have it (from ft_orders join)
  model_probability NUMERIC,
  refreshed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_backtest_enriched_ts
  ON public.signals_backtest_enriched (trade_timestamp);

CREATE INDEX IF NOT EXISTS idx_signals_backtest_enriched_trader
  ON public.signals_backtest_enriched (trader_wallet);

CREATE INDEX IF NOT EXISTS idx_signals_backtest_enriched_ml
  ON public.signals_backtest_enriched (model_probability) WHERE model_probability IS NOT NULL;

COMMENT ON TABLE public.signals_backtest_enriched IS 'Enriched resolved trades for signals backtest: resolution, rolling trader WR/ROI/count/conviction, and ML (from ft_orders). 15d lookback. Run combo backtests over this table.';
