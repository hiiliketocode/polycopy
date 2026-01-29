-- ============================================================================
-- Migration: Add missing Dome API fields to BigQuery trades table
-- Purpose: Add order_hash, taker, market_slug, title fields from Dome API
-- Date: January 29, 2026
-- ============================================================================

-- Add missing trade fields from Dome API
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.trades`
  ADD COLUMN IF NOT EXISTS order_hash STRING,
  ADD COLUMN IF NOT EXISTS taker STRING,
  ADD COLUMN IF NOT EXISTS market_slug STRING,
  ADD COLUMN IF NOT EXISTS title STRING;
