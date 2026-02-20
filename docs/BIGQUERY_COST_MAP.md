# What’s Causing Your BigQuery Bill – Cost Map

## Why “running the model” costs money every time

**What you expected:** Train the model once; after that it “just runs” for free.

**What actually happens:** In BigQuery, **training** creates a model object (stored). **Using** the model means running **ML.PREDICT**, which BigQuery treats as a **query**. You are charged for every query by **bytes processed**. So:

- Every **predict-trade** call = 1 BigQuery **ML.PREDICT** = 1 billable query.
- Every **get-polyscore** call (when it uses BQ) = 2 queries (trader_dna_snapshots + ML.PREDICT).
- Any other **SELECT** (or CREATE TABLE, etc.) = billable by bytes scanned.

So: **training** is a one-time cost; **each use** of the model (and each other query) is an ongoing cost.

---

## Trader summaries / “updates every day to get the averages”

If something **recomputes trader stats from raw trades every day**, that can be one of the biggest cost drivers.

- **`rebuild-all-trader-stats.py`**  
  - Runs two BigQuery jobs:
    1. **trader_global_stats** – `CREATE OR REPLACE TABLE … AS` from **trades** (84M+ rows) + **markets**.
    2. **trader_profile_stats** – same idea, different aggregation.
  - Each run does a **full scan** of the trades table (and joins). No `maximum_bytes_billed`. One run can easily be **hundreds of GB** (and show up as ~300–900 GB in Job history).
  - If this runs **daily** (cron, Cloud Scheduler, or manual habit), that alone can explain **steady daily cost** and a large share of the bill.
- **Where it’s run:** Not in Vercel crons. It’s meant to be run manually (`python3 rebuild-all-trader-stats.py`) or from your own scheduler/VM. If you (or a teammate) set up a daily run somewhere, that’s the “trader summaries updating every day” cost.

---

## App & API paths that hit BigQuery (and can drive cost)

| What | When it runs | What it does | Cost risk |
|------|----------------|--------------|-----------|
| **predict-trade** (Supabase Edge Function) | Every time someone needs an ML score for a trade | 1× BigQuery **ML.PREDICT** (poly_predictor_v11) per request. No byte cap. | **High volume:** called from FT sync (every 5 min per qualifying trade with `use_model`), trade cards (PolyScore), polysignal, enrich-ml, paper-trading. Many calls per day → adds up. |
| **get-polyscore** (Supabase Edge Function) | When app calls this instead of/in addition to predict-trade | 1× `trader_dna_snapshots` query + 1× **ML.PREDICT** (trade_predictor_v5). No byte cap. | Medium: 2 queries per call; volume depends on where it’s used. |
| **FT sync** (`/api/cron/ft-sync`) | **Every 5 minutes** (Vercel cron) | For each **new** trade that qualifies for a wallet with **use_model = true**, calls **getPolyScore** → **predict-trade** → 1 BQ ML.PREDICT. Cached per trade so same trade for multiple wallets = 1 call. | **High:** Many wallets + many new trades = thousands of predict-trade (hence BQ) calls per day. |
| **Trade card (PolyScore)** | When a user opens/expands PolyScore on a trade | **getPolyScore** → **predict-trade** → 1 BQ ML.PREDICT. | Depends on traffic; each view = 1 query. |
| **/api/polysignal** | When that API is called | getPolyScore → predict-trade → 1 BQ. | Depends on call volume. |
| **/api/ft/enrich-ml** | When enriching FT orders with ML scores | getPolyScore per order → predict-trade → 1 BQ each. | Can be high if many orders enriched. |
| **/api/paper-trading** | When user uses paper trading flow | getPolyScore → predict-trade → 1 BQ. | Depends on usage. |
| **Forward-test update** (`/api/forward-test/update`) | **GET:** when the forward-testing page loads. **POST:** when user clicks to refresh results. | **GET:** 2 BQ queries (current results + history). **POST:** **~20+ BQ queries** in a loop (one per CONFIG), each joining **trade_predictions_pnl_weighted** (~40M rows) and **trader_stats_at_trade** (~46M rows). No LIMIT, no `maximumBytesBilled`. | **Very high:** One POST can be hundreds of GB total (many large scans). If the page is loaded or “update” is clicked often, or called by a script/dashboard, cost explodes. |
| **Forward-test live** (`/api/forward-test/live`) | When that API is used | Multiple BQ queries (summary, recent, updates, inserts). No byte cap. | High per call. |
| **Forward-test daily** (`/api/forward-test/daily`) | When that API is used | BQ queries for daily rollups. No byte cap. | High per call. |
| **Backtest run** (`/api/backtest/run`) | When user runs a backtest | Large query over trader_stats_at_trade / enriched_trades (up to 500k rows) + trader basket query. No `maximumBytesBilled`. | Very high per run (you said you haven’t run these in a week; so not the “consistent daily” part). |
| **Backtest list** (`/api/backtest/list`) | When user views backtest list | 1 BQ query, small table (backtest_runs), LIMIT 100. | Low. |
| **Alpha agent** (`query_bigquery`) | When user chats and the agent runs a BQ query | 1 BQ query with **maximumBytesBilled = 1 GB**. | Capped at 1 GB per query; many chats could still add up. |
| **Alpha agent cron** (`/api/cron/alpha-agent`) | Daily at 6:00 UTC | Depends on implementation; if it runs BQ, same as above. | Depends on what the cron does. |
| **rebuild-all-trader-stats.py** | When **you** (or a scheduler) run it – e.g. daily for “trader summaries” | Full scan of **trades** + **markets** to rebuild trader_global_stats and trader_profile_stats, then sync to Supabase. No byte cap. | **Very high:** One run = hundreds of GB. Daily run = large, consistent daily cost. |

---

## What’s *not* hitting BigQuery from this repo

- **Leaderboard / trader list from Polymarket:** Uses **Polymarket API** (`data-api.polymarket.com`), not BigQuery.
- **sync-trader-leaderboard** (Vercel cron): Syncs leaderboard data into your DB from Polymarket; no BQ.
- **backfill-wallet-pnl** (Vercel cron): Uses **Dome API** + **Supabase**; no BQ.
- **FT sync “target traders”:** From leaderboard/Polymarket + your DB; no BQ for the list itself (BQ is only used when **getPolyScore** → predict-trade runs for a trade).

---

## Summary: what’s likely driving the huge cost

1. **Trader summaries “updating every day”**  
   If **rebuild-all-trader-stats.py** runs daily (cron/VM/Cloud Scheduler), it’s a prime suspect: full table scans, no cap, once per day = big, steady daily cost.

2. **Using the model on every qualifying trade (FT sync)**  
   FT sync every 5 min + many wallets with **use_model** + many new trades → **predict-trade** (and thus BQ) called very frequently. That doesn’t usually explain single 300–900 GB jobs (ML.PREDICT on one row is small), but it can explain **high job count** and a lot of total spend.

3. **Forward-test update (especially POST)**  
   One **POST** to `/api/forward-test/update` runs many heavy joins (40M + 46M row tables) with no cap. If that’s called daily (e.g. from the forward-testing page or a script), it can produce multiple very large jobs (like the 389 GB one you saw) and dominate the bill.

4. **Anything else that runs big BQ queries on a schedule**  
   e.g. Other scripts (e.g. `daily-sync-trades-markets.py`, `backfill_v2.py`) or **BigQuery Scheduled Queries** in the GCP console. Check **BigQuery → Job history** and sort by bytes processed to see exact job types and timings.

---

## What to do next

1. **BigQuery → Job history:** Filter by last 14–30 days, sort by **Bytes processed**. Look at:
   - Job type (Query vs Load).
   - **Creation time** (e.g. same time every day → scheduled).
   - **Referenced tables** (e.g. `trades`, `trader_stats_at_trade`, `trade_predictions_pnl_weighted`).
2. **Stop or limit the worst offenders:**
   - If **rebuild-all-trader-stats** runs daily: stop the daily run; run it rarely (e.g. weekly) or replace with incremental updates and add `maximum_bytes_billed`.
   - **Forward-test/update POST:** add `maximumBytesBilled` and/or run it rarely (e.g. manual only, not on every page load).
   - **predict-trade / get-polyscore:** add `maximumBytesBilled`; consider caching ML scores so the same trade doesn’t trigger BQ repeatedly.
3. **Add safeguards everywhere:** `maximumBytesBilled` (Node) / `maximum_bytes_billed` (Python) on **every** BQ query so no single job can run away again.

This map should let you match “what part of the app / which API / which script” to the big jobs in Job history and to your expectation that “trader summaries update every day” and “the model runs every time we need a score.”
