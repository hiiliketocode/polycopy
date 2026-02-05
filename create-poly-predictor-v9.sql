-- ============================================================================
-- CREATE POLY PREDICTOR V9
-- Clean, principled model based on audit findings
-- ============================================================================
--
-- KEY CHANGES FROM V8:
-- 1. REMOVED redundant features (price_bracket, bracket_win_rate, etc.)
-- 2. ADDED new features (niche_experience_pct, trader_selectivity, price_vs_trader_avg)
-- 3. PROPERLY COMPUTED total_exposure_log (now different from trade_size_log)
-- 4. 96% niche classification (vs 10% in V8)
-- 5. 146M training rows (vs 60M in V8)
-- ============================================================================

CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v9`

OPTIONS(
    model_type = 'LOGISTIC_REG',
    input_label_cols = ['outcome'],
    auto_class_weights = TRUE,
    l2_reg = 0.01,
    max_iterations = 50,
    enable_global_explain = TRUE,
    data_split_method = 'AUTO_SPLIT'  -- 80/20 train/test
) AS

SELECT 
    -- TARGET
    outcome,
    
    -- TRADER SKILL FEATURES (core predictors)
    global_win_rate,                    -- Overall trader skill
    niche_win_rate_history,             -- Niche-specific skill
    total_lifetime_trades,              -- Experience
    
    -- NEW FEATURES (V9)
    niche_experience_pct,               -- Specialization (% trades in this niche)
    trader_selectivity,                 -- Pickiness (inverse of trades per day)
    price_vs_trader_avg,                -- Normalized entry price vs trader's norm
    
    -- CONVICTION FEATURES
    conviction_z_score,                 -- How unusual is this bet size?
    trade_sequence,                     -- Nth trade in this position
    
    -- BEHAVIORAL FEATURES
    trader_tempo_seconds,               -- Time since last trade
    is_chasing_price_up,                -- Buying at higher prices
    is_averaging_down,                  -- Buying at lower prices
    
    -- TRADE FEATURES
    final_niche,                        -- Market category (now 96% classified)
    bet_structure,                      -- YES_NO, SPREAD, etc.
    position_direction,                 -- LONG/SHORT
    entry_price,                        -- Entry price (main signal but not sole)
    
    -- SIZE FEATURES (now properly separated)
    trade_size_log,                     -- This trade's size
    total_exposure_log,                 -- Cumulative position (different from above)
    
    -- MARKET FEATURES
    volume_momentum_ratio,              -- Recent vs total volume
    liquidity_impact_ratio,             -- Trade size vs market liquidity
    
    -- TIMING FEATURES
    minutes_to_start,                   -- Time until game/event starts
    hours_to_close,                     -- Time until market closes
    market_age_days                     -- How old is the market

FROM `polycopy_v1.enriched_trades_training_v9`

WHERE
    -- Filter outliers for stable training
    ABS(conviction_z_score) < 10        -- Remove extreme bet sizes
    AND trader_tempo_seconds < 86400    -- Max 1 day between trades
    AND entry_price > 0.01              -- Valid prices only
    AND entry_price < 0.99
    AND total_lifetime_trades >= 10     -- Minimum trader history
    AND trade_size_log > 0;             -- Non-zero trades only
