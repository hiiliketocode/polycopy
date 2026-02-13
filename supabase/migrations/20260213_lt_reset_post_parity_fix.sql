-- =============================================================================
-- LT RESET: Post-parity fix clean slate
-- =============================================================================
-- All existing LT data was generated under bugs that caused systematic
-- divergence from FT performance:
--   1. Double-slippage: entry price compounded 0.3% + 3% instead of just 3%
--   2. WHALE allocation fell through to FIXED sizing
--   3. Bankroll included locked_capital, inflating Kelly bets ~21%
--   4. Edge calculation used 3.3% slippage vs FT's 0.3%
--
-- This migration:
--   a) Marks all OPEN lt_orders as CANCELLED (pre_fix)
--   b) Releases all cooldown queue entries
--   c) Resets each strategy's capital to initial_capital
--   d) Resets all risk state (drawdown, circuit breaker, consecutive losses)
--   e) Clears execution logs for a clean timeline
--   f) Keeps strategies active so they restart immediately on deploy
--
-- NOTE: Any open CLOB orders on Polymarket must be cancelled separately
--       via the CLOB API. This migration only resets database state.
-- =============================================================================

-- ── Step 1: Cancel all OPEN lt_orders ──
-- These were placed under buggy logic. Mark them so they're excluded from
-- performance analysis. Real CLOB orders may still be live on-chain.
UPDATE public.lt_orders
SET outcome = 'CANCELLED',
    status = 'CANCELLED',
    rejection_reason = 'pre_parity_fix_reset',
    resolved_at = NOW(),
    updated_at = NOW()
WHERE outcome = 'OPEN';

-- ── Step 2: Release all pending cooldown entries ──
UPDATE public.lt_cooldown_queue
SET released_at = NOW()
WHERE released_at IS NULL;

-- ── Step 3: Reset all strategy capital to initial_capital ──
UPDATE public.lt_strategies
SET available_cash = initial_capital,
    locked_capital = 0,
    cooldown_capital = 0,
    -- Reset risk state
    daily_spent_usd = 0,
    daily_loss_usd = 0,
    consecutive_losses = 0,
    peak_equity = initial_capital,
    current_drawdown_pct = 0,
    circuit_breaker_active = FALSE,
    last_reset_date = CURRENT_DATE,
    -- Clear last sync so first run picks up fresh signals
    last_sync_time = NULL,
    -- Keep active — strategies restart immediately on deploy
    is_paused = FALSE,
    updated_at = NOW()
WHERE is_active = TRUE;

-- ── Step 4: Clean execution logs for a fresh timeline ──
-- Keep the table but clear old data so post-fix logs are easy to find.
DELETE FROM public.lt_execute_logs
WHERE created_at < NOW();
