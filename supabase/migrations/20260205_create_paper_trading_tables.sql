-- ============================================================================
-- Migration: Create paper trading simulation tables
-- Purpose: Store live paper trading simulations and their trades
-- Date: Feb 5, 2026
-- 
-- DESIGN:
-- - All strategies use EDGE-BASED position sizing for fair comparison
-- - Only entry criteria differ between strategies  
-- - Simulations persist to survive server restarts
-- - Hourly snapshots enable trend analysis and debugging
-- ============================================================================

-- =============================================================================
-- TABLE: paper_trading_simulations
-- Stores the configuration and state of each simulation
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_simulations (
  id TEXT PRIMARY KEY,                    -- Unique simulation ID (e.g., "live-1738723456789-abc123")
  
  -- Configuration
  mode TEXT NOT NULL DEFAULT 'live',      -- 'backtest' or 'live'
  initial_capital NUMERIC NOT NULL DEFAULT 1000,
  duration_days INTEGER NOT NULL DEFAULT 4,
  slippage_pct NUMERIC NOT NULL DEFAULT 0.04,
  cooldown_hours INTEGER NOT NULL DEFAULT 3,
  
  -- Strategies being tested (all use edge-based sizing)
  strategies JSONB NOT NULL DEFAULT '["PURE_VALUE_SCORE", "WEIGHTED_VALUE_SCORE", "SINGLES_ONLY_V1", "SINGLES_ONLY_V2"]'::jsonb,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  
  -- Status: 'active', 'completed', 'paused'
  status TEXT NOT NULL DEFAULT 'active',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: paper_trading_portfolios  
-- Stores the current state of each strategy's portfolio
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id TEXT NOT NULL REFERENCES paper_trading_simulations(id) ON DELETE CASCADE,
  strategy_type TEXT NOT NULL,            -- 'PURE_VALUE_SCORE', etc.
  
  -- Capital breakdown
  available_cash NUMERIC NOT NULL,
  locked_capital NUMERIC NOT NULL DEFAULT 0,
  cooldown_capital NUMERIC NOT NULL DEFAULT 0,
  
  -- Performance metrics
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  peak_capital NUMERIC NOT NULL,
  drawdown NUMERIC NOT NULL DEFAULT 0,     -- Max drawdown as decimal (0.15 = 15%)
  
  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(simulation_id, strategy_type)
);

-- =============================================================================
-- TABLE: paper_trading_positions
-- Stores individual trades/positions for each portfolio
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_positions (
  id TEXT PRIMARY KEY,                    -- Trade ID from the simulation
  portfolio_id UUID NOT NULL REFERENCES paper_trading_portfolios(id) ON DELETE CASCADE,
  
  -- Trade identification
  condition_id TEXT NOT NULL,
  token_id TEXT,
  market_slug TEXT,
  market_title TEXT NOT NULL,
  outcome TEXT NOT NULL,                  -- 'YES' or 'NO'
  
  -- Entry details
  entry_price NUMERIC NOT NULL,
  raw_price NUMERIC NOT NULL,             -- Price before slippage
  slippage_applied NUMERIC NOT NULL,
  size NUMERIC NOT NULL,                  -- Number of shares
  invested_usd NUMERIC NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  
  -- Signal data at entry (for analysis)
  value_score NUMERIC,
  polyscore NUMERIC,
  ai_edge NUMERIC,                        -- This drives position sizing
  trader_win_rate NUMERIC,
  bet_structure TEXT,                     -- 'STANDARD', 'SPREAD', 'OVER_UNDER', 'WINNER'
  niche TEXT,
  
  -- Original trade reference
  original_trade_id TEXT,
  wallet_address TEXT,
  
  -- Resolution
  status TEXT NOT NULL DEFAULT 'OPEN',    -- 'OPEN', 'WON', 'LOST', 'CANCELLED'
  exit_price NUMERIC,
  exit_timestamp TIMESTAMPTZ,
  pnl_usd NUMERIC,
  roi_percent NUMERIC,
  
  -- Cooldown tracking
  cash_available_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLE: paper_trading_hourly_snapshots
-- Hourly snapshots for tracking progress over time
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_hourly_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES paper_trading_portfolios(id) ON DELETE CASCADE,
  
  -- Hour tracking
  hour INTEGER NOT NULL,                  -- 0, 1, 2, ... (hour since simulation start)
  timestamp TIMESTAMPTZ NOT NULL,
  
  -- Portfolio state
  portfolio_value NUMERIC NOT NULL,
  available_cash NUMERIC NOT NULL,
  locked_capital NUMERIC NOT NULL,
  cooldown_capital NUMERIC NOT NULL,
  open_positions INTEGER NOT NULL,
  
  -- Activity this hour
  trades_this_hour INTEGER NOT NULL DEFAULT 0,
  resolutions_this_hour INTEGER NOT NULL DEFAULT 0,
  pnl_this_hour NUMERIC NOT NULL DEFAULT 0,
  cumulative_pnl NUMERIC NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(portfolio_id, hour)
);

-- =============================================================================
-- TABLE: paper_trading_cooldown_queue
-- Tracks capital waiting to be released after cooldown period
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.paper_trading_cooldown_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES paper_trading_portfolios(id) ON DELETE CASCADE,
  
  amount NUMERIC NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Simulations
CREATE INDEX IF NOT EXISTS idx_paper_trading_simulations_status 
ON paper_trading_simulations(status, ends_at DESC);

-- Portfolios
CREATE INDEX IF NOT EXISTS idx_paper_trading_portfolios_simulation 
ON paper_trading_portfolios(simulation_id);

-- Positions
CREATE INDEX IF NOT EXISTS idx_paper_trading_positions_portfolio 
ON paper_trading_positions(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_paper_trading_positions_status 
ON paper_trading_positions(portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_paper_trading_positions_condition 
ON paper_trading_positions(condition_id, status);

-- Snapshots
CREATE INDEX IF NOT EXISTS idx_paper_trading_snapshots_portfolio 
ON paper_trading_hourly_snapshots(portfolio_id, hour);

-- Cooldown
CREATE INDEX IF NOT EXISTS idx_paper_trading_cooldown_pending 
ON paper_trading_cooldown_queue(portfolio_id, available_at);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE paper_trading_simulations IS 
  'Paper trading simulation configurations. Each simulation tests 4 strategies simultaneously.';

COMMENT ON TABLE paper_trading_portfolios IS 
  'Current state of each strategy portfolio. One portfolio per strategy per simulation.';

COMMENT ON TABLE paper_trading_positions IS 
  'Individual trades. Open positions have status=OPEN, resolved have WON/LOST.';

COMMENT ON TABLE paper_trading_hourly_snapshots IS 
  'Hourly snapshots for charting and trend analysis. One per portfolio per hour.';

COMMENT ON TABLE paper_trading_cooldown_queue IS 
  'Capital waiting to be released after 3-hour cooldown. Deleted when released.';

COMMENT ON COLUMN paper_trading_positions.ai_edge IS 
  'AI edge percentage that determines position sizing. Higher edge = larger bet.';
