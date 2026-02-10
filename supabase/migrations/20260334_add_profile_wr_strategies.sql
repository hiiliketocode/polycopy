-- Migration: Add profile-based WR strategies for comparison with global WR
-- Purpose: Test whether niche/profile-specific win rates outperform global WR
-- Adds wr_source column: 'GLOBAL' (default) vs 'PROFILE'
-- Inserts 5 profile-based strategies mirroring existing WR-focused global strategies

-- ============================================================================
-- Add wr_source column
-- ============================================================================
ALTER TABLE public.ft_wallets ADD COLUMN IF NOT EXISTS wr_source TEXT DEFAULT 'GLOBAL';
COMMENT ON COLUMN public.ft_wallets.wr_source IS 'GLOBAL = use trader_global_stats win rate; PROFILE = use trader_profile_stats (niche/structure/bracket)';

-- ============================================================================
-- Profile-based strategies (mirrors of global WR strategies for comparison)
-- ============================================================================

-- P-T2-CONTRARIAN: Profile WR version of FT_T2_CONTRARIAN
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, wr_source, is_active
) VALUES (
    'FT_T2_CONTRARIAN_PROFILE', 'T2_CONTRARIAN_PROFILE', 'T2: Contrarian (Profile WR)',
    '10-40¢ prices, uses profile WR (niche/structure/bracket) vs global',
    NULL, 0.10, 0.40, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'T2_PRICE', 'Profile WR: Do contrarian bets outperform with niche-specific stats?', 'PROFILE', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- P-T2-MIDRANGE: Profile WR version of FT_T2_MIDRANGE
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, wr_source, is_active
) VALUES (
    'FT_T2_MIDRANGE_PROFILE', 'T2_MIDRANGE_PROFILE', 'T2: Mid-Range (Profile WR)',
    '30-70¢ prices, uses profile WR vs global',
    NULL, 0.30, 0.70, 0.05, FALSE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'T2_PRICE', 'Profile WR: Is the sweet spot in the middle with niche stats?', 'PROFILE', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- P-T4-CONTR-CONV: Profile WR version of FT_T4_CONTR_CONV
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, wr_source, is_active
) VALUES (
    'FT_T4_CONTR_CONV_PROFILE', 'T4_CONTR_CONV_PROFILE', 'T4: Contrarian + Conviction (Profile WR)',
    '10-40¢ AND 2x+ conviction, profile WR',
    NULL, 0.10, 0.40, 0.05, FALSE,
    'KELLY', 0.30, 1.00, 12.00,
    30, 2.0,
    'T4_COMPOUND', 'Profile WR: Bold underdog bets with niche-specific stats', 'PROFILE', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- P-T4-FAV-WR: Profile WR version of FT_T4_FAV_WR
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, wr_source, is_active
) VALUES (
    'FT_T4_FAV_WR_PROFILE', 'T4_FAV_WR_PROFILE', 'T4: Favorites + High WR (Profile WR)',
    '60-90¢ AND 65%+ profile WR vs global',
    0.65, 0.60, 0.90, 0.03, FALSE,
    'KELLY', 0.35, 1.00, 15.00,
    50, 0.0,
    'T4_COMPOUND', 'Profile WR: Elite traders on favorites - niche vs global', 'PROFILE', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;

-- P-T4-WR-CONV: Profile WR version of FT_T4_WR_CONV
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction,
    thesis_tier, hypothesis, wr_source, is_active
) VALUES (
    'FT_T4_WR_CONV_PROFILE', 'T4_WR_CONV_PROFILE', 'T4: WR + Conviction (Profile WR)',
    '60%+ profile WR AND 1.5x+ conviction vs global',
    0.60, 0.0, 1.0, 0.0, FALSE,
    'KELLY', 0.35, 1.00, 15.00,
    50, 1.5,
    'T4_COMPOUND', 'Profile WR: High WR traders betting big - niche vs global', 'PROFILE', TRUE
) ON CONFLICT (wallet_id) DO NOTHING;
