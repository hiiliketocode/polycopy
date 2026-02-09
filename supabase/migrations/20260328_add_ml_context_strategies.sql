-- ============================================================================
-- ML CONTEXT STRATEGIES (Feb 2026)
-- ============================================================================
-- New ML tests from brainstorm: best ML band (60%+) + context (live, niche, no crypto)
-- and ML-based allocation (ML_SCALED). Avoids known losers: longshots, crypto, 55-60% ML.
-- ============================================================================

-- ML_CTX_01: Sweet Spot Only - ML 60% + 20-40¢ (no longshots) + CONVICTION
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_SWEET_SPOT', 'ML_CTX_SWEET_SPOT', 'ML Ctx: Sweet Spot 20-40¢',
    'ML 60% + 20-40¢ only (no longshots), 5% edge. CONVICTION sizing.',
    0.60, 0.20, 0.40, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    'ML_CTX', 'Best ML band + best price band. Does avoiding longshots improve PnL?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_02: No Crypto - ML 60% + exclude crypto + CONVICTION
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_NO_CRYPTO', 'ML_CTX_NO_CRYPTO', 'ML Ctx: No Crypto',
    'ML 60% + exclude crypto. CONVICTION sizing.',
    0.60, 0.0, 1.0, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    ARRAY['SPORTS', 'POLITICS', 'FINANCE', 'ELECTIONS', 'WEATHER', 'CULTURE', 'SCIENCE', 'ENTERTAINMENT', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER'],
    'ML_CTX', 'Crypto -91% PnL drag. Does ML 60% + no crypto outperform?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_03: Live Only - ML 60% + trade_live_only + CONVICTION
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_LIVE', 'ML_CTX_LIVE', 'ML Ctx: Live Games Only',
    'ML 60% + live games only (after game start). CONVICTION sizing.',
    '{"trade_live_only":true}',
    0.60, 0.0, 1.0, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    'ML_CTX', 'Does ML add more value when event has started (more information)?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_04: Sports Only - ML 60% + sports markets + CONVICTION
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_SPORTS', 'ML_CTX_SPORTS', 'ML Ctx: Sports Only',
    'ML 60% + sports markets only. CONVICTION sizing.',
    0.60, 0.20, 0.70, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    ARRAY['SPORTS', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER', 'TENNIS', 'MMA'],
    'ML_CTX', 'Is ML better calibrated on sports? Test niche restriction.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_05: Politics Only - ML 60% + politics markets + CONVICTION
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_POLITICS', 'ML_CTX_POLITICS', 'ML Ctx: Politics Only',
    'ML 60% + politics markets only. CONVICTION sizing.',
    0.60, 0.0, 1.0, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    ARRAY['POLITICS', 'ELECTIONS', 'POLICY'],
    'ML_CTX', 'Is ML better calibrated on politics? Test niche restriction.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_06: ML-Scaled allocation - ML 60% + 20-40¢, bet size scales with ML score
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_ML_SCALED', 'ML_CTX_ML_SCALED', 'ML Ctx: ML-Scaled Sizing',
    'ML 60% + 20-40¢. Bet size scales with ML score (55%→1.1x, 70%→1.4x).',
    0.60, 0.20, 0.40, 0.05, TRUE,
    'ML_SCALED', 0.25, 0.50, 15.00,
    30, 0.0,
    'ML_CTX', 'Does sizing by ML confidence beat CONVICTION for same entry?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_07: ML 65% + No Crypto - highest ML confidence, exclude worst category
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_65_NO_CRYPTO', 'ML_CTX_65_NO_CRYPTO', 'ML Ctx: 65% + No Crypto',
    'ML 65%+ only, exclude crypto. Fewer trades, higher confidence.',
    0.65, 0.0, 1.0, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    ARRAY['SPORTS', 'POLITICS', 'FINANCE', 'ELECTIONS', 'WEATHER', 'CULTURE', 'SCIENCE', 'ENTERTAINMENT', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER'],
    'ML_CTX', 'Highest ML confidence + no crypto. Does extreme selectivity work?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_08: No Crypto + 3x Conviction - ML 60%, no crypto, min 3x conviction
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    market_categories,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_NO_CRYPTO_3X', 'ML_CTX_NO_CRYPTO_3X', 'ML Ctx: No Crypto + 3x Conv',
    'ML 60% + no crypto + 3x min conviction. 20-40¢ sweet spot.',
    0.60, 0.20, 0.40, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 3.0,
    ARRAY['SPORTS', 'POLITICS', 'FINANCE', 'ELECTIONS', 'WEATHER', 'CULTURE', 'SCIENCE', 'ENTERTAINMENT', 'NBA', 'NFL', 'MLB', 'NHL', 'SOCCER'],
    'ML_CTX', 'Combine: no crypto, best ML band, conviction filter, sweet spot.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_09: Favorites Band - ML 60% + 55-85¢ + 5% edge
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_FAVORITES', 'ML_CTX_FAVORITES', 'ML Ctx: Favorites 55-85¢',
    'ML 60% + 55-85¢ favorites band, 5% edge. FT: 60-80¢ had 81.9% WR.',
    0.60, 0.55, 0.85, 0.05, TRUE,
    'CONVICTION', 0.25, 0.50, 15.00,
    30, 0.0,
    'ML_CTX', 'Does ML + favorites band outperform? Test if favorites-first works.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_10: Allocation A/B - FIXED (same entry as sweet spot)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_AB_FIXED', 'ML_CTX_AB_FIXED', 'ML Ctx A/B: FIXED',
    'ML 60% + 20-40¢ + 5% edge. FIXED sizing (A/B vs KELLY vs CONVICTION).',
    0.60, 0.20, 0.40, 0.05, TRUE,
    'FIXED', 0.25, 1.00, 10.00,
    30, 0.0,
    'ML_CTX', 'Same entry as Sweet Spot. Does FIXED beat KELLY (Kelly amplifies losses)?', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ML_CTX_11: Allocation A/B - KELLY
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, is_active
) VALUES (
    'FT_ML_CTX_AB_KELLY', 'ML_CTX_AB_KELLY', 'ML Ctx A/B: KELLY',
    'ML 60% + 20-40¢ + 5% edge. KELLY sizing (A/B test).',
    0.60, 0.20, 0.40, 0.05, TRUE,
    'KELLY', 0.25, 0.50, 15.00,
    30, 0.0,
    'ML_CTX', 'Same entry. Does KELLY amplify or improve? Learnings said Kelly amplifies losses.', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- ============================================================================
-- SUMMARY: 11 ML CONTEXT STRATEGIES
-- ============================================================================
-- Sweet Spot, No Crypto, Live, Sports, Politics, ML-Scaled, 65% No Crypto,
-- No Crypto 3x, Favorites, A/B FIXED, A/B KELLY
-- ============================================================================
