-- Migration: 038_worker_polling_system
-- Purpose: Minimal schema for Fly.io hot/cold worker polling system
--
-- Architecture assumptions (explicitly documented to prevent future breakage):
-- - Workers are always-on Node processes on Fly.io (NOT cron, NOT serverless)
-- - No ephemeral in-memory cursors; all state persisted to database
-- - Position state is tracked via snapshots, NOT derived solely from trades
-- - Hot wallets are those in the 'follows' table (derived dynamically)
-- - Cold wallets are all other active traders (derived dynamically)

-- ============================================================
-- wallet_poll_state: REQUIRED for position change detection
-- ============================================================
-- Purpose: Tracks when we last checked positions for each wallet.
--          Position changes (closed, size changed) can only be detected
--          by comparing current API snapshot with previous snapshot.
--          This timestamp tells us when we last took a snapshot.
--
-- last_trade_time_seen: Optional but recommended watermark to avoid
--                       reprocessing old trades on restart. Could be derived
--                       from trades_public but requires expensive MAX() query.
--                       Trade-off: Small storage cost vs query efficiency.

CREATE TABLE IF NOT EXISTS wallet_poll_state (
  wallet_address TEXT PRIMARY KEY,
  last_trade_time_seen TIMESTAMPTZ,  -- Watermark for trade polling (optional but recommended)
  last_position_check_at TIMESTAMPTZ NOT NULL,  -- REQUIRED: Last position snapshot timestamp
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_poll_state_updated ON wallet_poll_state(updated_at);

COMMENT ON TABLE wallet_poll_state IS 'Polling state per wallet. last_position_check_at is required for position change detection. last_trade_time_seen is a performance optimization to avoid reprocessing trades.';

-- ============================================================
-- positions_current: REQUIRED for position change detection
-- ============================================================
-- Purpose: Snapshot of currently open positions. Required to detect when
--          positions close or change size. Without this, we cannot reliably
--          detect position changes (especially manual closes that don't
--          correspond to new trades).
--
-- This is NOT derived from trades_public because:
-- - Positions may have been opened before we started tracking
-- - Position size changes via partial closes may not create new trades
-- - Manual closes may not be visible in trade history immediately

CREATE TABLE IF NOT EXISTS positions_current (
  wallet_address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  size NUMERIC,
  redeemable BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,
  PRIMARY KEY (wallet_address, market_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_current_wallet ON positions_current(wallet_address);

COMMENT ON TABLE positions_current IS 'REQUIRED: Current snapshot of open positions. Used to detect position changes (closes, size changes) by comparing with API snapshot.';

-- ============================================================
-- positions_closed: OPTIONAL for analytics/debugging
-- ============================================================
-- Purpose: Historical record of closed positions with reason classification.
--          The worker needs to detect position closes (via positions_current
--          comparison), but storing them permanently is optional.
--
-- Trade-off if removed: Lose ability to query historical position closes
--                       and reason classification. Worker still functions correctly.

CREATE TABLE IF NOT EXISTS positions_closed (
  id BIGSERIAL PRIMARY KEY,  -- Surrogate key allows multiple close events for same wallet/market
  wallet_address TEXT NOT NULL,
  market_id TEXT NOT NULL,
  closed_reason TEXT NOT NULL CHECK (closed_reason IN ('manual_close', 'market_closed', 'redeemed')),
  closed_at TIMESTAMPTZ NOT NULL,
  raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_positions_closed_wallet ON positions_closed(wallet_address);
CREATE INDEX IF NOT EXISTS idx_positions_closed_market ON positions_closed(market_id);
CREATE INDEX IF NOT EXISTS idx_positions_closed_at ON positions_closed(closed_at);

-- Prevent duplicate closure records within the same millisecond (unlikely but possible)
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_closed_unique ON positions_closed(wallet_address, market_id, closed_at);

COMMENT ON TABLE positions_closed IS 'OPTIONAL: Historical record of closed positions. Worker detects closes correctly without this, but this enables analytics/debugging.';

-- ============================================================
-- job_locks: REQUIRED for cold worker correctness
-- ============================================================
-- Purpose: Prevents overlapping cold worker runs across deploys/restarts.
--          Cold worker runs hourly and must not run concurrently.

CREATE TABLE IF NOT EXISTS job_locks (
  job_name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE job_locks IS 'REQUIRED: Distributed locks to prevent overlapping cold worker runs. Uses TTL-based locking (locked_until).';

-- ============================================================
-- RPC: acquire_job_lock (FIXED: Atomic lock acquisition)
-- ============================================================
-- Previous implementation had a race condition (read-then-write).
-- This version uses a single atomic statement with ON CONFLICT.
-- Returns TRUE only if lock was successfully acquired.

CREATE OR REPLACE FUNCTION acquire_job_lock(
  p_job_name TEXT,
  p_locked_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Atomic INSERT/UPDATE: Insert new lock, or update if expired
  -- WHERE clause in ON CONFLICT DO UPDATE filters: only update if lock is expired
  WITH updated AS (
    INSERT INTO job_locks (job_name, locked_until, locked_at)
    VALUES (p_job_name, p_locked_until, NOW())
    ON CONFLICT (job_name) 
    DO UPDATE SET
      locked_until = p_locked_until,
      locked_at = NOW()
    WHERE job_locks.locked_until < NOW()  -- Only update if lock expired
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;
  
  -- If count > 0, lock was acquired (either inserted new or updated expired lock)
  RETURN v_updated_count > 0;
END;
$$;

COMMENT ON FUNCTION acquire_job_lock IS 'Atomically acquire job lock if available (lock expired or doesn''t exist). Returns TRUE if acquired, FALSE if held by another process. Uses single-statement atomic operation with ON CONFLICT DO UPDATE WHERE.';
