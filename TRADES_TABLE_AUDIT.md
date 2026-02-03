# Trades Table Audit Report

**Date:** January 29, 2026  
**Purpose:** Determine if `public.trades` table is still needed or can be deleted

## Executive Summary

The `trades` table is **ACTIVELY USED** but has some **BROKEN API ENDPOINTS** that reference it incorrectly. The table serves as:
1. **Source of truth** for raw Dome API fill events
2. **Data source** for derived tables (`top5_traders_trades`, `top50_traders_trades`)
3. **Input** for aggregation functions (`wallet_realized_pnl_daily`)
4. **Reference** for market queue population

**Recommendation:** **DO NOT DELETE** - The table is critical infrastructure, but fix the broken endpoints.

---

## Table Schema

From migration `20260316_add_trade_uid_to_trades.sql`:

```sql
CREATE TABLE public.trades (
  id UUID PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares_normalized NUMERIC(18, 6) NOT NULL,
  price NUMERIC(18, 8) NOT NULL,
  token_id TEXT,
  token_label TEXT,
  condition_id TEXT,
  market_slug TEXT,
  title TEXT,
  tx_hash TEXT NOT NULL,
  order_hash TEXT,
  taker TEXT,
  source TEXT NOT NULL DEFAULT 'dome',
  raw JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trade_uid TEXT GENERATED ALWAYS AS (COALESCE(order_hash, 'tx:' || tx_hash)) STORED
);
```

**Note:** This table does NOT have columns like `order_id`, `trader_id`, `market_id`, `outcome`, `order_type`, `size`, `filled_size`, `remaining_size`, `status`, `updated_at`.

---

## Active Usage (KEEP THESE)

### 1. **Ingestion Pipeline** ✅ CRITICAL
- **File:** `lib/ingestion/wallet-fills.ts`
- **Usage:** Writes raw Dome API fill events to `trades` table
- **Status:** Active - this is the primary ingestion point

### 2. **PolyScore Function** ✅ ACTIVE
- **File:** `supabase/functions/get-polyscore/index.ts` (line 170)
- **Usage:** Queries trades for recent trader actions on a condition
- **Query:** `SELECT side, price, shares_normalized, timestamp FROM trades WHERE wallet_address = ? AND condition_id = ?`

### 3. **Admin Dashboard** ✅ ACTIVE
- **File:** `app/admin/i-wish-id-copied-that/page.tsx` (line 190)
- **Usage:** Admin page queries recent BUY trades
- **Query:** `SELECT id, wallet_address, timestamp, side, shares_normalized, price, token_label, condition_id, market_slug, title FROM trades WHERE timestamp >= ? AND side = 'BUY'`

### 4. **Derived Tables** ✅ ACTIVE
- **Tables:** `top5_traders_trades`, `top50_traders_trades`
- **Usage:** Copies of trades table filtered to top traders for ML/analysis
- **Created by:** Migrations `20260126_create_top5_traders_trades.sql` and `20260127_create_top50_traders_trades.sql`
- **Dependency:** These tables are created via `LIKE public.trades INCLUDING ALL` and populated from `trades`

### 5. **Views** ✅ ACTIVE
- **View:** `trades_with_timing`
- **File:** Migration `20260126_add_trade_timing_columns.sql` (line 159)
- **Usage:** View that joins trades with timing calculations
- **Dependency:** `FROM public.trades t`

### 6. **Aggregation Functions** ✅ ACTIVE
- **Table:** `wallet_realized_pnl_daily`
- **File:** Migration `20260315_add_fill_aggregates_to_wallet_realized_pnl_daily.sql`
- **Usage:** Stores daily aggregates derived from trades table
- **Comment:** "Fill aggregates are derived from public.trades (Dome fills)"

### 7. **Market Queue Functions** ⚠️ BACKFILL ONLY (NOT PRODUCTION)
- **Functions:** 
  - `enqueue_market_fetch_queue_from_trades()`
  - `enqueue_market_fetch_queue_from_trades_page()`
- **Files:** Migrations `20260317_add_market_queue_enqueue_function.sql` and `20260317_add_market_queue_enqueue_page_function.sql`
- **Usage:** Populates market fetch queue with distinct condition_ids from trades
- **Query:** `SELECT DISTINCT condition_id FROM public.trades WHERE condition_id IS NOT NULL`
- **Used By:** ONLY `scripts/backfill-dome-markets.js` (backfill script, NOT production)
- **Alternative:** Can populate queue from `markets` table directly or fetch markets on-demand without queue

### 8. **Backfill Scripts** ✅ ACTIVE
- **Files:** Multiple scripts in `scripts/` directory
- **Usage:** Various backfill and analysis scripts query trades table
- **Examples:**
  - `scripts/backfill-top50-traders-trades.js`
  - `scripts/backfill-top5-traders-latest-trades.js`
  - `scripts/populate-top50-traders-trades.js`
  - `workers/worker-top5-traders.js`

---

## Broken Usage (FIX THESE)

### 1. **Portfolio API Endpoint** ❌ BROKEN
- **File:** `app/api/portfolio/route.ts` (line 241)
- **Issue:** Queries `trades` table with columns that don't exist
- **Broken Query:**
  ```typescript
  .from('trades')
  .select('order_id, market_id, outcome, side, order_type, price, size, filled_size, remaining_size, status, created_at, updated_at')
  .eq('trader_id', trader.id)
  ```
- **Problem:** 
  - `trades` table doesn't have: `order_id`, `market_id`, `outcome`, `order_type`, `size`, `filled_size`, `remaining_size`, `status`, `updated_at`, `trader_id`
  - Comment says "Orders table renamed to trades in migration 022" - this is incorrect
- **Fix:** Should query `orders_copy_enriched` instead (which is what `/app/api/portfolio/trades/route.ts` correctly does)

### 2. **Trader Orders API Endpoint** ❌ BROKEN
- **File:** `app/api/traders/[id]/orders/route.ts` (line 28)
- **Issue:** Same problem as above - queries `trades` with wrong schema
- **Broken Query:**
  ```typescript
  .from('trades')
  .select('order_id, market_id, outcome, side, order_type, price, size, filled_size, remaining_size, status, created_at, updated_at')
  .eq('trader_id', id)
  ```
- **Fix:** Should query `orders_copy_enriched` or appropriate orders table

---

## What Table Should Be Used Instead?

For user portfolio/orders data, the correct table is:
- **`orders_copy_enriched`** - This is a view/table that contains the order data with columns like `order_id`, `market_id`, `outcome`, etc.

Evidence:
- `/app/api/portfolio/trades/route.ts` correctly uses `orders_copy_enriched`
- Migration `20250113_create_orders_copy_enriched_view.sql` creates this view
- This is the production table for user-facing order/trade data

---

## Dependencies Summary

### Direct Dependencies (Will Break If Deleted)
1. `top5_traders_trades` - Created from trades via `LIKE public.trades INCLUDING ALL`
2. `top50_traders_trades` - Created from trades via `LIKE public.trades INCLUDING ALL`
3. `trades_with_timing` - View that queries trades
4. `wallet_realized_pnl_daily` - Aggregates from trades
5. `market_fetch_queue` - Populated from trades via functions
6. `get-polyscore` function - Queries trades directly
7. Ingestion pipeline - Writes to trades

### Indirect Dependencies
- Various backfill scripts
- Admin dashboard pages
- ML/analysis workflows

---

## Recommendations

### ✅ DO NOT DELETE
The `trades` table is **critical infrastructure** and serves as:
- Source of truth for raw trade data
- Input for multiple derived tables and views
- Data source for aggregation functions
- Reference for market queue population

### 🔧 FIX BROKEN ENDPOINTS
1. **Fix `/app/api/portfolio/route.ts`:**
   - Change from `.from('trades')` to `.from('orders_copy_enriched')`
   - Update column selection to match `orders_copy_enriched` schema
   - Update filter from `trader_id` to appropriate column

2. **Fix `/app/api/traders/[id]/orders/route.ts`:**
   - Same changes as above

### 📊 CONSIDER OPTIMIZATION
If the table is truly massive and causing performance issues:
1. **Partition by timestamp** - Partition trades table by month/year
2. **Archive old data** - Move old trades (>1 year) to archive table
3. **Add materialized views** - Pre-aggregate common queries
4. **Review indexes** - Ensure proper indexing for common queries

---

## Updated Analysis (After User Clarification)

**User Requirements:** Don't need ingestion, PolyScore, admin, derived tables, views, or aggregation from Dome.

**Remaining Dependencies:**
1. ❌ **Ingestion** - User doesn't need
2. ❌ **PolyScore** - User doesn't need  
3. ❌ **Admin** - User doesn't need
4. ❌ **Derived Tables** - User doesn't need
5. ❌ **Views** - User doesn't need
6. ❌ **Aggregation** - User doesn't need
7. ⚠️ **Market Queue** - ONLY used in backfill script, NOT production

### Market Queue Analysis

**Usage:** 
- ONLY in `scripts/backfill-dome-markets.js` (backfill script)
- NOT used in any production API endpoints (`app/api`)
- NOT used in workers
- Purpose: Populate `markets` table with metadata from Dome API

**Can Be Replaced:**
- Queue can be populated from `markets` table directly (find missing markets)
- Can get condition_ids from `orders` table (if it has condition_id)
- Can fetch markets on-demand without queue
- Or simply don't use the queue if backfilling isn't needed

## Conclusion

**If you don't need the features listed above, the `trades` table appears to be SAFE TO DELETE**, with these caveats:

1. **Broken Endpoints:** Fix these first (they're already broken anyway):
   - `app/api/portfolio/route.ts` - Change to use `orders_copy_enriched`
   - `app/api/traders/[id]/orders/route.ts` - Change to use `orders_copy_enriched`

2. **Market Queue:** If you need market backfilling, repopulate queue from:
   - `markets` table (find missing condition_ids)
   - `orders` table (if it has condition_id)
   - Or remove queue entirely if not needed

3. **Derived Tables:** If you delete `trades`, these will break:
   - `top5_traders_trades` - Will become empty/stale
   - `top50_traders_trades` - Will become empty/stale
   - `trades_with_timing` view - Will break
   - `wallet_realized_pnl_daily` aggregates - Will stop updating

**Action Items:**
1. 🔧 Fix broken endpoints first (they're already broken)
2. ✅ **Safe to delete `trades` table** if you don't need the features above
3. 🗑️ Delete derived tables/views that depend on trades
4. 🔄 Update market queue functions to use alternative sources (or remove)
