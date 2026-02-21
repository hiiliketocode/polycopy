-- Lookup table for signals backtest: one row per unique resolved trade from top traders.
-- Populated in chunks by scripts/populate-signals-backtest-cache.ts to avoid statement timeouts.
-- The backtest script reads from here when available so we can include tens of thousands of trades.

CREATE TABLE IF NOT EXISTS signals_backtest_cache (
  source_trade_id text NOT NULL PRIMARY KEY,
  trader_address text,
  entry_price numeric,
  outcome text NOT NULL,
  model_probability numeric,
  trader_win_rate numeric,
  trader_roi numeric,
  trader_resolved_count bigint,
  conviction numeric,
  order_time timestamptz NOT NULL,
  refreshed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_backtest_cache_order_time
  ON signals_backtest_cache (order_time);

CREATE INDEX IF NOT EXISTS idx_signals_backtest_cache_trader
  ON signals_backtest_cache (trader_address);

COMMENT ON TABLE signals_backtest_cache IS 'Pre-aggregated resolved trades for /v2/signals backtest; populated by populate-signals-backtest-cache.ts in time chunks to avoid timeout.';
