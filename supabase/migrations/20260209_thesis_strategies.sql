-- ============================================================================
-- THESIS ARCHITECTURE: FORWARD TESTING STRATEGY MATRIX
-- ============================================================================
-- 
-- GOAL: Systematically discover which factors drive trading performance
-- 
-- MEASUREMENT DIMENSIONS:
-- - Win Rate: % of trades that profit
-- - ROI: Return on investment
-- - Sharpe: Risk-adjusted returns
-- - Sample Size: Statistical significance
-- - Drawdown: Worst losing streak
--
-- FACTOR ISOLATION APPROACH:
-- Tier 1: Single factor tests (isolate each variable)
-- Tier 2: Two-factor combinations (test interactions)
-- Tier 3: Market specialization (category effects)
-- Tier 4: Compound strategies (multi-factor)
-- Tier 5: Anti-strategies (validate by testing opposites)
--
-- ============================================================================

-- Add new columns to support more filtering dimensions
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS min_conviction DECIMAL(4,2) DEFAULT 0.0;
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS market_categories TEXT[] DEFAULT NULL;  -- NULL = all categories
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS bet_structures TEXT[] DEFAULT NULL;     -- NULL = all structures
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS min_original_trade_usd DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS max_original_trade_usd DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS thesis_tier TEXT;  -- T1_SINGLE, T2_COMBO, T3_MARKET, T4_COMPOUND, T5_ANTI
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS hypothesis TEXT;   -- What we're testing

-- ============================================================================
-- TIER 1: SINGLE FACTOR TESTS (Isolate each variable)
-- ============================================================================

-- T1-01: BASELINE - No filters, just copy top traders
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, 
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_BASELINE', 'T1_BASELINE', 'T1: Baseline',
    'No filters - copy any trade from top traders',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 5.00,
    30, 0.0,
    'T1_SINGLE', 'Control group: What happens with no filtering?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T1-02: PURE WIN RATE - Only high WR traders
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_PURE_WR', 'T1_PURE_WR', 'T1: Pure Win Rate',
    '65%+ trader WR only, no edge requirement',
    0.65, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 5.00,
    50, 0.0,
    'T1_SINGLE', 'Does trader win rate alone predict success?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T1-03: PURE EDGE - High edge only
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_PURE_EDGE', 'T1_PURE_EDGE', 'T1: Pure Edge',
    '15%+ edge only, no WR requirement',
    NULL, 0.0, 1.0, 0.15, FALSE,
    'FIXED', 0.25, 0.50, 5.00,
    30, 0.0,
    'T1_SINGLE', 'Does mathematical edge alone predict success?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T1-04: PURE CONVICTION - High conviction only
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_PURE_CONV', 'T1_PURE_CONV', 'T1: Pure Conviction',
    '2x+ conviction only, no edge/WR requirement',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 5.00,
    30, 2.0,
    'T1_SINGLE', 'Does trader conviction (betting more than usual) predict success?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T1-05: PURE ML MODEL - ML score only
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_PURE_ML', 'T1_PURE_ML', 'T1: Pure ML Model',
    '60%+ ML model score only, no trader filters',
    0.60, 0.0, 1.0, 0.0, TRUE,
    'FIXED', 0.25, 0.50, 5.00,
    10, 0.0,
    'T1_SINGLE', 'Can the ML model predict winners without trader stats?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T1-06: HIGH EXPERIENCE - Very experienced traders only
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T1_EXPERIENCE', 'T1_EXPERIENCE', 'T1: High Experience',
    '200+ resolved trades only, minimal other filters',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 5.00,
    200, 0.0,
    'T1_SINGLE', 'Does trader experience correlate with better trades?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- TIER 2: PRICE BAND TESTS (Where in the odds spectrum?)
-- ============================================================================

-- T2-01: CONTRARIAN - Low prices, high reward potential
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T2_CONTRARIAN', 'T2_CONTRARIAN', 'T2: Contrarian Plays',
    '10-40¢ prices only, high upside bets',
    NULL, 0.10, 0.40, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'T2_PRICE', 'Do contrarian (underdog) bets outperform on ROI?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T2-02: MID-RANGE - Balanced risk/reward
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T2_MIDRANGE', 'T2_MIDRANGE', 'T2: Mid-Range',
    '30-70¢ prices only, balanced odds',
    NULL, 0.30, 0.70, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'T2_PRICE', 'Is the sweet spot in the middle of the odds curve?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T2-03: FAVORITES - High win rate, lower payouts
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T2_FAVORITES', 'T2_FAVORITES', 'T2: Favorites Only',
    '60-90¢ prices only, grind small wins',
    NULL, 0.60, 0.90, 0.03, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'T2_PRICE', 'Can we grind profits betting on likely winners?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T2-04: LONGSHOTS - Extreme underdogs
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T2_LONGSHOTS', 'T2_LONGSHOTS', 'T2: Longshots',
    '<25¢ prices only, high reward potential',
    NULL, 0.0, 0.25, 0.05, FALSE,
    'KELLY', 0.15, 0.50, 5.00,
    30, 0.0,
    'T2_PRICE', 'Do extreme longshots have positive expected value?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T2-05: HEAVY FAVORITES - Ultra safe bets
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T2_HEAVY_FAV', 'T2_HEAVY_FAV', 'T2: Heavy Favorites',
    '>75¢ prices only, very likely winners',
    NULL, 0.75, 0.95, 0.02, FALSE,
    'KELLY', 0.25, 0.50, 10.00,
    30, 0.0,
    'T2_PRICE', 'Can we profit from near-certain outcomes?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- TIER 3: MARKET SPECIALIZATION (Category effects)
-- ============================================================================

-- T3-01: SPORTS SPECIALIST
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T3_SPORTS', 'T3_SPORTS', 'T3: Sports Only',
    'Sports markets only, high conviction',
    NULL, 0.0, 1.0, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 1.5,
    ARRAY['SPORTS', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'TENNIS', 'MMA'],
    'T3_MARKET', 'Do sports betting specialists outperform?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T3-02: CRYPTO SPECIALIST
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T3_CRYPTO', 'T3_CRYPTO', 'T3: Crypto Only',
    'Crypto markets only, high edge',
    NULL, 0.0, 1.0, 0.10, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    ARRAY['CRYPTO', 'BITCOIN', 'ETHEREUM', 'DEFI'],
    'T3_MARKET', 'Are crypto markets more predictable?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T3-03: POLITICS SPECIALIST
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T3_POLITICS', 'T3_POLITICS', 'T3: Politics Only',
    'Politics markets only, ML model assist',
    0.55, 0.0, 1.0, 0.05, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    ARRAY['POLITICS', 'ELECTIONS', 'POLICY'],
    'T3_MARKET', 'Can we profit from political prediction markets?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T3-04: FINANCE SPECIALIST
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T3_FINANCE', 'T3_FINANCE', 'T3: Finance Only',
    'Finance markets only, high WR traders',
    0.60, 0.0, 1.0, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    50, 0.0,
    ARRAY['FINANCE', 'STOCKS', 'ECONOMY', 'FED'],
    'T3_MARKET', 'Do financial market experts outperform?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- TIER 4: COMPOUND STRATEGIES (Multi-factor)
-- ============================================================================

-- T4-01: WR + CONVICTION (Elite traders with skin in game)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_WR_CONV', 'T4_WR_CONV', 'T4: WR + Conviction',
    '60%+ WR AND 1.5x+ conviction',
    0.60, 0.0, 1.0, 0.0, FALSE,
    'KELLY', 0.35, 1.00, 15.00,
    50, 1.5,
    'T4_COMPOUND', 'Do high WR traders perform better when betting big?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T4-02: ML + EDGE (Model-validated edge trades)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_ML_EDGE', 'T4_ML_EDGE', 'T4: ML + Edge',
    '55%+ ML model AND 10%+ edge',
    0.55, 0.0, 1.0, 0.10, TRUE,
    'KELLY', 0.35, 1.00, 15.00,
    30, 0.0,
    'T4_COMPOUND', 'Does ML model + edge requirement improve results?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T4-03: CONTRARIAN + CONVICTION (Bold underdog bets)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_CONTR_CONV', 'T4_CONTR_CONV', 'T4: Contrarian + Conviction',
    '10-40¢ prices AND 2x+ conviction',
    NULL, 0.10, 0.40, 0.05, FALSE,
    'KELLY', 0.30, 1.00, 12.00,
    30, 2.0,
    'T4_COMPOUND', 'Are traders betting big on underdogs smart money?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T4-04: FAVORITES + HIGH WR (Safe plays from elite)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_FAV_WR', 'T4_FAV_WR', 'T4: Favorites + High WR',
    '60-90¢ prices AND 65%+ trader WR',
    0.65, 0.60, 0.90, 0.03, FALSE,
    'KELLY', 0.35, 1.00, 15.00,
    50, 0.0,
    'T4_COMPOUND', 'Do elite traders + favorites = safe profits?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T4-05: TRIPLE FILTER (WR + Edge + Conviction)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_TRIPLE', 'T4_TRIPLE', 'T4: Triple Filter',
    '60%+ WR AND 8%+ edge AND 1.5x+ conviction',
    0.60, 0.0, 1.0, 0.08, FALSE,
    'KELLY', 0.40, 2.00, 20.00,
    50, 1.5,
    'T4_COMPOUND', 'Is the intersection of all factors the best signal?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T4-06: FULL STACK (Everything on)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T4_FULL_STACK', 'T4_FULL_STACK', 'T4: Full Stack',
    'ALL filters: ML 55%+, WR 60%+, Edge 10%+, Conv 1.5x+, Mid-range',
    0.55, 0.20, 0.70, 0.10, TRUE,
    'KELLY', 0.50, 2.00, 30.00,
    50, 1.5,
    'T4_COMPOUND', 'Maximum filtering - few trades but highest quality?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- TIER 5: ANTI-STRATEGIES (Validate by testing opposites)
-- ============================================================================

-- T5-01: LOW WR TRADERS (Should lose money)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T5_LOW_WR', 'T5_LOW_WR', 'T5: Low WR Traders (Anti)',
    'Follow traders with <50% win rate',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 3.00,
    30, 0.0,
    'T5_ANTI', 'CONTROL: Following bad traders should lose money', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- Update T5_LOW_WR to use negative model_threshold as flag
-- (We'll handle this in sync logic)

-- T5-02: LOW CONVICTION (Small bets = low signal)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T5_LOW_CONV', 'T5_LOW_CONV', 'T5: Low Conviction (Anti)',
    'Only copy trades where trader bets <0.5x their usual',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 3.00,
    30, 0.0,
    'T5_ANTI', 'CONTROL: Low conviction trades should underperform', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T5-03: NEGATIVE EDGE (Should definitely lose)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T5_NEG_EDGE', 'T5_NEG_EDGE', 'T5: Negative Edge (Anti)',
    'Only copy trades with negative edge (WR < price)',
    NULL, 0.0, 1.0, -0.10, FALSE,
    'FIXED', 0.25, 0.50, 3.00,
    30, 0.0,
    'T5_ANTI', 'CONTROL: Negative edge trades must lose money', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- T5-04: RANDOM BASELINE (No skill test)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_T5_RANDOM', 'T5_RANDOM', 'T5: Near-Random (Anti)',
    'Copy from any trader with 5+ trades, no quality filter',
    NULL, 0.0, 1.0, 0.0, FALSE,
    'FIXED', 0.25, 0.50, 3.00,
    5, 0.0,
    'T5_ANTI', 'CONTROL: Random selection should break even or lose', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- SPECIAL STRATEGIES (Edge cases and experiments)
-- ============================================================================

-- S-01: WHALE FOLLOWS (Only copy big money trades)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    min_original_trade_usd,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_S_WHALE', 'S_WHALE', 'S: Whale Follows',
    'Only copy trades >$100 original size',
    NULL, 0.0, 1.0, 0.05, FALSE,
    'KELLY', 0.30, 1.00, 15.00,
    30, 0.0,
    100.00,
    'SPECIAL', 'Do large position sizes indicate better information?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- S-02: MICRO TRADES (Small bets, high volume)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    max_original_trade_usd,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_S_MICRO', 'S_MICRO', 'S: Micro Trades',
    'Only copy trades <$10 original size',
    NULL, 0.0, 1.0, 0.05, FALSE,
    'FIXED', 0.25, 0.50, 2.00,
    30, 0.0,
    10.00,
    'SPECIAL', 'Are small trades testing the waters or noise?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- S-03: KELLY AGGRESSIVE (High Kelly fraction)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_S_KELLY_AGG', 'S_KELLY_AGG', 'S: Kelly Aggressive',
    'Full Kelly (1.0) on high-quality trades',
    0.60, 0.0, 1.0, 0.10, FALSE,
    'KELLY', 1.00, 1.00, 100.00,
    50, 1.5,
    'SPECIAL', 'Does aggressive Kelly sizing improve or hurt returns?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- S-04: EDGE SCALED (Linear sizing with edge)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_S_EDGE_SCALE', 'S_EDGE_SCALE', 'S: Edge Scaled Sizing',
    'Bet size scales linearly with edge',
    NULL, 0.0, 1.0, 0.05, FALSE,
    'EDGE_SCALED', 0.25, 0.50, 20.00,
    30, 0.0,
    'SPECIAL', 'Does edge-proportional sizing improve Sharpe?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- SUMMARY: 24 STRATEGIES ACROSS 5 TIERS
-- ============================================================================
-- 
-- TIER 1 - SINGLE FACTOR (6):
--   T1_BASELINE, T1_PURE_WR, T1_PURE_EDGE, T1_PURE_CONV, T1_PURE_ML, T1_EXPERIENCE
--
-- TIER 2 - PRICE BANDS (5):
--   T2_CONTRARIAN, T2_MIDRANGE, T2_FAVORITES, T2_LONGSHOTS, T2_HEAVY_FAV
--
-- TIER 3 - MARKET SPECIALIZATION (4):
--   T3_SPORTS, T3_CRYPTO, T3_POLITICS, T3_FINANCE
--
-- TIER 4 - COMPOUND STRATEGIES (6):
--   T4_WR_CONV, T4_ML_EDGE, T4_CONTR_CONV, T4_FAV_WR, T4_TRIPLE, T4_FULL_STACK
--
-- TIER 5 - ANTI-STRATEGIES (4):
--   T5_LOW_WR, T5_LOW_CONV, T5_NEG_EDGE, T5_RANDOM
--
-- SPECIAL (4):
--   S_WHALE, S_MICRO, S_KELLY_AGG, S_EDGE_SCALE
--
-- ============================================================================
