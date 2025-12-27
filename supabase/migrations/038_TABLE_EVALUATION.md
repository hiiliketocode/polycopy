# Migration 038: Table Evaluation & Decisions

## Evaluation Results

### 1. wallet_poll_state
**Decision**: ✅ **KEEP** (removed `tier` column)

**Required for correctness**: 
- `last_position_check_at` - **REQUIRED** - Cannot detect position changes without knowing when we last checked. Cannot be derived.

**Optional but recommended**:
- `last_trade_time_seen` - Can be derived from `trades_public` with `MAX(trade_timestamp)`, but this is expensive. Small storage cost vs query efficiency trade-off.

**Removed**:
- `tier` - Can be derived dynamically from `follows` table (hot = those in follows, cold = all others)

---

### 2. positions_current
**Decision**: ✅ **KEEP** - Required for correctness

**Why required**: Position changes (closes, size changes) can only be detected by comparing current API snapshot with previous snapshot. Cannot derive from `trades_public` because:
- Positions may have been opened before we started tracking
- Partial closes may not create new trades
- Manual closes may not be immediately visible in trade history

---

### 3. positions_closed
**Decision**: ⚠️ **KEEP** (marked as optional)

**Why optional**: Worker detects closes correctly via `positions_current` comparison. Storing permanently is for:
- Historical analytics
- Debugging position close patterns
- Querying close reasons over time

**Trade-off if removed**: Lose analytics/debugging capabilities, but worker functions correctly.

**Keying fix**: Changed from `(wallet_address, market_id, closed_at)` composite PK to `id BIGSERIAL` PK + unique index. Rationale: Allows multiple close events if a position reopens and closes again (handles edge cases better).

---

### 4. job_locks
**Decision**: ✅ **KEEP** - Required for correctness

**Why required**: Prevents overlapping cold worker runs across deploys/restarts. Without this, concurrent instances could run simultaneously.

**Locking fix**: Fixed `acquire_job_lock()` to use atomic `INSERT ... ON CONFLICT DO UPDATE WHERE` pattern instead of read-then-write.

---

## Final Schema

### Required (3 tables)
1. `wallet_poll_state` - Position check tracking
2. `positions_current` - Current position snapshots  
3. `job_locks` - Distributed locking

### Optional (1 table)
1. `positions_closed` - Historical position closes (kept for analytics)

## Indexes (simplified, no redundancies)

- `wallet_poll_state`: `updated_at` (for monitoring)
- `positions_current`: `wallet_address` (for lookups by wallet)
- `positions_closed`: `wallet_address`, `closed_at` (for time-based queries)
- `job_locks`: Primary key only (lookups by job_name)

## Architecture Assumptions (Documented in Migration)

- Workers are always-on Node processes (NOT cron, NOT serverless)
- No ephemeral in-memory cursors; all state persisted
- Position state tracked via snapshots, NOT derived from trades
- Hot/cold tier derived dynamically from `follows` table

