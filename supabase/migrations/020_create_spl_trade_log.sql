-- Migration: 020_create_spl_trade_log
-- Purpose: Raw storage for Polymarket trade dumps (one row per trade)
-- NOTE: Finalized in 025_finalize_public_spl
-- Run this in Supabase SQL Editor or via the Supabase CLI before importing data

-- Enable UUID extension (defensive; no UUID columns yet but kept for consistency)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: spl
-- Stores raw Polymarket trades for tracked traders
-- ============================================================
CREATE TABLE IF NOT EXISTS spl (
  id BIGSERIAL PRIMARY KEY,

  -- Trade identity
  trade_id TEXT NOT NULL,                -- Stable identifier (transaction hash or derived)
  trader_wallet TEXT NOT NULL,           -- Wallet address (lowercase)
  transaction_hash TEXT,                 -- Polymarket transaction hash

  -- Market identifiers
  asset TEXT,                            -- Asset/market id from Polymarket API
  condition_id TEXT,                     -- conditionId from API
  market_slug TEXT,                      -- slug from API (market slug)
  event_slug TEXT,                       -- eventSlug from API
  market_title TEXT,                     -- title from API

  -- Trade details
  side TEXT,                             -- BUY/SELL
  outcome TEXT,                          -- Outcome name (e.g., Yes/No)
  outcome_index INTEGER,                 -- Numeric outcome index from API
  size NUMERIC(24, 8),                   -- Size of trade
  price NUMERIC(18, 8),                  -- Execution price
  trade_timestamp TIMESTAMPTZ,           -- Converted from API timestamp

  -- Full payload for future-proofing
  raw JSONB NOT NULL,                    -- Entire trade object as returned by API

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES / CONSTRAINTS
-- ============================================================
-- Avoid duplicates when re-running imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_spl_trade_id ON spl(trade_id);

-- Fast lookups by trader or market
CREATE INDEX IF NOT EXISTS idx_spl_trader_wallet ON spl(trader_wallet);
CREATE INDEX IF NOT EXISTS idx_spl_condition_id ON spl(condition_id);
CREATE INDEX IF NOT EXISTS idx_spl_trade_timestamp ON spl(trade_timestamp DESC);

-- ============================================================
-- NOTES
-- - RLS intentionally left DISABLED for this admin-only table.
--   Use the service role key when inserting/querying.
-- - `trade_id` should be a deterministic string (e.g., transaction hash or
--   `${transactionHash}-${asset}-${outcomeIndex}`) to allow safe upserts.
