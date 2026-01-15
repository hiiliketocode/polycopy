-- ============================================================================
-- Migration: Rename wallet_fills table to trades
-- Purpose: Use more intuitive table name "trades" instead of "wallet_fills"
-- Date: March 8, 2025
-- ============================================================================

-- Rename table
-- Note: PostgreSQL automatically renames the primary key constraint (wallet_fills_pkey -> trades_pkey)
ALTER TABLE public.wallet_fills
RENAME TO trades;

-- Rename indexes
ALTER INDEX IF EXISTS idx_wallet_fills_idempotency
RENAME TO idx_trades_idempotency;

ALTER INDEX IF EXISTS idx_wallet_fills_wallet_timestamp
RENAME TO idx_trades_wallet_timestamp;

ALTER INDEX IF EXISTS idx_wallet_fills_condition_id
RENAME TO idx_trades_condition_id;

ALTER INDEX IF EXISTS idx_wallet_fills_market_slug
RENAME TO idx_trades_market_slug;

ALTER INDEX IF EXISTS idx_wallet_fills_tx_hash
RENAME TO idx_trades_tx_hash;

-- Update table comment
COMMENT ON TABLE public.trades IS
  'Raw immutable fill events from Dome API. Stores BUY/SELL transactions without any derived data (no PnL, no FIFO matching).';

-- Update index comment
COMMENT ON INDEX idx_trades_idempotency IS
  'Idempotency constraint: prevents duplicate ingestion of same fill event. Handles null order_hash via COALESCE.';
