-- Add copy-trade specific metadata to orders + trades so the old copied_trades rows can be merged.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS copy_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS copied_trade_id uuid DEFAULT extensions.uuid_generate_v4 (),
  ADD COLUMN IF NOT EXISTS copied_trader_username text,
  ADD COLUMN IF NOT EXISTS copied_market_title text,
  ADD COLUMN IF NOT EXISTS price_when_copied numeric,
  ADD COLUMN IF NOT EXISTS amount_invested numeric,
  ADD COLUMN IF NOT EXISTS trade_method text NOT NULL DEFAULT 'quick',
  ADD COLUMN IF NOT EXISTS trader_still_has_position boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trader_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_price numeric,
  ADD COLUMN IF NOT EXISTS market_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS market_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS roi numeric,
  ADD COLUMN IF NOT EXISTS notification_closed_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_resolved_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_outcome text,
  ADD COLUMN IF NOT EXISTS user_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_exit_price numeric(10,4),
  ADD COLUMN IF NOT EXISTS market_slug text,
  ADD COLUMN IF NOT EXISTS trader_profile_image_url text,
  ADD COLUMN IF NOT EXISTS market_avatar_url text;

ALTER TABLE IF EXISTS public.trades
  ADD COLUMN IF NOT EXISTS copy_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS copied_trade_id uuid DEFAULT extensions.uuid_generate_v4 (),
  ADD COLUMN IF NOT EXISTS copied_trader_username text,
  ADD COLUMN IF NOT EXISTS copied_market_title text,
  ADD COLUMN IF NOT EXISTS price_when_copied numeric,
  ADD COLUMN IF NOT EXISTS amount_invested numeric,
  ADD COLUMN IF NOT EXISTS trade_method text NOT NULL DEFAULT 'quick',
  ADD COLUMN IF NOT EXISTS trader_still_has_position boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trader_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_price numeric,
  ADD COLUMN IF NOT EXISTS market_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS market_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS roi numeric,
  ADD COLUMN IF NOT EXISTS notification_closed_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_resolved_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resolved_outcome text,
  ADD COLUMN IF NOT EXISTS user_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_exit_price numeric(10,4),
  ADD COLUMN IF NOT EXISTS market_slug text,
  ADD COLUMN IF NOT EXISTS trader_profile_image_url text,
  ADD COLUMN IF NOT EXISTS market_avatar_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_copied_trade_id ON public.orders (copied_trade_id);
CREATE INDEX IF NOT EXISTS idx_orders_copy_user ON public.orders (copy_user_id);

CREATE INDEX IF NOT EXISTS idx_orders_copy_trader_profile_image ON public.orders (trader_profile_image_url) WHERE trader_profile_image_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_copy_market_avatar ON public.orders (market_avatar_url) WHERE market_avatar_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_copy_trader ON public.orders (copied_trader_wallet) WHERE copied_trader_wallet IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_copy_status ON public.orders (trader_still_has_position, market_resolved);

CREATE INDEX IF NOT EXISTS idx_orders_copy_market ON public.orders (market_id);

CREATE INDEX IF NOT EXISTS idx_orders_copy_slug ON public.orders (market_slug);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'trades' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_copied_trade_id ON public.trades (copied_trade_id);
    CREATE INDEX IF NOT EXISTS idx_trades_copy_user ON public.trades (copy_user_id);
    CREATE INDEX IF NOT EXISTS idx_trades_copy_trader_profile_image ON public.trades (trader_profile_image_url) WHERE trader_profile_image_url IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_trades_copy_market_avatar ON public.trades (market_avatar_url) WHERE market_avatar_url IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_trades_copy_trader ON public.trades (copied_trader_wallet) WHERE copied_trader_wallet IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_trades_copy_status ON public.trades (trader_still_has_position, market_resolved);
    CREATE INDEX IF NOT EXISTS idx_trades_copy_market ON public.trades (market_id);
    CREATE INDEX IF NOT EXISTS idx_trades_copy_slug ON public.trades (market_slug);
  END IF;
END
$$;
