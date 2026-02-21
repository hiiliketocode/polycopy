# Supabase Resource Optimization Plan

**Date:** February 20, 2026
**Instance:** Medium (2 CPU cores, 4 GB RAM, 347 Mbps baseline disk IO)

---

## The Situation

As of February 20, one day after upgrading to Medium compute:

- **Disk IO Budget: fully exhausted** — spiking to ~100% on Feb 19–20
- **CPU: sustained 75–80%+** across the last 4 days
- **Memory: 60–80%** utilization and climbing

A Medium instance should comfortably serve an app at our stage. The fact that we're already maxing it out indicates the workload itself needs optimization, not another compute upgrade.

---

## What's Using the Resources

### 1. `backfill-wallet-pnl` — Daily at 2:00 AM UTC (highest impact)

This cron is the foundation of our PnL tracking. It populates `wallet_realized_pnl_daily`, which feeds:

| Feature | How it uses the data |
|---|---|
| Trader profile PnL charts | Daily + cumulative realized PnL series |
| Trader rankings / percentiles | `wallet_realized_pnl_rankings` materialized view |
| Discover page sparklines | Batch sparkline API reads from the daily table |
| "Yesterday's Winners" | Top wallets by 1D PnL from rankings |
| Portfolio realized PnL | User's own PnL chart + period summaries |
| Bot "hot hands" strategies | `rotate-pnl-winners` (3 AM) picks top 10 traders by PnL to auto-copy |
| Per-order PnL on copy trades | `syncOrderPnl` enriches the `orders` table |

**How it works today:**

1. Collects wallets from 4 sources: `traders` table, active `follows`, distinct wallets from `trades_public` (via RPC), distinct wallets from `orders` (via RPC)
2. Deduplicates → processes each wallet sequentially (250ms sleep between)
3. For each wallet:
   - Checks if latest date is yesterday or today → skips if up to date
   - Fetches up to 5,000 closed positions from Polymarket API (6 parallel batches of 50)
   - Fetches open positions
   - Derives daily PnL rows and upserts in batches of 500
   - Queries up to 1,000 orders per wallet, matches to positions, updates in batches of 25
   - Fetches leaderboard metrics and updates the `traders` table

**Why it's expensive:**

- The two wallet-list RPC functions (`get_distinct_trader_wallets_from_trades_public`, `get_distinct_copied_trader_wallets_from_orders`) do `SELECT DISTINCT` with `LOWER(TRIM(...))` across full tables — sequential scans
- Even "up to date" wallets require a DB read to check their latest date
- Wallets that aren't up to date get a full re-fetch of all positions (not incremental)
- The order sync does up to 1,000 reads + many individual updates per wallet
- The entire process runs within a single Vercel function (5 min timeout), so it races to process as many wallets as possible, generating burst load

### 2. High-frequency crons — cumulative baseline load

| Cron | Schedule | What it does |
|---|---|---|
| `lt-execute` | Every 2 min | Executes live-trading strategies |
| `lt-sync-order-status` | Every 2 min | Syncs order statuses |
| `lt-resolve` | Every 5 min | Resolves completed LT orders |
| `ft-resolve` | Every 10 min | Resolves forward-test positions |
| `ft-snapshot` | Hourly | Snapshots FT wallet states |

These run 24/7 and never let the DB idle. Each one queries and writes to the database, creating a constant background CPU/IO drain.

### 3. Materialized view refresh — Daily at 3:00 AM UTC

`wallet_realized_pnl_rankings` is a materialized view that cross-joins the entire `wallet_realized_pnl_daily` table across 6 time windows (1D, 7D, 30D, 3M, 6M, ALL), ranks every wallet, then refreshes concurrently. This is a heavy operation that runs right after the backfill finishes — stacking load on top of load.

### 4. Missing indexes and inefficient query patterns

- `.ilike()` on `wallet_address` columns (case-insensitive search without functional indexes) in portfolio stats, notification checks, and other routes
- Unbounded queries (no `.limit()`) in portfolio stats, admin summaries
- N+1 patterns in LT strategy status (loops through strategies, one count query each)

---

## Recommended Fixes

### Tier 1 — Quick wins (hours, not days)

**A. Add missing indexes**

The wallet-list RPC functions scan full tables. Adding indexes eliminates sequential scans:

```sql
-- Speed up the RPC that builds the wallet list from trades_public
CREATE INDEX IF NOT EXISTS idx_trades_public_trader_wallet_lower
  ON trades_public (LOWER(TRIM(trader_wallet)))
  WHERE trader_wallet IS NOT NULL;

-- Speed up the RPC that builds the wallet list from orders
CREATE INDEX IF NOT EXISTS idx_orders_copied_trader_wallet_lower
  ON orders (LOWER(TRIM(copied_trader_wallet)))
  WHERE copied_trader_wallet IS NOT NULL;

-- Speed up .ilike() queries on wallet_address throughout the app
CREATE INDEX IF NOT EXISTS idx_traders_wallet_address_lower
  ON traders (LOWER(wallet_address));
```

**B. Add `.limit()` to unbounded queries**

- `app/api/portfolio/stats/route.ts` — fetches all orders for a user with no limit
- `app/api/admin/portfolio-summary/route.ts` — fetches all users with no limit

**C. Fix N+1 in LT status**

Replace the per-strategy count loop in `app/api/lt/status/route.ts` with a single query using `.in('strategy_id', ids)` and group by.

### Tier 2 — Backfill optimization (1–2 days)

**D. Make the backfill incremental**

Instead of re-fetching all 5,000 positions for a wallet, only fetch positions newer than the wallet's latest date. The Polymarket API supports `sortBy=TIMESTAMP&sortDirection=DESC`, so we can stop paginating once we hit positions we've already recorded.

Impact: Reduces both Polymarket API calls and Supabase upsert volume by ~90% for wallets with existing history.

**E. Batch the order sync**

Replace the current pattern (query 1,000 orders, then update individually in batches of 25) with a single bulk upsert or a Postgres function that does the matching server-side.

**F. Cache the wallet list**

The four-source wallet union can be computed once and cached (in a `backfill_wallet_queue` table or similar), rather than running two full-table `SELECT DISTINCT` operations at the start of every backfill.

**G. Stagger the nightly load**

Currently at 2 AM–3 AM UTC:
- 2:00 — `backfill-wallet-pnl` (heavy writes)
- 3:00 — `wallet_realized_pnl_rankings` refresh (heavy reads of same table)
- 3:00 — `rotate-pnl-winners` (reads rankings)

The materialized view refresh and the backfill compete for the same table. Adding a buffer (e.g., move rankings refresh to 4 AM) gives the DB time to settle between operations.

### Tier 3 — Architectural improvements (longer term)

**H. Tiered backfill frequency**

Not all wallets need daily updates:
- **Tier 1 (daily):** Wallets users are actively following, wallets in active bot strategies
- **Tier 2 (weekly):** Wallets in the `traders` leaderboard but not actively followed
- **Tier 3 (on-demand):** Everything else — backfill only when someone visits the trader page

This could reduce the nightly wallet count by 50–80%.

**I. Move backfill off Vercel**

The backfill is constrained by Vercel's 5-minute function timeout, which forces it to rush. Running it on a dedicated worker (Fly.io, which we already use for some workers) removes the time pressure, allows for proper rate limiting, and decouples it from the serving infrastructure.

**J. Replace the materialized view with incremental updates**

Instead of refreshing the entire `wallet_realized_pnl_rankings` view (which recomputes ranks for every wallet across 6 windows), maintain a regular table and update only the rows affected by the day's backfill.

**K. Reduce high-frequency cron load**

Evaluate whether `lt-execute` and `lt-sync-order-status` truly need to run every 2 minutes. If these could run every 5 minutes instead, that's 60% fewer cron invocations per hour.

---

## Impact Estimate

| Fix | Disk IO reduction | CPU reduction | Effort |
|---|---|---|---|
| A. Missing indexes | Medium | Medium | ~1 hour |
| B. Unbounded query limits | Low | Low | ~30 min |
| C. N+1 fix | Low | Low | ~30 min |
| D. Incremental backfill | **High** | **High** | ~4 hours |
| E. Batch order sync | Medium | Medium | ~2 hours |
| F. Cache wallet list | Medium | Low | ~1 hour |
| G. Stagger nightly load | Medium | Low | ~15 min |
| H. Tiered backfill | **High** | **High** | ~1 day |
| I. Move to worker | Medium | Medium | ~1 day |
| J. Incremental rankings | Medium | **High** | ~1 day |
| K. Reduce cron frequency | Low–Medium | Low–Medium | ~15 min |

**Doing A + D + G alone would likely bring the instance well within its resource budget.**

---

## What Happens If We Do Nothing

- Disk IO will remain exhausted, meaning the database falls back to baseline 347 Mbps throughput (no bursting). This makes all queries slower for all users, all the time.
- As the wallet list grows (more users, more traders, more copy trades), the backfill takes longer, upserts more rows, and the materialized view refresh gets heavier.
- The next step would be upgrading to Large compute ($100+/mo more), which buys time but doesn't fix the underlying inefficiency.
