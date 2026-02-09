-- =============================================================================
-- Comprehensive FT Strategy Descriptions
-- =============================================================================
-- Each strategy gets: updated description, hypothesis, and detailed_description
-- with hypothesis, settings explainer, and comparison references.
-- Wallets that use detailed_description as JSON (LIVE, PNL) get merged updates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORIGINAL 6 STRATEGIES
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET
  description = 'Underdogs 0–50¢ only. No ML, no min edge. Pure trader track record.',
  hypothesis = 'Do underdog trades from top traders (no ML, no WR/edge filter) have edge?',
  detailed_description = E'**Entry criteria**
- Price: 0–50¢ (underdogs only)
- Min edge: 0
- Min trader resolved: 30
- use_model: FALSE, model_threshold=NULL (no min WR)

**Settings** model_threshold=NULL, price_min=0, price_max=0.50, min_edge=0, use_model=FALSE, allocation=FIXED, min_bet=0.50, max_bet=10, min_trader_count=30.

**Compare against** FT_MODEL_ONLY (does ML add value?), FT_UNDERDOG_HUNTER (model+edge vs no filters), FT_FAVORITE_GRINDER (opposite price band).',
  updated_at = NOW()
WHERE wallet_id = 'FT_HIGH_CONVICTION';

UPDATE public.ft_wallets SET
  description = 'ML 50%+, trader WR 55%+, 5% edge. Full price range. Balanced baseline.',
  hypothesis = 'Does combining ML and trader WR + edge outperform either alone?',
  detailed_description = E'**Entry criteria**
- Model probability: 50%+
- Trader win rate: 55%+ (when use_model=true, model_threshold gates ML; min WR from extFilters or 0)
- Price: 0–100¢
- Min edge: 5%
- Min trader resolved: 30

**Settings** model_threshold=0.50, price_min=0, price_max=1, min_edge=0.05, use_model=TRUE, allocation=FIXED, min_bet=0.50, max_bet=10, min_trader_count=30.

**Compare against** FT_MODEL_ONLY (model alone), FT_SHARP_SHOOTER (more selective), FT_UNDERDOG_HUNTER (underdogs vs full range).',
  updated_at = NOW()
WHERE wallet_id = 'FT_MODEL_BALANCED';

UPDATE public.ft_wallets SET
  description = 'ML 50%+, underdogs 0–50¢, 5% edge. Hunt mispriced cheap positions.',
  hypothesis = 'Does ML filter underdogs to only mispriced ones?',
  detailed_description = E'**Entry criteria**
- Model probability: 50%+
- Price: 0–50¢ (underdogs)
- Min edge: 5%
- Min trader resolved: 30

**Settings** model_threshold=0.50, price_min=0, price_max=0.50, min_edge=0.05, use_model=TRUE, allocation=FIXED, min_bet=0.50, max_bet=10, min_trader_count=30.

**Compare against** FT_HIGH_CONVICTION (no model), FT_FAVORITE_GRINDER (favorites), FT_ML_UNDERDOG (ML Mix variant).',
  updated_at = NOW()
WHERE wallet_id = 'FT_UNDERDOG_HUNTER';

UPDATE public.ft_wallets SET
  description = '60%+ WR, favorites 50–90¢, 3% edge. No ML. Grind consistent small wins.',
  hypothesis = 'Can we profit by backing favorites with high-WR traders?',
  detailed_description = E'**Entry criteria**
- Trader win rate: 60%+ (model_threshold=0.60 when use_model=false)
- Price: 50–90¢ (favorites)
- Min edge: 3%
- Min trader resolved: 30
- use_model: FALSE

**Settings** model_threshold=0.60, price_min=0.50, price_max=0.90, min_edge=0.03, use_model=FALSE, allocation=FIXED, min_bet=0.50, max_bet=10, min_trader_count=30.

**Compare against** FT_UNDERDOG_HUNTER (underdogs vs favorites), FT_ML_FAVORITES (same band + ML).',
  updated_at = NOW()
WHERE wallet_id = 'FT_FAVORITE_GRINDER';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 65% WR, 10% edge, 1.5x conviction. Elite sniper. Kelly 50%, $2–50.',
  hypothesis = 'Do model + elite trader + high conviction produce the highest-quality trades?',
  detailed_description = E'**Entry criteria**
- Model probability: 55%+
- Trader win rate: 65%+
- Min edge: 10%
- Min conviction: 1.5x
- Price: 10–70¢
- Min trader resolved: 50

**Settings** model_threshold=0.55, price_min=0.10, price_max=0.70, min_edge=0.10, use_model=TRUE, allocation=KELLY kelly_fraction=0.50, min_bet=2, max_bet=50, min_trader_count=50, min_conviction=1.5.

**Compare against** FT_MODEL_BALANCED (selectivity vs volume), FT_ML_SHARP_SHOOTER (ML Mix variant, 0–100¢).',
  updated_at = NOW()
WHERE wallet_id = 'FT_SHARP_SHOOTER';

UPDATE public.ft_wallets SET
  description = 'ML 55% only. Full range. No trader WR/edge filters. Pure ML signal.',
  hypothesis = 'Can the ML model predict winners without trader stats?',
  detailed_description = E'**Entry criteria**
- Model probability: 55%+ (only filter)
- Price: 0–100¢
- Min edge: 0
- Min trader resolved: 30 (schema default)

**Settings** model_threshold=0.55, price_min=0, price_max=1, min_edge=0, use_model=TRUE, allocation=FIXED, min_bet=0.50, max_bet=10, min_trader_count=30.

**Compare against** Any model-gated strategy. If MODEL_ONLY underperforms trader-filtered wallets, trader selection adds alpha.',
  updated_at = NOW()
WHERE wallet_id = 'FT_MODEL_ONLY';

-- -----------------------------------------------------------------------------
-- TIER 1: SINGLE FACTOR
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = 'No filters. Copy any trade from top traders. Control group.', hypothesis = 'What happens with no filtering?', detailed_description = E'**Entry criteria** None. Any BUY from leaderboard traders with 30+ resolved.
**Settings** model_threshold=NULL, price 0–100¢, min_edge=0, use_model=FALSE, FIXED $0.50–5, min_trader_count=30.
**Compare against** T1_PURE_WR, T1_PURE_EDGE, T1_PURE_ML — baseline for factor isolation.', updated_at = NOW() WHERE wallet_id = 'FT_T1_BASELINE';
UPDATE public.ft_wallets SET description = '65%+ trader WR only. No edge/ML. 50+ resolved.', hypothesis = 'Does trader win rate alone predict success?', detailed_description = E'**Entry criteria** Trader WR ≥65%, 50+ resolved. Price 0–100¢, min_edge=0.
**Settings** model_threshold=0.65 (used as min WR), use_model=FALSE, FIXED $0.50–5.
**Compare against** T1_BASELINE, T1_PURE_EDGE, T1_PURE_ML.', updated_at = NOW() WHERE wallet_id = 'FT_T1_PURE_WR';
UPDATE public.ft_wallets SET description = '15%+ edge only. No WR/ML. 30+ resolved.', hypothesis = 'Does mathematical edge alone predict success?', detailed_description = E'**Entry criteria** edge (WR−price) ≥15%. No WR threshold.
**Settings** model_threshold=NULL, min_edge=0.15, use_model=FALSE, FIXED $0.50–5.
**Compare against** T1_PURE_WR, T1_BASELINE.', updated_at = NOW() WHERE wallet_id = 'FT_T1_PURE_EDGE';
UPDATE public.ft_wallets SET description = '2x+ conviction only. No edge/WR. Trader betting 2x usual.', hypothesis = 'Does trader conviction predict success?', detailed_description = E'**Entry criteria** conviction ≥2 (trade_value / avg_trade_size). No edge/WR.
**Settings** model_threshold=NULL, min_edge=0, min_conviction=2, use_model=FALSE.
**Compare against** T1_PURE_WR, T4_WR_CONV (WR+conviction).', updated_at = NOW() WHERE wallet_id = 'FT_T1_PURE_CONV';
UPDATE public.ft_wallets SET description = '60%+ ML only. No trader filters. 10+ resolved.', hypothesis = 'Can the ML model predict winners without trader stats?', detailed_description = E'**Entry criteria** model_probability ≥60%. Minimal trader filter (10+ resolved).
**Settings** model_threshold=0.60, use_model=TRUE, FIXED $0.50–5.
**Compare against** FT_MODEL_ONLY (55%), T1_PURE_WR, T1_BASELINE.', updated_at = NOW() WHERE wallet_id = 'FT_T1_PURE_ML';
UPDATE public.ft_wallets SET description = '200+ resolved trades only. Minimal other filters.', hypothesis = 'Does trader experience correlate with better trades?', detailed_description = E'**Entry criteria** trader resolved count ≥200. No WR/edge/ML.
**Settings** min_trader_resolved_count=200, model_threshold=NULL, use_model=FALSE.
**Compare against** T1_BASELINE (30+), T1_PURE_WR.', updated_at = NOW() WHERE wallet_id = 'FT_T1_EXPERIENCE';

-- -----------------------------------------------------------------------------
-- TIER 2: PRICE BANDS
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = '10–40¢ only. 5% edge. Contrarian underdogs.', hypothesis = 'Do contrarian (underdog) bets outperform on ROI?', detailed_description = E'**Entry criteria** price 10–40¢, min_edge=5%. Kelly 25%, $0.50–8.
**Settings** price_min=0.10, price_max=0.40, min_edge=0.05, allocation=KELLY.
**Compare against** T2_MIDRANGE, T2_FAVORITES, T2_LONGSHOTS, FT_ML_CONTRARIAN.', updated_at = NOW() WHERE wallet_id = 'FT_T2_CONTRARIAN';
UPDATE public.ft_wallets SET description = '30–70¢ only. 5% edge. Balanced odds.', hypothesis = 'Is the sweet spot in the middle of the odds curve?', detailed_description = E'**Entry criteria** price 30–70¢, min_edge=5%.
**Settings** price_min=0.30, price_max=0.70, min_edge=0.05, Kelly 25%.
**Compare against** T2_CONTRARIAN, T2_FAVORITES, FT_ML_MIDRANGE.', updated_at = NOW() WHERE wallet_id = 'FT_T2_MIDRANGE';
UPDATE public.ft_wallets SET description = '60–90¢ only. 3% edge. Grind small wins.', hypothesis = 'Can we grind profits betting on likely winners?', detailed_description = E'**Entry criteria** price 60–90¢, min_edge=3%.
**Settings** price_min=0.60, price_max=0.90, min_edge=0.03.
**Compare against** T2_CONTRARIAN, T2_HEAVY_FAV, FT_FAVORITE_GRINDER.', updated_at = NOW() WHERE wallet_id = 'FT_T2_FAVORITES';
UPDATE public.ft_wallets SET description = '0–25¢ only. 5% edge. Extreme longshots.', hypothesis = 'Do extreme longshots have positive expected value?', detailed_description = E'**Entry criteria** price 0–25¢, min_edge=5%. Kelly 15%, $0.50–5.
**Settings** price_min=0, price_max=0.25, min_edge=0.05.
**Compare against** T2_CONTRARIAN, T2_HEAVY_FAV.', updated_at = NOW() WHERE wallet_id = 'FT_T2_LONGSHOTS';
UPDATE public.ft_wallets SET description = '75–95¢ only. 2% edge. Near-certain outcomes.', hypothesis = 'Can we profit from near-certain outcomes?', detailed_description = E'**Entry criteria** price 75–95¢, min_edge=2%.
**Settings** price_min=0.75, price_max=0.95, min_edge=0.02.
**Compare against** T2_FAVORITES, FT_ML_HEAVY_FAV.', updated_at = NOW() WHERE wallet_id = 'FT_T2_HEAVY_FAV';

-- -----------------------------------------------------------------------------
-- TIER 3: MARKET SPECIALIZATION
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = 'Sports markets only. 5% edge, 1.5x conviction.', hypothesis = 'Do sports betting specialists outperform?', detailed_description = E'**Entry criteria** market title matches SPORTS, NBA, NFL, MLB, NHL, SOCCER, TENNIS, MMA. min_edge=5%, min_conviction=1.5.
**Settings** market_categories column (not detailed_description). allocation=KELLY.
**Compare against** T3_CRYPTO, T3_POLITICS, T3_FINANCE.', updated_at = NOW() WHERE wallet_id = 'FT_T3_SPORTS';
UPDATE public.ft_wallets SET description = 'Crypto markets only. 10% edge.', hypothesis = 'Are crypto markets more predictable?', detailed_description = E'**Entry criteria** market title matches CRYPTO, BITCOIN, ETHEREUM, DEFI. min_edge=10%.
**Settings** market_categories column.
**Compare against** T3_SPORTS, T3_POLITICS.', updated_at = NOW() WHERE wallet_id = 'FT_T3_CRYPTO';
UPDATE public.ft_wallets SET description = 'Politics markets only. ML 55%+, 5% edge.', hypothesis = 'Can we profit from political prediction markets?', detailed_description = E'**Entry criteria** market title matches POLITICS, ELECTIONS, POLICY. ML 55%+, min_edge=5%.
**Settings** model_threshold=0.55, use_model=TRUE, market_categories column.
**Compare against** T3_SPORTS, FT_ML_* (ML across categories).', updated_at = NOW() WHERE wallet_id = 'FT_T3_POLITICS';
UPDATE public.ft_wallets SET description = 'Finance markets only. 60% WR, 5% edge. No ML.', hypothesis = 'Do financial market experts outperform?', detailed_description = E'**Entry criteria** market title matches FINANCE, STOCKS, ECONOMY, FED. model_threshold=0.60 as min WR, use_model=FALSE, min_edge=5%, 50+ resolved.
**Settings** market_categories, min_trader_count=50.
**Compare against** T3_CRYPTO, T3_POLITICS.', updated_at = NOW() WHERE wallet_id = 'FT_T3_FINANCE';

-- -----------------------------------------------------------------------------
-- TIER 4: COMPOUND
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = '60%+ WR AND 1.5x+ conviction. Elite + skin in game.', hypothesis = 'Do high WR traders perform better when betting big?', detailed_description = E'**Entry criteria** trader WR ≥60%, conviction ≥1.5. Kelly 35%, $1–15, 50+ resolved.
**Settings** model_threshold=0.60 (min WR), min_conviction=1.5, use_model=FALSE.
**Compare against** T1_PURE_WR, T1_PURE_CONV, T4_TRIPLE.', updated_at = NOW() WHERE wallet_id = 'FT_T4_WR_CONV';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 10%+ edge. Quantitative combo.', hypothesis = 'Does ML + edge beat ML-only or edge-only?', detailed_description = E'**Entry criteria** model_probability ≥55%, edge ≥10%.
**Settings** model_threshold=0.55, min_edge=0.10, use_model=TRUE. Kelly 35%, $1–15.
**Compare against** T1_PURE_ML, T1_PURE_EDGE, FT_ML_EDGE.', updated_at = NOW() WHERE wallet_id = 'FT_T4_ML_EDGE';
UPDATE public.ft_wallets SET description = '10–40¢ AND 2x+ conviction. Bold underdog bets.', hypothesis = 'Are traders betting big on underdogs smart money?', detailed_description = E'**Entry criteria** price 10–40¢, min_edge=5%, conviction ≥2.
**Settings** price_min=0.10, price_max=0.40, min_conviction=2, use_model=FALSE.
**Compare against** T2_CONTRARIAN, T1_PURE_CONV.', updated_at = NOW() WHERE wallet_id = 'FT_T4_CONTR_CONV';
UPDATE public.ft_wallets SET description = '60–90¢ AND 65%+ WR. Safe plays from elite.', hypothesis = 'Do elite traders + favorites = safe profits?', detailed_description = E'**Entry criteria** price 60–90¢, trader WR ≥65%, min_edge=3%. Kelly 35%, $1–15, 50+ resolved.
**Settings** model_threshold=0.65 (min WR), price_min=0.60, price_max=0.90, use_model=FALSE.
**Compare against** T2_FAVORITES, FT_FAVORITE_GRINDER, T4_TRIPLE.', updated_at = NOW() WHERE wallet_id = 'FT_T4_FAV_WR';
UPDATE public.ft_wallets SET description = '60%+ WR AND 8%+ edge AND 1.5x+ conviction. Triple filter.', hypothesis = 'Is the intersection of all factors the best signal?', detailed_description = E'**Entry criteria** WR ≥60%, edge ≥8%, conviction ≥1.5. Kelly 40%, $2–20, 50+ resolved.
**Settings** model_threshold=0.60, min_edge=0.08, min_conviction=1.5, use_model=FALSE.
**Compare against** T4_WR_CONV, T4_ML_EDGE, T4_FULL_STACK.', updated_at = NOW() WHERE wallet_id = 'FT_T4_TRIPLE';
UPDATE public.ft_wallets SET description = 'ALL filters: ML 55%+, WR 60%+, edge 10%+, conv 1.5x+, 20–70¢.', hypothesis = 'Maximum filtering — few trades but highest quality?', detailed_description = E'**Entry criteria** ML 55%+, WR 60%+, edge 10%+, conviction 1.5x+, price 20–70¢. Kelly 50%, $2–30, 50+ resolved.
**Settings** model_threshold=0.55, price_min=0.20, price_max=0.70, min_edge=0.10, min_conviction=1.5, use_model=TRUE.
**Compare against** FT_SHARP_SHOOTER, T4_TRIPLE, FT_ML_SHARP_SHOOTER.', updated_at = NOW() WHERE wallet_id = 'FT_T4_FULL_STACK';

-- -----------------------------------------------------------------------------
-- TIER 5: ANTI-STRATEGIES (Control / should lose)
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET
  description = 'Trader WR <50% only. Anti-strategy. Should lose money.',
  hypothesis = 'CONTROL: Following bad traders should lose money.',
  detailed_description = '{"max_trader_win_rate":0.50,"hypothesis":"CONTROL: Following bad traders should lose money.","thesis_tier":"T5_ANTI"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_T5_LOW_WR';

UPDATE public.ft_wallets SET
  description = 'Conviction <0.5x only. Anti-strategy. Low signal.',
  hypothesis = 'CONTROL: Low conviction trades should underperform.',
  detailed_description = '{"max_conviction":0.5,"hypothesis":"CONTROL: Low conviction trades should underperform.","thesis_tier":"T5_ANTI"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_T5_LOW_CONV';

UPDATE public.ft_wallets SET description = 'Negative edge (WR < price). Min edge -10%. Anti-strategy.', hypothesis = 'CONTROL: Negative edge trades must lose money.', detailed_description = E'**Entry criteria** min_edge=-0.10 allows slight negative edge.
**Settings** min_edge=-0.10, use_model=FALSE, FIXED $0.50–3.
**Compare against** T1_PURE_EDGE (positive edge). Anti: should lose.', updated_at = NOW() WHERE wallet_id = 'FT_T5_NEG_EDGE';
UPDATE public.ft_wallets SET description = '5+ resolved only. Near-random. Anti-strategy.', hypothesis = 'CONTROL: Random selection should break even or lose.', detailed_description = E'**Entry criteria** min_trader_resolved_count=5. No quality filter.
**Settings** min_trader_count=5, model_threshold=NULL, min_edge=0.
**Compare against** T1_BASELINE (30+). Anti: should underperform.', updated_at = NOW() WHERE wallet_id = 'FT_T5_RANDOM';

-- -----------------------------------------------------------------------------
-- SPECIAL
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = 'Only copy trades where original size >$100. Whale follows.', hypothesis = 'Do large position sizes indicate better information?', detailed_description = E'**Entry criteria** min_original_trade_usd=100. min_edge=5%, Kelly 30%, $1–15.
**Settings** extended filter min_original_trade_usd. Market categories: none.
**Compare against** S_MICRO (opposite), T1_BASELINE.', updated_at = NOW() WHERE wallet_id = 'FT_S_WHALE';
UPDATE public.ft_wallets SET description = 'Only copy trades where original size <$10. Micro trades.', hypothesis = 'Are small trades testing the waters or noise?', detailed_description = E'**Entry criteria** max_original_trade_usd=10. min_edge=5%, FIXED $0.50–2.
**Settings** extended filter max_original_trade_usd.
**Compare against** S_WHALE (opposite).', updated_at = NOW() WHERE wallet_id = 'FT_S_MICRO';
UPDATE public.ft_wallets SET description = 'Full Kelly (1.0). 60% WR, 10% edge, 1.5x conv. Aggressive sizing.', hypothesis = 'Does aggressive Kelly sizing improve or hurt returns?', detailed_description = E'**Entry criteria** Kelly fraction=1.0, WR 60%+, edge 10%+, conviction 1.5x. min_bet=1, max_bet=100, 50+ resolved.
**Settings** allocation=KELLY, kelly_fraction=1.0.
**Compare against** T4_WR_CONV (quarter Kelly), FT_SHARP_SHOOTER (half Kelly).', updated_at = NOW() WHERE wallet_id = 'FT_S_KELLY_AGG';
UPDATE public.ft_wallets SET description = 'Edge-scaled bet sizing. Bet scales linearly with edge.', hypothesis = 'Does edge-proportional sizing improve Sharpe?', detailed_description = E'**Entry criteria** allocation=EDGE_SCALED. min_edge=5%, $0.50–20.
**Settings** allocation_method=EDGE_SCALED. Bet = base * (1 + edge * 5).
**Compare against** FIXED/KELLY strategies.', updated_at = NOW() WHERE wallet_id = 'FT_S_EDGE_SCALE';

-- -----------------------------------------------------------------------------
-- ML MIX (10 strategies)
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET description = 'ML 55%+ AND 1.5x conviction. Elite sniper (best non-ML performer + ML).', hypothesis = 'Does ML improve the profitable Sharp Shooter profile?', detailed_description = E'**Entry criteria** model 55%+, conviction 1.5x, 30+ resolved. Kelly 40%, $15–75.
**Settings** model_threshold=0.55, min_conviction=1.5, use_model=TRUE, price 0–100¢.
**Compare against** FT_SHARP_SHOOTER (no ML), FT_ML_UNDERDOG, FT_ML_HIGH_CONV.', updated_at = NOW() WHERE wallet_id = 'FT_ML_SHARP_SHOOTER';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND underdogs 0–50¢, 5% edge.', hypothesis = 'Does ML filter underdogs to only mispriced ones?', detailed_description = E'**Entry criteria** model 55%+, price 0–50¢, min_edge=5%. Kelly 30%, $0.50–8.
**Compare against** FT_UNDERDOG_HUNTER, FT_ML_FAVORITES.', updated_at = NOW() WHERE wallet_id = 'FT_ML_UNDERDOG';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND favorites 60–90¢, 3% edge.', hypothesis = 'Does ML improve favorites grinding?', detailed_description = E'**Entry criteria** model 55%+, price 60–90¢, min_edge=3%.
**Compare against** FT_FAVORITE_GRINDER, FT_ML_UNDERDOG.', updated_at = NOW() WHERE wallet_id = 'FT_ML_FAVORITES';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 2x conviction. Double confirmation.', hypothesis = 'Does ML + trader conviction = better than either alone?', detailed_description = E'**Entry criteria** model 55%+, conviction 2x. FIXED $0.50–5.
**Compare against** T1_PURE_CONV, FT_ML_SHARP_SHOOTER (1.5x).', updated_at = NOW() WHERE wallet_id = 'FT_ML_HIGH_CONV';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 5% min edge. Quantitative combo.', hypothesis = 'Does ML + edge beat ML-only or edge-only?', detailed_description = E'**Entry criteria** model 55%+, min_edge=5%. Kelly 35%, $1–15.
**Compare against** T1_PURE_ML, T1_PURE_EDGE, T4_ML_EDGE.', updated_at = NOW() WHERE wallet_id = 'FT_ML_EDGE';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 25–75¢ only. Avoid extremes.', hypothesis = 'Is ML + mid-range the sweet spot?', detailed_description = E'**Entry criteria** model 55%+, price 25–75¢, min_edge=5%.
**Compare against** T2_MIDRANGE, FT_ML_CONTRARIAN, FT_ML_HEAVY_FAV.', updated_at = NOW() WHERE wallet_id = 'FT_ML_MIDRANGE';
UPDATE public.ft_wallets SET description = 'ML 65% only. Highest confidence. Fewer trades.', hypothesis = 'Does raising ML threshold improve precision?', detailed_description = E'**Entry criteria** model 65%+ only. Kelly 35%, $1–20, 10+ resolved.
**Compare against** FT_MODEL_ONLY (55%), FT_ML_LOOSE (50%).', updated_at = NOW() WHERE wallet_id = 'FT_ML_STRICT';
UPDATE public.ft_wallets SET description = 'ML 50% only. Lower bar. More trades.', hypothesis = 'Does a lower ML threshold add or destroy value?', detailed_description = E'**Entry criteria** model 50%+ only. Kelly 25%, $0.50–8, 10+ resolved.
**Compare against** FT_ML_STRICT (65%), FT_MODEL_ONLY (55%).', updated_at = NOW() WHERE wallet_id = 'FT_ML_LOOSE';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 10–40¢ contrarian, 5% edge.', hypothesis = 'Does ML improve contrarian (underdog) selection?', detailed_description = E'**Entry criteria** model 55%+, price 10–40¢, min_edge=5%.
**Compare against** T2_CONTRARIAN, FT_ML_UNDERDOG.', updated_at = NOW() WHERE wallet_id = 'FT_ML_CONTRARIAN';
UPDATE public.ft_wallets SET description = 'ML 55%+ AND 75–95¢ heavy favorites, 2% edge.', hypothesis = 'Does ML add value to heavy favorites?', detailed_description = E'**Entry criteria** model 55%+, price 75–95¢, min_edge=2%.
**Compare against** T2_HEAVY_FAV, FT_ML_FAVORITES.', updated_at = NOW() WHERE wallet_id = 'FT_ML_HEAVY_FAV';

-- -----------------------------------------------------------------------------
-- LIVE (trade_live_only: only after game/event start) — preserve JSON, add hypothesis
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET
  description = 'ML 55%+, live games only (after game start).',
  hypothesis = 'Does pure ML work better during live games?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Does pure ML work better during live games?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_MODEL_ONLY';

UPDATE public.ft_wallets SET
  description = '0–50¢, 5% edge, ML 55%+, live only.',
  hypothesis = 'Do underdogs perform better when traded live?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Do underdogs perform better when traded live?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_UNDERDOGS';

UPDATE public.ft_wallets SET
  description = '60–90¢, 3% edge, ML 55%+, live only.',
  hypothesis = 'Do favorites grind better during live action?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Do favorites grind better during live action?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_FAVORITES';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 2x conviction, live only.',
  hypothesis = 'Does trader conviction matter more when games are live?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Does trader conviction matter more when games are live?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_HIGH_CONV';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 1.5x conviction, elite sniper, live only.',
  hypothesis = 'Elite live-only: does selectivity beat volume in-game?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Elite live-only: does selectivity beat volume in-game?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_SHARP_SHOOTER';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 25–75¢, 5% edge, live only.',
  hypothesis = 'Mid-range odds during live: avoid extremes in-game.',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Mid-range odds during live: avoid extremes in-game.","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_MIDRANGE';

UPDATE public.ft_wallets SET
  description = '60%+ trader WR, 5% edge, no ML, live only.',
  hypothesis = 'Baseline: does trader WR alone work live vs pre-game?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Baseline: does trader WR alone work live vs pre-game?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_WR_ONLY';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 10% min edge, live only.',
  hypothesis = 'High edge required: does live reveal more mispricings?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"High edge required: does live reveal more mispricings?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_EDGE_HUNTER';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 10–40¢, 5% edge, live only.',
  hypothesis = 'Contrarian live: fade favorites when action heats up?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Contrarian live: fade favorites when action heats up?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_CONTRARIAN';

UPDATE public.ft_wallets SET
  description = 'ML 55%+, 75–95¢, 2% edge, live only.',
  hypothesis = 'Near-certain live: safe favorites when outcome clearer?',
  detailed_description = '{"trade_live_only":true,"hypothesis":"Near-certain live: safe favorites when outcome clearer?","thesis_tier":"LIVE"}',
  updated_at = NOW()
WHERE wallet_id = 'FT_LIVE_HEAVY_FAV';

-- -----------------------------------------------------------------------------
-- PNL ROTATION (target_traders in detailed_description — do not overwrite JSON)
-- -----------------------------------------------------------------------------

UPDATE public.ft_wallets SET
  description = 'Top 10 traders by yesterday''s realized PnL. target_traders rotated daily at 3am UTC. FIXED $8.',
  hypothesis = 'Do yesterday''s hot hands continue today?',
  updated_at = NOW()
WHERE wallet_id = 'FT_TOP_DAILY_WINNERS';

UPDATE public.ft_wallets SET
  description = 'Top 10 traders by last 7 days realized PnL. target_traders rotated daily at 3am UTC. FIXED $8.',
  hypothesis = 'Do 7-day winners have persistent edge?',
  updated_at = NOW()
WHERE wallet_id = 'FT_TOP_7D_WINNERS';
