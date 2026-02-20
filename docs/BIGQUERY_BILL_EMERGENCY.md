# BigQuery $56k Bill — Immediate Actions & Prevention

## Do this right now (today)

### 1. Contact Google Cloud Billing Support (free)
- **Console**: [Google Cloud Console](https://console.cloud.google.com) → **Help** (?) → **Support** → **Billing**
- Or: **Billing** → **Account management** → **Get billing support**
- Explain: unexpected $56k in 2 weeks, already charged, request review and possible refund/credit.
- Have ready: project ID `gen-lang-client-0299056258`, billing account, and approximate dates of the spike.

### 2. Find what drove the cost
- **Console** → **Billing** → **Reports**
  - Filter by **Product** = BigQuery (and BigQuery Storage if relevant).
  - Group by **SKU** and/or **Project** to see Query vs Storage vs Data Transfer.
- **Console** → **BigQuery** → **Job history**
  - Filter by date range (last 14 days).
  - Sort by **Bytes processed** (or **Slot time**) to find the heaviest jobs.
  - Note job labels, user, and query patterns (which tables, full scans, etc.).

### 3. Stop new spend immediately
- **Option A – Budget + alert (does not stop jobs)**
  - **Billing** → **Budgets & alerts** → Create a budget (e.g. $500/month) with email alerts at 50%, 90%, 100%.
- **Option B – Disable BigQuery in project (stops new queries)**
  - Disable the **BigQuery API** for the project: **APIs & Services** → **Enabled APIs** → **BigQuery API** → Disable.
  - This stops new query and load jobs; storage will still incur cost until you delete data.
- **Option C – Cap query cost per job (recommended in code)**
  - Use `maximumBytesBilled` on every query (see “Code fixes” below) so no single job can exceed a cap (e.g. 10 GB).

### 4. Dispute / refund
- Billing support can sometimes offer a one-time credit for clearly unexpected usage.
- Be clear: “We did not intend to spend this much; we’ve identified the cause and added safeguards.”

---

## If the cost is consistent every day (~$3K–$5K)

That pattern usually means **something runs on a schedule** (daily or every few hours), not one-off backtests.

1. **Check what type of cost it is**
   - **Billing → Reports** → filter by **Product** or **SKU**:
     - **BigQuery Analysis** = query cost (SQL / ML.PREDICT).
     - **BigQuery Storage** = storage (roughly $0.02/GB/month; very large storage can add up but is rarely $3–5K/day by itself).
     - **BigQuery Data Transfer** / **Load** = moving or loading data (e.g. DTS, load jobs from GCS).
   - That tells you whether it’s **queries**, **storage**, or **loads**.

2. **Find the jobs that run every day**
   - **BigQuery → Job history** → last 7 days.
   - Sort by **Bytes processed** (or **Slot time**).
   - Look for jobs that appear **once or a few times per day** at similar times (e.g. 01:00, 02:00, 06:00). Those are the usual suspects for a steady daily bill.

3. **Likely “steady daily” culprits in or around this repo**
   - **Scheduled pipelines** (run by cron/Cloud Scheduler/VM, not Vercel): e.g. `daily-sync-trades-markets.py`, `backfill_v2.py`, `rebuild-all-trader-stats.py`, DTS setup in `DTS_SETUP_GUIDE.md`. Any of these running daily with no `maximum_bytes_billed` can scan huge amounts.
   - **BigQuery Data Transfer Service (DTS)** loading from GCS on a schedule, plus any follow-up MERGE/query jobs.
   - **Scheduled queries** created in the GCP BigQuery UI (no code in this repo).
   - **FT sync + PolyScore**: FT sync runs **every 5 minutes** and, for wallets with `use_model` enabled, calls **predict-trade** (Supabase) → **BigQuery ML.PREDICT** per new trade. High trade volume × many wallets can add up; cost is still per-query, so check Job history for many small ML jobs vs a few huge ones.
   - **get-polyscore** (Supabase): each call does a `trader_dna_snapshots` query + **ML.PREDICT** (`trade_predictor_v5`). If this is hit on every trade card or similar, volume could be high.

So: use **Reports** to see Query vs Storage vs Load, then use **Job history** to see which jobs run daily and how many bytes they process.

---

## Likely causes in this repo

Findings from the codebase:

| Area | Risk | Why |
|------|------|-----|
| **Backtest API** (`app/api/backtest/run/route.ts`) | **Very high** | No `maximumBytesBilled`. Each run can scan 10–100+ GB (trader_stats_at_trade, enriched_trades, trades). Multiple runs or wide date ranges = huge cost. |
| **lib/bigquery/client.ts** | **High** | `fetchTopTraders`, `getTradeStats`, `fetchTradesFromBigQuery`, `fetchMarketResolutions` have **no** byte limit. `fetchTopTraders` is a full table scan on 84M+ rows. |
| **Alpha agent** (`lib/alpha-agent/bigquery-tool.ts`) | **Medium** | Has 1 GB/job cap (good). Many chats with heavy queries could still add up. |
| **Backtest list** (`app/api/backtest/list/route.ts`) | Low | Small metadata table, but still no cap. |
| **predict-trade** (Supabase) | **Medium** | BigQuery ML.PREDICT per request; no byte limit. High traffic = many small-but-uncapped jobs. |
| **Python scripts** (backfill, sync, rebuild stats, etc.) | **Very high** | Dozens of scripts run `client.query()` with no `maximum_bytes_billed`. Full table scans, MERGEs, backfills. If any ran on a schedule or repeatedly, they can dominate the bill. |

Most plausible for **$56k in 2 weeks**:
1. Backtest runs (manual or scripted) with large date ranges or many runs.
2. Scheduled or repeated data pipelines (e.g. `backfill_v2`, `daily-sync-trades-markets`, `rebuild-all-trader-stats`, DTS).
3. Alpha agent or other app traffic with many uncapped queries.

---

## Code fixes to prevent recurrence

### 1. Enforce a global byte cap for all BQ queries
- In `lib/bigquery/client.ts` (and any shared BQ wrapper), run all queries via a helper that sets `maximumBytesBilled` (e.g. 10 GB per job). Fail the request if the dry run or job would exceed that.

### 2. Backtest API
- Use `createQueryJob` with `maximumBytesBilled: '10737418240'` (10 GB) (or lower) for both the “trader basket” query and the main trades query.
- Optionally add a server-side rate limit or daily cap on backtest runs per user/IP.

### 3. Alpha agent
- Keep the existing 1 GB limit; consider lowering to 500 MB if usage is high.

### 4. predict-trade (Supabase)
- Add `maximumBytesBilled` to the BigQuery ML.PREDICT job (e.g. 1 GB).

### 5. Budgets and alerts
- Create a **project-level** budget (e.g. $1k or $2k/month) with alerts at 50%, 90%, 100%.
- Optionally use a **programmatic** budget that disables the BigQuery API when a threshold is hit (see Cloud docs: “Disable billing usage with notifications”).

### 6. Python scripts
- For any script that runs in production or on a schedule, set `maximum_bytes_billed` in `QueryJobConfig` (e.g. 50 GB for backfills, lower for ad‑hoc queries).

---

## Quick reference: BigQuery pricing (on-demand)
- **Queries**: ~$6.25 per TB of bytes processed (as of 2024; confirm in your region).
- **$56,000** ≈ **~9,000 TB** processed in 2 weeks, or ~**640 TB/day**.
- So either: a small number of very large jobs (e.g. full table scans on 84M-row tables many times), or a large number of medium-sized jobs. Job history will show which.

---

## Checklist
- [ ] Contact GCP Billing Support and request review/refund.
- [ ] Run Billing Reports + BigQuery Job history to identify top cost drivers.
- [ ] Add a budget with email alerts (and optionally disable API at threshold).
- [ ] Add `maximumBytesBilled` to all query paths (Node + Python).
- [ ] Re-enable or keep BigQuery only after safeguards are in place.
