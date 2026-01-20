# Merge Copy Trades into `orders`

## Goals
- Keep the existing `orders` table as the canonical source of a user’s Polymarket orders while surfacing every copy-trade-specific field that the UI/cron now relies on.
- Stop writing/reading the `copied_trades` table so that we can simplify ingestion, notification, and analytics flows.
- Preserve the user-exposed APIs (profile feed, admin dashboards, notification cron, etc.) by replaying their behavior from the richer `orders` rows.

## Current facts (why `copied_trades` exists today)
- `orders` (or `trades` in older deployments) stores each trader’s CLOB order lifecycle. It is populated by `lib/ingestion/syncTrader.ts`, `app/api/polymarket/orders/place/route.ts`, and the refresh cron in `app/api/polymarket/orders/refresh/route.ts`.
- `copied_trades` mirrors a subset of that data with copy-specific metadata: `user_id`, `trader_wallet`, `market_title`, `price_when_copied`, `roi`, `notification_*` flags, cached images, etc. It is consumed everywhere from `app/profile/page.tsx`, `app/api/cron/check-notifications/route.ts`, `app/feed/page.tsx`, and the admin dashboards to show copy history, ROI, and send emails.
- New copy trades are inserted into both tables in `app/api/polymarket/orders/place/route.ts` (see the `payload` for `orders` and the `insert` into `copied_trades`).
- Many scripts (e.g. `scripts/backfill-copied-trades-avatars.js`, `scripts/check-db-health.js`) and routes (`app/api/copied-trades/*`, `app/admin/content-data/page.tsx`, etc.) still point at `copied_trades` today.

## Schema mapping
We plan to keep the existing `orders` columns untouched and add the copy-trade-specific columns directly onto that table so every consumer can query a single row per real order. The following mapping summarizes what must be preserved (all column names are from `copied_trades` SQL in the prompt):

| `copied_trades` column | Target representation | Notes |
|---|---|---|
| `id` | `copied_trade_id` (UUID) persisted alongside `order_id` | Keep the legacy UUID so APIs such as `/api/copied-trades/[id]/status` can still verify ownership. We can expose `order_id` as the canonical key elsewhere. |
| `user_id` | new `copy_user_id` (auth.users.id) | This is the follower whose feed/profile is reading copy history; it cannot become `trader_id`. Keep a foreign key to `auth.users` so ownership checks/rate limits keep working. |
| `trader_wallet` | `copied_trader_wallet` (existing) | Already tracked during order placement; keep in sync. |
| `trader_username` | new column `copied_trader_username` | Add this column so UI/notifications can show a display name without hitting `copied_trades`. |
| `market_id` | `market_id` (existing) | `orders` already stores this. |
| `market_title` | new column (e.g. `copied_market_title`) or derive from cached market metadata | Needed for profile/feed/notifications — we can compute from `market_cache` but having a persisted string makes the migration easier and keeps the UX stable. |
| `outcome` | `outcome` (existing) | Already on `orders`. |
| `price_when_copied` | new column (decimal) | Use for ROI & notification math instead of digging through raw payloads. |
| `amount_invested` | new column (nullable numeric) | Surface from copy modal. |
| `trade_method` | new enum-text column (`manual`, `quick`, `auto`) | Clarifies how the trade was captured (manual entry, quick copy via Polycopy UI, or auto-trigger like auto-close); default to `quick` for existing rows. |
| `copied_at` | `created_at` (existing) | Already stored, but we may keep a dedicated `copy_executed_at` timestamp if future copy metadata diverges. |
| `trader_still_has_position` | new boolean | Used by the notification cron and profile UI. |
| `trader_closed_at` | new timestamp | Represents the real exit time for the trader’s position (mirrors what the cron currently expects). |
| `current_price` | new numeric | Used to show live quotes in the profile table. |
| `market_resolved` / `market_resolved_at` | new boolean + timestamp | Cron sets these, and they drive UI badges and notification guardrails. |
| `roi` | new numeric | ROI calculations on `copied_trades` should continue to work (UI, admin dashboards, ROI fixes). |
| `notification_closed_sent` / `notification_resolved_sent` | new booleans | Cron checks these flags before sending emails; we must keep them. |
| `last_checked_at` | new timestamp | Cron currently writes this; keep for the same purpose. |
| `resolved_outcome` | new text | Helpful when the resolved outcome differs from the outcome the user copied. |
| `user_closed_at` / `user_exit_price` | new timestamp + numeric | Allows the user to lock in ROI manually, as seen on `app/profile/page.tsx` and `app/api/copied-trades/[id]/status/route.ts`. |
| `market_slug` | new text column (indexed) | Used by feed/trader pages to join on slug for deduped UI text. |
| `trader_profile_image_url` / `market_avatar_url` | new text columns + conditional indexes | For avatar lookups in feed/admin dashboards. |

Indexes & triggers currently defined on `copied_trades` (on wallet, slug, user_id, status combo) should be recreated on the new columns where the same queries/methods need them. The `update_copied_trades_updated_at` trigger can be replaced by the existing `update_updated_at_column()` trigger that already runs on `orders`.

## Migration steps
1. **Discover and document the current dependencies.** Catalog every code path that reads/writes `copied_trades` so they can be updated once the schema is merged. Key files include:
   - `app/api/polymarket/orders/place/route.ts` and `app/api/polymarket/orders/refresh/route.ts` (writers that insert copy metadata as part of order upserts).
   - `lib/ingestion/syncTrader.ts` / `app/api/polymarket/orders/refresh/route.ts` (which should be taught to populate the new copy columns for both `orders` and legacy `trades` tables).
   - `app/api/copied-trades/*` routes (`GET /api/copied-trades`, `POST /api/copied-trades`, `GET /api/copied-trades/[id]/status`, etc.) that enforce authorization/rate limits by joining `user_id` and `id`.
   - Notification cron (`app/api/cron/check-notifications/route.ts`) plus UI pages (`app/profile/page.tsx`, `app/feed/page.tsx`, `app/trader/[wallet]/page.tsx`, `app/admin/content-data/page.tsx`) that read from `copied_trades`.
   - Backfill or health-check scripts in `scripts/backfill-copied-trades-avatars.js`, `scripts/check-db-health.js`, and any admin tooling that filters by `user_id`.

> **Routes/scripts to keep working while migrating** – keep a checklist of every handler above since they will either be reimplemented on `orders` or temporarily query both tables while you phase the change in.

2. **Schema migration**
   - Create a Supabase migration that:
   - Adds the mapped columns above (`copied_trader_username`, `price_when_copied`, `amount_invested`, `trade_method`, `trader_still_has_position`, etc.) to both `orders` and `trades` (the `resolveOrdersTableName` helper should keep working after the columns exist).
     - Adds indexes for the ones that support filtering (e.g., `(user_closed_at, market_resolved)`, `copied_trader_wallet`, `market_slug`), recreating the conditional indexes from `copied_trades`.
     - Persists the legacy `copied_trades.id` (e.g., via `copied_trade_id`) so status/rate-limit routes can continue comparing against the same UUID while you migrate the APIs.
   - Update all writers (order placement, refresh cron, ingestion helpers, notification job) to populate the new columns for whichever row and table they touch (`orders` or `trades`). Verify each writer also sets `copy_user_id` so ownership checks still work.

3. **Data migration**
   - `supabase/migrations/20250112_backfill_copy_trades_to_orders.sql` implements the heuristic join outlined above: it matches `copied_trades` → `orders` (and optionally `trades` when the table still exists), copies every copy-specific column, persists the legacy `copied_trades.id` in `copied_trade_id`, populates `copy_user_id`, and explicitly marks each backfilled row as `trade_method = 'manual'` so historical manual entries stay distinguishable.
   - The migration creates `copy_trade_migration_failures(copied_trade_id, target_table, reason)` so we can audit every row that could not be paired with an `orders`/`trades` row (either due to missing orders, mismatched metadata, or incomplete data). Review that table and resolve orphaned entries before dropping `copied_trades`.
   - Validate the migration by comparing counts/ROIs and by replaying the key UI flows. Once satisfied, `copied_trades` can be retired or switched to read-only while the new columns are the source of truth.

4. **Code + API updates**
   - Replace every `copied_trades` query with the new columns on `orders` (ideally after a flag switch/fan-out period). Key refactors include:
     - Update profile/feed/trader/admin APIs to filter `orders` by `copy_user_id` (the follower’s `auth.users.id`), not `trader_id`.
     - Teach the cron notification job to read `notification_*`, `market_resolved`, etc. from the enriched `orders` rows; keep pagination/filter logic the same.
     - Rebuild `/api/copied-trades` and `/api/copied-trades/[id]/status` to query `orders` by `copied_trade_id`/`copy_user_id` so the rate limits and ownership checks remain intact.
     - Ensure search indexes used in UI (e.g., slug-based lookups on `app/feed/page.tsx`) are recreated against the new columns in `orders`.
   - Update any scripts or admin tooling to expect the merged schema, dropping direct `copied_trades` usage once the new fields are live everywhere.

   ### Read-path migration plan
   Each of the following consumers needs to point at the enriched `orders` rows instead of `copied_trades`. For each handler we will:
   1. Identify the filters/joins it currently relies on (`user_id`, `trader_wallet`, `copied_at`, etc.).
   2. Rewrite the Supabase query to use `orders` (or `trades` when still in use) filtering by `copy_user_id`.
   3. Ensure rate-limits/auth checks that previously used `copied_trades.id` now use `copied_trade_id`.
   4. Verify the consumer still gets the needed columns (`market_title`, ROI, avatars, notifications, `trade_method`).

   | Consumer | Key behavior | New order logic |
   |---|---|---|
   | `app/api/copied-trades/route.ts` (GET/POST) | Fetches/deletes copies for an authenticated follower, enforcing `user_id` check | Query `orders`/`trades` where `copy_user_id = auth.uid()` and `copied_trade_id` matches; `POST` should upsert `copy_user_id`, `copied_trade_id`, and other metadata on the existing order row instead of inserting into `copied_trades`. |
   | `app/api/copied-trades/[id]/status/route.ts` | Fetches status/updates notification columns based on `copied_trades` row + `id` | Look up the unique `copied_trade_id` (or `order_id` + `copy_user_id`) in `orders`, perform the same updates (status flags, `trade_method`, `notification_*` bits), and continue using `copy_user_id` for ownership/rate limits. |
   | `app/api/cron/check-notifications/route.ts` | Reads `copied_trades` rows to send emails, filtering on notification flags and `market_resolved` | Query `orders` with the new flags, maintain the same filters (`copied_trader_wallet IS NOT NULL`, `notification_*`). Update notification writes to update the order row directly. |
   | `app/api/orders/route.ts` | Supplements CLOB orders with copy-trader metadata via `copied_trades` lookups | Incorporate the `copy_user_id`, `copied_trader_username`, `copied_market_title`, etc. directly from `orders`, removing the extra lookup. |
   | `app/api/admin/trader-details/route.ts`, `app/admin/content-data/page.tsx` | Shows copy history/ROIs from `copied_trades` | Repoint to `orders`, keeping the same filters and columns (trade_method, `market_title`, ROI). |
   | `app/profile/page.tsx`, `app/feed/page.tsx`, `app/trader/[wallet]/page.tsx` | Lists a user’s copy history and calculates live ROI | Replace the Supabase select from `copied_trades` with `orders`/`trades`, filtering by `copy_user_id` and ordering by `copied_trade_id` (or `created_at`). Use the new `trade_method` field when showing where the trade originated. |
   | Cron/scripts (`scripts/backfill-copied-trades-avatars.js`, `scripts/check-db-health.js`) | Backfill/health-check the `copied_trades` table | Update them to read from `orders` or use `copy_trade_migration_failures` for auditing once the old table is empty. |
   | `app/api/copied-trades/[id]/route.ts` (DELETE) | Deletes a copied trade row | Update to clear the `copy_user_id`/related flags on the order row rather than deleting a row from `copied_trades`. |
  | Notification helpers or any other undiscovered scripts | | Search for remaining `copied_trades` references (run `rg copied_trades`) and update each one using the same process. |

5. **Clean-up + rollout**
   - Once all reads/writes use `orders`, drop the `copied_trades` table, its indexes, and the trigger.
   - Review monitoring/cron alerts to ensure no more warnings about missing columns.
   - Update documentation (e.g., `DEPLOY_QUICK_REFERENCE.md`, `PROFILE_TRADE_CARDS_UPDATE.md`, `DOCS/ROI...`) to describe the new single-table flow.

## Manual copy reconciliation
- Manual-copy rows never created CLOB orders, so the backfillers log them in `copy_trade_migration_failures`. Treating them as second-class records would leave the UI/cron split between two tables, so we need to synthesize order rows (or equivalent records) so they live inside `orders` with `trade_method = 'manual'`.
- **Plan step 1:** Scan `copy_trade_migration_failures` after running the backfill. Each entry needs a synthetic `orders` record (or a manually updated stub).
- **Plan step 2:** For each failure:
  * Generate an `order_id` (UUID) and insert an `orders` row with:
    * `trader_id` (lookup from `traders`), `copy_user_id` = follower, `copied_trade_id`, `copied_trader_username`, `copied_market_title`, `trade_method = 'manual'`, `market_id`, `outcome`, `price`, `size`, timestamps, notification flags, `raw.source = 'manual_copy'` (optional), etc.
    * Derived fields such as `roi`, `notification_*`, `market_slug`, avatar URLs, and `user_closed_at`/`user_exit_price` copied from the manual entry.
  * If inserting a row is not feasible, update an existing `orders` placeholder that matches on wallet/market/outcome, ensuring `copy_user_id` is assigned.
- **Plan step 3:** Re-run the backfill (or update rows directly) so `copy_user_id` and `copied_trade_id` are populated, allowing the rest of the application to treat manual copies as regular orders.
- Once these synthetic rows exist, the UI and cron can compare manual vs. CLOB trades simply by checking `trade_method = 'manual'` without branching on which table to query.

## Validation & roll-back safeguards
- Before dropping `copied_trades`, keep it in read-only mode and compare row counts/values with the new `orders` columns to ensure parity.
- Run the existing UI smoke flows (profile page, feed, orders page) against a staging supabase instance where both tables are populated to verify nothing breaks.
- Use `scripts/check-db-health.js` (after updating it) or a custom SQL query to confirm there are no `NULL` values in the new required copy-trade columns for the migrated rows.
- Keep the migration reversible by only dropping `copied_trades` once we can prove the new columns faithfully reproduce the old data (e.g., matching `copied_trades.id` if preserved).

Once these steps are in place, we can retire the `copied_trades` API surface and rely on the enriched `orders` schema everywhere, eliminating duplication and keeping the table that “stays exactly the same” while letting copy trades “come in” cleanly.
