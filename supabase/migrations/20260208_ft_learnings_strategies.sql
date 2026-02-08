-- ============================================================================
-- FT-LEARNINGS STRATEGIES (Feb 2026)
-- ============================================================================
-- New strategies based on forward test analysis:
-- - Sweet Spot 20-40¢ was best-performing band (+$6.9k PnL)
-- - Conviction 3x+ was profitable
-- - Crypto short-term destroyed performance (-91% PnL drag)
-- - ML 60%+ band had 73.5% WR vs 55-60% at 34.9%
-- ============================================================================

-- FT-LEARNINGS-01: Sweet Spot 20-40
-- Hypothesis: Is 20-40¢ the best band when made explicit?
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LEARNINGS_SWEET_SPOT', 'LEARNINGS_SWEET_SPOT', 'FT: Sweet Spot 20-40¢',
    '20-40¢ entry band only (FT best performer: +$6.9k)',
    0.55, 0.20, 0.40, 0.05, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'FT_LEARNINGS', 'FT: Is 20-40¢ the best band when made explicit?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- FT-LEARNINGS-02: Conviction 3x
-- Hypothesis: Does requiring 3x+ conviction improve underdog selection?
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LEARNINGS_CONV_3X', 'LEARNINGS_CONV_3X', 'FT: Conviction 3x+',
    '3x+ conviction on underdogs (FT: 3x+ was profitable)',
    NULL, 0.10, 0.50, 0.05, FALSE,
    'KELLY', 0.30, 1.00, 12.00,
    30, 3.0,
    'FT_LEARNINGS', 'FT: Does requiring 3x+ conviction improve underdog selection?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- FT-LEARNINGS-03: Underdog No Crypto
-- Hypothesis: Does excluding crypto improve Underdog Hunter performance?
-- market_categories = include only these (excludes crypto by omission)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LEARNINGS_NO_CRYPTO', 'LEARNINGS_NO_CRYPTO', 'FT: Underdog No Crypto',
    'Underdog Hunter config but excludes crypto (FT: crypto -91% PnL drag)',
    0.55, 0.0, 0.50, 0.05, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    ARRAY['SPORTS', 'POLITICS', 'FINANCE', 'ELECTIONS', 'WEATHER', 'CULTURE', 'SCIENCE', 'ENTERTAINMENT', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER'],
    'FT_LEARNINGS', 'FT: Does excluding crypto improve Underdog Hunter performance?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- FT-LEARNINGS-04: ML Band 60%
-- Hypothesis: Does ML 60%+ (narrower than 55%+) improve precision?
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LEARNINGS_ML_60', 'LEARNINGS_ML_60', 'FT: ML Band 60%',
    'ML 60%+ only (FT: 60-65% had 73.5% WR vs 55-60% at 34.9%)',
    0.60, 0.0, 1.0, 0.05, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 1.5,
    'FT_LEARNINGS', 'FT: Does ML 60%+ (narrower than 55%+) improve precision?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;
