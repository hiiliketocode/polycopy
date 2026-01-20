-- Backfill copy-trade metadata from `copied_trades` into the enriched `orders` (and `trades`) table.
-- Keeps track of entries that could not be matched so we can audit and resolve them manually.

CREATE TABLE IF NOT EXISTS copy_trade_migration_failures (
  copied_trade_id uuid NOT NULL,
  target_table text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (copied_trade_id, target_table)
);

CREATE TEMP TABLE tmp_copy_trade_matches_orders ON COMMIT DROP AS
SELECT
  ct.id AS copied_trade_id,
  o.order_id,
  ct.user_id,
  ct.trader_username,
  ct.market_title,
  ct.price_when_copied,
  ct.amount_invested,
  ct.trader_still_has_position,
  ct.trader_closed_at,
  ct.current_price,
  ct.market_resolved,
  ct.market_resolved_at,
  ct.roi,
  ct.notification_closed_sent,
  ct.notification_resolved_sent,
  ct.last_checked_at,
  ct.resolved_outcome,
  ct.user_closed_at,
  ct.user_exit_price,
  ct.market_slug,
  ct.trader_profile_image_url,
  ct.market_avatar_url,
  ROW_NUMBER() OVER (
    PARTITION BY ct.id
    ORDER BY ABS(EXTRACT(EPOCH FROM (o.created_at - ct.copied_at)))
  ) AS rn
FROM public.copied_trades ct
JOIN public.traders t
  ON LOWER(TRIM(ct.trader_wallet)) = t.wallet_address
JOIN public.orders o
  ON o.trader_id = t.id
  AND LOWER(TRIM(o.copied_trader_wallet)) = LOWER(TRIM(ct.trader_wallet))
  AND LOWER(o.market_id) = LOWER(ct.market_id)
  AND LOWER(o.outcome) = LOWER(ct.outcome)
  AND o.created_at BETWEEN ct.copied_at - interval '10 minutes' AND ct.copied_at + interval '10 minutes'
  AND (ct.price_when_copied IS NULL OR ABS(o.price - ct.price_when_copied) < 0.00001)
  AND o.copy_user_id IS NULL
WHERE ct.trader_wallet IS NOT NULL
  AND ct.market_id IS NOT NULL
  AND ct.outcome IS NOT NULL;

UPDATE public.orders o
SET
  copy_user_id = tmp.user_id,
  copied_trade_id = tmp.copied_trade_id,
  copied_trader_username = tmp.trader_username,
  copied_market_title = tmp.market_title,
  price_when_copied = tmp.price_when_copied,
  amount_invested = tmp.amount_invested,
  trade_method = 'manual',
  trader_still_has_position = tmp.trader_still_has_position,
  trader_closed_at = tmp.trader_closed_at,
  current_price = tmp.current_price,
  market_resolved = tmp.market_resolved,
  market_resolved_at = tmp.market_resolved_at,
  roi = tmp.roi,
  notification_closed_sent = tmp.notification_closed_sent,
  notification_resolved_sent = tmp.notification_resolved_sent,
  last_checked_at = tmp.last_checked_at,
  resolved_outcome = tmp.resolved_outcome,
  user_closed_at = tmp.user_closed_at,
  user_exit_price = tmp.user_exit_price,
  market_slug = tmp.market_slug,
  trader_profile_image_url = tmp.trader_profile_image_url,
  market_avatar_url = tmp.market_avatar_url
FROM tmp_copy_trade_matches_orders tmp
WHERE o.order_id = tmp.order_id
  AND tmp.rn = 1;

INSERT INTO copy_trade_migration_failures (copied_trade_id, target_table, reason)
SELECT
  ct.id,
  'orders',
  'no matching order row found while backfilling copy metadata'
FROM public.copied_trades ct
WHERE NOT EXISTS (
  SELECT 1
  FROM tmp_copy_trade_matches_orders tmp
  WHERE tmp.copied_trade_id = ct.id
    AND tmp.rn = 1
)
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS tmp_copy_trade_matches_orders;

DO $$
BEGIN
  IF to_regclass('public.trades') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trades) THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_copy_trade_matches_trades ON COMMIT DROP AS
  SELECT
    ct.id AS copied_trade_id,
    t.order_id,
    ct.user_id,
    ct.trader_username,
    ct.market_title,
    ct.price_when_copied,
    ct.amount_invested,
    ct.trader_still_has_position,
    ct.trader_closed_at,
    ct.current_price,
    ct.market_resolved,
    ct.market_resolved_at,
    ct.roi,
    ct.notification_closed_sent,
    ct.notification_resolved_sent,
    ct.last_checked_at,
    ct.resolved_outcome,
    ct.user_closed_at,
    ct.user_exit_price,
    ct.market_slug,
    ct.trader_profile_image_url,
    ct.market_avatar_url,
    ROW_NUMBER() OVER (
      PARTITION BY ct.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (t.created_at - ct.copied_at)))
    ) AS rn
  FROM public.copied_trades ct
  JOIN public.traders tr
    ON LOWER(TRIM(ct.trader_wallet)) = tr.wallet_address
  JOIN public.trades t
    ON t.trader_id = tr.id
    AND LOWER(TRIM(t.copied_trader_wallet)) = LOWER(TRIM(ct.trader_wallet))
    AND LOWER(t.market_id) = LOWER(ct.market_id)
    AND LOWER(t.outcome) = LOWER(ct.outcome)
    AND t.created_at BETWEEN ct.copied_at - interval '10 minutes' AND ct.copied_at + interval '10 minutes'
    AND (ct.price_when_copied IS NULL OR ABS(t.price - ct.price_when_copied) < 0.00001)
    AND t.copy_user_id IS NULL
  WHERE ct.trader_wallet IS NOT NULL
    AND ct.market_id IS NOT NULL
    AND ct.outcome IS NOT NULL;

  UPDATE public.trades t
  SET
    copy_user_id = tmp.user_id,
    copied_trade_id = tmp.copied_trade_id,
    copied_trader_username = tmp.trader_username,
  copied_market_title = tmp.market_title,
  price_when_copied = tmp.price_when_copied,
  amount_invested = tmp.amount_invested,
  trade_method = 'manual',
    trader_still_has_position = tmp.trader_still_has_position,
    trader_closed_at = tmp.trader_closed_at,
    current_price = tmp.current_price,
    market_resolved = tmp.market_resolved,
    market_resolved_at = tmp.market_resolved_at,
    roi = tmp.roi,
    notification_closed_sent = tmp.notification_closed_sent,
    notification_resolved_sent = tmp.notification_resolved_sent,
    last_checked_at = tmp.last_checked_at,
    resolved_outcome = tmp.resolved_outcome,
    user_closed_at = tmp.user_closed_at,
    user_exit_price = tmp.user_exit_price,
    market_slug = tmp.market_slug,
    trader_profile_image_url = tmp.trader_profile_image_url,
    market_avatar_url = tmp.market_avatar_url
  FROM tmp_copy_trade_matches_trades tmp
  WHERE t.order_id = tmp.order_id
    AND tmp.rn = 1;

  INSERT INTO copy_trade_migration_failures (copied_trade_id, target_table, reason)
  SELECT
    ct.id,
    'trades',
    'no matching trade row found while backfilling copy metadata'
  FROM public.copied_trades ct
  WHERE NOT EXISTS (
    SELECT 1
    FROM tmp_copy_trade_matches_trades tmp
    WHERE tmp.copied_trade_id = ct.id
      AND tmp.rn = 1
  )
  ON CONFLICT DO NOTHING;

  DROP TABLE IF EXISTS tmp_copy_trade_matches_trades;
END
$$;
