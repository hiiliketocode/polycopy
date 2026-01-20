-- ============================================================================
-- Migration: Rebuild markets table from Dome API schema
-- Purpose: Store full Dome /polymarket/markets response keyed by condition_id
-- Date: March 17, 2026
-- ============================================================================

DROP TABLE IF EXISTS public.markets;

CREATE TABLE public.markets (
  condition_id TEXT PRIMARY KEY,
  market_slug TEXT,
  event_slug TEXT,
  title TEXT,
  start_time_unix BIGINT,
  end_time_unix BIGINT,
  completed_time_unix BIGINT,
  close_time_unix BIGINT,
  game_start_time_raw TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  completed_time TIMESTAMPTZ,
  close_time TIMESTAMPTZ,
  game_start_time TIMESTAMPTZ,
  tags JSONB,
  volume_1_week NUMERIC,
  volume_1_month NUMERIC,
  volume_1_year NUMERIC,
  volume_total NUMERIC,
  resolution_source TEXT,
  image TEXT,
  description TEXT,
  negative_risk_id TEXT,
  side_a JSONB,
  side_b JSONB,
  winning_side TEXT,
  status TEXT,
  extra_fields JSONB,
  raw_dome JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_markets_market_slug ON public.markets (market_slug);
CREATE INDEX IF NOT EXISTS idx_markets_event_slug ON public.markets (event_slug);
CREATE INDEX IF NOT EXISTS idx_markets_status ON public.markets (status);
CREATE INDEX IF NOT EXISTS idx_markets_start_time ON public.markets (start_time);

COMMENT ON TABLE public.markets IS
  'Dome API market metadata keyed by condition_id. Mirrors /polymarket/markets response; raw_dome stores full payload.';
