-- ============================================================================
-- CREATE ENRICHED TRADES TRAINING V10
-- Adding high-value features from comprehensive analysis
-- ============================================================================
--
-- NEW FEATURES IN V10:
-- 1. trade_size_tier (Whale/Large/Medium/Small) - 67.9% vs 40.3% win rate
-- 2. trader_sells_ratio (holding behavior) - 54.0% vs 43.9% win rate
-- 3. is_hedging (both outcomes same market) - 52.2% vs 32.6% win rate
-- 4. is_in_best_niche (trading in strongest niche) - 71.2% vs 42.2% win rate
-- 5. is_with_crowd (aligned with volume) - 53.2% vs 48.4% win rate
-- 6. market_age_bucket (1-4 weeks optimal)
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.enriched_trades_training_v10` AS

WITH
-- ============================================================================
-- STEP 1: DEDUPLICATE AND CLASSIFY MARKETS (same as V9)
-- ============================================================================
markets_classified AS (
  SELECT
    condition_id,
    market_slug,
    winning_label,
    volume_total,
    volume_1_week,
    start_time,
    end_time,
    game_start_time,
    bet_structure,
    event_slug,

    -- COMPREHENSIVE NICHE CLASSIFICATION from market_slug
    CASE
        -- Crypto
        WHEN LOWER(market_slug) LIKE 'btc%' OR LOWER(market_slug) LIKE '%bitcoin%' THEN 'BITCOIN'
        WHEN LOWER(market_slug) LIKE 'eth%' OR LOWER(market_slug) LIKE '%ethereum%' THEN 'ETHEREUM'
        WHEN LOWER(market_slug) LIKE 'sol%' OR LOWER(market_slug) LIKE '%solana%' THEN 'SOLANA'
        WHEN LOWER(market_slug) LIKE 'xrp%' OR LOWER(market_slug) LIKE '%ripple%' THEN 'RIPPLE'
        WHEN LOWER(market_slug) LIKE '%dogecoin%' OR LOWER(market_slug) LIKE 'doge%' THEN 'DOGECOIN'

        -- US Sports
        WHEN LOWER(market_slug) LIKE 'nba-%' THEN 'NBA'
        WHEN LOWER(market_slug) LIKE 'nfl-%' THEN 'NFL'
        WHEN LOWER(market_slug) LIKE 'mlb-%' THEN 'MLB'
        WHEN LOWER(market_slug) LIKE 'nhl-%' THEN 'NHL'
        WHEN LOWER(market_slug) LIKE 'wnba-%' THEN 'WNBA'
        WHEN LOWER(market_slug) LIKE 'cbb-%' THEN 'NCAA_BASKETBALL'
        WHEN LOWER(market_slug) LIKE 'cfb-%' THEN 'NCAA_FOOTBALL'

        -- Soccer
        WHEN LOWER(market_slug) LIKE 'epl-%' THEN 'PREMIER_LEAGUE'
        WHEN LOWER(market_slug) LIKE 'ucl-%' THEN 'CHAMPIONS_LEAGUE'
        WHEN LOWER(market_slug) LIKE 'uel-%' THEN 'EUROPA_LEAGUE'
        WHEN LOWER(market_slug) LIKE 'lal-%' THEN 'LA_LIGA'
        WHEN LOWER(market_slug) LIKE 'bun-%' THEN 'BUNDESLIGA'
        WHEN LOWER(market_slug) LIKE 'sea-%' THEN 'SERIE_A'
        WHEN LOWER(market_slug) LIKE 'mls-%' THEN 'MLS'

        -- Tennis
        WHEN LOWER(market_slug) LIKE 'atp-%' THEN 'ATP_TOUR'
        WHEN LOWER(market_slug) LIKE 'wta-%' THEN 'WTA_TOUR'
        WHEN LOWER(market_slug) LIKE '%wimbledon%' THEN 'WIMBLEDON'
        WHEN LOWER(market_slug) LIKE '%us-open%' AND LOWER(market_slug) NOT LIKE '%bitcoin%' THEN 'US_OPEN_TENNIS'
        WHEN LOWER(market_slug) LIKE '%australian-open%' THEN 'AUSTRALIAN_OPEN'
        WHEN LOWER(market_slug) LIKE '%french-open%' THEN 'FRENCH_OPEN'

        -- Esports
        WHEN LOWER(market_slug) LIKE 'lol-%' THEN 'LEAGUE_OF_LEGENDS'
        WHEN LOWER(market_slug) LIKE 'val-%' THEN 'VALORANT'
        WHEN LOWER(market_slug) LIKE '%counter-strike%' OR LOWER(market_slug) LIKE '%csgo%' THEN 'COUNTER_STRIKE'
        WHEN LOWER(market_slug) LIKE '%dota%' THEN 'DOTA_2'

        -- Politics/People
        WHEN LOWER(market_slug) LIKE '%trump%' THEN 'TRUMP'
        WHEN LOWER(market_slug) LIKE 'elon%' OR LOWER(market_slug) LIKE '%elon-musk%' THEN 'ELON_MUSK'
        WHEN LOWER(market_slug) LIKE '%biden%' THEN 'BIDEN'
        WHEN LOWER(market_slug) LIKE '%harris%' THEN 'HARRIS'
        WHEN LOWER(market_slug) LIKE '%election%' OR LOWER(market_slug) LIKE '%president%' THEN 'ELECTION'

        -- Weather
        WHEN LOWER(market_slug) LIKE 'highest-%' OR LOWER(market_slug) LIKE '%temperature%' THEN 'WEATHER'

        -- Combat Sports
        WHEN LOWER(market_slug) LIKE 'ufc-%' THEN 'UFC'
        WHEN LOWER(market_slug) LIKE '%boxing%' THEN 'BOXING'

        -- Fallbacks
        WHEN market_subtype IS NOT NULL AND market_subtype != '' THEN UPPER(market_subtype)
        WHEN market_type IS NOT NULL AND market_type != '' THEN UPPER(market_type)

        ELSE 'OTHER'
    END as final_niche,

    ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY last_updated DESC NULLS LAST) as rn

  FROM `polycopy_v1.markets`
  WHERE winning_label IS NOT NULL
),

markets_dedup AS (
  SELECT * EXCEPT(rn) FROM markets_classified WHERE rn = 1
),

-- ============================================================================
-- STEP 2: CALCULATE MARKET-LEVEL VOLUME DIRECTION (for crowd feature)
-- ============================================================================
market_volume_direction AS (
  SELECT 
    condition_id,
    SUM(CASE WHEN price > 0.5 THEN shares_normalized * price ELSE 0 END) as yes_volume,
    SUM(CASE WHEN price <= 0.5 THEN shares_normalized * price ELSE 0 END) as no_volume,
    CASE 
      WHEN SUM(CASE WHEN price > 0.5 THEN shares_normalized * price ELSE 0 END) >
           SUM(CASE WHEN price <= 0.5 THEN shares_normalized * price ELSE 0 END)
      THEN 'YES_HEAVY'
      ELSE 'NO_HEAVY'
    END as volume_direction
  FROM `polycopy_v1.trades`
  WHERE side = 'BUY'
  GROUP BY condition_id
),

-- ============================================================================
-- STEP 3: CALCULATE TRADER-LEVEL STATS (sells ratio, best niche, etc.)
-- ============================================================================
trader_sell_behavior AS (
  SELECT 
    wallet_address,
    COUNT(*) as total_trades_all,
    SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as sell_count,
    SUM(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) / COUNT(*) as sells_ratio
  FROM `polycopy_v1.trades`
  GROUP BY wallet_address
),

-- Trader niche performance (to find best niche)
trader_niche_performance AS (
  SELECT 
    t.wallet_address,
    m.final_niche,
    COUNT(*) as niche_trades,
    AVG(CASE WHEN LOWER(t.token_label) = LOWER(m.winning_label) THEN 1.0 ELSE 0.0 END) as niche_win_rate
  FROM `polycopy_v1.trades` t
  JOIN markets_dedup m ON t.condition_id = m.condition_id
  WHERE t.side = 'BUY'
  GROUP BY t.wallet_address, m.final_niche
  HAVING COUNT(*) >= 10  -- Minimum trades for meaningful stat
),

trader_best_niche AS (
  SELECT 
    wallet_address,
    ARRAY_AGG(final_niche ORDER BY niche_win_rate DESC, niche_trades DESC LIMIT 1)[OFFSET(0)] as best_niche,
    MAX(niche_win_rate) as best_niche_win_rate
  FROM trader_niche_performance
  GROUP BY wallet_address
),

-- Trader hedging behavior (per market)
trader_market_hedging AS (
  SELECT 
    wallet_address,
    condition_id,
    COUNT(DISTINCT token_label) as distinct_tokens,
    MAX(CASE WHEN side = 'SELL' THEN 1 ELSE 0 END) as has_sells
  FROM `polycopy_v1.trades`
  GROUP BY wallet_address, condition_id
),

-- Trader aggregates (from V9)
trader_aggregates AS (
  SELECT
    wallet_address,
    COUNT(*) as total_trades,
    AVG(price * shares_normalized) as avg_trade_value,
    STDDEV(price * shares_normalized) as stddev_trade_value,
    AVG(price) as avg_entry_price,
    COUNT(DISTINCT DATE(timestamp)) as active_days,
    COUNT(*) / NULLIF(COUNT(DISTINCT DATE(timestamp)), 0) as trades_per_day
  FROM `polycopy_v1.trades`
  WHERE side = 'BUY'
  GROUP BY wallet_address
),

-- Trader niche experience
trader_niche_experience AS (
  SELECT
    t.wallet_address,
    m.final_niche,
    COUNT(*) as niche_trades,
    COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY t.wallet_address) as niche_experience_pct
  FROM `polycopy_v1.trades` t
  JOIN markets_dedup m ON t.condition_id = m.condition_id
  WHERE t.side = 'BUY'
  GROUP BY t.wallet_address, m.final_niche
),

-- ============================================================================
-- STEP 4: JOIN TRADES WITH MARKETS
-- ============================================================================
trades_with_markets AS (
  SELECT
    t.id as trade_id,
    t.wallet_address,
    t.timestamp,
    t.price as entry_price,
    t.shares_normalized,
    t.token_label,
    t.condition_id,

    -- Market metadata
    m.final_niche,
    COALESCE(m.bet_structure, 'STANDARD') as bet_structure,
    m.winning_label,
    m.volume_total,
    m.volume_1_week,
    m.start_time as market_start_time,
    m.end_time as market_end_time,
    m.game_start_time,
    m.event_slug,

    -- Outcome
    CASE
      WHEN LOWER(t.token_label) = LOWER(m.winning_label) THEN 'WON'
      ELSE 'LOST'
    END as outcome,

    -- Position direction
    CASE
      WHEN t.side = 'SELL' THEN 'SHORT'
      ELSE 'LONG'
    END as position_direction,

    -- Trade value
    t.price * t.shares_normalized as trade_value,
    
    -- Volume direction for crowd feature
    v.volume_direction,
    v.yes_volume,
    v.no_volume

  FROM `polycopy_v1.trades` t
  INNER JOIN markets_dedup m ON t.condition_id = m.condition_id
  LEFT JOIN market_volume_direction v ON t.condition_id = v.condition_id
  WHERE t.side = 'BUY'
),

-- ============================================================================
-- STEP 5: ADD SEQUENCE AND BEHAVIORAL FEATURES
-- ============================================================================
trades_with_sequence AS (
  SELECT
    t.*,

    -- Trade sequence within position
    ROW_NUMBER() OVER (PARTITION BY wallet_address, condition_id ORDER BY timestamp) as trade_sequence,

    -- Previous trade info
    LAG(timestamp) OVER (PARTITION BY wallet_address ORDER BY timestamp) as prev_trade_time,
    LAG(entry_price) OVER (PARTITION BY wallet_address, condition_id ORDER BY timestamp) as prev_price_same_market,

    -- Cumulative exposure
    SUM(trade_value) OVER (
      PARTITION BY wallet_address, condition_id
      ORDER BY timestamp
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as cumulative_exposure,

    -- Market age at trade
    TIMESTAMP_DIFF(timestamp, market_start_time, DAY) as market_age_days

  FROM trades_with_markets t
),

trades_with_behavior AS (
  SELECT
    t.*,

    -- Tempo
    COALESCE(TIMESTAMP_DIFF(timestamp, prev_trade_time, SECOND), 300) as trader_tempo_seconds,

    -- Price chasing
    CASE WHEN entry_price > COALESCE(prev_price_same_market, entry_price) THEN 1 ELSE 0 END as is_chasing_price_up,
    CASE WHEN entry_price < COALESCE(prev_price_same_market, entry_price) THEN 1 ELSE 0 END as is_averaging_down

  FROM trades_with_sequence t
),

-- ============================================================================
-- STEP 6: JOIN WITH TRADER STATS AND ADD V10 FEATURES
-- ============================================================================
enriched_trades AS (
  SELECT
    t.*,

    -- Global trader stats
    COALESCE(g.L_win_rate, 0.5) as global_win_rate,
    COALESCE(g.L_count, 0) as total_lifetime_trades,

    -- Trader aggregates
    COALESCE(ta.avg_trade_value, t.trade_value) as trader_avg_trade_value,
    COALESCE(ta.stddev_trade_value, 1) as trader_stddev_trade_value,
    COALESCE(ta.avg_entry_price, 0.5) as trader_avg_entry_price,
    COALESCE(ta.trades_per_day, 1) as trader_trades_per_day,

    -- Niche stats
    COALESCE(p.L_win_rate, g.L_win_rate, 0.5) as niche_win_rate_history,
    COALESCE(ne.niche_experience_pct, 0) as niche_experience_pct,

    -- V10 NEW: Trader sells ratio
    COALESCE(sb.sells_ratio, 0) as trader_sells_ratio,

    -- V10 NEW: Best niche
    bn.best_niche as trader_best_niche,
    
    -- V10 NEW: Hedging behavior for this market
    COALESCE(h.distinct_tokens, 1) as tokens_in_market,
    COALESCE(h.has_sells, 0) as has_sells_in_market

  FROM trades_with_behavior t
  LEFT JOIN `polycopy_v1.trader_global_stats` g ON t.wallet_address = g.wallet_address
  LEFT JOIN trader_aggregates ta ON t.wallet_address = ta.wallet_address
  LEFT JOIN `polycopy_v1.trader_profile_stats` p
    ON t.wallet_address = p.wallet_address
    AND t.final_niche = p.final_niche
  LEFT JOIN trader_niche_experience ne
    ON t.wallet_address = ne.wallet_address
    AND t.final_niche = ne.final_niche
  LEFT JOIN trader_sell_behavior sb ON t.wallet_address = sb.wallet_address
  LEFT JOIN trader_best_niche bn ON t.wallet_address = bn.wallet_address
  LEFT JOIN trader_market_hedging h 
    ON t.wallet_address = h.wallet_address 
    AND t.condition_id = h.condition_id
),

-- ============================================================================
-- STEP 7: FINAL FEATURE ENGINEERING WITH V10 FEATURES
-- ============================================================================
final_enriched AS (
  SELECT
    -- TARGET
    outcome,

    -- TRADER SKILL FEATURES (core)
    global_win_rate,
    niche_win_rate_history,
    total_lifetime_trades,

    -- TRADER BEHAVIOR (V9)
    niche_experience_pct,
    1.0 / NULLIF(trader_trades_per_day, 0) as trader_selectivity,
    SAFE_DIVIDE(entry_price - trader_avg_entry_price, 0.2) as price_vs_trader_avg,

    -- CONVICTION FEATURES
    SAFE_DIVIDE(trade_value - trader_avg_trade_value, NULLIF(trader_stddev_trade_value, 0)) as conviction_z_score,
    trade_sequence,

    -- BEHAVIORAL FEATURES
    trader_tempo_seconds,
    is_chasing_price_up,
    is_averaging_down,

    -- V10 NEW: TRADE SIZE TIER (whale detection)
    CASE 
      WHEN SAFE_DIVIDE(trade_value, NULLIF(volume_total, 0)) > 0.01 THEN 'WHALE'
      WHEN SAFE_DIVIDE(trade_value, NULLIF(volume_total, 0)) > 0.001 THEN 'LARGE'
      WHEN SAFE_DIVIDE(trade_value, NULLIF(volume_total, 0)) > 0.0001 THEN 'MEDIUM'
      ELSE 'SMALL'
    END as trade_size_tier,

    -- V10 NEW: TRADER SELLS RATIO (holding behavior)
    trader_sells_ratio,

    -- V10 NEW: IS HEDGING (both outcomes)
    CASE WHEN tokens_in_market > 1 THEN 1 ELSE 0 END as is_hedging,

    -- V10 NEW: IS IN BEST NICHE
    CASE WHEN final_niche = trader_best_niche THEN 1 ELSE 0 END as is_in_best_niche,

    -- V10 NEW: IS WITH CROWD (aligned with volume)
    CASE 
      WHEN (entry_price > 0.5 AND volume_direction = 'YES_HEAVY') OR 
           (entry_price <= 0.5 AND volume_direction = 'NO_HEAVY')
      THEN 1 ELSE 0 
    END as is_with_crowd,

    -- V10 NEW: MARKET AGE BUCKET
    CASE 
      WHEN market_age_days < 1 THEN 'DAY_1'
      WHEN market_age_days < 7 THEN 'WEEK_1'
      WHEN market_age_days < 30 THEN 'MONTH_1'
      ELSE 'OLDER'
    END as market_age_bucket,

    -- TRADE FEATURES
    final_niche,
    bet_structure,
    position_direction,
    entry_price,
    LOG(trade_value + 1) as trade_size_log,
    LOG(cumulative_exposure + 1) as total_exposure_log,

    -- MARKET FEATURES
    SAFE_DIVIDE(volume_1_week, NULLIF(volume_total, 0)) as volume_momentum_ratio,
    SAFE_DIVIDE(trade_value, NULLIF(volume_total, 1000)) as liquidity_impact_ratio,

    -- TIMING FEATURES
    COALESCE(
      TIMESTAMP_DIFF(game_start_time, timestamp, MINUTE),
      TIMESTAMP_DIFF(market_start_time, timestamp, MINUTE),
      0
    ) as minutes_to_start,
    COALESCE(
      TIMESTAMP_DIFF(market_end_time, timestamp, HOUR),
      24
    ) as hours_to_close,
    COALESCE(market_age_days, 0) as market_age_days,

    -- METADATA
    wallet_address,
    timestamp,
    condition_id

  FROM enriched_trades
  WHERE
    entry_price > 0.01 AND entry_price < 0.99
    AND trade_value > 0
    AND total_lifetime_trades >= 10
)

SELECT * FROM final_enriched;
