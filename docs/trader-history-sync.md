# Trader History Sync (CLOB-backed)

This flow moves trader order/fill history into Supabase so frontend pages don’t call Polymarket directly.

## Schema
- `traders` — wallet roster (`wallet_address`, `display_name`, `is_active`)
- `trader_sync_state` — per-trader watermarks + last run status/error
- `trades` — CLOB orders/trades (status, size/filled, outcome, timestamps)
- `fills` — CLOB trades (one row per fill leg)
- `trades_public` — raw Polymarket public trades (executed fills only)

RLS is enabled and locked down; ingestion uses the service role key.

## CLOB client
- Uses `@polymarket/clob-client` with read-only API creds.
- Required env:
  - `POLYMARKET_CLOB_API_KEY`
  - `POLYMARKET_CLOB_API_SECRET`
  - `POLYMARKET_CLOB_API_PASSPHRASE`
  - `POLYMARKET_CLOB_API_ADDRESS` (address used in headers)
- Normalization outputs `NormalizedOrder` and `NormalizedFill`.
- Trades fetched by `maker_address` watermark; orders fetched via `getOrder` + fallback from trades; open orders fetched via `getOpenOrders` with owner hint.

## Ingestion (lib/ingestion/syncTrader.ts)
1) Ensure trader row exists.  
2) Read sync state (watermark).  
3) Fetch trades since watermark → normalize fills → collect order ids.  
4) Fetch orders by id (plus fallback from trades) → upsert trades table.  
5) Upsert fills.  
6) Reconcile older open/partial orders by refetching by id.  
7) Update `trader_sync_state` (status/error + watermark).

Idempotency: upserts on `order_id` and `fill_id`; safe to rerun.

## Cron endpoint
- `GET /api/cron/sync-traders`
- Auth: `Authorization: Bearer ${CRON_SECRET}`
- Batches active traders (default 50), concurrency 5.
- Returns summary counts for orders/fills/refreshed.

## Backfill script
- `scripts/backfillTraders.ts`
- Args: `--limit=200 --offset=0 --wallet=0xabc... --reset-watermark`
- Run with `npx ts-node scripts/backfillTraders.ts [args]`

## Frontend read API
- `GET /api/traders/{id}/orders?limit=50&offset=0`
- Returns paged orders plus `fills_count` summary per order.

## Troubleshooting
- Missing env vars → CLOB client throws immediately.  
- Rate limits → client retries with exponential backoff.  
- Stale open orders → reconciliation step refetches any open/partial older than 90m.  
- RLS → only service-role API usage works; client-side Supabase queries will be blocked unless a policy is added.
