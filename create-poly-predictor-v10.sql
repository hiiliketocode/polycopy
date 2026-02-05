-- ============================================================================
-- CREATE POLY PREDICTOR V10
-- With high-value features from comprehensive analysis
-- ============================================================================
--
-- NEW FEATURES IN V10:
-- 1. trade_size_tier - Whale/Large/Medium/Small (67.9% vs 40.3%)
-- 2. trader_sells_ratio - Holding behavior
-- 3. is_hedging - Both outcomes in market
-- 4. is_in_best_niche - Trading in strongest niche (51.8% vs 48.6%)
-- 5. is_with_crowd - Aligned with volume (69.4% vs 30.3%)
-- 6. market_age_bucket - Optimal entry timing
-- ============================================================================

CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v10`

OPTIONS(
    model_type = 'LOGISTIC_REG',
    input_label_cols = ['outcome'],
    auto_class_weights = TRUE,
    l2_reg = 0.01,
    max_iterations = 50,
    enable_global_explain = TRUE,
    data_split_method = 'AUTO_SPLIT'
) AS

SELECT 
    -- TARGET
    outcome,
    
    -- TRADER SKILL FEATURES (core)
    global_win_rate,
    niche_win_rate_history,
    total_lifetime_trades,
    
    -- TRADER BEHAVIOR (from V9)
    niche_experience_pct,
    trader_selectivity,
    price_vs_trader_avg,
    
    -- CONVICTION FEATURES
    conviction_z_score,
    trade_sequence,
    
    -- BEHAVIORAL FEATURES
    trader_tempo_seconds,
    is_chasing_price_up,
    is_averaging_down,
    
    -- V10 NEW FEATURES
    trade_size_tier,           -- Whale detection (67.9% vs 40.3%)
    trader_sells_ratio,        -- Holding behavior
    is_hedging,                -- Both outcomes
    is_in_best_niche,          -- Specialization (51.8% vs 48.6%)
    is_with_crowd,             -- Volume alignment (69.4% vs 30.3%)
    market_age_bucket,         -- Entry timing
    
    -- TRADE FEATURES
    final_niche,
    bet_structure,
    position_direction,
    entry_price,
    trade_size_log,
    total_exposure_log,
    
    -- MARKET FEATURES
    volume_momentum_ratio,
    liquidity_impact_ratio,
    
    -- TIMING FEATURES
    minutes_to_start,
    hours_to_close,
    market_age_days

FROM `polycopy_v1.enriched_trades_training_v10`

WHERE
    ABS(conviction_z_score) < 10
    AND trader_tempo_seconds < 86400
    AND entry_price > 0.01
    AND entry_price < 0.99
    AND total_lifetime_trades >= 10
    AND trade_size_log > 0;
