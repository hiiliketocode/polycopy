-- =============================================================================
-- 10 LIVE-ONLY FT STRATEGIES: Trade only when market game/event has started
-- =============================================================================
-- Uses game_start_time (or start_time) from markets - only takes trades when
-- current time >= game start. Targets in-game trading (e.g. live sports).
-- =============================================================================

-- LIVE-01: Live Model Only
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_MODEL_ONLY', 'LIVE_MODEL_ONLY', 'Live: Model Only',
    'ML 55%+, live games only (after game start)',
    '{"trade_live_only":true}',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'KELLY', 0.25, 0.50, 10.00,
    30, 0.0,
    'LIVE', 'Does pure ML work better during live games?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-02: Live Underdogs
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_UNDERDOGS', 'LIVE_UNDERDOGS', 'Live: Underdogs',
    '0-50¢, 5% edge, ML 55%+, live only',
    '{"trade_live_only":true}',
    0.55, 0.0, 0.50, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 8.00,
    30, 0.0,
    'LIVE', 'Do underdogs perform better when traded live?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-03: Live Favorites
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_FAVORITES', 'LIVE_FAVORITES', 'Live: Favorites',
    '60-90¢, 3% edge, ML 55%+, live only',
    '{"trade_live_only":true}',
    0.55, 0.60, 0.90, 0.03, TRUE,
    'KELLY', 0.25, 0.50, 8.00,
    30, 0.0,
    'LIVE', 'Do favorites grind better during live action?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-04: Live High Conviction
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_HIGH_CONV', 'LIVE_HIGH_CONV', 'Live: High Conviction',
    'ML 55%+, 2x conviction, live only',
    '{"trade_live_only":true}',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'FIXED', 0.25, 0.50, 5.00,
    30, 2.0,
    'LIVE', 'Does trader conviction matter more when games are live?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-05: Live Sharp Shooter
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_SHARP_SHOOTER', 'LIVE_SHARP_SHOOTER', 'Live: Sharp Shooter',
    'ML 55%+, 1.5x conviction, elite sniper, live only',
    '{"trade_live_only":true}',
    0.55, 0.0, 1.0, 0.0, TRUE,
    'KELLY', 0.40, 15.00, 75.00,
    30, 1.5,
    'LIVE', 'Elite live-only: does selectivity beat volume in-game?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-06: Live Mid-Range
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_MIDRANGE', 'LIVE_MIDRANGE', 'Live: Mid-Range',
    'ML 55%+, 25-75¢, 5% edge, live only',
    '{"trade_live_only":true}',
    0.55, 0.25, 0.75, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 10.00,
    30, 0.0,
    'LIVE', 'Mid-range odds during live: avoid extremes in-game', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-07: Live Trader WR Only (no ML)
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_WR_ONLY', 'LIVE_WR_ONLY', 'Live: WR Only',
    '60%+ trader WR, 5% edge, no ML, live only',
    '{"trade_live_only":true}',
    0.60, 0.0, 1.0, 0.05, FALSE,
    'KELLY', 0.30, 0.50, 10.00,
    30, 0.0,
    'LIVE', 'Baseline: does trader WR alone work live vs pre-game?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-08: Live Edge Hunter
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_EDGE_HUNTER', 'LIVE_EDGE_HUNTER', 'Live: Edge Hunter',
    'ML 55%+, 10% min edge, live only',
    '{"trade_live_only":true}',
    0.55, 0.0, 1.0, 0.10, TRUE,
    'KELLY', 0.35, 1.00, 15.00,
    30, 0.0,
    'LIVE', 'High edge required: does live reveal more mispricings?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-09: Live Contrarian
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_CONTRARIAN', 'LIVE_CONTRARIAN', 'Live: Contrarian',
    'ML 55%+, 10-40¢, 5% edge, live only',
    '{"trade_live_only":true}',
    0.55, 0.10, 0.40, 0.05, TRUE,
    'KELLY', 0.30, 0.50, 12.00,
    30, 0.0,
    'LIVE', 'Contrarian live: fade favorites when action heats up?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();

-- LIVE-10: Live Heavy Favorites
INSERT INTO public.ft_wallets (
    wallet_id, config_id, display_name, description, detailed_description,
    model_threshold, price_min, price_max, min_edge, use_model,
    allocation_method, kelly_fraction, min_bet, max_bet,
    min_trader_resolved_count, min_conviction, thesis_tier, hypothesis, is_active
) VALUES (
    'FT_LIVE_HEAVY_FAV', 'LIVE_HEAVY_FAV', 'Live: Heavy Favorites',
    'ML 55%+, 75-95¢, 2% edge, live only',
    '{"trade_live_only":true}',
    0.55, 0.75, 0.95, 0.02, TRUE,
    'KELLY', 0.25, 0.50, 10.00,
    30, 0.0,
    'LIVE', 'Near-certain live: safe favorites when outcome clearer?', TRUE
) ON CONFLICT (wallet_id) DO UPDATE SET
    detailed_description = '{"trade_live_only":true}',
    description = EXCLUDED.description,
    updated_at = NOW();
