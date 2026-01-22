-- Migration: Create table for aggregated Top 30 realized PnL windows
-- Purpose: Precompute summary rows for common lookback windows (7D, 30D, 90D, 180D, 365D, ALL)
--           so dashboard charts can read ready-made totals and averages without recomputing.

CREATE TABLE IF NOT EXISTS public.top30_realized_pnl_windows (
  window_key text NOT NULL,
  as_of date NOT NULL,
  lookback_days integer NULL,
  start_date date NOT NULL,
  wallet_count integer NOT NULL DEFAULT 0,
  total_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  average_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  cumulative_realized_pnl numeric(18,4) NOT NULL DEFAULT 0,
  cumulative_average_pnl numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (window_key, as_of)
);

COMMENT ON TABLE public.top30_realized_pnl_windows IS
  'Windowed aggregates for Top 30 realized PnL (common lookbacks).';
COMMENT ON COLUMN public.top30_realized_pnl_windows.window_key IS
  'Label such as 7D, 30D, 90D, 180D, 365D, ALL.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.as_of IS
  'Date that the window is anchored to (usually today).';
COMMENT ON COLUMN public.top30_realized_pnl_windows.lookback_days IS
  'Number of trailing days included in the window (null for ALL).';
COMMENT ON COLUMN public.top30_realized_pnl_windows.start_date IS
  'Calculated start date for the window.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.wallet_count IS
  'Number of Top 30 wallets included in the summary (typically 30).';
COMMENT ON COLUMN public.top30_realized_pnl_windows.total_realized_pnl IS
  'Sum of realized PnL for the window across top wallets.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.average_realized_pnl IS
  'Average realized PnL per day for the window.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.cumulative_realized_pnl IS
  'Running total (since window start) of daily aggregates.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.cumulative_average_pnl IS
  'Running total of average PnL for the window.';
COMMENT ON COLUMN public.top30_realized_pnl_windows.updated_at IS
  'When the window row was last refreshed.';

CREATE INDEX IF NOT EXISTS idx_top30_realized_pnl_windows_updated_at
  ON public.top30_realized_pnl_windows (updated_at DESC);
