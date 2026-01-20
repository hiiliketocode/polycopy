-- ============================================================================
-- Migration: Create markets + market_fetch_queue (Gamma metadata cache)
-- Purpose: Store Gamma market metadata keyed by condition_id and track fetch state
-- Date: March 17, 2026
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.markets (
  condition_id TEXT PRIMARY KEY,
  gamma_market_id TEXT,
  slug TEXT,
  question TEXT,
  description TEXT,
  category TEXT,
  tags JSONB,
  outcomes JSONB,
  outcome_prices JSONB,
  volume NUMERIC,
  liquidity NUMERIC,
  active BOOLEAN,
  closed BOOLEAN,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  twitter_card_image TEXT,
  icon TEXT,
  raw_gamma JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist if table was created manually before this migration.
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS gamma_market_id TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS question TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS tags JSONB;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS outcomes JSONB;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS outcome_prices JSONB;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS volume NUMERIC;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS liquidity NUMERIC;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS closed BOOLEAN;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS twitter_card_image TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS raw_gamma JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.markets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Clean up duplicates if the table existed without a PK or unique constraint.
DELETE FROM public.markets
WHERE condition_id IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    condition_id,
    ROW_NUMBER() OVER (
      PARTITION BY condition_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM public.markets
)
DELETE FROM public.markets m
USING ranked r
WHERE m.ctid = r.ctid
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.markets'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.markets
      ADD CONSTRAINT markets_pkey PRIMARY KEY (condition_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_markets_category ON public.markets (category);
CREATE INDEX IF NOT EXISTS idx_markets_active ON public.markets (active);
CREATE INDEX IF NOT EXISTS idx_markets_closed ON public.markets (closed);
CREATE INDEX IF NOT EXISTS idx_markets_slug ON public.markets (slug);
CREATE INDEX IF NOT EXISTS idx_markets_gamma_market_id ON public.markets (gamma_market_id);

COMMENT ON TABLE public.markets IS
  'Gamma API market metadata cache keyed by condition_id. Updated via upsert; raw_gamma stores full Gamma market response.';

-- ============================================================================
-- Queue table: which markets need fetching
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.market_fetch_queue (
  condition_id TEXT PRIMARY KEY,
  fetched BOOLEAN NOT NULL DEFAULT FALSE,
  last_attempt TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0)
);

ALTER TABLE public.market_fetch_queue ADD COLUMN IF NOT EXISTS fetched BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.market_fetch_queue ADD COLUMN IF NOT EXISTS last_attempt TIMESTAMPTZ;
ALTER TABLE public.market_fetch_queue ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0);

CREATE INDEX IF NOT EXISTS idx_market_fetch_queue_fetched_last_attempt
  ON public.market_fetch_queue (fetched, last_attempt);

COMMENT ON TABLE public.market_fetch_queue IS
  'Queue of condition_ids to fetch from Gamma. Rows persist after fetched=true to keep backfills idempotent and incremental.';
