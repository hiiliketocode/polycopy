# FT Polling: Confirmation That All Tests Get All Trades and Markets

**Date:** February 2026  
**Purpose:** Confirm the system polls and fetches trades and markets for every forward test.

---

## 1. Polling runs for every test

| Trigger | Schedule | What runs |
|--------|----------|-----------|
| **Vercel cron** | Every **2 minutes** (`*/2 * * * *`) | `GET /api/cron/ft-sync` → calls `POST /api/ft/sync` |
| **FT list page** | Every **30 seconds** while page is open | `POST /api/ft/sync` then resolve, enrich-ml, refresh |
| **FT wallet detail page** | Every **30 seconds** while page is open | Same |

Each sync run:

1. Loads **all** FT wallets with `is_active = true`.
2. Filters to **active test period** only: `start_date ≤ now` and `end_date ≥ now`.
3. **Every** wallet in that set is processed in the same run: same trader pool, same trade pool, same market map. No test is skipped.

So: **every test that is active and in its test window is included on every sync.**

---

## 2. Trades: one shared pool, every test evaluated

- **Trader pool (shared):** Leaderboard (month PNL, month VOL, week PNL, day VOL; up to 100 each) plus any `target_trader` / `target_traders` from wallet configs. Merged into one set of traders for the run.
- **Trades (shared):** For each trader, the sync fetches BUY trades from Polymarket Data API (`data-api.polymarket.com/trades?user=...`) with pagination:
  - Up to **4 pages × 50** = **200 trades per trader** per run.
  - Only trades **newer than** the oldest `last_sync_time` across all active wallets (so we don’t re-process old trades).
- **Per test:** The same `allTrades` array is then iterated for **each** active wallet. Each wallet’s filters (price, edge, ML, target_trader, etc.) are applied; qualifying trades are inserted into `ft_orders` for that wallet. So **every test sees the same global trade feed**; they only differ by filter.

**Conclusion:** Every test gets the same trade pipeline. The only limit is 200 trades per trader per run; if a trader had more than 200 new trades in 2 minutes, the oldest would be skipped (rare).

---

## 3. Markets: every trade’s market is loaded

- **Collect condition IDs:** All unique `conditionId` values from `allTrades` are collected.
- **DB first:** Those `condition_id`s are loaded from `markets` in Supabase.
- **API fallback:** Any `condition_id` not in the DB is fetched from Polymarket Gamma API (`gamma-api.polymarket.com/markets?condition_ids=...`) in batches of 20 and then used (and can be written to DB elsewhere). So every trade has a market entry (from DB or API).

**Conclusion:** Every trade used in the sync has corresponding market info (open/closed, end_time, title, slug, etc.).

---

## 4. Code references

| What | Where |
|------|--------|
| Cron schedule | `vercel.json`: `"/api/cron/ft-sync"` → `*/2 * * * *` |
| Sync entry | `app/api/cron/ft-sync/route.ts` → `app/api/ft/sync/route.ts` |
| Active wallets | `app/api/ft/sync/route.ts`: `ft_wallets` where `is_active = true`, then filter by `start_date` / `end_date` |
| Trader pool | Same file: leaderboard + `target_trader` / `target_traders` per wallet |
| Trades per trader | Same file: `fetch(... data-api.polymarket.com/trades ...)` in a loop, up to `MAX_PAGES_PER_TRADER` (4) |
| Market fetch | Same file: `markets` table `.in('condition_id', conditionIds)` then Gamma API for `missingConditionIds` |
| Per-wallet loop | Same file: `for (const wallet of activeWallets)` then `for (const trade of allTrades)` with wallet-specific filters |

---

## 5. Short answer

- **Polling:** Yes. Cron every 2 minutes; plus every 30s when an FT page is open. Every run includes every active test in its active period.
- **Trades:** Yes. One shared pool of trades (from the shared trader set, up to 200 per trader per run) is evaluated for **every** active wallet. Every test gets the same feed; none are skipped.
- **Markets:** Yes. Every trade’s market is resolved from the DB or from the Polymarket API.
