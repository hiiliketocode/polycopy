-- Forward Testing Tables
-- Tables to track virtual "paper trading" wallets testing different strategies

-- ft_wallets: Each wallet represents a different strategy configuration
CREATE TABLE IF NOT EXISTS public.ft_wallets (
    wallet_id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    detailed_description TEXT,
    
    -- Balance tracking
    starting_balance DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
    current_balance DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
    total_pnl DECIMAL(12,2) DEFAULT 0.00,
    
    -- Strategy configuration
    model_threshold DECIMAL(4,3),     -- e.g., 0.50 for 50% model confidence
    price_min DECIMAL(4,3) DEFAULT 0.0,
    price_max DECIMAL(4,3) DEFAULT 1.0,
    min_edge DECIMAL(4,3) DEFAULT 0.0, -- minimum edge (win_rate - price)
    use_model BOOLEAN DEFAULT TRUE,
    
    -- Trade settings
    bet_size DECIMAL(10,2) NOT NULL DEFAULT 1.20,  -- Base bet size (used with FIXED method)
    bet_allocation_weight DECIMAL(4,2) NOT NULL DEFAULT 1.00,  -- Legacy multiplier
    
    -- Dynamic allocation settings
    allocation_method TEXT NOT NULL DEFAULT 'FIXED',  -- FIXED, KELLY, EDGE_SCALED, TIERED, CONFIDENCE
    kelly_fraction DECIMAL(4,2) DEFAULT 0.25,  -- Fraction of Kelly to use (0.25 = quarter Kelly, safer)
    min_bet DECIMAL(10,2) DEFAULT 0.50,  -- Minimum bet size
    max_bet DECIMAL(10,2) DEFAULT 10.00,  -- Maximum bet size
    
    min_trader_resolved_count INTEGER DEFAULT 30,
    
    -- Time bounds
    start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '4 days'),
    
    -- Sync state
    last_sync_time TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    total_trades INTEGER DEFAULT 0,
    open_positions INTEGER DEFAULT 0,
    trades_seen INTEGER DEFAULT 0,
    trades_skipped INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ft_orders: Individual virtual trades/positions
CREATE TABLE IF NOT EXISTS public.ft_orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id TEXT NOT NULL REFERENCES public.ft_wallets(wallet_id),
    order_type TEXT DEFAULT 'FT',  -- Always 'FT' for forward test
    
    -- Trade details
    side TEXT,  -- BUY or SELL
    market_slug TEXT,
    condition_id TEXT,
    market_title TEXT,
    token_label TEXT,  -- YES or NO (what we're betting will win)
    
    -- Source trade info (from Polymarket)
    source_trade_id TEXT,  -- Transaction hash or trade ID from Polymarket
    trader_address TEXT,   -- The trader we copied
    
    -- Price and size
    entry_price DECIMAL(6,4),
    size DECIMAL(10,2),  -- Virtual bet size in dollars
    
    -- Market timing
    market_end_time TIMESTAMP WITH TIME ZONE,
    
    -- Trader stats at time of trade
    trader_win_rate DECIMAL(5,4),
    trader_roi DECIMAL(8,4),
    trader_resolved_count INTEGER,
    
    -- Model prediction (if applicable)
    model_probability DECIMAL(5,4),
    edge_pct DECIMAL(5,4),  -- trader_win_rate - entry_price
    conviction DECIMAL(6,2),  -- trade_value / trader_avg_trade_value (1.0 = normal, 2.0 = 2x their usual)
    
    -- Outcome (once resolved)
    outcome TEXT DEFAULT 'OPEN',  -- OPEN, WON, LOST
    winning_label TEXT,  -- YES or NO (the actual winner)
    pnl DECIMAL(10,2),   -- Profit/loss in dollars
    
    -- Timestamps
    order_time TIMESTAMP WITH TIME ZONE NOT NULL,  -- When the source trade was placed
    resolved_time TIMESTAMP WITH TIME ZONE,        -- When we marked it resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(wallet_id, source_trade_id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ft_orders_wallet_outcome ON public.ft_orders(wallet_id, outcome);
CREATE INDEX IF NOT EXISTS idx_ft_orders_wallet_time ON public.ft_orders(wallet_id, order_time DESC);
CREATE INDEX IF NOT EXISTS idx_ft_orders_condition_id ON public.ft_orders(condition_id);
CREATE INDEX IF NOT EXISTS idx_ft_orders_trader ON public.ft_orders(trader_address);

-- Enable RLS
ALTER TABLE public.ft_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ft_orders ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow public read ft_wallets" ON public.ft_wallets
    FOR SELECT USING (true);
    
CREATE POLICY "Allow public read ft_orders" ON public.ft_orders
    FOR SELECT USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access ft_wallets" ON public.ft_wallets
    FOR ALL USING (true) WITH CHECK (true);
    
CREATE POLICY "Service role full access ft_orders" ON public.ft_orders
    FOR ALL USING (true) WITH CHECK (true);

-- Insert default wallets
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    starting_balance, current_balance, bet_size,
    model_threshold, price_min, price_max, min_edge, use_model,
    start_date, end_date, is_active
) VALUES 
(
    'FT_HIGH_CONVICTION', 
    'HIGH_CONVICTION', 
    'High Conviction',
    '95ct+ underdogs only, no model filter',
    E'**Strategy**: Copy only ultra-high-conviction trades from experienced traders.\n\n**Entry Criteria**:\n- Trader win rate: 95%+ (top 1% of traders)\n- Price range: 0-50¢ (underdog positions)\n- Minimum trader experience: 30+ resolved trades\n- No model filter - relies purely on trader track record\n\n**Why This Works**: Traders with 95%+ win rates are extremely selective. When they bet on underdogs, they likely have strong conviction based on information not yet reflected in the market.',
    1000.00, 1000.00, 1.20,
    NULL, 0.0, 0.50, 0.0, FALSE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
),
(
    'FT_MODEL_BALANCED',
    'MODEL_BALANCED',
    'Model Balanced',
    'Model 50%+ confidence, 55%+ trader WR, 5%+ edge',
    E'**Strategy**: Balanced approach using both model predictions and trader statistics.\n\n**Entry Criteria**:\n- Model probability: 50%+ (model thinks trade is likely profitable)\n- Trader win rate: 55%+ \n- Price range: Full range (0-100¢)\n- Minimum edge: 5% (trader_wr - price >= 0.05)\n- Minimum trader experience: 30+ resolved trades\n\n**Why This Works**: Combines model intelligence with proven trader track records. The 5% edge requirement ensures we only enter when odds are meaningfully in our favor.',
    1000.00, 1000.00, 1.20,
    0.50, 0.0, 1.0, 0.05, TRUE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
),
(
    'FT_UNDERDOG_HUNTER',
    'UNDERDOG_HUNTER', 
    'Underdog Hunter',
    'Model 50%+, underdogs (<50¢), 5%+ edge',
    E'**Strategy**: Hunt for mispriced underdog positions using model + trader signals.\n\n**Entry Criteria**:\n- Model probability: 50%+ confidence\n- Price range: 0-50¢ (underdog positions only)\n- Minimum edge: 5%\n- Minimum trader experience: 30+ resolved trades\n\n**Why This Works**: Underdogs offer higher payouts when they win. By filtering for model confidence and edge, we identify underdogs that are likely mispriced by the market.',
    1000.00, 1000.00, 1.20,
    0.50, 0.0, 0.50, 0.05, TRUE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
),
(
    'FT_FAVORITE_GRINDER',
    'FAVORITE_GRINDER',
    'Favorite Grinder', 
    'High WR traders, favorites (>50¢), consistent wins',
    E'**Strategy**: Grind consistent small wins by backing favorites with high-WR traders.\n\n**Entry Criteria**:\n- Trader win rate: 60%+ \n- Price range: 50-90¢ (favorites only)\n- Minimum edge: 3%\n- Minimum trader experience: 30+ resolved trades\n\n**Why This Works**: Favorites win more often. Combined with high-WR traders, this aims for consistent small wins rather than big payouts.',
    1000.00, 1000.00, 1.20,
    NULL, 0.50, 0.90, 0.03, FALSE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
),
(
    'FT_SHARP_SHOOTER',
    'SHARP_SHOOTER',
    'Sharp Shooter',
    'Model 55%+, 65%+ WR, 10%+ edge, 1.5x conv, $50 max',
    E'**Strategy**: Sniper approach - fewer trades, highest quality, aggressive bets.\n\n**Entry Criteria**:\n- Model probability: 55%+ (model confidence required)\n- Trader win rate: 65%+ (elite traders only)\n- Minimum edge: 10% (trader_wr - price >= 0.10)\n- Minimum conviction: 1.5x (trader betting 50%+ more than usual)\n- Price range: 10-70¢ (avoid extreme odds)\n- Minimum trader experience: 50+ resolved trades\n\n**Bet Sizing**: Kelly Criterion at 50% (half Kelly)\n- Min bet: $2.00\n- Max bet: $50.00\n\n**Why This Works**: Requires BOTH model confidence AND elite trader putting extra money where their mouth is. Only the highest-quality setups pass all filters.',
    1000.00, 1000.00, 5.00,
    0.55, 0.10, 0.70, 0.10, TRUE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
),
(
    'FT_MODEL_ONLY',
    'MODEL_ONLY',
    'Model Only',
    'Model 55%+ only, no trader filters, pure ML signal',
    E'**Strategy**: Pure model-driven trading - tests the ML model in isolation.\n\n**Entry Criteria**:\n- Model probability: 55%+ (only filter)\n- Price range: Full range (0-100¢)\n- Minimum edge: 0% (model score is the only signal)\n- No trader win rate requirement\n- Minimum trader experience: 10+ trades (minimal filter)\n\n**Bet Sizing**: Kelly Criterion at 25% (quarter Kelly)\n- Min bet: $0.50\n- Max bet: $10.00\n\n**Why This Works**: Isolates the model''s predictive power from trader statistics. If this wallet performs well, it validates our ML model. If it underperforms vs trader-filtered wallets, it shows trader selection adds alpha.',
    1000.00, 1000.00, 1.20,
    0.55, 0.0, 1.0, 0.0, TRUE,
    NOW(), NOW() + INTERVAL '4 days', TRUE
)
ON CONFLICT (wallet_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    detailed_description = EXCLUDED.detailed_description,
    model_threshold = EXCLUDED.model_threshold,
    price_min = EXCLUDED.price_min,
    price_max = EXCLUDED.price_max,
    min_edge = EXCLUDED.min_edge,
    use_model = EXCLUDED.use_model,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    updated_at = NOW();

-- Update Sharp Shooter with aggressive Kelly settings and conviction filter
UPDATE public.ft_wallets 
SET 
    allocation_method = 'KELLY',
    kelly_fraction = 0.50,  -- Half Kelly (more aggressive than default 0.25)
    min_bet = 2.00,
    max_bet = 50.00,
    min_trader_resolved_count = 50,
    min_conviction = 1.50  -- Only copy trades where trader is betting 1.5x their usual
WHERE wallet_id = 'FT_SHARP_SHOOTER';
