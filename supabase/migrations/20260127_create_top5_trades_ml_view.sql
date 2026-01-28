-- ============================================================================
-- Migration: Create ML-ready view for top5 trades
-- Purpose: Join top5 trades + markets + trade timing calculations
-- Date: Jan 27, 2026
--
-- Notes:
-- - Timing uses public.calculate_trade_timing(), which uses markets.close_time
--   (when trading stops), NOT markets.end_time (final resolution confirmation).
-- - This is a VIEW (no heavy table rewrite / avoids upstream timeouts).
-- ============================================================================

DROP VIEW IF EXISTS public.top5_trades_ml;

CREATE VIEW public.top5_trades_ml AS
SELECT
  twm.*,
  timing.seconds_before_game_start,
  timing.seconds_before_market_end,
  timing.trade_timing_category
FROM public.top5_trades_with_markets twm
LEFT JOIN LATERAL public.calculate_trade_timing(twm."timestamp", twm.condition_id) AS timing ON true;

COMMENT ON VIEW public.top5_trades_ml IS
  'Top5 (30D) trades joined with markets + timing fields (seconds_before_game_start, seconds_before_market_end, trade_timing_category). Timing uses markets.close_time.';

