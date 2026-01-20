-- ============================================================================
-- Migration: Create wallet_fills table for raw Dome API fill events
-- Purpose: Store immutable raw fill events from Dome API (Polymarket orders)
-- Date: March 8, 2025
-- Data Source: Dome API /polymarket/orders endpoint
-- ============================================================================
-- 
-- This table stores raw fill events (BUY/SELL) from Dome API.
-- It is immutable - no updates, only inserts. All derived data (PnL, FIFO matching)
-- will be calculated in separate tables/views.
--
-- Idempotency: Safe to rerun ingestion via unique constraint on
-- (wallet_address, tx_hash, COALESCE(order_hash, ''))
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wallet_fills (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Wallet identification
  wallet_address TEXT NOT NULL,
  
  -- Timestamp (converted from Dome's Unix seconds to timestamptz)
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Trade details
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares NUMERIC(18,0),  -- Raw shares (integer) from Dome API
  shares_normalized NUMERIC(18,6) NOT NULL,
  price NUMERIC(18,8) NOT NULL,
  
  -- Market/token identification
  token_id TEXT,
  token_label TEXT,  -- "Yes" or "No" (outcome)
  condition_id TEXT,
  market_slug TEXT,
  title TEXT,  -- Market title
  
  -- Transaction identifiers
  tx_hash TEXT NOT NULL,
  order_hash TEXT,  -- Can be null for some fills
  taker TEXT,  -- Taker wallet address
  
  -- Metadata
  source TEXT NOT NULL DEFAULT 'dome',  -- Data source identifier
  raw JSONB NOT NULL,  -- Complete raw payload from Dome API
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- IDEMPOTENCY CONSTRAINT
-- ============================================================================
-- Unique constraint to prevent duplicate ingestion.
-- Handles null order_hash by using COALESCE to empty string.
-- This ensures:
-- - Same (wallet, tx_hash, order_hash) = same fill (dedupe)
-- - Same (wallet, tx_hash) with null order_hash = same fill (dedupe)
-- - Safe to rerun ingestion scripts

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_fills_idempotency
ON public.wallet_fills (
  wallet_address,
  tx_hash,
  COALESCE(order_hash, '')
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Index for querying fills by wallet and time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_wallet_fills_wallet_timestamp
ON public.wallet_fills (wallet_address, timestamp DESC);

-- Index for querying by condition_id (for market-level analysis)
CREATE INDEX IF NOT EXISTS idx_wallet_fills_condition_id
ON public.wallet_fills (condition_id)
WHERE condition_id IS NOT NULL;

-- Index for querying by market_slug (for market-level analysis)
CREATE INDEX IF NOT EXISTS idx_wallet_fills_market_slug
ON public.wallet_fills (market_slug)
WHERE market_slug IS NOT NULL;

-- Index for querying by tx_hash (for transaction lookups)
CREATE INDEX IF NOT EXISTS idx_wallet_fills_tx_hash
ON public.wallet_fills (tx_hash);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.wallet_fills IS
  'Raw immutable fill events from Dome API. Stores BUY/SELL transactions without any derived data (no PnL, no FIFO matching).';

COMMENT ON COLUMN public.wallet_fills.wallet_address IS
  'Trader wallet address (maker).';

COMMENT ON COLUMN public.wallet_fills.timestamp IS
  'Fill timestamp converted from Dome API Unix seconds to timestamptz.';

COMMENT ON COLUMN public.wallet_fills.side IS
  'Trade side: BUY or SELL.';

COMMENT ON COLUMN public.wallet_fills.shares IS
  'Raw shares (integer) from Dome API shares field.';

COMMENT ON COLUMN public.wallet_fills.shares_normalized IS
  'Normalized shares (decimal) from Dome API shares_normalized field.';

COMMENT ON COLUMN public.wallet_fills.price IS
  'Fill price per share.';

COMMENT ON COLUMN public.wallet_fills.token_label IS
  'Outcome label: "Yes" or "No" (from Dome API token_label).';

COMMENT ON COLUMN public.wallet_fills.tx_hash IS
  'Transaction hash (always present, used in idempotency constraint).';

COMMENT ON COLUMN public.wallet_fills.order_hash IS
  'Order hash (can be null, handled in idempotency constraint via COALESCE).';

COMMENT ON COLUMN public.wallet_fills.raw IS
  'Complete raw JSON payload from Dome API for audit/debugging.';

COMMENT ON COLUMN public.wallet_fills.source IS
  'Data source identifier (default: "dome", can be "dome_websocket" later).';

COMMENT ON INDEX idx_wallet_fills_idempotency IS
  'Idempotency constraint: prevents duplicate ingestion of same fill event. Handles null order_hash via COALESCE.';
