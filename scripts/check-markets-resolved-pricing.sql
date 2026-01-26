-- =============================================================================
-- Check markets table: how many have resolved pricing for correct PnL
-- Run in Supabase SQL Editor (Dashboard > SQL Editor) or via psql.
-- Alternatively: node scripts/check-markets-resolved-pricing.js
-- =============================================================================
-- Final price for PnL = 1 if your outcome matches winner, 0 otherwise.
-- We need either winning_side (Dome) or resolved_outcome (our cache) to know
-- the winner. Without these we cannot compute correct PnL for resolved markets.
-- =============================================================================

-- 1) Total markets
SELECT
  'Total markets' AS metric,
  COUNT(*)::bigint AS count
FROM public.markets;

-- 2) Resolved pricing sources (what we use for final 0/1 price)
SELECT
  'Has winning_side (Dome API)' AS metric,
  COUNT(*)::bigint AS count
FROM public.markets
WHERE winning_side IS NOT NULL AND TRIM(winning_side) <> '';

SELECT
  'Has resolved_outcome (our cache)' AS metric,
  COUNT(*)::bigint AS count
FROM public.markets
WHERE resolved_outcome IS NOT NULL AND TRIM(resolved_outcome) <> '';

SELECT
  'Has EITHER (resolved pricing for PnL)' AS metric,
  COUNT(*)::bigint AS count
FROM public.markets
WHERE (winning_side IS NOT NULL AND TRIM(winning_side) <> '')
   OR (resolved_outcome IS NOT NULL AND TRIM(resolved_outcome) <> '');

-- 3) By status (Dome)
SELECT
  status,
  COUNT(*)::bigint AS cnt
FROM public.markets
GROUP BY status
ORDER BY cnt DESC;

-- 4) Closed vs open (from price-cache migration)
SELECT
  COALESCE(closed::text, 'NULL') AS closed,
  COUNT(*)::bigint AS cnt
FROM public.markets
GROUP BY closed
ORDER BY cnt DESC;

-- 5) Gap: markets in orders/trades but NO resolved pricing
-- These can cause wrong or missing PnL if the market is actually resolved.
WITH markets_with_pricing AS (
  SELECT condition_id
  FROM public.markets
  WHERE (winning_side IS NOT NULL AND TRIM(winning_side) <> '')
     OR (resolved_outcome IS NOT NULL AND TRIM(resolved_outcome) <> '')
),
markets_in_orders AS (
  SELECT DISTINCT market_id AS condition_id
  FROM public.orders
  WHERE market_id IS NOT NULL AND TRIM(market_id) <> ''
)
SELECT
  'Markets in orders WITHOUT resolved pricing' AS metric,
  COUNT(*)::bigint AS count
FROM markets_in_orders m
WHERE NOT EXISTS (
  SELECT 1 FROM markets_with_pricing w WHERE w.condition_id = m.condition_id
);

-- 6) Summary: one row per metric
SELECT * FROM (
  SELECT 'total_markets' AS metric, COUNT(*)::bigint AS count FROM public.markets
  UNION ALL
  SELECT 'has_winning_side',
    COUNT(*)::bigint FROM public.markets
    WHERE winning_side IS NOT NULL AND TRIM(winning_side) <> ''
  UNION ALL
  SELECT 'has_resolved_outcome',
    COUNT(*)::bigint FROM public.markets
    WHERE resolved_outcome IS NOT NULL AND TRIM(resolved_outcome) <> ''
  UNION ALL
  SELECT 'has_either_resolved_pricing',
    COUNT(*)::bigint FROM public.markets
    WHERE (winning_side IS NOT NULL AND TRIM(winning_side) <> '')
       OR (resolved_outcome IS NOT NULL AND TRIM(resolved_outcome) <> '')
  UNION ALL
  SELECT 'in_orders_without_pricing',
    (SELECT COUNT(*)::bigint FROM (
      SELECT DISTINCT o.market_id FROM public.orders o
      WHERE o.market_id IS NOT NULL AND TRIM(o.market_id) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM public.markets m
          WHERE m.condition_id = o.market_id
            AND ((m.winning_side IS NOT NULL AND TRIM(m.winning_side) <> '')
                 OR (m.resolved_outcome IS NOT NULL AND TRIM(m.resolved_outcome) <> ''))
        )
    ) t)
) s
ORDER BY metric;
