-- ============================================================================
-- ALPHA AGENT: Autonomous AI Trading Strategy Optimizer
-- Migration: Create core tables for the AI agent system
-- ============================================================================

-- ============================================================================
-- 1. AGENT WALLETS - The 3 bots managed by the AI agent
-- ============================================================================
-- These are FT wallets but flagged as agent-managed so the agent can modify them.
-- We insert them into ft_wallets with a special prefix and track the mapping here.

CREATE TABLE IF NOT EXISTS alpha_agent_bots (
    bot_id TEXT PRIMARY KEY,                        -- e.g., 'ALPHA_EXPLORER', 'ALPHA_OPTIMIZER', 'ALPHA_CONSERVATIVE'
    ft_wallet_id TEXT NOT NULL REFERENCES ft_wallets(wallet_id),
    bot_role TEXT NOT NULL,                          -- 'explorer' | 'optimizer' | 'conservative'
    description TEXT NOT NULL,
    current_hypothesis TEXT,                         -- What the bot is currently testing
    last_config_change TIMESTAMPTZ,
    total_config_changes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. AGENT MEMORY - 3-tier persistent memory system (FinMem-inspired)
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_memory (
    memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_tier TEXT NOT NULL CHECK (memory_tier IN ('short_term', 'mid_term', 'long_term')),
    memory_type TEXT NOT NULL CHECK (memory_type IN (
        'observation',          -- Raw data observations
        'pattern',              -- Detected patterns
        'hypothesis',           -- Testable hypotheses
        'lesson',               -- Learned lessons (from outcomes)
        'anti_pattern',         -- Things that don't work
        'strategy_rule',        -- Proven strategy rules
        'market_regime',        -- Market condition observations
        'trader_insight',       -- Insights about specific traders
        'reflection'            -- Self-reflection on past decisions
    )),
    title TEXT NOT NULL,                             -- Short summary
    content TEXT NOT NULL,                           -- Full memory content
    evidence JSONB DEFAULT '{}',                     -- Supporting data/metrics
    confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
    tags TEXT[] DEFAULT '{}',                        -- Searchable tags
    related_memory_ids UUID[] DEFAULT '{}',          -- Links to related memories
    source_run_id UUID,                              -- Which agent run created this
    validated BOOLEAN DEFAULT FALSE,                  -- Has outcome confirmed this?
    validation_result TEXT,                           -- How validation turned out
    times_referenced INTEGER DEFAULT 0,              -- How often this memory is retrieved
    decay_factor REAL DEFAULT 1.0,                   -- For time-based relevance decay
    expires_at TIMESTAMPTZ,                          -- For short-term memories
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_memory_tier ON alpha_agent_memory(memory_tier);
CREATE INDEX idx_agent_memory_type ON alpha_agent_memory(memory_type);
CREATE INDEX idx_agent_memory_tags ON alpha_agent_memory USING GIN(tags);
CREATE INDEX idx_agent_memory_confidence ON alpha_agent_memory(confidence DESC);
CREATE INDEX idx_agent_memory_created ON alpha_agent_memory(created_at DESC);

-- ============================================================================
-- 3. AGENT RUNS - Each execution cycle of the agent
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type TEXT NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'reactive')),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Phase completion tracking
    phases_completed JSONB DEFAULT '{}',             -- { observe: true, analyze: true, ... }
    
    -- Observation summary
    observation_summary JSONB DEFAULT '{}',           -- Key metrics snapshot
    
    -- Analysis results
    analysis TEXT,                                    -- LLM analysis output
    patterns_found JSONB DEFAULT '[]',                -- Patterns detected this run
    
    -- Decisions made
    decisions JSONB DEFAULT '[]',                     -- Strategy changes decided
    decisions_reasoning TEXT,                          -- Full reasoning chain
    
    -- Actions taken
    actions_taken JSONB DEFAULT '[]',                 -- Config changes applied
    
    -- Reflection
    reflection TEXT,                                  -- Post-action reflection
    
    -- Performance context
    market_regime TEXT,                                -- bull/bear/volatile/stable
    total_bots_analyzed INTEGER,
    winning_bots INTEGER,
    losing_bots INTEGER,
    
    -- Token/cost tracking
    llm_tokens_used INTEGER DEFAULT 0,
    llm_model TEXT,
    
    -- Error handling
    error_message TEXT,
    error_phase TEXT
);

CREATE INDEX idx_agent_runs_status ON alpha_agent_runs(status);
CREATE INDEX idx_agent_runs_started ON alpha_agent_runs(started_at DESC);

-- ============================================================================
-- 4. AGENT DECISIONS - Detailed log of every strategy change
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_decisions (
    decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES alpha_agent_runs(run_id),
    bot_id TEXT NOT NULL REFERENCES alpha_agent_bots(bot_id),
    
    -- What changed
    decision_type TEXT NOT NULL CHECK (decision_type IN (
        'create_strategy',       -- New strategy creation
        'modify_filters',        -- Change entry filters
        'modify_allocation',     -- Change sizing method
        'modify_risk',           -- Change risk parameters
        'pause_strategy',        -- Temporarily pause
        'resume_strategy',       -- Resume from pause
        'reset_strategy',        -- Full reset
        'add_exit_rule',         -- Add selling/hedging rule
        'modify_exit_rule'       -- Change selling/hedging rule
    )),
    
    -- Before/after config
    config_before JSONB NOT NULL,
    config_after JSONB NOT NULL,
    config_diff JSONB NOT NULL,                       -- Just the changed fields
    
    -- Reasoning
    reasoning TEXT NOT NULL,                           -- Why this change was made
    hypothesis TEXT,                                   -- What hypothesis this tests
    expected_outcome TEXT,                              -- What we expect to happen
    confidence REAL DEFAULT 0.5,                       -- Agent's confidence in this decision
    
    -- Supporting evidence
    evidence_summary TEXT,                             -- Data that supports this decision
    related_memory_ids UUID[] DEFAULT '{}',
    
    -- Outcome tracking (filled in later)
    outcome_evaluated BOOLEAN DEFAULT FALSE,
    outcome_result TEXT,                                -- 'improved' | 'degraded' | 'neutral'
    outcome_details JSONB,                             -- Metrics before/after
    outcome_evaluated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_decisions_run ON alpha_agent_decisions(run_id);
CREATE INDEX idx_agent_decisions_bot ON alpha_agent_decisions(bot_id);
CREATE INDEX idx_agent_decisions_type ON alpha_agent_decisions(decision_type);
CREATE INDEX idx_agent_decisions_outcome ON alpha_agent_decisions(outcome_evaluated);

-- ============================================================================
-- 5. AGENT PERFORMANCE SNAPSHOTS - Track agent bot performance over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id TEXT NOT NULL REFERENCES alpha_agent_bots(bot_id),
    run_id UUID REFERENCES alpha_agent_runs(run_id),
    
    -- Core metrics
    total_pnl REAL,
    realized_pnl REAL,
    unrealized_pnl REAL,
    current_balance REAL,
    total_trades INTEGER,
    open_trades INTEGER,
    resolved_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    win_rate REAL,
    avg_win REAL,
    avg_loss REAL,
    profit_factor REAL,
    roi_pct REAL,
    
    -- Edge metrics
    avg_edge REAL,
    avg_model_probability REAL,
    avg_conviction REAL,
    
    -- Time metrics
    avg_time_to_resolution_hours REAL,
    
    -- Current config snapshot
    config_snapshot JSONB,
    
    snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_snapshots_bot ON alpha_agent_snapshots(bot_id, snapshot_at DESC);

-- ============================================================================
-- 6. STRATEGY HYPOTHESES - Track testable hypotheses
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_hypotheses (
    hypothesis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
        'proposed',          -- Just generated
        'testing',           -- Currently being tested by a bot
        'validated',         -- Confirmed by data
        'invalidated',       -- Disproven by data
        'inconclusive',      -- Not enough data yet
        'superseded'         -- Replaced by better hypothesis
    )),
    
    -- Assignment
    assigned_bot_id TEXT REFERENCES alpha_agent_bots(bot_id),
    assigned_run_id UUID REFERENCES alpha_agent_runs(run_id),
    
    -- Test design
    test_config JSONB,                                 -- Config to test this hypothesis
    success_criteria TEXT,                              -- How to evaluate
    min_trades_needed INTEGER DEFAULT 20,               -- Minimum sample size
    max_test_duration_hours INTEGER DEFAULT 168,        -- Max 1 week test
    
    -- Results
    trades_observed INTEGER DEFAULT 0,
    current_win_rate REAL,
    current_pnl REAL,
    result_summary TEXT,
    
    -- Lineage
    parent_hypothesis_id UUID REFERENCES alpha_agent_hypotheses(hypothesis_id),
    source_memory_ids UUID[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    evaluated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_hypotheses_status ON alpha_agent_hypotheses(status);
CREATE INDEX idx_agent_hypotheses_bot ON alpha_agent_hypotheses(assigned_bot_id);

-- ============================================================================
-- 7. SELLING STRATEGY LOG - Track exit/hedge decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS alpha_agent_exit_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id TEXT NOT NULL REFERENCES alpha_agent_bots(bot_id),
    
    rule_type TEXT NOT NULL CHECK (rule_type IN (
        'time_based_exit',       -- Exit after N hours
        'price_target',          -- Exit at price target
        'stop_loss',             -- Stop loss rule
        'take_profit',           -- Take profit rule
        'hedge_trigger',         -- When to hedge
        'resolution_proximity',  -- Exit as resolution approaches
        'edge_decay',            -- Exit when edge decays
        'trader_exit',           -- Exit when copied trader exits
        'regime_change'          -- Exit on market regime change
    )),
    
    -- Rule parameters
    parameters JSONB NOT NULL,
    
    -- Performance
    times_triggered INTEGER DEFAULT 0,
    avg_pnl_when_triggered REAL,
    
    is_active BOOLEAN DEFAULT TRUE,
    reasoning TEXT,
    created_by_run_id UUID REFERENCES alpha_agent_runs(run_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_exit_rules_bot ON alpha_agent_exit_rules(bot_id, is_active);

-- ============================================================================
-- 8. Insert the 3 agent-managed FT wallets
-- ============================================================================

-- Bot 1: ALPHA EXPLORER - Aggressive hypothesis testing, tests new ideas
INSERT INTO ft_wallets (
    wallet_id, config_id, strategy_name, description,
    model_threshold, price_min, price_max, min_edge,
    use_model, allocation_method, kelly_fraction,
    bet_size, bet_allocation_weight, min_bet, max_bet,
    starting_balance, current_balance, is_active,
    start_date, end_date, min_trader_resolved_count, min_conviction,
    detailed_description
) VALUES (
    'ALPHA_EXPLORER', 'ALPHA_EXPLORER', 'Alpha Explorer',
    'AI Agent Bot - Aggressive edge exploration. Tests new hypotheses about what strategies work.',
    0.52, 0.10, 0.85, 0.03,
    TRUE, 'CONFIDENCE', 0.30,
    1.50, 1.0, 0.50, 8.00,
    500.00, 500.00, TRUE,
    '2026-02-15', '2027-02-15', 30, 0.8,
    '{"agent_managed": true, "bot_role": "explorer"}'
) ON CONFLICT (wallet_id) DO NOTHING;

-- Bot 2: ALPHA OPTIMIZER - Refines proven strategies, optimizes parameters
INSERT INTO ft_wallets (
    wallet_id, config_id, strategy_name, description,
    model_threshold, price_min, price_max, min_edge,
    use_model, allocation_method, kelly_fraction,
    bet_size, bet_allocation_weight, min_bet, max_bet,
    starting_balance, current_balance, is_active,
    start_date, end_date, min_trader_resolved_count, min_conviction,
    detailed_description
) VALUES (
    'ALPHA_OPTIMIZER', 'ALPHA_OPTIMIZER', 'Alpha Optimizer',
    'AI Agent Bot - Optimizes proven winning strategies. Fine-tunes parameters for maximum edge.',
    0.55, 0.15, 0.75, 0.05,
    TRUE, 'KELLY', 0.25,
    2.00, 1.0, 0.50, 10.00,
    500.00, 500.00, TRUE,
    '2026-02-15', '2027-02-15', 50, 1.0,
    '{"agent_managed": true, "bot_role": "optimizer"}'
) ON CONFLICT (wallet_id) DO NOTHING;

-- Bot 3: ALPHA CONSERVATIVE - High conviction only, proven edge
INSERT INTO ft_wallets (
    wallet_id, config_id, strategy_name, description,
    model_threshold, price_min, price_max, min_edge,
    use_model, allocation_method, kelly_fraction,
    bet_size, bet_allocation_weight, min_bet, max_bet,
    starting_balance, current_balance, is_active,
    start_date, end_date, min_trader_resolved_count, min_conviction,
    detailed_description
) VALUES (
    'ALPHA_CONSERVATIVE', 'ALPHA_CONSERVATIVE', 'Alpha Conservative',
    'AI Agent Bot - Ultra-conservative. Only takes highest-conviction setups from proven patterns.',
    0.60, 0.20, 0.65, 0.08,
    TRUE, 'WHALE', 0.20,
    2.50, 1.0, 1.00, 12.00,
    500.00, 500.00, TRUE,
    '2026-02-15', '2027-02-15', 100, 1.5,
    '{"agent_managed": true, "bot_role": "conservative"}'
) ON CONFLICT (wallet_id) DO NOTHING;

-- Insert agent bot mappings
INSERT INTO alpha_agent_bots (bot_id, ft_wallet_id, bot_role, description)
VALUES 
    ('ALPHA_EXPLORER', 'ALPHA_EXPLORER', 'explorer', 
     'Aggressive edge exploration. Tests new hypotheses with moderate risk. Rotates strategies frequently to find alpha.'),
    ('ALPHA_OPTIMIZER', 'ALPHA_OPTIMIZER', 'optimizer',
     'Refines proven strategies. Takes winning patterns and optimizes entry filters, sizing, and exit rules.'),
    ('ALPHA_CONSERVATIVE', 'ALPHA_CONSERVATIVE', 'conservative',
     'Ultra-conservative. Only deploys highest-conviction strategies with proven track records. Maximizes Sharpe ratio.')
ON CONFLICT (bot_id) DO NOTHING;

-- ============================================================================
-- 9. Helper function for memory reference counting
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_memory_references(memory_ids UUID[])
RETURNS VOID AS $$
BEGIN
    UPDATE alpha_agent_memory
    SET times_referenced = times_referenced + 1
    WHERE memory_id = ANY(memory_ids);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. Seed initial long-term memories (bootstrap knowledge)
-- ============================================================================

INSERT INTO alpha_agent_memory (memory_tier, memory_type, title, content, confidence, tags) VALUES
    ('long_term', 'strategy_rule', 'Kelly Criterion requires accurate edge estimation',
     'Kelly sizing is theoretically optimal but extremely sensitive to edge estimation errors. Using fractional Kelly (0.25-0.5) provides significant drawdown protection with modest return sacrifice. Over-betting (full Kelly or more) leads to ruin. Under-betting wastes capital but preserves it.',
     0.95, ARRAY['sizing', 'kelly', 'risk_management']),
    
    ('long_term', 'strategy_rule', 'Edge decays with time and price movement',
     'The edge of a trade signal decays as: (1) time passes after the signal, (2) the price moves toward the signal direction (less value), (3) other traders copy the same signal. Fresh signals with low slippage have the highest edge. Stale signals should be discounted.',
     0.90, ARRAY['edge', 'timing', 'signal_decay']),
    
    ('long_term', 'strategy_rule', 'Win rate alone is insufficient for profitability',
     'A 70% win rate with bad sizing can lose money. A 55% win rate with good sizing can be very profitable. The key metric is expected value: EV = (win_rate × avg_win) - (loss_rate × avg_loss). Profit factor > 1.5 is strong. Edge-scaled sizing amplifies EV.',
     0.95, ARRAY['win_rate', 'sizing', 'expected_value']),
    
    ('long_term', 'strategy_rule', 'Time to resolution impacts capital efficiency',
     'Shorter resolution times allow capital to be recycled faster. A 55% WR on 2-hour markets is more capital-efficient than 60% WR on 7-day markets. The annualized return considers both win rate AND capital turnover. Sports markets typically resolve faster than political markets.',
     0.85, ARRAY['time_to_resolution', 'capital_efficiency', 'market_type']),
    
    ('long_term', 'strategy_rule', 'ML model probability is a signal, not a guarantee',
     'The ML model captures trader-level patterns (win rate trends, conviction, experience) not market-level fundamentals. It works best when combined with other filters (edge, price band, conviction). Model probability > 0.55 combined with edge > 5% is a strong setup.',
     0.85, ARRAY['ml_model', 'signal_combination', 'probability']),
    
    ('long_term', 'strategy_rule', 'Underdog bets have asymmetric risk/reward',
     'Bets at 10-40 cents (underdogs) have higher potential ROI per trade but lower base rates. The key is finding underdogs where the trader win rate significantly exceeds the market price. Edge = WR - price, so a 60% WR trader buying at 30c has 30% edge vs 5% edge at 55c.',
     0.80, ARRAY['underdogs', 'price_band', 'asymmetric_returns']),
    
    ('long_term', 'strategy_rule', 'Diversification across market types reduces variance',
     'Different market categories (sports, politics, crypto) have different resolution patterns and correlation structures. Sports resolve quickly but are efficient. Politics are slower but may have more mispricing. Diversifying across categories reduces portfolio variance.',
     0.75, ARRAY['diversification', 'market_type', 'variance']),
    
    ('long_term', 'anti_pattern', 'Chasing performance leads to regime-change losses',
     'Copying the exact strategy of whatever bot performed best last week often fails because: (1) the edge may have been captured, (2) market regimes shift, (3) small sample sizes create illusions of skill. Instead, look for persistent structural edges that work across regimes.',
     0.85, ARRAY['regime_change', 'overfitting', 'anti_pattern']),
    
    ('long_term', 'strategy_rule', 'Position exit timing matters as much as entry',
     'Many positions that were profitable at some point end up losing because of poor exit timing. Key exit signals: (1) copied trader sells their position, (2) price reaches a take-profit target, (3) edge decays below a threshold, (4) time to resolution creates liquidity risk, (5) market regime changes.',
     0.80, ARRAY['exit_strategy', 'selling', 'timing']);
