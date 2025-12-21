-- Migration: 024_rename_spl_to_trades_public
-- Purpose: Rename legacy spl table + indexes to trades_public for clarity
-- NOTE: 025_finalize_public_spl renames back to public.spl and applies final schema.

-- Rename the table if it exists
ALTER TABLE IF EXISTS spl RENAME TO trades_public;

-- Rename indexes for readability (no-ops if they do not exist)
ALTER INDEX IF EXISTS idx_spl_trade_id RENAME TO idx_trades_public_trade_id;
ALTER INDEX IF EXISTS idx_spl_trader_wallet RENAME TO idx_trades_public_trader_wallet;
ALTER INDEX IF EXISTS idx_spl_condition_id RENAME TO idx_trades_public_condition_id;
ALTER INDEX IF EXISTS idx_spl_trade_timestamp RENAME TO idx_trades_public_trade_timestamp;
