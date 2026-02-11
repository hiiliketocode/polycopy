-- =============================================================================
-- LT REBUILD: CLEAN SLATE
-- =============================================================================
-- This migration:
--   1. Drops all existing LT data (strategies, orders, risk, redemptions, etc.)
--   2. Drops the old over-complex LT tables
--   3. Removes LT foreign keys from the orders table
--   4. Rebuilds LT with a simple 3-table design:
--      - lt_strategies  (config + cash management + risk state)
--      - lt_orders      (executed trades)
--      - lt_cooldown_queue (capital cooldown tracking)
--   5. Keeps lt_execute_logs but resets data and adds trace_id columns
-- =============================================================================

-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ PHASE 1: TEAR DOWN OLD LT SYSTEM                                           │
-- └──────────────────────────────────────────────────────────────────────────────┘

-- Remove LT foreign keys from orders table first (avoids dependency errors)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_lt_strategy_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_lt_order_id_fkey;

-- Drop indexes on orders LT columns
DROP INDEX IF EXISTS idx_orders_lt_strategy;
DROP INDEX IF EXISTS idx_orders_lt_order;

-- Remove LT columns from orders table
ALTER TABLE public.orders 
    DROP COLUMN IF EXISTS lt_strategy_id,
    DROP COLUMN IF EXISTS lt_order_id,
    DROP COLUMN IF EXISTS signal_price,
    DROP COLUMN IF EXISTS signal_size_usd;

-- Drop old LT tables in dependency order (children first)
DROP TABLE IF EXISTS public.lt_alerts CASCADE;
DROP TABLE IF EXISTS public.lt_health_checks CASCADE;
DROP TABLE IF EXISTS public.lt_redemptions CASCADE;
DROP TABLE IF EXISTS public.lt_risk_state CASCADE;
DROP TABLE IF EXISTS public.lt_risk_rules CASCADE;
DROP TABLE IF EXISTS public.lt_orders CASCADE;
DROP TABLE IF EXISTS public.lt_strategies CASCADE;

-- Clear old LT execution logs
TRUNCATE TABLE public.lt_execute_logs;


-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ PHASE 2: BUILD NEW LT SYSTEM                                               │
-- └──────────────────────────────────────────────────────────────────────────────┘

-- ─────────────────────────────────────────────────────────────────────────────
-- lt_strategies: Strategy config + cash management + risk rules (all-in-one)
-- Mirrors FT wallets with added execution settings and risk management.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.lt_strategies (
    strategy_id TEXT PRIMARY KEY,  -- e.g. "LT_FT_ML_EDGE"
    ft_wallet_id TEXT NOT NULL REFERENCES public.ft_wallets(wallet_id),

    -- User / Account
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    shadow_mode BOOLEAN NOT NULL DEFAULT FALSE,  -- simulate without real orders
    launched_at TIMESTAMPTZ,

    -- ── Cash Management (3-bucket model mirroring FT portfolio.ts) ──
    initial_capital NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    available_cash NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    locked_capital NUMERIC(12,2) NOT NULL DEFAULT 0,
    cooldown_capital NUMERIC(12,2) NOT NULL DEFAULT 0,
    cooldown_hours NUMERIC(4,1) NOT NULL DEFAULT 3.0,

    -- ── Execution Settings ──
    slippage_tolerance_pct NUMERIC(5,3) NOT NULL DEFAULT 3.000,
    order_type TEXT NOT NULL DEFAULT 'FOK',  -- FOK default (not IOC)
    min_order_size_usd NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    max_order_size_usd NUMERIC(10,2) NOT NULL DEFAULT 100.00,

    -- ── Risk Rules (simple, explicit) ──
    max_position_size_usd NUMERIC(12,2),        -- per-trade cap (NULL = no limit)
    max_total_exposure_usd NUMERIC(12,2),        -- max locked_capital (NULL = no limit)
    daily_budget_usd NUMERIC(12,2),              -- max daily spend (NULL = no limit)
    max_daily_loss_usd NUMERIC(12,2),            -- circuit breaker: daily loss (NULL = off)
    circuit_breaker_loss_pct NUMERIC(5,2),       -- circuit breaker: drawdown % (NULL = off)
    stop_loss_pct NUMERIC(5,2),                  -- auto-sell if position down X% (NULL = off)
    take_profit_pct NUMERIC(5,2),                -- auto-sell if position up X% (NULL = off)
    max_hold_hours INT,                          -- auto-exit after X hours (NULL = off)

    -- ── Risk State (tracked inline, reset daily) ──
    daily_spent_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    daily_loss_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    consecutive_losses INT NOT NULL DEFAULT 0,
    peak_equity NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    current_drawdown_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
    circuit_breaker_active BOOLEAN NOT NULL DEFAULT FALSE,
    last_reset_date DATE,

    -- Sync
    last_sync_time TIMESTAMPTZ,
    sync_ft_changes BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, ft_wallet_id)
);

COMMENT ON TABLE public.lt_strategies IS
  'Live Trading strategies. One per user per FT wallet. Includes cash management (3-bucket) and risk state.';
COMMENT ON COLUMN public.lt_strategies.available_cash IS 'Cash ready to trade (unlocked)';
COMMENT ON COLUMN public.lt_strategies.locked_capital IS 'Cash in open positions';
COMMENT ON COLUMN public.lt_strategies.cooldown_capital IS 'Cash from resolved positions waiting cooldown_hours';
COMMENT ON COLUMN public.lt_strategies.shadow_mode IS 'When true, simulates trades without placing real CLOB orders';
COMMENT ON COLUMN public.lt_strategies.order_type IS 'Default order type: FOK (all-or-nothing) or FAK (partial fills OK)';


-- ─────────────────────────────────────────────────────────────────────────────
-- lt_orders: Executed trades (links FT order → real CLOB order)
-- Tracks both buys and sells with shares tracking for exit support.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.lt_orders (
    lt_order_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id) ON DELETE CASCADE,
    user_id UUID NOT NULL,

    -- Source (FT signal)
    ft_order_id TEXT,           -- Which FT order triggered this
    ft_wallet_id TEXT NOT NULL,
    ft_trader_wallet TEXT,
    source_trade_id TEXT NOT NULL,

    -- Market
    condition_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_label TEXT NOT NULL,    -- YES / NO
    market_title TEXT,
    market_slug TEXT,

    -- Trade
    side TEXT NOT NULL DEFAULT 'BUY',
    signal_price NUMERIC(12,6) NOT NULL,
    signal_size_usd NUMERIC(12,2) NOT NULL,

    -- Execution
    executed_price NUMERIC(12,6),
    executed_size_usd NUMERIC(12,2),                -- actual USD invested
    shares_bought NUMERIC(18,6),                     -- tokens purchased
    shares_remaining NUMERIC(18,6),                  -- tokens still held (for sell tracking)
    order_id TEXT,                                   -- CLOB order ID
    status TEXT NOT NULL DEFAULT 'PENDING',           -- PENDING, FILLED, PARTIAL, REJECTED, CANCELLED
    fill_rate NUMERIC(5,4),
    slippage_bps INT,                                -- basis points

    -- Outcome
    outcome TEXT NOT NULL DEFAULT 'OPEN',             -- OPEN, WON, LOST, CANCELLED, SOLD
    winning_label TEXT,
    pnl NUMERIC(12,2),
    ft_pnl NUMERIC(12,2),
    performance_diff_pct NUMERIC(8,4),

    -- Timing
    order_placed_at TIMESTAMPTZ,
    fully_filled_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    execution_latency_ms INT,

    -- Risk
    risk_check_passed BOOLEAN DEFAULT TRUE,
    risk_check_reason TEXT,
    rejection_reason TEXT,

    -- Flags
    is_force_test BOOLEAN NOT NULL DEFAULT FALSE,
    is_shadow BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(strategy_id, source_trade_id)
);

COMMENT ON TABLE public.lt_orders IS
  'Live Trading executed orders. Links FT signals to real CLOB orders with shares tracking for sell support.';
COMMENT ON COLUMN public.lt_orders.executed_size_usd IS 'Actual USD cost = shares_bought × executed_price';
COMMENT ON COLUMN public.lt_orders.shares_bought IS 'Tokens purchased (= executed_size_usd / executed_price)';
COMMENT ON COLUMN public.lt_orders.shares_remaining IS 'Tokens still held, reduced by sells';
COMMENT ON COLUMN public.lt_orders.slippage_bps IS '(executed_price - signal_price) / signal_price × 10000';


-- ─────────────────────────────────────────────────────────────────────────────
-- lt_cooldown_queue: Capital cooldown tracking (mirrors FT cooldownQueue)
-- When a position resolves, proceeds wait in cooldown before becoming available.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.lt_cooldown_queue (
    id BIGSERIAL PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id) ON DELETE CASCADE,
    lt_order_id TEXT REFERENCES public.lt_orders(lt_order_id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    available_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ           -- NULL = still pending, set when moved to available_cash
);

COMMENT ON TABLE public.lt_cooldown_queue IS
  'Capital cooldown queue. Resolved position proceeds wait here before becoming available cash.';


-- ─────────────────────────────────────────────────────────────────────────────
-- lt_execute_logs: Enhanced with trace IDs for correlating execution stages
-- ─────────────────────────────────────────────────────────────────────────────
-- Add new columns (table already exists from previous migration)
ALTER TABLE public.lt_execute_logs
    ADD COLUMN IF NOT EXISTS trace_id TEXT,
    ADD COLUMN IF NOT EXISTS execution_id TEXT,
    ADD COLUMN IF NOT EXISTS stage TEXT,
    ADD COLUMN IF NOT EXISTS elapsed_ms INT,
    ADD COLUMN IF NOT EXISTS ft_order_id TEXT,
    ADD COLUMN IF NOT EXISTS lt_order_id TEXT,
    ADD COLUMN IF NOT EXISTS order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_lt_logs_trace ON public.lt_execute_logs (trace_id, created_at)
    WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lt_logs_execution ON public.lt_execute_logs (execution_id, created_at)
    WHERE execution_id IS NOT NULL;

COMMENT ON COLUMN public.lt_execute_logs.trace_id IS 'Correlate all logs for a single trade execution';
COMMENT ON COLUMN public.lt_execute_logs.execution_id IS 'Correlate all logs for a single cron run';
COMMENT ON COLUMN public.lt_execute_logs.stage IS 'Execution stage: FT_QUERY, TOKEN_RESOLVE, RISK_CHECK, CASH_CHECK, ORDER_PLACE, ORDER_POLL, etc.';


-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ PHASE 3: INDEXES                                                           │
-- └──────────────────────────────────────────────────────────────────────────────┘

CREATE INDEX idx_lt_strategies_active ON public.lt_strategies (is_active, is_paused)
    WHERE is_active = TRUE AND is_paused = FALSE;
CREATE INDEX idx_lt_strategies_user ON public.lt_strategies (user_id);

CREATE INDEX idx_lt_orders_strategy_created ON public.lt_orders (strategy_id, created_at DESC);
CREATE INDEX idx_lt_orders_ft_order ON public.lt_orders (ft_order_id) WHERE ft_order_id IS NOT NULL;
CREATE INDEX idx_lt_orders_order_id ON public.lt_orders (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_lt_orders_open ON public.lt_orders (outcome) WHERE outcome = 'OPEN';
CREATE INDEX idx_lt_orders_condition_open ON public.lt_orders (condition_id, token_label)
    WHERE outcome = 'OPEN';
CREATE INDEX idx_lt_orders_source_trade ON public.lt_orders (strategy_id, source_trade_id);

CREATE INDEX idx_lt_cooldown_pending ON public.lt_cooldown_queue (strategy_id, available_at)
    WHERE released_at IS NULL;


-- ┌──────────────────────────────────────────────────────────────────────────────┐
-- │ PHASE 4: RLS POLICIES                                                      │
-- └──────────────────────────────────────────────────────────────────────────────┘

ALTER TABLE public.lt_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_cooldown_queue ENABLE ROW LEVEL SECURITY;

-- Users can read their own strategies
CREATE POLICY "Users view own lt_strategies"
    ON public.lt_strategies FOR SELECT
    USING (auth.uid() = user_id);

-- Service role: full access on all LT tables
CREATE POLICY "Service role lt_strategies"
    ON public.lt_strategies FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role lt_orders"
    ON public.lt_orders FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role lt_cooldown_queue"
    ON public.lt_cooldown_queue FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Users can read their own orders
CREATE POLICY "Users view own lt_orders"
    ON public.lt_orders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.lt_strategies s
            WHERE s.strategy_id = lt_orders.strategy_id
              AND s.user_id = auth.uid()
        )
    );

-- Users can read their own cooldowns
CREATE POLICY "Users view own lt_cooldown_queue"
    ON public.lt_cooldown_queue FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.lt_strategies s
            WHERE s.strategy_id = lt_cooldown_queue.strategy_id
              AND s.user_id = auth.uid()
        )
    );
