# Public Trades (public.trades_public)

`public.trades_public` stores executed trades (fills) from the Polymarket public Data API. It is a trade tape only.

## What it represents
- Executed fills for a proxy wallet on Polymarket’s public API.
- Immutable trade records suitable for analytics and trader pages.

## What it does NOT represent
- Orders, open trades, cancellations, or lifecycle state.
- CLOB order data (private/premium ingestion is separate).

## Why proxy wallets
Public trades are keyed by the Polymarket proxy wallet that executes trades. EOAs are not used for public trade tracking in this table.

## Incremental syncing
Ingestion reads `trader_sync_state.last_seen_trade_ts` as a watermark and only upserts trades newer than that timestamp. The watermark is updated after a successful run.

## Auto refresh via cron
- `GET /api/cron/sync-public-trades` runs `lib/ingestion/syncPublicTrades` for every active trader (`traders.is_active = true`), so the `trades_public` tape stays current now that the historical backfill is complete.
- Callers must supply `Authorization: Bearer ${CRON_SECRET}` (the same secret used by the other cron routes) and can use `?limit=` to control how many wallets are processed per job (default 50, capped at 200). Requests without an explicit `limit` still respect the `traders.created_at` ordering so the same wallets rotate through when the job runs frequently.
- The route batches work with five concurrent workers and returns `{ processed, requested, tradesUpserted, pagesFetched, failures, limit }`, where `processed` counts the successful trader syncs and `failures` equals `(requested - processed)`.
- Each sync job respects the `trader_sync_state.last_seen_trade_ts` watermark so only new trades (courtesy of `https://data-api.polymarket.com/trades?user=...`) are fetched; the watermark is bumped on success and preserved on errors.
- Schedule the new endpoint with your scheduler of choice (e.g., Vercel cron every few minutes) so the public trade table reflects the latest activity while the historical window remains locked by the backfill workflow.

## Frontend usage
Frontend pages can query `public.trades_public` for recent executed trades per trader or per market, using the `(trader_wallet, trade_timestamp)` and `(condition_id, trade_timestamp)` indexes.
