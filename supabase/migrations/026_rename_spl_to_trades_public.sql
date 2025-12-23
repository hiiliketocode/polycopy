-- Migration: 026_rename_spl_to_trades_public
-- Purpose: Rename public.spl to trades_public for clarity

-- Rename table
ALTER TABLE IF EXISTS public.spl RENAME TO trades_public;

-- Rename indexes if they exist
ALTER INDEX IF EXISTS idx_spl_trade_id RENAME TO idx_trades_public_trade_id;
ALTER INDEX IF EXISTS idx_spl_trader_wallet_ts RENAME TO idx_trades_public_trader_wallet_ts;
ALTER INDEX IF EXISTS idx_spl_trader_id_ts RENAME TO idx_trades_public_trader_id_ts;
ALTER INDEX IF EXISTS idx_spl_condition_ts RENAME TO idx_trades_public_condition_ts;
