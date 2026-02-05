-- Migration: Add resolved stats columns to trader stats tables
-- These columns enable proper ROI calculation by tracking:
-- 1. Resolved trade counts (for accurate win rate denominators)
-- 2. Resolved invested amounts (for accurate ROI calculation)
--
-- Background: The previous calculation divided PnL (from resolved trades only)
-- by total invested (from ALL trades including unresolved), which diluted ROI.
-- The fix is to use resolved_invested as the ROI denominator.

-- ============================================================================
-- Add columns to trader_global_stats
-- ============================================================================

-- Resolved trade counts
ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS l_resolved_count INTEGER DEFAULT 0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d30_resolved_count INTEGER DEFAULT 0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d7_resolved_count INTEGER DEFAULT 0;

-- Resolved invested amounts (for proper ROI calculation)
ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS l_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d30_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d7_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

-- Total invested (for reference/context)
ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS l_total_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d30_total_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_global_stats 
ADD COLUMN IF NOT EXISTS d7_total_invested_usd DOUBLE PRECISION DEFAULT 0.0;

-- ============================================================================
-- Add columns to trader_profile_stats
-- ============================================================================

-- Resolved trade counts
ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS l_resolved_count INTEGER DEFAULT 0;

ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS d30_resolved_count INTEGER DEFAULT 0;

ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS d7_resolved_count INTEGER DEFAULT 0;

-- Resolved invested amounts (for proper ROI calculation)
ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS l_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS d30_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

ALTER TABLE trader_profile_stats 
ADD COLUMN IF NOT EXISTS d7_resolved_invested_usd DOUBLE PRECISION DEFAULT 0.0;

-- ============================================================================
-- Add comments explaining the columns
-- ============================================================================

COMMENT ON COLUMN trader_global_stats.l_resolved_count IS 'Lifetime count of resolved (closed) trades - used for accurate win rate calculation';
COMMENT ON COLUMN trader_global_stats.d30_resolved_count IS '30-day count of resolved trades';
COMMENT ON COLUMN trader_global_stats.d7_resolved_count IS '7-day count of resolved trades';
COMMENT ON COLUMN trader_global_stats.l_resolved_invested_usd IS 'Lifetime USD invested in resolved trades only - used as ROI denominator';
COMMENT ON COLUMN trader_global_stats.d30_resolved_invested_usd IS '30-day USD invested in resolved trades only';
COMMENT ON COLUMN trader_global_stats.d7_resolved_invested_usd IS '7-day USD invested in resolved trades only';
COMMENT ON COLUMN trader_global_stats.l_total_invested_usd IS 'Lifetime total USD invested (all trades) - for reference';
COMMENT ON COLUMN trader_global_stats.d30_total_invested_usd IS '30-day total USD invested (all trades)';
COMMENT ON COLUMN trader_global_stats.d7_total_invested_usd IS '7-day total USD invested (all trades)';

COMMENT ON COLUMN trader_profile_stats.l_resolved_count IS 'Lifetime count of resolved trades for this profile';
COMMENT ON COLUMN trader_profile_stats.d30_resolved_count IS '30-day count of resolved trades for this profile';
COMMENT ON COLUMN trader_profile_stats.d7_resolved_count IS '7-day count of resolved trades for this profile';
COMMENT ON COLUMN trader_profile_stats.l_resolved_invested_usd IS 'Lifetime USD invested in resolved trades for this profile';
COMMENT ON COLUMN trader_profile_stats.d30_resolved_invested_usd IS '30-day USD invested in resolved trades for this profile';
COMMENT ON COLUMN trader_profile_stats.d7_resolved_invested_usd IS '7-day USD invested in resolved trades for this profile';
