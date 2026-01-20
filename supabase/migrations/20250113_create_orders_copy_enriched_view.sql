-- Provide a single, derived view for copy-trade PnL so UI/cron code can stop
-- relying on stored ROI values. This keeps `orders` as the source of truth
-- while exposing normalized entry/exit math in one place.

CREATE OR REPLACE VIEW public.orders_copy_enriched AS
SELECT
  o.*,
  -- Canonical entry price/size/invested
  COALESCE(o.price_when_copied, o.price) AS entry_price,
  COALESCE(
    NULLIF(o.filled_size, 0),
    NULLIF(o.size, 0),
    CASE
      WHEN COALESCE(o.price_when_copied, o.price) IS NOT NULL
        AND COALESCE(o.price_when_copied, o.price) > 0
        AND o.amount_invested IS NOT NULL
      THEN o.amount_invested / COALESCE(o.price_when_copied, o.price)
      ELSE NULL
    END
  ) AS entry_size,
  COALESCE(
    o.amount_invested,
    COALESCE(o.price_when_copied, o.price) * COALESCE(
      NULLIF(o.filled_size, 0),
      NULLIF(o.size, 0),
      CASE
        WHEN COALESCE(o.price_when_copied, o.price) IS NOT NULL
          AND COALESCE(o.price_when_copied, o.price) > 0
          AND o.amount_invested IS NOT NULL
        THEN o.amount_invested / COALESCE(o.price_when_copied, o.price)
        ELSE NULL
      END
    )
  ) AS invested_usd,
  -- Exit price prioritizes user-locked exit, then latest known price
  COALESCE(o.user_exit_price, o.current_price) AS exit_price,
  CASE
    WHEN COALESCE(o.price_when_copied, o.price) IS NOT NULL
      AND COALESCE(o.price_when_copied, o.price) > 0
      AND COALESCE(o.user_exit_price, o.current_price) IS NOT NULL
    THEN ((COALESCE(o.user_exit_price, o.current_price) - COALESCE(o.price_when_copied, o.price))
      / COALESCE(o.price_when_copied, o.price)) * 100
    ELSE NULL
  END AS pnl_pct,
  CASE
    WHEN COALESCE(o.user_exit_price, o.current_price) IS NOT NULL
      AND COALESCE(
        NULLIF(o.filled_size, 0),
        NULLIF(o.size, 0),
        CASE
          WHEN COALESCE(o.price_when_copied, o.price) IS NOT NULL
            AND COALESCE(o.price_when_copied, o.price) > 0
            AND o.amount_invested IS NOT NULL
          THEN o.amount_invested / COALESCE(o.price_when_copied, o.price)
          ELSE NULL
        END
      ) IS NOT NULL
      AND COALESCE(o.price_when_copied, o.price) IS NOT NULL
    THEN (COALESCE(o.user_exit_price, o.current_price) - COALESCE(o.price_when_copied, o.price))
      * COALESCE(
        NULLIF(o.filled_size, 0),
        NULLIF(o.size, 0),
        CASE
          WHEN COALESCE(o.price_when_copied, o.price) IS NOT NULL
            AND COALESCE(o.price_when_copied, o.price) > 0
            AND o.amount_invested IS NOT NULL
          THEN o.amount_invested / COALESCE(o.price_when_copied, o.price)
          ELSE NULL
        END
      )
    ELSE NULL
  END AS pnl_usd
FROM public.orders o;

COMMENT ON VIEW public.orders_copy_enriched IS
  'Derived copy-trade view with canonical entry/exit, invested, and PnL fields for manual + quick copies';
