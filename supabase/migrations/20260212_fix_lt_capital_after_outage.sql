-- =============================================================================
-- FIX LT CAPITAL STATE AFTER DB OUTAGE
-- =============================================================================
-- After a DB outage, lt_strategies can have stale capital state (locked_capital,
-- cooldown_capital) that is no longer backed by actual lt_orders or lt_cooldown_queue
-- entries. This migration reconciles all strategies by:
--
--   1. Recomputing locked_capital from actual OPEN lt_orders
--   2. Recomputing cooldown_capital from actual unreleased lt_cooldown_queue entries
--   3. Recomputing realized_pnl from resolved lt_orders
--   4. Setting available_cash = initial_capital + realized_pnl - locked - cooldown
--   5. Fixing drawdown and peak_equity
-- =============================================================================

-- Step 1: Reset strategies that have NO lt_orders at all
-- These should have all capital available (clean slate)
UPDATE public.lt_strategies s
SET
    available_cash = s.initial_capital,
    locked_capital = 0,
    cooldown_capital = 0,
    current_drawdown_pct = 0,
    peak_equity = s.initial_capital,
    daily_spent_usd = 0,
    daily_loss_usd = 0,
    consecutive_losses = 0,
    updated_at = NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM public.lt_orders o
    WHERE o.strategy_id = s.strategy_id
);

-- Step 2: For strategies WITH lt_orders, reconcile based on actual data
-- 2a: Compute correct locked_capital from OPEN orders
WITH correct_locked AS (
    SELECT
        strategy_id,
        COALESCE(SUM(
            CASE
                WHEN status = 'PENDING' THEN COALESCE(signal_size_usd, 0)
                ELSE COALESCE(executed_size_usd, 0)
            END
        ), 0) AS should_be_locked
    FROM public.lt_orders
    WHERE outcome = 'OPEN'
      AND status IN ('FILLED', 'PARTIAL', 'PENDING')
    GROUP BY strategy_id
),
-- 2b: Compute realized PnL from resolved orders
correct_pnl AS (
    SELECT
        strategy_id,
        COALESCE(SUM(COALESCE(pnl, 0)), 0) AS realized_pnl
    FROM public.lt_orders
    WHERE outcome IN ('WON', 'LOST')
    GROUP BY strategy_id
),
-- 2c: Compute correct cooldown from unreleased queue entries
correct_cooldown AS (
    SELECT
        strategy_id,
        COALESCE(SUM(amount), 0) AS queued_cooldown
    FROM public.lt_cooldown_queue
    WHERE released_at IS NULL
    GROUP BY strategy_id
)
UPDATE public.lt_strategies s
SET
    locked_capital = GREATEST(0, COALESCE(cl.should_be_locked, 0)),
    cooldown_capital = GREATEST(0, COALESCE(cc.queued_cooldown, 0)),
    available_cash = GREATEST(0,
        s.initial_capital
        + COALESCE(cp.realized_pnl, 0)
        - COALESCE(cl.should_be_locked, 0)
        - COALESCE(cc.queued_cooldown, 0)
    ),
    current_drawdown_pct = CASE
        WHEN (s.initial_capital + COALESCE(cp.realized_pnl, 0)) < s.initial_capital
        THEN ROUND(
            (s.initial_capital - (s.initial_capital + COALESCE(cp.realized_pnl, 0)))
            / s.initial_capital, 4
        )
        ELSE 0
    END,
    peak_equity = GREATEST(
        s.initial_capital,
        s.initial_capital + COALESCE(cp.realized_pnl, 0)
    ),
    updated_at = NOW()
FROM (
    SELECT DISTINCT strategy_id FROM public.lt_orders
) AS has_orders
LEFT JOIN correct_locked cl ON cl.strategy_id = has_orders.strategy_id
LEFT JOIN correct_pnl cp ON cp.strategy_id = has_orders.strategy_id
LEFT JOIN correct_cooldown cc ON cc.strategy_id = has_orders.strategy_id
WHERE s.strategy_id = has_orders.strategy_id;

-- Step 3: Clean up any orphaned cooldown queue entries
-- (entries referencing lt_orders that no longer exist)
DELETE FROM public.lt_cooldown_queue cq
WHERE cq.lt_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lt_orders o
    WHERE o.lt_order_id = cq.lt_order_id
  );
