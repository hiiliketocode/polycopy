-- Migration: 021_trader_history_sync
-- Purpose: Tables for trader tracking, order/fill ingestion, and sync metadata

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: traders
-- ============================================================
CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: trader_sync_state
-- Stores ingestion metadata per trader (watermarks + errors)
-- ============================================================
CREATE TABLE IF NOT EXISTS trader_sync_state (
  trader_id UUID PRIMARY KEY REFERENCES traders(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMPTZ NULL,
  last_seen_order_ts TIMESTAMPTZ NULL,
  last_run_status TEXT NULL,
  last_run_error TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: orders (CLOB orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,                          -- CLOB order id
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  outcome TEXT NULL,                                  -- e.g., YES/NO or categorical outcome
  side TEXT NOT NULL,                                 -- BUY/SELL
  order_type TEXT NULL,                               -- limit/market/GTC/FAK/etc
  price NUMERIC(18, 8) NULL,
  size NUMERIC(24, 8) NOT NULL,
  filled_size NUMERIC(24, 8) NOT NULL DEFAULT 0,
  remaining_size NUMERIC(24, 8) NULL,
  status TEXT NOT NULL,                               -- open/partial/filled/canceled/expired/etc
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- order creation time from CLOB
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()       -- last status update time from CLOB
);

CREATE INDEX IF NOT EXISTS idx_orders_trader_created_at ON orders(trader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_market ON orders(market_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ============================================================
-- TABLE: fills (CLOB trades/fills)
-- ============================================================
CREATE TABLE IF NOT EXISTS fills (
  fill_id TEXT PRIMARY KEY,                           -- CLOB trade id or composite id per fill leg
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  price NUMERIC(18, 8) NOT NULL,
  size NUMERIC(24, 8) NOT NULL,
  outcome TEXT NULL,
  side TEXT NULL,                                     -- BUY/SELL relative to trader
  filled_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fills_order ON fills(order_id);
CREATE INDEX IF NOT EXISTS idx_fills_trader_filled_at ON fills(trader_id, filled_at DESC);

-- ============================================================
-- RLS (locked down by default)
-- - No SELECT/INSERT/UPDATE/DELETE policies are defined to keep data server-only.
-- - Service role bypasses RLS for ingestion and server-side APIs.
-- ============================================================
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trader_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE fills ENABLE ROW LEVEL SECURITY;
