# Investigation: How a wallet gets into the traders DB (and why some have no decent PnL)

## Wallet in question
`0x1839e2f71a9e0693b16100f13fdc1613008ece53`

## Ways a wallet gets into the `traders` table

There is **no minimum PnL or track-record check** before insertion in any of these paths.

### 1. **Leaderboard sync cron** (most likely for this wallet)

- **Endpoint:** `GET /api/cron/sync-trader-leaderboard` (runs daily at 1 AM UTC, see `vercel.json`).
- **Defaults:** `timePeriod=all`, `orderBy=VOL`, 20 pages × 50 = **top 1000 by all-time volume**.
- **Behavior:** Fetches Polymarket leaderboard and **upserts every returned wallet** into `traders` with `is_active: true`. PnL can be negative; we do not filter by PnL or win rate.
- **Why weak traders appear:** Anyone in Polymarket’s top 1000 **by volume** gets in, including high-volume, low-PnL or losing traders.

**Relevant code:** `app/api/cron/sync-trader-leaderboard/route.ts` (defaults at lines 184–185: `orderBy=VOL`, `timePeriod=all`).

### 2. **ensureTrader / ensureTraderId** (create-on-use)

A trader row is created when we need a `trader_id` and the wallet is not in `traders`:

- **Place order** (`app/api/polymarket/orders/place/route.ts`): user places an order that references a copied trader.
- **Refresh orders** (`app/api/polymarket/orders/refresh/route.ts`): we refresh orders for a wallet.
- **Copied trades** (`app/api/copied-trades/route.ts`): we persist a copied trade for a trader.
- **Public trade sync** (`lib/ingestion/syncPublicTrades.ts`): when `syncPublicTrades({ wallet })` is called for a wallet not in DB, `ensureTrader(wallet)` creates the row.

So **any wallet that was ever copied, or that we synced by wallet, or that we needed for an order** can be in `traders` with no quality bar.

### 3. **Manual script**

- `scripts/add-wallet-to-traders.js` — e.g. `node scripts/add-wallet-to-traders.js 0x...`
- Adds the given wallet with no checks.

### 4. **BigQuery / Python pipeline**

- **daily-sync-trades-markets.py** — `discover_and_add_new_wallets()`: any wallet that appears in the BigQuery **trades** table but not in **traders** is inserted into `traders`. No PnL or quality filter.
- **add-missing-wallets-to-traders.py** — adds a hardcoded list of wallets (this specific wallet is not in that list).

---

## How to check this wallet

1. **In your DB (Supabase):**
   - `traders`: `SELECT * FROM traders WHERE LOWER(wallet_address) = '0x1839e2f71a9e0693b16100f13fdc1613008ece53';`
   - `trader_global_stats`: `SELECT * FROM trader_global_stats WHERE LOWER(wallet_address) = '0x1839e2f71a9e0693b16100f13fdc1613008ece53';`
   - `wallet_realized_pnl_daily` (if you have it): same filter by wallet.
   - Check `trades_public` and any `copied_*` tables for this wallet to see if they were synced or copied.

2. **Polymarket leaderboard:**
   - Check if they appear in top 1000 by volume:  
     `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=50&offset=0&category=overall`  
     (paginate or use `user=0x1839e2f71a9e0693b16100f13fdc1613008ece53` if the API supports it).
   - `scripts/check-polymarket-wallet.js` may also help for a single-wallet leaderboard lookup.

3. **Run the inspect script (if you added it):**
   - `node scripts/inspect-trader-in-db.js 0x1839e2f71a9e0693b16100f13fdc1613008ece53`  
   (requires Supabase env vars and optional Polymarket fetch).

---

## Recommendations

- **Deactivate low-quality traders:** If you confirm this wallet has poor PnL/stats, set `is_active = false` for them in `traders`. Active crons (e.g. sync-public-trades, sync-traders, backfill) only process `is_active = true`.
- **Optional: minimum bar in leaderboard sync:** When building the payload in `sync-trader-leaderboard`, you could filter out entries with e.g. negative PnL or very low win rate before upserting, so weak traders are not added (or are upserted with `is_active: false`). This would require a policy (e.g. “only add if all-time PnL > 0 or rank ≤ 500”).
- **Downstream filtering:** Fire Feed and FT sync already filter by stats (e.g. min resolved count, win rate). So even if a weak trader is in `traders`, they may not appear in feeds or strategies; the main impact is DB size and which wallets get public-trade/backfill work.

---

## Summary

**Why this wallet is in the DB with no decent PnL/track record:** They almost certainly got in via (1) the **daily leaderboard sync** (top 1000 by **volume**, not PnL), or (2) **ensureTraderId** after being copied or used in an order. There is no PnL or track-record gate at insertion. To stop them from being processed by crons, set `is_active = false`; optionally add a quality filter to the leaderboard sync to avoid adding (or to mark as inactive) such traders in the future.
