-- ============================================================================
-- ML THRESHOLD SWEEP STRATEGIES (Feb 2026)
-- ============================================================================
--
-- PURPOSE: Find the ML score sweet spot on pure unfiltered data.
-- FT analysis showed: ML 60-65% had 73.5% WR; 55-60% had 34.9% WR (worst).
-- These strategies isolate ML threshold only—no price/edge filters—to map
-- where the sweet spot lies. Bet sizing uses CONVICTION (trader bet size vs
-- avg) to scale position size with trader confidence.
--
-- HYPOTHESIS: Higher ML thresholds (60+, 65+, 70+) will show better risk-
-- adjusted returns than 50-55%. Lower thresholds add volume but may destroy
-- value. Compare WR, PnL, Sharpe across thresholds to pick optimal gate.
--
-- ============================================================================

-- ML-SWEEP-50: Pure ML 50% - Baseline loose threshold
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SWEEP_50', 'ML_SWEEP_50', 'ML Sweep: 50%',
    'Pure ML 50%+, full price range. Conviction-based sizing.',
    0.50, 0.0, 1.0, 0.0, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    10, 0.0,
    'ML_SWEEP', 'Does a loose ML 50% threshold add or destroy value vs higher gates? Baseline for sweep comparison.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-SWEEP-55: Pure ML 55% - Common baseline
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SWEEP_55', 'ML_SWEEP_55', 'ML Sweep: 55%',
    'Pure ML 55%+, full price range. Conviction-based sizing.',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    10, 0.0,
    'ML_SWEEP', 'FT data: 55-60% ML band had 34.9% WR (worst). Is 55% floor too loose? Compare vs 60/65/70.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-SWEEP-60: Pure ML 60% - Suspected sweet spot
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SWEEP_60', 'ML_SWEEP_60', 'ML Sweep: 60%',
    'Pure ML 60%+, full price range. Conviction-based sizing.',
    0.60, 0.0, 1.0, 0.0, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    10, 0.0,
    'ML_SWEEP', 'FT data: 60-65% ML band had 73.5% WR. Is 60% the inflection point where ML adds real value?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-SWEEP-65: Pure ML 65% - Higher confidence
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SWEEP_65', 'ML_SWEEP_65', 'ML Sweep: 65%',
    'Pure ML 65%+, full price range. Conviction-based sizing.',
    0.65, 0.0, 1.0, 0.0, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    10, 0.0,
    'ML_SWEEP', 'Fewer trades but higher model confidence. Does 65% improve precision vs 60%?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-SWEEP-70: Pure ML 70% - Strict gate
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SWEEP_70', 'ML_SWEEP_70', 'ML Sweep: 70%',
    'Pure ML 70%+, full price range. Conviction-based sizing.',
    0.70, 0.0, 1.0, 0.0, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    10, 0.0,
    'ML_SWEEP', 'Highest confidence trades only. Does extreme selectivity improve Sharpe or starve the strategy?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- SUMMARY: 5 ML SWEEP STRATEGIES (50, 55, 60, 65, 70)
-- ============================================================================
-- All use: full price range (0-100¢), no edge filter, CONVICTION allocation.
-- Compare WR, PnL, Sharpe across thresholds to find sweet spot.
-- ============================================================================
