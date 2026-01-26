-- ============================================================================
-- Migration: Create user_portfolio_summary table
-- Purpose: Cache calculated portfolio stats for fast display on portfolio page
-- Date: January 25, 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_portfolio_summary (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  
  -- P&L Metrics
  total_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
  
  -- Trading Statistics
  total_volume NUMERIC(18, 2) NOT NULL DEFAULT 0,
  roi NUMERIC(10, 4) NOT NULL DEFAULT 0,
  win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0,
  
  -- Trade Counts
  total_trades INTEGER NOT NULL DEFAULT 0,
  total_buy_trades INTEGER NOT NULL DEFAULT 0,
  total_sell_trades INTEGER NOT NULL DEFAULT 0,
  open_positions INTEGER NOT NULL DEFAULT 0,
  closed_positions INTEGER NOT NULL DEFAULT 0,
  winning_positions INTEGER NOT NULL DEFAULT 0,
  losing_positions INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Version tracking (increment when calculation logic changes)
  calculation_version INTEGER NOT NULL DEFAULT 1
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_portfolio_summary_user_id 
ON public.user_portfolio_summary (user_id);

-- Index for finding stale summaries (older than X minutes)
CREATE INDEX IF NOT EXISTS idx_user_portfolio_summary_updated_at 
ON public.user_portfolio_summary (last_updated_at);

-- RLS Policy: Users can only see their own portfolio summary
ALTER TABLE public.user_portfolio_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own portfolio summary"
ON public.user_portfolio_summary
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all portfolio summaries"
ON public.user_portfolio_summary
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to upsert portfolio summary (for use in API)
CREATE OR REPLACE FUNCTION public.upsert_user_portfolio_summary(
  p_user_id UUID,
  p_total_pnl NUMERIC,
  p_realized_pnl NUMERIC,
  p_unrealized_pnl NUMERIC,
  p_total_volume NUMERIC,
  p_roi NUMERIC,
  p_win_rate NUMERIC,
  p_total_trades INTEGER,
  p_total_buy_trades INTEGER,
  p_total_sell_trades INTEGER,
  p_open_positions INTEGER,
  p_closed_positions INTEGER,
  p_winning_positions INTEGER,
  p_losing_positions INTEGER,
  p_calculation_version INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_portfolio_summary (
    user_id,
    total_pnl,
    realized_pnl,
    unrealized_pnl,
    total_volume,
    roi,
    win_rate,
    total_trades,
    total_buy_trades,
    total_sell_trades,
    open_positions,
    closed_positions,
    winning_positions,
    losing_positions,
    calculated_at,
    last_updated_at,
    calculation_version
  )
  VALUES (
    p_user_id,
    p_total_pnl,
    p_realized_pnl,
    p_unrealized_pnl,
    p_total_volume,
    p_roi,
    p_win_rate,
    p_total_trades,
    p_total_buy_trades,
    p_total_sell_trades,
    p_open_positions,
    p_closed_positions,
    p_winning_positions,
    p_losing_positions,
    NOW(),
    NOW(),
    p_calculation_version
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_pnl = EXCLUDED.total_pnl,
    realized_pnl = EXCLUDED.realized_pnl,
    unrealized_pnl = EXCLUDED.unrealized_pnl,
    total_volume = EXCLUDED.total_volume,
    roi = EXCLUDED.roi,
    win_rate = EXCLUDED.win_rate,
    total_trades = EXCLUDED.total_trades,
    total_buy_trades = EXCLUDED.total_buy_trades,
    total_sell_trades = EXCLUDED.total_sell_trades,
    open_positions = EXCLUDED.open_positions,
    closed_positions = EXCLUDED.closed_positions,
    winning_positions = EXCLUDED.winning_positions,
    losing_positions = EXCLUDED.losing_positions,
    last_updated_at = NOW(),
    calculation_version = EXCLUDED.calculation_version;
END;
$$;

COMMENT ON TABLE public.user_portfolio_summary IS 
  'Cached portfolio performance summaries for users. Updated when user opens portfolio page.';

COMMENT ON COLUMN public.user_portfolio_summary.calculation_version IS 
  'Version number of calculation logic. Increment when P&L calculation methodology changes to force recalculation.';

COMMENT ON COLUMN public.user_portfolio_summary.calculated_at IS 
  'When this summary was first calculated (preserved on updates).';

COMMENT ON COLUMN public.user_portfolio_summary.last_updated_at IS 
  'When this summary was last updated (changes on every update).';
