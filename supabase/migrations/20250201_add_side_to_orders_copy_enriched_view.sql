-- Add side column to orders_copy_enriched for accurate volume calculations.

CREATE OR REPLACE VIEW public.orders_copy_enriched AS
WITH base AS (
  SELECT
    o.trader_id,
    o.order_id,
    o.status,
    o.time_in_force,
    o.order_type,
    o.side,
    o.filled_size,
    o.created_at,
    o.copied_trade_id,
    o.copy_user_id,
    o.copied_trader_wallet,
    o.copied_trader_username,
    o.trader_profile_image_url,
    o.market_id,
    o.copied_market_title,
    o.market_slug,
    o.market_avatar_url,
    o.outcome,
    o.price_when_copied,
    o.trade_method,
    o.trader_still_has_position,
    o.trader_closed_at,
    o.current_price,
    o.market_resolved,
    o.market_resolved_at,
    o.notification_closed_sent,
    o.notification_resolved_sent,
    o.last_checked_at,
    o.resolved_outcome,
    o.user_closed_at,
    o.user_exit_price,
    COALESCE(o.price_when_copied, o.price) AS entry_price,
    CASE
      WHEN o.filled_size IS NOT NULL AND o.filled_size > 0
      THEN o.filled_size
      WHEN o.filled_size IS NULL AND o.size IS NOT NULL AND o.size > 0
      THEN o.size
      WHEN o.filled_size IS NULL
        AND COALESCE(o.price_when_copied, o.price) IS NOT NULL
        AND COALESCE(o.price_when_copied, o.price) > 0
        AND o.amount_invested IS NOT NULL
      THEN o.amount_invested / COALESCE(o.price_when_copied, o.price)
      ELSE NULL
    END AS entry_size,
    COALESCE(
      o.amount_invested,
      COALESCE(o.price_when_copied, o.price) * CASE
        WHEN o.filled_size IS NOT NULL AND o.filled_size > 0
        THEN o.filled_size
        WHEN o.filled_size IS NULL AND o.size IS NOT NULL AND o.size > 0
        THEN o.size
        ELSE NULL
      END
    ) AS invested_usd,
    COALESCE(o.user_exit_price, o.current_price) AS exit_price
  FROM public.orders o
)
SELECT
  base.trader_id,
  base.order_id,
  base.created_at,
  base.copied_trade_id,
  base.copy_user_id,
  base.copied_trader_wallet,
  base.copied_trader_username,
  base.trader_profile_image_url,
  base.market_id,
  base.copied_market_title,
  base.market_slug,
  base.market_avatar_url,
  base.outcome,
  base.price_when_copied,
  base.trade_method,
  base.trader_still_has_position,
  base.trader_closed_at,
  base.current_price,
  base.market_resolved,
  base.market_resolved_at,
  base.notification_closed_sent,
  base.notification_resolved_sent,
  base.last_checked_at,
  base.resolved_outcome,
  base.user_closed_at,
  base.user_exit_price,
  base.entry_price,
  base.entry_size,
  base.invested_usd,
  base.exit_price,
  base.side,
  CASE
    WHEN base.entry_price IS NOT NULL
      AND base.entry_price > 0
      AND base.exit_price IS NOT NULL
    THEN ((base.exit_price - base.entry_price) / base.entry_price) * 100
    ELSE NULL
  END AS pnl_pct,
  CASE
    WHEN base.exit_price IS NOT NULL
      AND base.entry_size IS NOT NULL
      AND base.entry_price IS NOT NULL
    THEN (base.exit_price - base.entry_price) * base.entry_size
    ELSE NULL
  END AS pnl_usd
FROM base
WHERE NOT (
  lower(coalesce(base.status, '')) = 'open'
  AND coalesce(base.filled_size, 0) = 0
);

COMMENT ON VIEW public.orders_copy_enriched IS
  'Normalized copy-trade view with canonical entry/exit/invested/side and derived PnL fields.';
