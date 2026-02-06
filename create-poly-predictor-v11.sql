-- ============================================================================
-- CREATE POLY PREDICTOR V11
-- Comprehensive model with performance trends
-- ============================================================================
--
-- V11 FEATURE SUMMARY (41 features):
--
-- WIN RATES (4): global_win_rate, D30_win_rate, D7_win_rate, niche_win_rate_history
-- ROI (3): lifetime_roi_pct, D30_roi_pct, D7_roi_pct
-- TRENDS (5): win_rate_trend_short/long, roi_trend_short/long, performance_regime
-- EXPERIENCE (4): total_lifetime_trades, trader_experience_bucket, niche_experience_pct, is_in_best_niche
-- BEHAVIOR (9): trader_selectivity, price_vs_trader_avg, conviction_z_score, trade_sequence,
--               total_exposure_log, trader_tempo_seconds, is_chasing_price_up, is_averaging_down, stddev_bet_size
-- BEHAVIORAL V10 (3): is_hedging, trader_sells_ratio, is_with_crowd
-- TRADE SIZE (2): trade_size_tier, trade_size_log
-- TRADE CONTEXT (4): final_niche, bet_structure, position_direction, entry_price
-- MARKET (4): volume_momentum_ratio, liquidity_impact_ratio, market_duration_days, market_age_bucket
-- TIMING (3): minutes_to_start, hours_to_close, market_age_days
-- ============================================================================

CREATE OR REPLACE MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11`

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
    
    -- =========================================================================
    -- CATEGORY 1: TRADER SKILL - WIN RATES (4 features)
    -- Different time horizons capture different signals
    -- =========================================================================
    global_win_rate,                    -- Lifetime overall skill
    D30_win_rate,                       -- 30-day rolling (BROUGHT BACK)
    D7_win_rate,                        -- 7-day rolling (BROUGHT BACK)
    niche_win_rate_history,             -- Niche-specific expertise

    -- =========================================================================
    -- CATEGORY 2: TRADER SKILL - ROI (3 features)
    -- ROI is distinct from win rate - can win often but lose money
    -- =========================================================================
    lifetime_roi_pct,                   -- Lifetime profitability (BROUGHT BACK)
    D30_roi_pct,                        -- 30-day profitability (BROUGHT BACK)
    D7_roi_pct,                         -- 7-day profitability (BROUGHT BACK)

    -- =========================================================================
    -- CATEGORY 3: PERFORMANCE TRENDS (5 features) - NEW IN V11
    -- Captures DIRECTION of performance - are they improving or declining?
    -- =========================================================================
    win_rate_trend_short,               -- D7 - D30 (recent direction)
    win_rate_trend_long,                -- D30 - L (medium vs historical)
    roi_trend_short,                    -- D7 ROI - D30 ROI
    roi_trend_long,                     -- D30 ROI - L ROI
    performance_regime,                 -- HOT_STREAK/IMPROVING/STABLE/DECLINING/COLD_STREAK

    -- =========================================================================
    -- CATEGORY 4: EXPERIENCE & SPECIALIZATION (4 features)
    -- =========================================================================
    total_lifetime_trades,              -- Raw experience
    trader_experience_bucket,           -- NOVICE/INTERMEDIATE/EXPERIENCED/EXPERT (BROUGHT BACK)
    niche_experience_pct,               -- Specialization % (V9)
    is_in_best_niche,                   -- Trading in strongest niche (V10)

    -- =========================================================================
    -- CATEGORY 5: TRADER BEHAVIOR (2 features from V9)
    -- =========================================================================
    trader_selectivity,                 -- How picky (inverse of trades/day)
    price_vs_trader_avg,                -- Entry price vs trader's norm

    -- =========================================================================
    -- CATEGORY 6: CONVICTION FEATURES (3 features)
    -- =========================================================================
    conviction_z_score,                 -- Bet size vs trader's norm
    trade_sequence,                     -- Nth trade in this position
    total_exposure_log,                 -- Cumulative position size

    -- =========================================================================
    -- CATEGORY 7: BEHAVIORAL PATTERNS (7 features)
    -- =========================================================================
    trader_tempo_seconds,               -- Time since last trade
    is_chasing_price_up,                -- Buying higher (FOMO)
    is_averaging_down,                  -- Buying lower (value)
    stddev_bet_size,                    -- Betting consistency (BROUGHT BACK)
    is_hedging,                         -- Both sides in market (V10)
    trader_sells_ratio,                 -- % of trades that are sells (V10)
    is_with_crowd,                      -- Aligned with volume (V10)

    -- =========================================================================
    -- CATEGORY 8: TRADE SIZE (2 features)
    -- =========================================================================
    trade_size_tier,                    -- WHALE/LARGE/MEDIUM/SMALL (V10)
    trade_size_log,                     -- Log of trade value

    -- =========================================================================
    -- CATEGORY 9: TRADE CONTEXT (4 features)
    -- =========================================================================
    final_niche,                        -- Market category
    bet_structure,                      -- YES_NO/SPREAD/etc
    position_direction,                 -- LONG/SHORT
    entry_price,                        -- Entry price (0-1)

    -- =========================================================================
    -- CATEGORY 10: MARKET FEATURES (4 features)
    -- =========================================================================
    volume_momentum_ratio,              -- Recent/total volume
    liquidity_impact_ratio,             -- Trade size vs market liquidity
    market_duration_days,               -- Total market lifespan (BROUGHT BACK from V5)
    market_age_bucket,                  -- DAY_1/WEEK_1/MONTH_1/OLDER (V10)

    -- =========================================================================
    -- CATEGORY 11: TIMING FEATURES (3 features)
    -- =========================================================================
    minutes_to_start,                   -- Time until event starts
    hours_to_close,                     -- Time until market closes
    market_age_days                     -- Days since market opened

FROM `polycopy_v1.enriched_trades_training_v11`

WHERE
    -- Filter outliers for stable training
    ABS(conviction_z_score) < 10        -- Remove extreme bet sizes
    AND trader_tempo_seconds < 86400    -- Max 1 day between trades
    AND entry_price > 0.01              -- Valid prices only
    AND entry_price < 0.99
    AND total_lifetime_trades >= 10     -- Minimum trader history
    AND trade_size_log > 0;             -- Non-zero trades only
