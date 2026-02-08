-- Live Trading Tables
-- Tables for real trading that mirrors forward testing strategies
-- Includes risk management, redemption, and monitoring

-- lt_strategies: Live trading strategy configurations (1:1 mapping to FT wallets)
CREATE TABLE IF NOT EXISTS public.lt_strategies (
    strategy_id TEXT PRIMARY KEY,  -- e.g., "LT_FT_HIGH_CONVICTION"
    ft_wallet_id TEXT NOT NULL REFERENCES public.ft_wallets(wallet_id),
    
    -- Status & Control
    is_active BOOLEAN DEFAULT FALSE,
    is_paused BOOLEAN DEFAULT FALSE,
    launched_at TIMESTAMP WITH TIME ZONE,  -- When live trading started
    
    -- User/Account
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,  -- User's Polymarket wallet
    
    -- Capital Management
    starting_capital DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
    max_position_size_usd DECIMAL(12,2),  -- Optional cap per trade
    max_total_exposure_usd DECIMAL(12,2),  -- Optional total exposure cap
    
    -- Execution Settings
    slippage_tolerance_pct DECIMAL(5,3) DEFAULT 0.5,  -- 0.5% max slippage
    order_type TEXT DEFAULT 'GTC',  -- GTC, FOK, FAK
    min_order_size_usd DECIMAL(10,2) DEFAULT 1.00,
    max_order_size_usd DECIMAL(10,2) DEFAULT 100.00,
    
    -- Sync Settings
    sync_ft_changes BOOLEAN DEFAULT TRUE,  -- Auto-update when FT config changes
    last_sync_time TIMESTAMP WITH TIME ZONE,
    
    -- Risk Management Link
    risk_rules_id UUID,  -- References lt_risk_rules (created separately)
    
    -- Health Status
    health_status TEXT DEFAULT 'HEALTHY',  -- HEALTHY, WARNING, CRITICAL
    last_health_check TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    display_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, ft_wallet_id)  -- One live strategy per user per FT wallet
);

-- lt_orders: Live trading order tracking (links FT signals to real orders)
CREATE TABLE IF NOT EXISTS public.lt_orders (
    lt_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    ft_order_id UUID REFERENCES public.ft_orders(order_id),  -- Link to FT signal
    
    -- Order Reference
    order_id UUID NOT NULL REFERENCES public.orders(order_id),  -- Real CLOB order
    polymarket_order_id TEXT,  -- From CLOB response
    
    -- Signal Details (from FT)
    source_trade_id TEXT NOT NULL,  -- Same as ft_orders.source_trade_id
    trader_address TEXT,
    condition_id TEXT,
    market_slug TEXT,
    market_title TEXT,
    token_label TEXT,
    
    -- Execution Details
    signal_price DECIMAL(6,4),  -- Price from FT signal
    signal_size_usd DECIMAL(10,2),  -- Size from FT signal
    executed_price DECIMAL(6,4),  -- Actual fill price (from orders table)
    executed_size DECIMAL(10,2),  -- Actual filled size
    order_placed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    first_fill_at TIMESTAMP WITH TIME ZONE,
    fully_filled_at TIMESTAMP WITH TIME ZONE,
    
    -- Execution Quality Metrics
    slippage_pct DECIMAL(6,4),  -- (executed_price - signal_price) / signal_price
    fill_rate DECIMAL(5,4),  -- executed_size / signal_size_usd
    execution_latency_ms INTEGER,  -- Time from signal to order placement
    fill_latency_ms INTEGER,  -- Time from order to first fill
    
    -- Risk Check
    risk_check_passed BOOLEAN DEFAULT TRUE,
    risk_check_reason TEXT,
    
    -- Status
    status TEXT DEFAULT 'PENDING',  -- PENDING, PARTIAL, FILLED, REJECTED, CANCELLED
    rejection_reason TEXT,
    
    -- Outcome (resolved)
    outcome TEXT DEFAULT 'OPEN',  -- OPEN, WON, LOST, CLOSED
    winning_label TEXT,
    pnl DECIMAL(10,2),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Comparison to FT
    ft_entry_price DECIMAL(6,4),  -- FT's entry_price
    ft_size DECIMAL(10,2),  -- FT's size
    ft_pnl DECIMAL(10,2),  -- FT's PnL (when resolved)
    performance_diff_pct DECIMAL(8,4),  -- (live_pnl - ft_pnl) / ft_pnl
    
    -- Redemption Link
    redemption_id UUID,  -- References lt_redemptions (created separately)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id, source_trade_id)  -- One live order per strategy per source trade
);

-- lt_risk_rules: Risk management configuration per strategy
CREATE TABLE IF NOT EXISTS public.lt_risk_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Budget Limits
    daily_budget_usd DECIMAL(12,2),  -- Max $ per day
    daily_budget_pct DECIMAL(5,3),   -- Max % of capital per day (e.g., 0.10 = 10%)
    weekly_budget_usd DECIMAL(12,2),
    monthly_budget_usd DECIMAL(12,2),
    
    -- Position Limits
    max_position_size_usd DECIMAL(10,2),  -- Max $ per trade
    max_position_size_pct DECIMAL(5,3),   -- Max % of capital per trade (e.g., 0.02 = 2%)
    max_total_exposure_usd DECIMAL(12,2), -- Max total open exposure
    max_total_exposure_pct DECIMAL(5,3),  -- Max % of capital in open positions
    max_positions_per_market INTEGER DEFAULT 1,  -- Max positions per market
    max_concurrent_positions INTEGER DEFAULT 20, -- Max open positions
    
    -- Drawdown Control
    max_drawdown_pct DECIMAL(5,3) DEFAULT 0.07,  -- Pause if equity drops 7%
    max_consecutive_losses INTEGER DEFAULT 5,    -- Pause after 5 losses
    drawdown_resume_threshold_pct DECIMAL(5,3), -- Resume after X% recovery
    
    -- Circuit Breakers
    max_slippage_pct DECIMAL(6,4) DEFAULT 0.01,  -- Reject if slippage > 1%
    max_spread_pct DECIMAL(6,4),                -- Reject if spread > X%
    min_liquidity_usd DECIMAL(10,2),           -- Require min liquidity
    max_latency_ms INTEGER DEFAULT 5000,        -- Reject if latency > 5s
    
    -- Volatility Adjustment
    use_volatility_adjustment BOOLEAN DEFAULT FALSE,
    volatility_lookback_days INTEGER DEFAULT 7,
    low_volatility_multiplier DECIMAL(4,2) DEFAULT 1.0,
    high_volatility_multiplier DECIMAL(4,2) DEFAULT 0.5,
    
    -- Stop Loss (optional)
    enable_stop_loss BOOLEAN DEFAULT FALSE,
    stop_loss_pct DECIMAL(5,3),  -- Exit if price drops X% from entry
    
    -- Take Profit (optional)
    enable_take_profit BOOLEAN DEFAULT FALSE,
    take_profit_pct DECIMAL(5,3),  -- Exit if price rises X% from entry
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);

-- lt_risk_state: Current risk state tracking per strategy
CREATE TABLE IF NOT EXISTS public.lt_risk_state (
    state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Current State
    current_equity DECIMAL(12,2) NOT NULL,
    peak_equity DECIMAL(12,2) NOT NULL,
    current_drawdown_pct DECIMAL(5,3) DEFAULT 0,
    consecutive_losses INTEGER DEFAULT 0,
    
    -- Daily Tracking
    daily_spent_usd DECIMAL(12,2) DEFAULT 0,
    daily_trades_count INTEGER DEFAULT 0,
    daily_start_equity DECIMAL(12,2),
    daily_reset_at TIMESTAMP WITH TIME ZONE DEFAULT DATE_TRUNC('day', NOW()),
    
    -- Weekly/Monthly Tracking
    weekly_spent_usd DECIMAL(12,2) DEFAULT 0,
    monthly_spent_usd DECIMAL(12,2) DEFAULT 0,
    
    -- Circuit Breaker State
    circuit_breaker_active BOOLEAN DEFAULT FALSE,
    circuit_breaker_reason TEXT,
    circuit_breaker_until TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_paused BOOLEAN DEFAULT FALSE,
    pause_reason TEXT,
    paused_at TIMESTAMP WITH TIME ZONE,
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);

-- lt_redemptions: Redemption tracking for resolved positions
CREATE TABLE IF NOT EXISTS public.lt_redemptions (
    redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lt_order_id UUID NOT NULL REFERENCES public.lt_orders(lt_order_id),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    order_id UUID NOT NULL REFERENCES public.orders(order_id),
    
    -- Market Resolution
    condition_id TEXT NOT NULL,
    market_resolved_at TIMESTAMP WITH TIME ZONE,
    winning_outcome TEXT,  -- YES or NO
    user_outcome TEXT,     -- What we bet on
    
    -- Redemption Details
    redemption_type TEXT NOT NULL,  -- 'WINNER' (auto-redeem) or 'LOSER' (confirm)
    redemption_status TEXT DEFAULT 'PENDING',  -- PENDING, REDEEMING, REDEEMED, FAILED
    redemption_tx_hash TEXT,
    redemption_amount_usd DECIMAL(10,2),
    
    -- Attempts
    redemption_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    redeemed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(lt_order_id)
);

-- lt_health_checks: Health monitoring per strategy
CREATE TABLE IF NOT EXISTS public.lt_health_checks (
    check_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Check Type
    check_type TEXT NOT NULL,  -- 'EXECUTION', 'REDEMPTION', 'RISK', 'SYSTEM'
    check_status TEXT NOT NULL,  -- 'HEALTHY', 'WARNING', 'CRITICAL'
    
    -- Metrics
    execution_latency_ms INTEGER,
    fill_rate DECIMAL(5,4),
    rejection_rate DECIMAL(5,4),
    slippage_avg_pct DECIMAL(6,4),
    error_count INTEGER DEFAULT 0,
    
    -- Timestamps
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Details
    details JSONB
);

-- lt_alerts: Alert system for issues and events
CREATE TABLE IF NOT EXISTS public.lt_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT REFERENCES public.lt_strategies(strategy_id),
    
    -- Alert Details
    alert_type TEXT NOT NULL,  -- 'DRAWDOWN', 'CIRCUIT_BREAKER', 'ERROR', 'PERFORMANCE'
    alert_severity TEXT NOT NULL,  -- 'INFO', 'WARNING', 'CRITICAL'
    alert_title TEXT NOT NULL,
    alert_message TEXT NOT NULL,
    
    -- Status
    alert_status TEXT DEFAULT 'ACTIVE',  -- ACTIVE, ACKNOWLEDGED, RESOLVED
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notification
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_channels TEXT[],  -- ['email', 'slack', 'telegram']
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lt_orders_strategy_status ON public.lt_orders(strategy_id, status);
CREATE INDEX IF NOT EXISTS idx_lt_orders_order_id ON public.lt_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_lt_orders_ft_order ON public.lt_orders(ft_order_id);
CREATE INDEX IF NOT EXISTS idx_lt_orders_condition ON public.lt_orders(condition_id);
CREATE INDEX IF NOT EXISTS idx_lt_orders_outcome ON public.lt_orders(strategy_id, outcome);
CREATE INDEX IF NOT EXISTS idx_lt_orders_source_trade ON public.lt_orders(strategy_id, source_trade_id);

CREATE INDEX IF NOT EXISTS idx_lt_risk_state_strategy ON public.lt_risk_state(strategy_id);
CREATE INDEX IF NOT EXISTS idx_lt_risk_state_paused ON public.lt_risk_state(is_paused) WHERE is_paused = TRUE;
CREATE INDEX IF NOT EXISTS idx_lt_risk_state_circuit_breaker ON public.lt_risk_state(circuit_breaker_active) WHERE circuit_breaker_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lt_redemptions_strategy_status ON public.lt_redemptions(strategy_id, redemption_status);
CREATE INDEX IF NOT EXISTS idx_lt_redemptions_pending ON public.lt_redemptions(redemption_status) WHERE redemption_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_lt_health_strategy_time ON public.lt_health_checks(strategy_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_lt_health_status ON public.lt_health_checks(check_status) WHERE check_status IN ('WARNING', 'CRITICAL');

CREATE INDEX IF NOT EXISTS idx_lt_alerts_strategy_status ON public.lt_alerts(strategy_id, alert_status);
CREATE INDEX IF NOT EXISTS idx_lt_alerts_active ON public.lt_alerts(alert_status, alert_severity) WHERE alert_status = 'ACTIVE';

-- Enable RLS
ALTER TABLE public.lt_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_risk_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_risk_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lt_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own strategies
CREATE POLICY "Users can view their own lt_strategies" ON public.lt_strategies
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own lt_strategies" ON public.lt_strategies
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own lt_orders" ON public.lt_orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.lt_strategies 
            WHERE strategy_id = lt_orders.strategy_id 
            AND user_id = auth.uid()
        )
    );

CREATE POLICY "Service role full access lt_strategies" ON public.lt_strategies
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_orders" ON public.lt_orders
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_risk_rules" ON public.lt_risk_rules
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_risk_state" ON public.lt_risk_state
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_redemptions" ON public.lt_redemptions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_health_checks" ON public.lt_health_checks
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access lt_alerts" ON public.lt_alerts
    FOR ALL USING (true) WITH CHECK (true);

-- Add foreign key constraint for risk_rules_id
ALTER TABLE public.lt_strategies
    ADD CONSTRAINT fk_lt_strategies_risk_rules
    FOREIGN KEY (risk_rules_id) REFERENCES public.lt_risk_rules(rule_id);

-- Add foreign key constraint for redemption_id in lt_orders
ALTER TABLE public.lt_orders
    ADD CONSTRAINT fk_lt_orders_redemption
    FOREIGN KEY (redemption_id) REFERENCES public.lt_redemptions(redemption_id);
