-- ============================================================================
-- Migration: Remove Redundant Classification Columns
-- Purpose: Remove final_type and final_subtype columns (redundant with 
--          market_type and market_subtype)
-- Date: February 4, 2026
-- ============================================================================
-- These columns are redundant:
--   - final_type is redundant with market_type
--   - final_subtype is redundant with market_subtype
-- The app uses: market_type, market_subtype, final_niche (alias for market_subtype), bet_structure

ALTER TABLE public.markets
  DROP COLUMN IF EXISTS final_type,
  DROP COLUMN IF EXISTS final_subtype;

-- Note: final_niche is kept as it's explicitly used by trader_profile_stats table
-- and serves as an alias for market_subtype
