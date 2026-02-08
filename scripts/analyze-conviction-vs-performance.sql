-- ============================================================================
-- CONVICTION SCORE VS TRADE PERFORMANCE ANALYSIS
-- 
-- This query analyzes how conviction scores correlate with win rates and ROI
-- across different price brackets and niches.
-- 
-- Conviction is calculated as: trade_value / trader_avg_trade_value
-- A conviction of 2.0x means the trade is 2x the trader's typical size
-- ============================================================================

-- ============================================================================
-- ANALYSIS 1: WIN RATE BY CONVICTION BUCKET (OVERALL)
-- ============================================================================
WITH trade_outcomes AS (
  SELECT
    -- Conviction z-score buckets (standardized)
    CASE 
      WHEN conviction_z_score < -2 THEN '1. Very Low (<-2σ)'
      WHEN conviction_z_score < -1 THEN '2. Low (-2σ to -1σ)'
      WHEN conviction_z_score < -0.5 THEN '3. Below Avg (-1σ to -0.5σ)'
      WHEN conviction_z_score < 0.5 THEN '4. Average (-0.5σ to 0.5σ)'
      WHEN conviction_z_score < 1 THEN '5. Above Avg (0.5σ to 1σ)'
      WHEN conviction_z_score < 2 THEN '6. High (1σ to 2σ)'
      ELSE '7. Very High (>2σ)'
    END as conviction_bucket,
    
    -- Also calculate conviction multiplier buckets
    CASE
      WHEN trade_size_log < 2 THEN 'A. Tiny (<$10)'
      WHEN trade_size_log < 3 THEN 'B. Small ($10-$100)'
      WHEN trade_size_log < 4 THEN 'C. Medium ($100-$1K)'
      WHEN trade_size_log < 5 THEN 'D. Large ($1K-$10K)'
      ELSE 'E. Whale (>$10K)'
    END as size_bucket,
    
    outcome,
    entry_price,
    final_niche,
    bet_structure
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10  -- Remove extreme outliers
    AND entry_price > 0.01 AND entry_price < 0.99
)

SELECT
  conviction_bucket,
  COUNT(*) as total_trades,
  COUNTIF(outcome = 'WON') as wins,
  COUNTIF(outcome = 'LOST') as losses,
  ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct,
  ROUND(AVG(entry_price) * 100, 1) as avg_entry_price_pct
FROM trade_outcomes
GROUP BY conviction_bucket
ORDER BY conviction_bucket;


-- ============================================================================
-- ANALYSIS 2: AGGREGATED VIEW - CONVICTION X PRICE BRACKET
-- Shows win rate in each cell
-- ============================================================================
WITH trade_outcomes AS (
  SELECT
    CASE 
      WHEN conviction_z_score < -1 THEN '1. Low (<-1σ)'
      WHEN conviction_z_score < 0 THEN '2. Below Avg'
      WHEN conviction_z_score < 1 THEN '3. Above Avg'
      ELSE '4. High (>1σ)'
    END as conviction_bucket,
    
    CASE 
      WHEN entry_price < 0.3 THEN 'Underdog (<30%)'
      WHEN entry_price < 0.5 THEN 'Low-Mid (30-50%)'
      WHEN entry_price < 0.7 THEN 'Mid-High (50-70%)'
      ELSE 'Favorite (>70%)'
    END as price_bracket,
    
    outcome
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10
    AND entry_price > 0.01 AND entry_price < 0.99
)

SELECT
  conviction_bucket,
  price_bracket,
  COUNT(*) as trades,
  ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct
FROM trade_outcomes
GROUP BY conviction_bucket, price_bracket
ORDER BY conviction_bucket, price_bracket;


-- ============================================================================
-- ANALYSIS 3: ROI BY CONVICTION BUCKET
-- ============================================================================
WITH trade_pnl AS (
  SELECT
    CASE 
      WHEN conviction_z_score < -1 THEN '1. Low (<-1σ)'
      WHEN conviction_z_score < 0 THEN '2. Below Avg'
      WHEN conviction_z_score < 1 THEN '3. Above Avg'
      ELSE '4. High (>1σ)'
    END as conviction_bucket,
    
    outcome,
    entry_price,
    -- PnL calculation
    CASE 
      WHEN outcome = 'WON' THEN (1.0 - entry_price) / entry_price
      ELSE -1.0
    END as roi_pct,
    
    EXP(trade_size_log) - 1 as trade_value_usd
    
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10
    AND entry_price > 0.01 AND entry_price < 0.99
)

SELECT
  conviction_bucket,
  COUNT(*) as total_trades,
  ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct,
  ROUND(AVG(roi_pct) * 100, 1) as avg_roi_pct,
  ROUND(SUM(trade_value_usd * roi_pct), 0) as total_pnl_usd,
  ROUND(SUM(trade_value_usd), 0) as total_invested_usd,
  ROUND(SAFE_DIVIDE(SUM(trade_value_usd * roi_pct), SUM(trade_value_usd)) * 100, 1) as weighted_roi_pct
FROM trade_pnl
GROUP BY conviction_bucket
ORDER BY conviction_bucket;


-- ============================================================================
-- ANALYSIS 4: FULL MATRIX - CONVICTION X PRICE X WIN RATE
-- Pivoted view with WR in each cell
-- ============================================================================
WITH trade_outcomes AS (
  SELECT
    CASE 
      WHEN conviction_z_score < -1 THEN '1_Low'
      WHEN conviction_z_score < 0 THEN '2_Below'
      WHEN conviction_z_score < 1 THEN '3_Above'
      ELSE '4_High'
    END as conv,
    
    CASE 
      WHEN entry_price < 0.3 THEN 'Under'
      WHEN entry_price < 0.5 THEN 'L_Mid'
      WHEN entry_price < 0.7 THEN 'H_Mid'
      ELSE 'Fav'
    END as price,
    
    outcome
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10
    AND entry_price > 0.01 AND entry_price < 0.99
)

SELECT
  conv as conviction,
  -- Pivot by price bracket
  CONCAT(
    ROUND(SAFE_DIVIDE(COUNTIF(price = 'Under' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Under'), 0)) * 100, 0),
    '% (', COUNTIF(price = 'Under'), ')'
  ) as underdog,
  CONCAT(
    ROUND(SAFE_DIVIDE(COUNTIF(price = 'L_Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'L_Mid'), 0)) * 100, 0),
    '% (', COUNTIF(price = 'L_Mid'), ')'
  ) as low_mid,
  CONCAT(
    ROUND(SAFE_DIVIDE(COUNTIF(price = 'H_Mid' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'H_Mid'), 0)) * 100, 0),
    '% (', COUNTIF(price = 'H_Mid'), ')'
  ) as high_mid,
  CONCAT(
    ROUND(SAFE_DIVIDE(COUNTIF(price = 'Fav' AND outcome = 'WON'), NULLIF(COUNTIF(price = 'Fav'), 0)) * 100, 0),
    '% (', COUNTIF(price = 'Fav'), ')'
  ) as favorite,
  CONCAT(
    ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 0),
    '% (', COUNT(*), ')'
  ) as total
FROM trade_outcomes
GROUP BY conv
ORDER BY conv;


-- ============================================================================
-- ANALYSIS 5: CONVICTION BY NICHE
-- Which niches perform best at high conviction?
-- ============================================================================
WITH trade_outcomes AS (
  SELECT
    final_niche,
    CASE 
      WHEN conviction_z_score < 0 THEN 'Low Conviction'
      ELSE 'High Conviction'
    END as conviction_level,
    outcome
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10
    AND entry_price > 0.01 AND entry_price < 0.99
    AND final_niche IS NOT NULL
)

SELECT
  final_niche,
  -- Low conviction stats
  COUNTIF(conviction_level = 'Low Conviction') as low_conv_trades,
  ROUND(SAFE_DIVIDE(
    COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
    NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
  ) * 100, 1) as low_conv_wr,
  
  -- High conviction stats  
  COUNTIF(conviction_level = 'High Conviction') as high_conv_trades,
  ROUND(SAFE_DIVIDE(
    COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
    NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
  ) * 100, 1) as high_conv_wr,
  
  -- Difference (does high conviction help?)
  ROUND(
    SAFE_DIVIDE(
      COUNTIF(conviction_level = 'High Conviction' AND outcome = 'WON'),
      NULLIF(COUNTIF(conviction_level = 'High Conviction'), 0)
    ) -
    SAFE_DIVIDE(
      COUNTIF(conviction_level = 'Low Conviction' AND outcome = 'WON'),
      NULLIF(COUNTIF(conviction_level = 'Low Conviction'), 0)
    ), 0.001
  ) * 100 as wr_diff_pct
  
FROM trade_outcomes
GROUP BY final_niche
HAVING COUNT(*) >= 1000  -- Only niches with enough data
ORDER BY high_conv_trades DESC
LIMIT 20;


-- ============================================================================
-- ANALYSIS 6: PERFORMANCE REGIME + CONVICTION
-- Does conviction matter more when trader is HOT vs COLD?
-- ============================================================================
WITH trade_outcomes AS (
  SELECT
    performance_regime,
    CASE 
      WHEN conviction_z_score < 0 THEN 'Below Avg'
      ELSE 'Above Avg'
    END as conviction_level,
    outcome
  FROM `polycopy_v1.enriched_trades_training_v11`
  WHERE conviction_z_score IS NOT NULL
    AND conviction_z_score BETWEEN -10 AND 10
    AND entry_price > 0.01 AND entry_price < 0.99
    AND performance_regime IS NOT NULL
)

SELECT
  performance_regime,
  conviction_level,
  COUNT(*) as trades,
  ROUND(SAFE_DIVIDE(COUNTIF(outcome = 'WON'), COUNT(*)) * 100, 1) as win_rate_pct
FROM trade_outcomes
GROUP BY performance_regime, conviction_level
ORDER BY performance_regime, conviction_level;
