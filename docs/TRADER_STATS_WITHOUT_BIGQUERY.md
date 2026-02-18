# Trader Stats (Conviction, ROI, etc.) Without BigQuery

## The problem

We used to refresh **trader_global_stats** and **trader_profile_stats** in Supabase **every 30 minutes** from BigQuery:

- **Cloud Run job** `sync-trader-stats-from-bigquery` ran at :05 and :35 past each hour.
- It read from BigQuery tables `trader_global_stats` and `trader_profile_stats` (themselves built from the `trades` + `markets` tables in BQ) and upserted into Supabase.

With BigQuery off (or quota exhausted), that sync no longer runs. The Supabase tables are **going stale**: no new wallets, no updated win rate, ROI, or avg bet size. That directly affects:

| Consumer | What it uses | Effect if stale |
|---------|----------------|------------------|
| **Fire feed** | `trader_global_stats` (d30_win_rate, d30_total_roi_pct, d30_avg_trade_size_usd), `trader_profile_stats` (niche win rate, ROI) | Filters and sorts traders by WR/ROI; conviction = trade size / avg bet size. Stale stats → wrong ranking and conviction. |
| **predict-trade** | Same tables for the 41 ML inputs (e.g. global_roi_pct, d30_roi_pct, profile roi_pct) | ML score uses outdated trader performance. |
| **FT sync** | Win rate / ROI for strategy filters and display | Copy-trade filters and UI show old numbers. |
| **Polysignal / paper-trading** | Trader stats for scoring/display | Same as above. |
| **Feed (all)** | Conviction (trade size / avg bet size), ROI %, win rate per trade card | Conviction and ROI badges become wrong or missing. |

So we need a **new way to keep trader_global_stats and trader_profile_stats fresh** that does **not** depend on BigQuery.

---

## What the tables contain (recap)

### trader_global_stats (per wallet)

- **Counts:** l_count, d30_count, d7_count, l_resolved_count, d30_resolved_count, d7_resolved_count  
- **Win rates:** l_win_rate, d30_win_rate, d7_win_rate  
- **PnL / ROI:** l_total_pnl_usd, d30_total_pnl_usd, d7_total_pnl_usd, l_total_roi_pct, d30_total_roi_pct, d7_total_roi_pct  
- **Sizes:** l_avg_trade_size_usd, d30_avg_trade_size_usd, d7_avg_trade_size_usd, l_avg_pos_size_usd  
- **Other:** l_avg_pnl_trade_usd, current_win_streak, etc.

### trader_profile_stats (per wallet + niche + bet_structure + price_bracket)

- win_rate, roi_pct, trade_count (and d30_*, d7_*, l_* variants where present)  
- Used for “win rate / ROI in this category” (e.g. NFL, POLITICS) and for ML profile features.

**Conviction** on the feed is computed in-app as: **trade size (USD) / avg bet size (USD)**; avg bet size comes from these stats (d30_avg_trade_size_usd or l_avg_trade_size_usd). So keeping these tables updated is what keeps conviction and ROI meaningful.

---

## Options (no BigQuery)

### Option A: Compute from Polymarket Data API (recommended)

Use **free Polymarket Data API** endpoints we already use elsewhere:

1. **Leaderboard**  
   `GET https://data-api.polymarket.com/v1/leaderboard?timePeriod=month&limit=1&user={wallet}`  
   (and `timePeriod=all`)  
   → PnL, volume, rank. We can derive **ROI %** (e.g. PnL/volume) and use as d30 / lifetime aggregates for **global** stats.

2. **Closed positions**  
   `GET https://data-api.polymarket.com/closed-positions?user={wallet}&limit=...&offset=...`  
   → Each position has `realizedPnl`, `totalBought`, `outcome`, `curPrice`, `timestamp`. From these we can compute:
   - Resolved count, win count (e.g. realizedPnl > 0 or outcome vs resolution)
   - Total invested (e.g. sum of `totalBought` or equivalent)
   - Total PnL → **win rate** and **ROI %** for L / D30 / D7 windows

3. **Activity (trades)**  
   `GET https://data-api.polymarket.com/activity?user={wallet}&type=TRADE&limit=...`  
   → Individual trades with `usdcSize` (or size × price) and metadata. We can compute:
   - **Avg bet size** (lifetime, D30, D7) → feeds **conviction**
   - If response includes category/tags, we can aggregate by niche for **trader_profile_stats**

**Implementation sketch:**

- **Cron job** (e.g. Vercel cron or a small worker) every 30–60 minutes:
  - Read list of wallets to update (e.g. from `traders` or `trader_global_stats`, cap to N per run to respect rate limits).
  - For each wallet (or batch in parallel with a concurrency limit):
    - Fetch leaderboard (month + all) and closed-positions (paginate if needed); optionally activity for avg size and profile.
    - Compute l_* / d30_* / d7_* for global stats and, if available, profile buckets.
    - Upsert into `trader_global_stats` and `trader_profile_stats` in Supabase.
  - Spread work over the 30‑minute window to avoid bursting the Data API (and optional backoff on 429).

**Pros:** No BigQuery, no new paid services; uses the same API the app already uses (fire-feed, v3 profile, FT sync).  
**Cons:** Rate limits and number of wallets (e.g. 500–1000) mean we may update a subset per run and cycle through wallets over a few runs; profile stats need category on trades/positions (if not present, we can start with global-only).

---

### Option B: Compute from Supabase `trades` + `markets`

If we **keep** the Supabase `trades` table populated (e.g. from CLOB or Data API sync) and have **markets** with `winning_label` / `status`:

- Run an **aggregation job** (SQL in Supabase or a small Node script) that:
  - Joins `trades` (BUY, wallet, price, shares, condition_id, token_label, timestamp) to `markets` (condition_id, status, winning_label).
  - Computes resolved/win counts, PnL, invested, avg trade size for L / D30 / D7.
  - Optionally groups by niche (if we store category/niche on trades or markets) for profile stats.
- Upsert results into `trader_global_stats` and `trader_profile_stats`.

**Pros:** Single source of truth in our DB; no per-wallet API calls for stats.  
**Cons:** Requires `trades` (and possibly markets) to be reliably backfilled and updated; niche/profile breakdown depends on having that data in Supabase.

---

### Option C: Hybrid

- **Global stats:** From Polymarket Data API (Option A) so we don’t depend on Supabase trades coverage.
- **Profile stats:** From Option A if the API gives category/niche; otherwise from Supabase (Option B) when available, or defer profile stats until we have a stable pipeline.

---

## Recommended next steps

1. **Short term:** Add a **Vercel cron** (or equivalent) that:
   - Uses **leaderboard + closed-positions** (and optionally **activity**) from the Polymarket Data API.
   - Computes and upserts **trader_global_stats** (and **trader_profile_stats** if we have category data) for a bounded set of wallets per run (e.g. top 200–500 by “last_updated” or by “trader” list).
2. **Schema:** Keep the existing Supabase schema for `trader_global_stats` and `trader_profile_stats`; the job should match column names and semantics (e.g. d30_total_roi_pct = percentage in 0–1 or 0–100 depending on current app usage).
3. **Conviction / ROI on feed:** No app change required once the tables are updated; the feed and predict-trade already read from these tables.
4. **Decommission:** Once this cron is stable, remove or disable the Cloud Run job `sync-trader-stats-from-bigquery` and any BigQuery scheduled queries that fed the BQ stats tables.

This gives you **conviction, ROI, and win rate** for each trade and trader **without BigQuery**, using the same Supabase tables and the free Polymarket Data API.
