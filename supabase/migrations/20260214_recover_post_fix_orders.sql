-- =============================================================================
-- RECOVERY: Restore post-fix lt_orders incorrectly cancelled
-- =============================================================================
-- The cleanup query cancelled ALL lt_orders, including ~24 hours of valid
-- post-fix trades. Only outcome, status, rejection_reason, resolved_at, and
-- updated_at were overwritten. All trade data (pnl, shares_bought,
-- executed_price, fill_rate, winning_label, risk_check_passed, etc.) is intact.
--
-- The code fix was deployed at 2026-02-13 22:59:33 UTC.
-- Any order with order_placed_at after that time is a valid post-fix trade.
--
-- This migration:
--   a) Restores WON/LOST orders using preserved pnl and winning_label
--   b) Restores OPEN filled orders (markets not yet resolved)
--   c) Restores PENDING orders (on CLOB book, not yet filled)
--   d) Leaves legitimately rejected orders as CANCELLED
--   e) Recalculates strategy capital from recovered orders
-- =============================================================================

-- ======================================================
-- DIAGNOSTIC: Run this SELECT first to verify the counts
-- ======================================================
-- SELECT
--     CASE
--         WHEN pnl IS NOT NULL AND risk_check_passed IS DISTINCT FROM FALSE
--             THEN 'resolved (WON/LOST) → will recover'
--         WHEN pnl IS NULL AND COALESCE(shares_bought, 0) > 0 AND risk_check_passed IS DISTINCT FROM FALSE
--             THEN 'open filled → will recover'
--         WHEN pnl IS NULL AND COALESCE(shares_bought, 0) = 0 AND executed_price IS NOT NULL
--              AND COALESCE(executed_size_usd, 0) = 0 AND risk_check_passed IS DISTINCT FROM FALSE
--             THEN 'pending → will recover'
--         ELSE 'rejected/other → stays cancelled'
--     END AS category,
--     COUNT(*) AS cnt,
--     MIN(order_placed_at) AS earliest,
--     MAX(order_placed_at) AS latest
-- FROM public.lt_orders
-- WHERE order_placed_at >= '2026-02-13T23:00:00+00:00'
-- GROUP BY 1
-- ORDER BY 1;

-- ──────────────────────────────────────────────────────────────
-- Step 1: Restore resolved orders (WON / LOST)
-- These have pnl set by the resolve cron before being cancelled.
-- winning_label + token_label determine WON vs LOST; pnl sign as fallback.
-- ──────────────────────────────────────────────────────────────
UPDATE public.lt_orders
SET
    outcome = CASE
        WHEN winning_label IS NOT NULL AND UPPER(COALESCE(token_label,'')) = UPPER(winning_label) THEN 'WON'
        WHEN winning_label IS NOT NULL AND UPPER(COALESCE(token_label,'')) != UPPER(winning_label) THEN 'LOST'
        WHEN pnl >= 0 THEN 'WON'
        ELSE 'LOST'
    END,
    status = CASE
        WHEN COALESCE(fill_rate, 0) >= 1.0 THEN 'FILLED'
        WHEN COALESCE(fill_rate, 0) > 0 THEN 'PARTIAL'
        ELSE 'FILLED'
    END,
    rejection_reason = NULL,
    -- resolved_at was preserved by COALESCE(resolved_at, NOW()), so it still
    -- holds the original resolution timestamp for these orders. Leave it.
    updated_at = NOW()
WHERE order_placed_at >= '2026-02-13T23:00:00+00:00'
  AND pnl IS NOT NULL
  AND risk_check_passed IS DISTINCT FROM FALSE;

-- ──────────────────────────────────────────────────────────────
-- Step 2: Restore OPEN filled/partial orders
-- These have shares but no pnl (market not yet resolved).
-- ──────────────────────────────────────────────────────────────
UPDATE public.lt_orders
SET
    outcome = 'OPEN',
    status = CASE
        WHEN COALESCE(fill_rate, 0) >= 1.0 THEN 'FILLED'
        WHEN COALESCE(fill_rate, 0) > 0 THEN 'PARTIAL'
        ELSE 'FILLED'
    END,
    rejection_reason = NULL,
    resolved_at = NULL,   -- OPEN orders must not have resolved_at
    updated_at = NOW()
WHERE order_placed_at >= '2026-02-13T23:00:00+00:00'
  AND pnl IS NULL
  AND COALESCE(shares_bought, 0) > 0
  AND risk_check_passed IS DISTINCT FROM FALSE;

-- ──────────────────────────────────────────────────────────────
-- Step 3: Restore PENDING orders (on book, not yet filled)
-- These have executed_price (limit price) but 0 shares/size.
-- ──────────────────────────────────────────────────────────────
UPDATE public.lt_orders
SET
    outcome = 'OPEN',
    status = 'PENDING',
    rejection_reason = NULL,
    resolved_at = NULL,
    updated_at = NOW()
WHERE order_placed_at >= '2026-02-13T23:00:00+00:00'
  AND pnl IS NULL
  AND COALESCE(shares_bought, 0) = 0
  AND executed_price IS NOT NULL
  AND COALESCE(executed_size_usd, 0) = 0
  AND risk_check_passed IS DISTINCT FROM FALSE;

-- ──────────────────────────────────────────────────────────────
-- Step 4: Recalculate strategy capital from recovered orders
-- Formula:
--   available_cash = initial_capital + net_pnl − capital_in_open_positions
--   locked_capital = capital_in_open_positions
-- ──────────────────────────────────────────────────────────────
WITH order_stats AS (
    SELECT
        strategy_id,
        -- Net P&L from resolved trades
        COALESCE(SUM(
            CASE WHEN outcome IN ('WON', 'LOST') THEN pnl ELSE 0 END
        ), 0) AS net_pnl,
        -- Capital locked in open filled positions
        COALESCE(SUM(
            CASE WHEN outcome = 'OPEN' AND status IN ('FILLED', 'PARTIAL')
                 THEN COALESCE(executed_size_usd, shares_bought * executed_price, 0)
                 ELSE 0 END
        ), 0) AS locked_filled,
        -- Capital locked in pending orders
        COALESCE(SUM(
            CASE WHEN outcome = 'OPEN' AND status = 'PENDING'
                 THEN COALESCE(signal_size_usd, 0)
                 ELSE 0 END
        ), 0) AS locked_pending
    FROM public.lt_orders
    WHERE order_placed_at >= '2026-02-13T23:00:00+00:00'
      AND outcome != 'CANCELLED'
    GROUP BY strategy_id
)
UPDATE public.lt_strategies s
SET
    available_cash  = GREATEST(0, s.initial_capital + os.net_pnl - os.locked_filled - os.locked_pending),
    locked_capital  = os.locked_filled + os.locked_pending,
    cooldown_capital = 0,
    peak_equity     = GREATEST(s.initial_capital, s.initial_capital + os.net_pnl),
    current_drawdown_pct = 0,  -- risk manager recalculates on next resolution
    daily_spent_usd = 0,
    daily_loss_usd  = 0,
    updated_at      = NOW()
FROM order_stats os
WHERE s.strategy_id = os.strategy_id
  AND s.is_active = TRUE;
