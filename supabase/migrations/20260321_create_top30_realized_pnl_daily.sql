-- Migration: Create persisted daily aggregates for the Top 30 realized leaderboard
-- Purpose: Store the aggregated and average realized P&L for the Top 30 wallets (30D window)
--           plus the accumulated totals over the trailing window so the index page can
--           read pre-computed data instead of re-aggregating in real time.

CREATE TABLE IF NOT EXISTS public.top30_realized_pnl_daily (
  date date NOT NULL PRIMARY KEY,
  wallet_count integer NOT NULL DEFAULT 0,
  total_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  average_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  cumulative_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  cumulative_average_pnl numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.top30_realized_pnl_daily IS
  'Daily aggregates for the Top 30 realized PnL leaderboard (30D window)';
COMMENT ON COLUMN public.top30_realized_pnl_daily.wallet_count IS
  'Number of ranked wallets included in the aggregation (typically 30).';
COMMENT ON COLUMN public.top30_realized_pnl_daily.total_realized_pnl IS
  'Sum of realized PnL returned by the Top 30 wallets for the given date.';
COMMENT ON COLUMN public.top30_realized_pnl_daily.average_realized_pnl IS
  'Arithmetic mean of the Top 30 wallets'' realized PnL for the date.';
COMMENT ON COLUMN public.top30_realized_pnl_daily.cumulative_realized_pnl IS
  'Running total of total_realized_pnl across the trailing window.';
COMMENT ON COLUMN public.top30_realized_pnl_daily.cumulative_average_pnl IS
  'Running total of average_realized_pnl across the trailing window.';
COMMENT ON COLUMN public.top30_realized_pnl_daily.updated_at IS
  'Last refresh timestamp for the aggregated row.';

CREATE INDEX IF NOT EXISTS idx_top30_realized_pnl_daily_updated_at
  ON public.top30_realized_pnl_daily (updated_at DESC);
