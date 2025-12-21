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

## Frontend usage
Frontend pages can query `public.trades_public` for recent executed trades per trader or per market, using the `(trader_wallet, trade_timestamp)` and `(condition_id, trade_timestamp)` indexes.
