-- Migration: 025_finalize_public_spl
-- Purpose: Finalize public.spl schema for executed trades from Polymarket public API
-- NOTE: 026_rename_spl_to_trades_public renames the table after this migration.

-- Ensure table name is public.spl (legacy rename safety)
ALTER TABLE IF EXISTS trades_public SET SCHEMA public;
ALTER TABLE IF EXISTS trades_public RENAME TO spl;

-- Add trader mapping and ingestion timestamp
ALTER TABLE IF EXISTS public.spl
  ADD COLUMN IF NOT EXISTS trader_id UUID REFERENCES public.traders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add public trades watermark to sync state
ALTER TABLE IF EXISTS public.trader_sync_state
  ADD COLUMN IF NOT EXISTS last_seen_trade_ts TIMESTAMPTZ NULL;

-- Clarify identity semantics (proxy wallet, not EOA)
COMMENT ON COLUMN public.spl.trader_wallet IS 'Proxy wallet used by Polymarket for public executed trades (not the EOA).';

-- Remove invalid rows before enforcing required fields
DELETE FROM public.spl
WHERE trade_id IS NULL
   OR trader_wallet IS NULL
   OR condition_id IS NULL
   OR trade_timestamp IS NULL
   OR raw IS NULL;

-- Enforce required fields
ALTER TABLE public.spl ALTER COLUMN condition_id SET NOT NULL;
ALTER TABLE public.spl ALTER COLUMN trade_timestamp SET NOT NULL;

-- Lightweight constraints for side/outcome values (Postgres lacks IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spl_side_check'
  ) THEN
    ALTER TABLE public.spl
      ADD CONSTRAINT spl_side_check
      CHECK (side IS NULL OR lower(side) IN ('buy', 'sell')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'spl_outcome_check'
  ) THEN
    ALTER TABLE public.spl
      ADD CONSTRAINT spl_outcome_check
      CHECK (outcome IS NULL OR lower(outcome) IN ('yes', 'no')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.spl VALIDATE CONSTRAINT spl_side_check;
ALTER TABLE public.spl VALIDATE CONSTRAINT spl_outcome_check;

-- Rename legacy index names if they exist (from trades_public rename)
ALTER INDEX IF EXISTS idx_trades_public_trade_id RENAME TO idx_spl_trade_id;
ALTER INDEX IF EXISTS idx_trades_public_trader_wallet RENAME TO idx_spl_trader_wallet;
ALTER INDEX IF EXISTS idx_trades_public_condition_id RENAME TO idx_spl_condition_id;
ALTER INDEX IF EXISTS idx_trades_public_trade_timestamp RENAME TO idx_spl_trade_timestamp;

-- Indexes for idempotent upserts and analytics
CREATE UNIQUE INDEX IF NOT EXISTS idx_spl_trade_id
  ON public.spl (trade_id);

CREATE INDEX IF NOT EXISTS idx_spl_trader_wallet_ts
  ON public.spl (trader_wallet, trade_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_spl_trader_id_ts
  ON public.spl (trader_id, trade_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_spl_condition_ts
  ON public.spl (condition_id, trade_timestamp DESC);
