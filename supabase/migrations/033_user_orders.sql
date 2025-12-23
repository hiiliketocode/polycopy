-- Migration: 033_user_orders
-- Purpose: Store per-user CLOB orders for the Orders page

CREATE TABLE IF NOT EXISTS public.user_orders (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polymarket_order_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  market_question TEXT NULL,
  market_url TEXT NULL,
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
  source TEXT NOT NULL DEFAULT 'polymarket',
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, polymarket_order_id)
);

CREATE INDEX IF NOT EXISTS idx_user_orders_user_created_at
  ON public.user_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_orders_status_updated_at
  ON public.user_orders (user_id, status, updated_at DESC);

ALTER TABLE public.user_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own user_orders" ON public.user_orders;

CREATE POLICY "Users can read their own user_orders"
ON public.user_orders
FOR SELECT
USING (auth.uid() = user_id);
