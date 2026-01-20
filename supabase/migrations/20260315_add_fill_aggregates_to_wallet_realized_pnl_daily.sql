-- ============================================================================
-- Migration: Add fill-derived daily aggregates to wallet_realized_pnl_daily
-- Purpose: Store Dome fills-derived daily activity alongside realized PnL
-- Notes:
--   - Trade data source is Dome.
--   - realized_pnl is Dome realized PnL (not unrealized).
--   - Fill aggregates are derived from public.trades (Dome fills).
-- ============================================================================

ALTER TABLE public.wallet_realized_pnl_daily
  ADD COLUMN IF NOT EXISTS trade_count_total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_count_buy INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_count_sell INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notional_total NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notional_buy NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notional_sell NUMERIC(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_total NUMERIC(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_markets INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_conditions INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_trade_ts TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fills_source TEXT NOT NULL DEFAULT 'dome',
  ADD COLUMN IF NOT EXISTS fills_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.wallet_realized_pnl_daily.trade_count_total IS
  'Daily trade count from Dome fills (trades).';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.trade_count_buy IS
  'Daily BUY trade count from Dome fills (trades).';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.trade_count_sell IS
  'Daily SELL trade count from Dome fills (trades).';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.notional_total IS
  'Daily notional sum (shares_normalized * price) from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.notional_buy IS
  'Daily BUY notional sum from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.notional_sell IS
  'Daily SELL notional sum from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.shares_total IS
  'Daily shares_normalized sum from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.unique_markets IS
  'Daily distinct market_slug count from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.unique_conditions IS
  'Daily distinct condition_id count from Dome fills.';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.last_trade_ts IS
  'Latest fill timestamp for the day (UTC grouping).';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.fills_source IS
  'Fill aggregate source (default: dome).';
COMMENT ON COLUMN public.wallet_realized_pnl_daily.fills_updated_at IS
  'Last update time for fill-derived aggregates.';
