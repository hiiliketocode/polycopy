-- Migration: 036_trades_public_hardening
-- Purpose: Ensure trades_public dedup, latest-wins metadata, and add wallet backfill tracking.

-- ============================================================
-- Schema tweaks for trades_public metadata
-- ============================================================
ALTER TABLE trades_public
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS trade_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

UPDATE trades_public
SET last_seen_at = COALESCE(last_seen_at, created_at);

ALTER TABLE trades_public
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT NOW();

-- ============================================================
-- Deduplicate existing trade_id rows (keep most recent)
-- ============================================================
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY trade_id
      ORDER BY COALESCE(source_updated_at, last_seen_at, created_at) DESC, id DESC
    ) AS rn
  FROM trades_public
)
DELETE FROM trades_public
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- ============================================================
-- Enforce unique constraint on trade_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_trades_public_trade_id'
  ) THEN
    ALTER TABLE trades_public
    ADD CONSTRAINT uq_trades_public_trade_id
    UNIQUE USING INDEX idx_trades_public_trade_id;
  END IF;
END
$$;

-- ============================================================
-- Wallet backfill tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_backfills (
  wallet TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_before_ts TIMESTAMPTZ,
  cursor_offset INTEGER,
  last_trade_time TIMESTAMPTZ,
  max_offset_reached INTEGER,
  partial_reason TEXT,
  last_run_at TIMESTAMPTZ,
  error_count INTEGER NOT NULL DEFAULT 0,
  inserted_trades BIGINT NOT NULL DEFAULT 0
);

-- ============================================================
-- RPC: conditional upsert with latest-wins semantics
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_trades_public(trades jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  entry jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(trades) LOOP
    INSERT INTO trades_public (
      trade_id,
      trader_wallet,
      trader_id,
      transaction_hash,
      status,
      asset,
      condition_id,
      market_slug,
      event_slug,
      market_title,
      side,
      outcome,
      outcome_index,
      size,
      price,
      trade_timestamp,
      trade_time,
      source_updated_at,
      raw
    )
    VALUES (
      entry->>'trade_id',
      entry->>'trader_wallet',
      NULLIF(entry->>'trader_id', '')::uuid,
      NULLIF(entry->>'transaction_hash', ''),
      NULLIF(entry->>'status', ''),
      NULLIF(entry->>'asset', ''),
      NULLIF(entry->>'condition_id', ''),
      NULLIF(entry->>'market_slug', ''),
      NULLIF(entry->>'event_slug', ''),
      NULLIF(entry->>'market_title', ''),
      NULLIF(entry->>'side', ''),
      NULLIF(entry->>'outcome', ''),
      NULLIF(entry->>'outcome_index', '')::INTEGER,
      NULLIF(entry->>'size', '')::NUMERIC,
      NULLIF(entry->>'price', '')::NUMERIC,
      NULLIF(entry->>'trade_timestamp', '')::timestamptz,
      NULLIF(entry->>'trade_time', '')::timestamptz,
      NULLIF(entry->>'source_updated_at', '')::timestamptz,
      entry->'raw'
    )
    ON CONFLICT (trade_id) DO UPDATE SET
      trader_wallet = EXCLUDED.trader_wallet,
      trader_id = EXCLUDED.trader_id,
      transaction_hash = EXCLUDED.transaction_hash,
      status = EXCLUDED.status,
      asset = EXCLUDED.asset,
      condition_id = EXCLUDED.condition_id,
      market_slug = EXCLUDED.market_slug,
      event_slug = EXCLUDED.event_slug,
      market_title = EXCLUDED.market_title,
      side = EXCLUDED.side,
      outcome = EXCLUDED.outcome,
      outcome_index = EXCLUDED.outcome_index,
      size = EXCLUDED.size,
      price = EXCLUDED.price,
      trade_timestamp = EXCLUDED.trade_timestamp,
      trade_time = EXCLUDED.trade_time,
      source_updated_at = EXCLUDED.source_updated_at,
      raw = EXCLUDED.raw,
      last_seen_at = NOW()
    WHERE COALESCE(
      EXCLUDED.source_updated_at,
      EXCLUDED.trade_time,
      EXCLUDED.trade_timestamp
    ) >= COALESCE(
      trades_public.source_updated_at,
      trades_public.trade_time,
      trades_public.trade_timestamp,
      trades_public.last_seen_at,
      trades_public.created_at
    );
  END LOOP;
END;
$$;
