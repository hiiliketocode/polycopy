-- ============================================================================
-- Migration: Create view joining top5 trades + markets
-- Purpose: Enrich top5_traders_trades with markets metadata + outcome_prices
-- Date: Jan 27, 2026
-- ============================================================================

DROP VIEW IF EXISTS public.top5_trades_with_markets;

CREATE VIEW public.top5_trades_with_markets AS
SELECT
  t.*,

  -- Markets fields (prefixed to avoid name collisions with trades columns)
  m.condition_id AS market_condition_id,
  m.market_slug AS market_market_slug,
  m.event_slug AS market_event_slug,
  m.title AS market_title,

  m.start_time_unix AS market_start_time_unix,
  m.end_time_unix AS market_end_time_unix,
  m.completed_time_unix AS market_completed_time_unix,
  m.close_time_unix AS market_close_time_unix,
  m.game_start_time_raw AS market_game_start_time_raw,

  m.start_time AS market_start_time,
  m.end_time AS market_end_time,
  m.completed_time AS market_completed_time,
  m.close_time AS market_close_time,
  m.game_start_time AS market_game_start_time,

  m.tags AS market_tags,
  m.volume_1_week AS market_volume_1_week,
  m.volume_1_month AS market_volume_1_month,
  m.volume_1_year AS market_volume_1_year,
  m.volume_total AS market_volume_total,
  m.resolution_source AS market_resolution_source,
  m.image AS market_image,
  m.description AS market_description,
  m.negative_risk_id AS market_negative_risk_id,
  m.side_a AS market_side_a,
  m.side_b AS market_side_b,

  m.winning_side AS market_winning_side,
  m.resolved_outcome AS market_resolved_outcome,
  m.outcome_prices AS market_outcome_prices,
  m.last_price_updated_at AS market_last_price_updated_at,
  m.closed AS market_closed,
  m.status AS market_status,

  m.extra_fields AS market_extra_fields,
  m.raw_dome AS market_raw_dome,
  m.created_at AS market_created_at,
  m.updated_at AS market_updated_at
FROM public.top5_traders_trades t
LEFT JOIN public.markets m
  ON m.condition_id = t.condition_id;

COMMENT ON VIEW public.top5_trades_with_markets IS
  'Top-5 (30D) trades enriched with markets metadata + outcome_prices. Source: top5_traders_trades LEFT JOIN markets on condition_id.';

