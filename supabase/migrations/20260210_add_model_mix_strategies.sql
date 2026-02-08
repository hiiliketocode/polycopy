-- ============================================================================
-- 10 MODEL-MIX STRATEGIES: Assess ML model value across different combinations
-- ============================================================================
--
-- Design rationale: Pair the model (use_model=true) with the best-performing
-- non-model strategies to measure incremental value. Each strategy answers:
-- "Does adding ML gating improve this mix?"
--
-- Reference: Sharp Shooter (+$75) was the only profitable non-model strategy.
-- We add ML to it and similar high-signal mixes.
--
-- ============================================================================

-- ML-01: Sharp Shooter + ML
-- Base: Sharp Shooter (profitable). Add ML 55% to filter for model-validated elite trades.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_SHARP_SHOOTER', 'ML_SHARP_SHOOTER', 'ML: Sharp Shooter',
    'ML 55% + 1.5x conviction, elite sniper (based on best performer)',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'KELLY', 0.40, 15.00, 75.00,
    30, 1.5,
    'ML_MIX', 'Does ML improve the profitable Sharp Shooter profile?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-02: Underdog + ML
-- Base: Underdog Hunter. Model validates which underdogs (0-50¢) have real edge.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_UNDERDOG', 'ML_UNDERDOG', 'ML: Underdog Hunter',
    'ML 55% + underdogs 0-50¢, 5% edge',
    0.55, 0.0, 0.50, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 8.00,
    30, 0.0,
    'ML_MIX', 'Does ML filter underdogs to only mispriced ones?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-03: Favorites + ML
-- Base: Favorite Grinder. Model validates which favorites (60-90¢) are worth backing.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_FAVORITES', 'ML_FAVORITES', 'ML: Favorite Grinder',
    'ML 55% + favorites 60-90¢, 3% edge',
    0.55, 0.60, 0.90, 0.03, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'ML_MIX', 'Does ML improve favorites grinding?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-04: High Conviction + ML
-- Base: High Conviction (trader betting 2x usual). ML adds second signal.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_HIGH_CONV', 'ML_HIGH_CONV', 'ML: High Conviction',
    'ML 55% + 2x conviction, double confirmation',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'FIXED', 0.25, 0.50, 5.00,
    30, 2.0,
    'ML_MIX', 'Does ML + trader conviction = better than either alone?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-05: ML + Edge
-- Model + mathematical edge (WR - price >= 5%). Two quantitative filters.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_EDGE', 'ML_EDGE', 'ML: Model + Edge',
    'ML 55% + 5% min edge, quantitative combo',
    0.55, 0.0, 1.0, 0.05, TRUE,
    'KELLY', 0.35, 1.00, 15.00,
    30, 0.0,
    'ML_MIX', 'Does ML + edge beat ML-only or edge-only?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-06: Mid-Range + ML
-- Avoid extremes. ML 55% + 25-75¢ only (sweet spot of odds curve).
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_MIDRANGE', 'ML_MIDRANGE', 'ML: Mid-Range',
    'ML 55% + 25-75¢ only, avoid extremes',
    0.55, 0.25, 0.75, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 10.00,
    30, 0.0,
    'ML_MIX', 'Is ML + mid-range the sweet spot?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-07: ML Strict (65%)
-- Higher bar than T1 Pure ML (60%). Fewer trades, higher quality?
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_STRICT', 'ML_STRICT', 'ML: Strict (65%)',
    'ML 65% only, highest confidence trades',
    0.65, 0.0, 1.0, 0.0, TRUE,
    'KELLY', 0.35, 1.00, 20.00,
    10, 0.0,
    'ML_MIX', 'Does raising ML threshold improve precision?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-08: ML Loose (50%)
-- Lower bar to capture more trades. Does volume help or hurt?
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_LOOSE', 'ML_LOOSE', 'ML: Loose (50%)',
    'ML 50% only, more trades, lower bar',
    0.50, 0.0, 1.0, 0.0, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    10, 0.0,
    'ML_MIX', 'Does a lower ML threshold add or destroy value?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-09: Contrarian + ML
-- 10-40¢ contrarian plays. Model validates mispricings.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CONTRARIAN', 'ML_CONTRARIAN', 'ML: Contrarian',
    'ML 55% + 10-40¢ contrarian, 5% edge',
    0.55, 0.10, 0.40, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 12.00,
    30, 0.0,
    'ML_MIX', 'Does ML improve contrarian (underdog) selection?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML-10: Heavy Favorites + ML
-- 75-95¢ near-certain outcomes. Model confirms they are indeed safe.
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_HEAVY_FAV', 'ML_HEAVY_FAV', 'ML: Heavy Favorites',
    'ML 55% + 75-95¢ near-certain, 2% edge',
    0.55, 0.75, 0.95, 0.02, TRUE,
    'KELLY', 0.25, 0.50, 10.00,
    30, 0.0,
    'ML_MIX', 'Does ML add value to heavy favorites?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;
