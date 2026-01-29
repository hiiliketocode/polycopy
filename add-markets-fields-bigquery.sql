-- ============================================================================
-- Migration: Add missing Dome API fields to BigQuery markets table
-- Purpose: Add volume, risk, title, description, tags, timestamps, and other
--          fields from Dome API that are currently missing
-- Date: January 29, 2026
-- ============================================================================

-- Add text fields
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS title STRING,
  ADD COLUMN IF NOT EXISTS description STRING,
  ADD COLUMN IF NOT EXISTS resolution_source STRING,
  ADD COLUMN IF NOT EXISTS image STRING,
  ADD COLUMN IF NOT EXISTS negative_risk_id STRING,
  ADD COLUMN IF NOT EXISTS game_start_time_raw STRING;

-- Add volume fields
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS volume_1_week FLOAT64,
  ADD COLUMN IF NOT EXISTS volume_1_month FLOAT64,
  ADD COLUMN IF NOT EXISTS volume_1_year FLOAT64,
  ADD COLUMN IF NOT EXISTS volume_total FLOAT64;

-- Add timestamp fields
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS close_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS game_start_time TIMESTAMP;

-- Add unix timestamp fields (for easier querying)
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS start_time_unix INT64,
  ADD COLUMN IF NOT EXISTS end_time_unix INT64,
  ADD COLUMN IF NOT EXISTS completed_time_unix INT64,
  ADD COLUMN IF NOT EXISTS close_time_unix INT64;

-- Add JSON fields (side_a, side_b, tags)
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS side_a JSON,
  ADD COLUMN IF NOT EXISTS side_b JSON,
  ADD COLUMN IF NOT EXISTS tags JSON;

-- Add market_type for classification
ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.markets`
  ADD COLUMN IF NOT EXISTS market_type STRING;
