-- ============================================================================
-- CREATE ENRICHED TRADES TRAINING V8
-- Enhanced feature set for improved ML model
-- ============================================================================
-- 
-- NEW FEATURES ADDED (vs v7):
-- 1. D7_win_rate, D30_win_rate - Time-specific momentum
-- 2. L_total_roi_pct - ROI alongside win rate
-- 3. bracket_win_rate - Price bracket specific (LOW/MID/HIGH)
-- 4. bet_size_vs_avg - Deviation from trader's norm
-- 5. stddev_bet_size - Bet consistency (risk tolerance)
-- 6. max_trades_per_day - Activity level indicator
-- 7. D7_roi_pct, D30_roi_pct - Recent ROI metrics
-- 8. trader_experience_bucket - Binned experience level
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.enriched_trades_training_v8` AS

WITH 
-- Deduplicate markets table (take most recent by last_updated or first by condition_id)
markets_dedup AS (
  SELECT * EXCEPT(rn)
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY last_updated DESC NULLS LAST, condition_id) as rn
    FROM `polycopy_v1.markets`
    WHERE winning_label IS NOT NULL  -- Only resolved markets
  )
  WHERE rn = 1
),

-- Calculate price brackets
price_brackets AS (
  SELECT 
    t.*,
    CASE 
      WHEN t.price < 0.35 THEN 'LOW'
      WHEN t.price >= 0.35 AND t.price <= 0.65 THEN 'MID'
      ELSE 'HIGH'
    END as price_bracket
  FROM `polycopy_v1.trades` t
),

-- Join trades with markets to get outcomes and market metadata
trades_with_markets AS (
  SELECT 
    t.id as trade_id,
    t.wallet_address,
    t.timestamp,
    t.side,
    t.price as entry_price,
    t.shares_normalized,
    t.token_label,
    t.condition_id,
    t.price_bracket,
    
    -- Market metadata: niche = market_subtype (fallback to market_type)
    COALESCE(m.market_subtype, m.market_type, 'OTHER') as final_niche,
    COALESCE(m.bet_structure, 'STANDARD') as bet_structure,
    m.winning_label,
    m.volume_total,
    m.volume_1_week,
    m.start_time as market_start_time,
    m.end_time as market_end_time,
    m.game_start_time,
    
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
    t.price * t.shares_normalized as trade_value
    
  FROM price_brackets t
  INNER JOIN markets_dedup m ON t.condition_id = m.condition_id
  WHERE t.side = 'BUY'  -- Focus on buy signals
),

-- Calculate per-wallet running stats for trade sequence and tempo
wallet_trade_sequences AS (
  SELECT 
    *,
    ROW_NUMBER() OVER (PARTITION BY wallet_address, condition_id ORDER BY timestamp) as trade_sequence,
    LAG(timestamp) OVER (PARTITION BY wallet_address ORDER BY timestamp) as prev_trade_time,
    LAG(entry_price) OVER (PARTITION BY wallet_address, condition_id ORDER BY timestamp) as prev_price_same_market
  FROM trades_with_markets
),

-- Add tempo and chasing indicators
trades_with_sequence AS (
  SELECT 
    *,
    COALESCE(TIMESTAMP_DIFF(timestamp, prev_trade_time, SECOND), 300) as trader_tempo_seconds,
    CASE WHEN entry_price > COALESCE(prev_price_same_market, entry_price) THEN 1 ELSE 0 END as is_chasing_price_up,
    CASE WHEN entry_price < COALESCE(prev_price_same_market, entry_price) THEN 1 ELSE 0 END as is_averaging_down
  FROM wallet_trade_sequences
),

-- Calculate cumulative exposure for conviction z-score
wallet_avg_bet AS (
  SELECT 
    wallet_address,
    AVG(trade_value) as avg_bet_size,
    STDDEV(trade_value) as stddev_bet_size
  FROM trades_with_sequence
  GROUP BY wallet_address
),

-- Join with trader global stats (time-bucketed win rates)
enriched_with_global AS (
  SELECT 
    t.*,
    
    -- Global stats (time-bucketed)
    COALESCE(g.L_win_rate, 0.5) as global_win_rate,
    COALESCE(g.D30_win_rate, g.L_win_rate, 0.5) as D30_win_rate,
    COALESCE(g.D7_win_rate, g.D30_win_rate, g.L_win_rate, 0.5) as D7_win_rate,
    COALESCE(g.L_total_roi_pct, 0) as lifetime_roi_pct,
    COALESCE(g.D30_total_roi_pct, 0) as D30_roi_pct,
    COALESCE(g.D7_total_roi_pct, 0) as D7_roi_pct,
    COALESCE(g.L_count, 0) as total_lifetime_trades,
    COALESCE(g.L_avg_trade_size_usd, 100) as avg_trade_size_global,
    
    -- Avg bet info for z-score
    w.avg_bet_size,
    w.stddev_bet_size
    
  FROM trades_with_sequence t
  LEFT JOIN `polycopy_v1.trader_global_stats` g ON t.wallet_address = g.wallet_address
  LEFT JOIN wallet_avg_bet w ON t.wallet_address = w.wallet_address
),

-- Join with trader profile stats (niche + bracket specific)
-- Note: profile_stats has all dimensions filled (niche, structure, bracket), so we match exactly
enriched_with_profile AS (
  SELECT 
    t.*,
    
    -- Niche + structure + bracket specific win rate (exact match)
    COALESCE(p.L_win_rate, t.global_win_rate) as niche_win_rate_history,
    COALESCE(p.L_win_rate, t.global_win_rate) as bracket_win_rate,
    COALESCE(p.L_win_rate, t.global_win_rate) as niche_bracket_win_rate,
    COALESCE(p.L_total_roi_pct, t.lifetime_roi_pct) as niche_roi_pct
    
  FROM enriched_with_global t
  
  -- Join for exact match on niche + structure + bracket
  LEFT JOIN `polycopy_v1.trader_profile_stats` p
    ON t.wallet_address = p.wallet_address
    AND t.final_niche = p.final_niche
    AND t.bet_structure = p.structure
    AND t.price_bracket = p.bracket
),

-- Join with DNA snapshots for behavioral features
enriched_with_dna AS (
  SELECT 
    t.*,
    COALESCE(d.recent_win_rate, t.D7_win_rate) as recent_win_rate,
    COALESCE(d.max_trades_per_day, 10) as max_trades_per_day,
    COALESCE(d.stddev_bet_size_usdc, t.stddev_bet_size, 50) as dna_stddev_bet_size
  FROM enriched_with_profile t
  LEFT JOIN `polycopy_v1.trader_dna_snapshots` d ON t.wallet_address = d.wallet_address
),

-- Final enrichment with calculated features
final_enriched AS (
  SELECT 
    -- OUTCOME (target)
    outcome,
    
    -- TRADER SKILL FEATURES
    global_win_rate,
    D30_win_rate,
    D7_win_rate,
    niche_win_rate_history,
    bracket_win_rate,
    niche_bracket_win_rate,
    recent_win_rate,
    
    -- ROI FEATURES (new!)
    lifetime_roi_pct,
    D30_roi_pct,
    D7_roi_pct,
    niche_roi_pct,
    
    -- EXPERIENCE FEATURES
    total_lifetime_trades,
    CASE 
      WHEN total_lifetime_trades < 100 THEN 'NOVICE'
      WHEN total_lifetime_trades < 1000 THEN 'INTERMEDIATE'
      WHEN total_lifetime_trades < 10000 THEN 'EXPERIENCED'
      ELSE 'EXPERT'
    END as trader_experience_bucket,
    
    -- CONVICTION FEATURES
    SAFE_DIVIDE(trade_value - avg_bet_size, NULLIF(stddev_bet_size, 0)) as conviction_z_score,
    trade_sequence,
    SAFE_DIVIDE(trade_value, NULLIF(avg_trade_size_global, 0)) as bet_size_vs_avg,
    
    -- BEHAVIORAL FEATURES
    trader_tempo_seconds,
    is_chasing_price_up,
    is_averaging_down,
    max_trades_per_day,
    dna_stddev_bet_size as stddev_bet_size,
    0 as is_hedged,  -- Would need more complex calculation
    
    -- TRADE FEATURES
    final_niche,
    bet_structure,
    position_direction,
    entry_price,
    price_bracket,
    LOG(trade_value + 1) as trade_size_log,
    LOG(trade_value + 1) as total_exposure_log,  -- Simplified for now
    
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
    COALESCE(
      TIMESTAMP_DIFF(timestamp, market_start_time, DAY),
      0
    ) as market_age_days,
    
    -- METADATA (for validation, not training)
    wallet_address,
    timestamp,
    condition_id
    
  FROM enriched_with_dna
  WHERE 
    entry_price > 0 AND entry_price < 1
    AND trade_value > 0
    AND total_lifetime_trades > 0
)

SELECT * FROM final_enriched;
