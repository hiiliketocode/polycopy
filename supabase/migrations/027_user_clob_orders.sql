-- Migration: 027_user_clob_orders
-- Purpose: Premium user wallet identities, CLOB order lifecycle, and sync metadata

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: user_wallets
-- Connected wallet identity for a Polycopy user (premium-only CLOB access)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eoa_wallet TEXT NULL,
  proxy_wallet TEXT NULL,
  clob_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_wallets_eoa_lowercase_check
    CHECK (eoa_wallet IS NULL OR eoa_wallet = lower(eoa_wallet)),
  CONSTRAINT user_wallets_proxy_lowercase_check
    CHECK (proxy_wallet IS NULL OR proxy_wallet = lower(proxy_wallet))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_user_id_eoa_wallet
  ON public.user_wallets (user_id, eoa_wallet)
  WHERE eoa_wallet IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_proxy_wallet
  ON public.user_wallets (proxy_wallet)
  WHERE proxy_wallet IS NOT NULL;

COMMENT ON TABLE public.user_wallets IS
  'Connected wallet identity for an authenticated premium user; not part of public trader history or public trades.';

-- ============================================================
-- TABLE: user_clob_sync_state
-- Per-wallet ingestion watermarks and errors (server-owned)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_clob_sync_state (
  user_wallet_id UUID PRIMARY KEY REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  last_seen_updated_at TIMESTAMPTZ NULL,
  last_run_status TEXT NULL,
  last_run_error TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_clob_sync_state IS
  'Server-side sync metadata for premium user CLOB orders; not exposed to public clients.';

-- ============================================================
-- TABLE: user_clob_orders
-- Canonical CLOB order lifecycle for authenticated users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_clob_orders (
  order_id TEXT PRIMARY KEY,
  user_wallet_id UUID NOT NULL REFERENCES public.user_wallets(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  outcome TEXT NULL,
  side TEXT NOT NULL,
  order_type TEXT NULL,
  time_in_force TEXT NULL,
  price NUMERIC(18, 8) NULL,
  size NUMERIC(24, 8) NOT NULL,
  filled_size NUMERIC(24, 8) NOT NULL DEFAULT 0,
  remaining_size NUMERIC(24, 8) NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  raw JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_clob_orders_wallet_created_at
  ON public.user_clob_orders (user_wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_clob_orders_wallet_status_updated_at
  ON public.user_clob_orders (user_wallet_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_clob_orders_market
  ON public.user_clob_orders (market_id);

CREATE INDEX IF NOT EXISTS idx_user_clob_orders_status
  ON public.user_clob_orders (status);

COMMENT ON TABLE public.user_clob_orders IS
  'Authenticated premium user CLOB order lifecycle (resting/open + closed history); not public trades, not trader roster, and not positions.';

-- ============================================================
-- RLS: user_wallets
-- ============================================================
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own user_wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Users can insert their own user_wallets" ON public.user_wallets;
DROP POLICY IF EXISTS "Users can update their own user_wallets" ON public.user_wallets;

CREATE POLICY "Users can read their own user_wallets"
ON public.user_wallets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own user_wallets"
ON public.user_wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own user_wallets"
ON public.user_wallets
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- RLS: user_clob_sync_state
-- ============================================================
ALTER TABLE public.user_clob_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own user_clob_sync_state" ON public.user_clob_sync_state;

CREATE POLICY "Users can read their own user_clob_sync_state"
ON public.user_clob_sync_state
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_wallets uw
    WHERE uw.id = user_clob_sync_state.user_wallet_id
      AND uw.user_id = auth.uid()
  )
);

-- ============================================================
-- RLS: user_clob_orders
-- ============================================================
ALTER TABLE public.user_clob_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own user_clob_orders" ON public.user_clob_orders;

CREATE POLICY "Users can read their own user_clob_orders"
ON public.user_clob_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_wallets uw
    WHERE uw.id = user_clob_orders.user_wallet_id
      AND uw.user_id = auth.uid()
  )
);
