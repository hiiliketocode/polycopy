-- ============================================================================
-- Migration: Add price cache fields to markets
-- Purpose: Store latest outcome prices and resolution data for reuse by
--          portfolio queries (avoids per-request Polymarket price calls).
-- Date: March 21, 2026
-- ============================================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS outcome_prices JSONB,
  ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_outcome TEXT,
  ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_markets_last_price_updated_at
  ON public.markets (last_price_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_markets_closed
  ON public.markets (closed);
