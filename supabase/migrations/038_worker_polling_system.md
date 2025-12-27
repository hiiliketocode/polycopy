# Migration 038: Worker Polling System - Table Evaluation

## Table Evaluation Summary

### 1. wallet_poll_state
**Status**: ✅ **REQUIRED** (with one optional column)

**Purpose**: Tracks polling state per wallet to enable position change detection and efficient trade watermarking.

**Columns**:
- `wallet_address` (PK): ✅ Required
- `last_position_check_at`: ✅ **REQUIRED** - Cannot detect position changes without knowing when we last checked. Cannot be derived from trades_public.
- `last_trade_time_seen`: ⚠️ **Optional but recommended** - Can be derived from `trades_public` with `MAX(trade_timestamp) WHERE trader_wallet = ?`, but this is expensive. Small storage cost vs query efficiency trade-off.
- `tier`: ❌ **REMOVED** - Can be derived dynamically from `follows` table. Hot wallets = those in follows, cold wallets = all others.

**Decision**: Keep table, remove `tier` column.

---

### 2. positions_current
**Status**: ✅ **REQUIRED**

**Purpose**: Snapshot of currently open positions. Required to detect position changes (closes, size changes).

**Why not derive from trades_public?**
- Positions may have been opened before we started tracking
- Position size changes via partial closes may not create new trades
- Manual closes may not be immediately visible in trade history
- Need to compare current API snapshot with previous snapshot to detect changes

**Decision**: Keep table - essential for correctness.

---

### 3. positions_closed
**Status**: ⚠️ **OPTIONAL** (kept for analytics/debugging)

**Purpose**: Historical record of closed positions with reason classification.

**Trade-off if removed**:
- ✅ Worker still functions correctly (detects closes via positions_current comparison)
- ❌ Lose ability to query historical position closes and reason classification
- ❌ Lose ability to analyze close patterns over time

**Decision**: Keep table but mark as optional in comments. Useful for debugging and analytics. Added surrogate `id` PK to handle multiple close events.

---

### 4. job_locks
**Status**: ✅ **REQUIRED**

**Purpose**: Prevents overlapping cold worker runs across deploys/restarts.

**Why required**: Without this, if we deploy or restart the cold worker, we could have two instances running simultaneously, causing duplicate processing.

**Decision**: Keep table - essential for correctness. Fixed locking function to be atomic.

---

## Final Schema

### Required Tables (3)
1. `wallet_poll_state` - Position check tracking (last_position_check_at required)
2. `positions_current` - Current position snapshots (required for change detection)
3. `job_locks` - Distributed locking (required for cold worker correctness)

### Optional Tables (1)
1. `positions_closed` - Historical position closes (kept for analytics/debugging)

## What We Are NOT Doing

Explicitly documented in migration comments:
- ❌ NOT using cron tables or schedules (workers are always-on)
- ❌ NOT relying on ephemeral in-memory cursors (all state persisted)
- ❌ NOT deriving position state purely from trades (uses position snapshots)
- ❌ NOT storing tier (derived dynamically from follows table)

## Correctness Guarantees

1. **Cold worker cannot double-run**: Atomic lock acquisition via `acquire_job_lock()`
2. **Hot worker restart-safe**: `last_trade_time_seen` watermark persisted (optional but recommended for efficiency)
3. **Position changes detectable**: `last_position_check_at` required, `positions_current` snapshot required
4. **No duplicate trades**: Existing `trades_public` unique constraint on `trade_id`

