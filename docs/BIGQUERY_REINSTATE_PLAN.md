# BigQuery Re‑enable Plan: ML Score + Bots & Signals (Without Crazy Cost)

**Goal:** Turn BigQuery back on only for what you need (ML score, bots, signals), and keep the expensive stuff off.

---

## What caused the cost (and stays OFF)

- **BigQuery scheduled queries** that ran every 30 minutes:
  - Recalculate Profile Trader Stats  
  - Recalculate Global Trader Stats  
  - trader profile stats recalc  
- **Do not** re-create or re-enable these in BigQuery. You already paused/deleted them.

**Also stay off or heavily limited:**

- **forward-test/update POST** (huge joins) – keep behind kill switch or add strict byte cap before use.
- **backtest/run** – same; add byte cap before re-enabling.
- **rebuild-all-trader-stats.py** – do **not** run on a schedule (no 30 min, no daily). If you run it at all, do it rarely (e.g. weekly) and add `maximum_bytes_billed` in the script.

---

## What you need for “ML score + bots and signals”

| Need | Where it runs | Uses BigQuery? |
|------|----------------|----------------|
| **ML score** (PolyScore / predict) | getPolyScore → **predict-trade** (Supabase) | Yes – 1× ML.PREDICT per request. **Cap added** so each call is limited (e.g. 1 GB). |
| **FT sync** (copy-trade signals, use_model wallets) | Vercel cron **ft-sync** every 5 min | Calls getPolyScore → predict-trade, so BQ only via ML.PREDICT (capped). |
| **Trader stats for filters/display** (global, profile) | FT sync, fire-feed, polysignal, paper-trading, etc. | **No.** They read **Supabase** tables `trader_global_stats` and `trader_profile_stats`. Those are synced from BQ by `rebuild-all-trader-stats.py` when you run it manually/rarely. So you do **not** need the 30‑min BQ scheduled queries; you only need the data to exist in Supabase (from a past or rare rebuild). |
| **LT execute** (live trading bot) | Vercel cron **lt-execute** | No BQ. |
| **Alpha agent** (optional) | Vercel cron **alpha-agent** + chat | Can run BQ via `query_bigquery`; already capped at 1 GB per query. |

So for “bots and signals” you need:

1. **BigQuery API** re-enabled in GCP.  
2. **BIGQUERY_DISABLED=false** so the app can call BQ again.  
3. **ML path** (predict-trade, and get-polyscore if used) with **maximumBytesBilled** so each request is capped.  
4. **ft-sync** cron enabled so FT sync runs (and can call predict-trade for use_model wallets).  
5. **Trader stats**: use existing Supabase data (or run `rebuild-all-trader-stats.py` rarely, with a byte cap). **Do not** turn the 30‑min BQ scheduled queries back on.

---

## Step-by-step reinstate checklist

### 1. GCP: Re-enable BigQuery API

- Go to: **https://console.cloud.google.com/apis/library/bigquery.googleapis.com**  
- Select project: **gen-lang-client-0299056258**  
- Click **ENABLE**.

### 2. Keep the expensive BQ scheduled queries OFF

- In **BigQuery → Data transfer / Scheduled queries**, leave **Recalculate Profile Trader Stats**, **Recalculate Global Trader Stats**, and **trader profile stats recalc** **paused or deleted**. Do not re-enable them.

### 3. App: Turn the kill switch off

- In **Vercel** (and any other env): set **BIGQUERY_DISABLED** = **false** (or remove the variable).  
- Redeploy so the app can call BigQuery again.

### 4. Crons: Ensure ft-sync (and optionally alpha-agent) run

- In **vercel.json**, **ft-sync** should be present (e.g. `"path": "/api/cron/ft-sync", "schedule": "*/5 * * * *"`).  
- Optionally **alpha-agent** if you use it (already has 1 GB cap per BQ query).  
- Redeploy if you changed crons.

### 5. Byte caps on ML (done in code)

- **predict-trade** (Supabase): `createQueryJob({ query, maximumBytesBilled: '1073741824' })` (1 GB) so each ML.PREDICT is capped.  
- **get-polyscore** (Supabase): same idea for the ML query and, if possible, the trader_dna_snapshots query (e.g. 100 MB cap).  
- This prevents any single ML request from scanning unbounded data.

### 6. Trader stats in Supabase

- Bots and signals read **Supabase** `trader_global_stats` and `trader_profile_stats`.  
- If that data is stale or missing, run **rebuild-all-trader-stats.py** **once** (or very rarely, e.g. weekly), and add `maximum_bytes_billed` in the script before doing so.  
- Do **not** run it on a 30‑min or daily schedule.

### 7. Billing safeguard

- In **Billing → Budgets & alerts**, create a budget (e.g. **$500/month**) with email alerts at **50%**, **90%**, **100%**.  
- Optionally set a second budget at a lower threshold if you want an earlier warning.

---

## What stays gated (optional / later)

- **Backtest run** and **forward-test update POST**: leave them returning 503 until you add `maximumBytesBilled` and/or run them only manually. Then you can re-enable those routes with strict caps.  
- **Forward-test live/daily**: same idea; add byte caps before relying on them heavily.

---

## Summary

| Action | Status |
|--------|--------|
| Re-enable BigQuery API in GCP | You do in Console |
| Leave 30‑min BQ scheduled queries OFF | You keep paused/deleted |
| Set BIGQUERY_DISABLED=false | You set in Vercel + redeploy |
| ft-sync cron (and alpha-agent if needed) | Already in vercel.json |
| Add maximumBytesBilled to predict-trade | Done in code below |
| Add maximumBytesBilled to get-polyscore | Done in code below |
| Trader stats | Use Supabase; rebuild script rarely only, with byte cap |
| Budget alerts | You create in Billing |

After this, ML score works, FT sync and signals can run, and cost is bounded by per-request caps and no 30‑min full-table recalc.

---

## Quick “you do” list

1. **GCP:** Re-enable **BigQuery API** (APIs & Services → BigQuery API → Enable).  
2. **GCP:** Leave the three **scheduled queries** (trader stats every 30 min) **paused/deleted**.  
3. **Vercel:** Set **BIGQUERY_DISABLED** = **false** (or remove it); **redeploy**.  
4. **Supabase:** Redeploy **predict-trade** and **get-polyscore** Edge Functions so the new byte caps are live.  
5. **Billing:** Create a **budget** (e.g. $500/month) with alerts at 50%, 90%, 100%.
