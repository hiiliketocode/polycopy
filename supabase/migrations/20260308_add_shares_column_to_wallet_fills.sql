-- ============================================================================
-- Migration: Add shares column to trades table
-- Purpose: Add missing shares field (raw integer shares) from Dome API
-- Date: March 8, 2025
-- ============================================================================
-- 
-- The trades table (formerly wallet_fills) was created without the shares column.
-- This migration adds it to match the complete Dome API response structure.
-- ============================================================================

-- Add shares column (raw integer shares from Dome API)
-- Works for both wallet_fills (if not renamed yet) and trades (if renamed)
DO $$
BEGIN
  -- Try trades table first (if renamed)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trades') THEN
    ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS shares NUMERIC(18,0);
    COMMENT ON COLUMN public.trades.shares IS 'Raw shares (integer) from Dome API shares field.';
  -- Fallback to wallet_fills (if not renamed yet)
  ELSIF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_fills') THEN
    ALTER TABLE public.wallet_fills ADD COLUMN IF NOT EXISTS shares NUMERIC(18,0);
    COMMENT ON COLUMN public.wallet_fills.shares IS 'Raw shares (integer) from Dome API shares field.';
  ELSE
    RAISE EXCEPTION 'Neither trades nor wallet_fills table exists';
  END IF;
END $$;
