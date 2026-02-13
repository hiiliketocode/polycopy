-- =============================================================================
-- FIX: TRADER_FEATHER missing target_trader + reset stale sync times
-- =============================================================================
-- 1. TRADER_FEATHER had no target_trader configured, so the sync skipped all
--    trades for it (TRADER_* wallets fail-closed without a target_trader).
-- 2. 70+ wallets haven't synced in 30+ hours because the sync loop had no
--    per-wallet error handling — one wallet failure killed all remaining wallets.
--    Reset last_sync_time to 48h ago so they catch up on new trades.
-- =============================================================================

-- Fix TRADER_FEATHER: set target_trader from its existing order history
UPDATE public.ft_wallets
SET detailed_description = '{"target_trader":"0x113d4c0b5a6702ab045ea2cba7c3f71d51fc3ce8","target_trader_name":"feather"}',
    updated_at = NOW()
WHERE wallet_id = 'TRADER_FEATHER'
  AND (detailed_description IS NULL OR detailed_description = '');

-- Fix TRADER_WBS: also missing target_trader (has NULL detailed_description)
-- Skip for now since we don't know the target trader address. The wallet will
-- harmlessly skip trades until configured.

-- Reset stale sync times: wallets stuck at 30h+ ago get reset to 48h ago
-- so they pick up recent trades without re-processing ancient history.
UPDATE public.ft_wallets
SET last_sync_time = NOW() - INTERVAL '48 hours',
    updated_at = NOW()
WHERE is_active = TRUE
  AND last_sync_time IS NOT NULL
  AND last_sync_time < NOW() - INTERVAL '6 hours';
