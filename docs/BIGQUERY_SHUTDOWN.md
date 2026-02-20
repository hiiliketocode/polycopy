# BigQuery Shutdown – What Was Done

All BigQuery usage from the app is gated so you can shut it down completely.

## 1. Kill switch: `BIGQUERY_DISABLED`

Set this in your **Vercel** project (and any other env where the app runs):

```bash
BIGQUERY_DISABLED=true
```

When set to `true` or `1`:

- **getPolyScore** returns a safe “Unavailable” response without calling the predict-trade Edge Function (no BigQuery).
- **getBigQueryClient()** throws, so any code path using the shared BQ client fails fast.
- **Backtest** list/run APIs return **503** with message `BigQuery is disabled (BIGQUERY_DISABLED).`
- **Forward-test** update/live/daily APIs return **503**.
- **Alpha agent** `query_bigquery` returns a failure message instead of running a query.

**To turn BigQuery back on later:** set `BIGQUERY_DISABLED=false` (or remove it) and redeploy.

---

## 2. Crons removed (Vercel)

These crons were **removed** from `vercel.json` so they no longer run at all:

- **`/api/cron/ft-sync`** (was every 5 min) – was calling getPolyScore → predict-trade → BigQuery for every qualifying trade.
- **`/api/cron/alpha-agent`** (was daily 06:00 UTC) – could run BigQuery via the agent.

Other crons (lt-execute, lt-sync-order-status, ft-resolve, ft-snapshot, sync-trader-leaderboard, backfill-wallet-pnl, etc.) are unchanged; they do not use BigQuery.

To **re-enable FT sync** later (after you’ve added cost controls): add the ft-sync cron back to `vercel.json` and set `BIGQUERY_DISABLED=false` only when you’re ready.

---

## 3. GCP: disable the BigQuery API (optional but recommended)

To stop **all** BigQuery usage for the project (including scripts, Supabase Edge Functions, and anything else):

1. Open: **https://console.cloud.google.com/apis/library/bigquery.googleapis.com**
2. Select project: **gen-lang-client-0299056258**
3. Click **DISABLE** for the BigQuery API.

No new queries or load jobs will run. Storage will still bill until you delete datasets/tables.

---

## 4. Supabase Edge Functions (predict-trade, get-polyscore)

The app no longer **calls** predict-trade when `BIGQUERY_DISABLED=true`, so FT sync and PolyScore won’t hit BigQuery from the Next app.

If anything else calls **predict-trade** or **get-polyscore** (e.g. another client or cron), those functions will still run BigQuery inside Supabase. To stop that:

- In **Supabase Dashboard** → **Edge Functions**: disable **predict-trade** and **get-polyscore**, or  
- Add a kill-switch env var in those functions (e.g. `BIGQUERY_DISABLED`) and skip the BigQuery step when set.

---

## 5. Scripts and external schedulers

- **rebuild-all-trader-stats.py** and any other Python/Node scripts that use BigQuery do **not** read `BIGQUERY_DISABLED` (they run outside the Next app).  
- If you run them via **cron**, **Cloud Scheduler**, or a **VM**, stop or disable those jobs there.  
- Disabling the **BigQuery API** in GCP (step 3) will make those scripts fail when they try to use BQ, which effectively stops cost from them.

---

## Summary

| Action | Effect |
|--------|--------|
| Set **BIGQUERY_DISABLED=true** in Vercel | All app BQ usage and PolyScore → predict-trade are gated or no-op; backtest/forward-test return 503. |
| **ft-sync** and **alpha-agent** crons removed | No scheduled BQ from those paths. |
| Disable **BigQuery API** in GCP (optional) | No BQ usage from any client (app, Supabase, scripts). |
| Disable or gate **predict-trade** / **get-polyscore** in Supabase (optional) | No BQ from those Edge Functions even if something else calls them. |
| Stop **rebuild-all-trader-stats** (and similar) if scheduled | No big daily scans from scripts. |

After you set the env var and deploy, the app is fully shut down from BigQuery from the Next.js side; optional steps above stop the rest.
