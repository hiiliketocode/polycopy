-- ============================================================================
-- Migration: Recreate trades table + add trade_uid generated column
-- Purpose: Clean rebuild with idempotency indexes for fast upserts
-- Date: March 16, 2026
-- ============================================================================

-- WARNING: This migration drops and recreates public.trades, deleting all data.
DROP TABLE IF EXISTS public.trades;

CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares_normalized NUMERIC(18, 6) NOT NULL,
  price NUMERIC(18, 8) NOT NULL,
  token_id TEXT,
  token_label TEXT,
  condition_id TEXT,
  market_slug TEXT,
  title TEXT,
  tx_hash TEXT NOT NULL,
  order_hash TEXT,
  taker TEXT,
  source TEXT NOT NULL DEFAULT 'dome',
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trade_uid TEXT GENERATED ALWAYS AS (COALESCE(order_hash, 'tx:' || tx_hash)) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_wallet_trade_uid_unique
ON public.trades (wallet_address, trade_uid);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_idempotency
ON public.trades (
  wallet_address,
  tx_hash,
  COALESCE(order_hash, '')
);

CREATE INDEX IF NOT EXISTS idx_trades_wallet_timestamp
ON public.trades (wallet_address, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_trades_condition_id
ON public.trades (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_market_slug
ON public.trades (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_tx_hash
ON public.trades (tx_hash);

COMMENT ON COLUMN public.trades.trade_uid IS
  'Idempotency key: order_hash when present, else tx_hash prefixed with tx:.';
