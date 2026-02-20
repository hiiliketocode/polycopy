# How to Stop BigQuery Scheduled Queries (Trader Stats & Others)

Scheduled queries in BigQuery (including ones that refresh **trader_global_stats**, **trader_profile_stats**, or anything else) live in **BigQuery Data Transfer**. You need to **disable or delete** them in Google Cloud. They are not defined in this repo.

---

## Option 1: Google Cloud Console (UI)

### 1. Open Data Transfer / Scheduled Queries

1. Go to **[Google Cloud Console](https://console.cloud.google.com)** and select project **gen-lang-client-0299056258**.
2. Open **BigQuery** (search “BigQuery” or use the menu).
3. In the left sidebar, under **Data management** or **Data transfer**, click **Scheduled queries** (or **Transfer history** / **Data transfers** depending on the menu).
   - If you don’t see it: try **BigQuery** → **Data transfer** in the main nav, or open:  
     **https://console.cloud.google.com/bigquery/scheduled-queries?project=gen-lang-client-0299056258**

### 2. List and identify configs

- You’ll see a list of **transfer configs**. Each one is either:
  - A **scheduled query** (runs SQL on a schedule), or
  - A **data transfer** (e.g. GCS → BigQuery).
- Look for any whose **name or description** mentions:
  - **trader_global_stats**
  - **trader_profile_stats**
  - **trader stats**
  - **rebuild**
  - Or any schedule that runs daily/hourly and you don’t recognize.

### 3. Disable or delete each one

- **Disable (stops future runs, keeps config):**
  - Open the config → find **Disable** or a “pause”/toggle and turn it off.
- **Delete (removes it permanently):**
  - Open the config → **Delete** (or three dots → Delete).

Do this for **every** scheduled query / transfer you want to stop (trader profile, global stats, and any others).

---

## Option 2: Command line (list and delete)

### 1. List all transfer configs (scheduled queries + other transfers)

```bash
bq ls --transfer_config --transfer_location=us --project_id=gen-lang-client-0299056258
```

Or with gcloud (same project):

```bash
gcloud alpha bq transfer-configs list --project_id=gen-lang-client-0299056258 --location=us
```

You’ll see **display name**, **config ID**, and **schedule**. Note the config IDs for anything that looks like trader stats or other heavy jobs.

### 2. Delete a specific scheduled query / transfer config

Use the **full resource name** from the list (e.g. `projects/gen-lang-client-0299056258/locations/us/transferConfigs/xxxxx`):

```bash
bq rm --transfer_config \
  projects/gen-lang-client-0299056258/locations/us/transferConfigs/CONFIG_ID_HERE
```

Replace `CONFIG_ID_HERE` with the actual ID (e.g. a long hex string or a name like `scheduled_query_abc123`).

Example if the ID were `abc123-def456`:

```bash
bq rm --transfer_config \
  projects/gen-lang-client-0299056258/locations/us/transferConfigs/abc123-def456
```

Repeat for **every** config you want to stop (trader profile, global stats, and any others).

### 3. Disable instead of delete (via API)

If the UI or `bq` doesn’t give a “disable” option, you can use the Data Transfer API to set **disabled = true** so it won’t run again but the config stays. That requires a small script or `gcloud`/API call; if you prefer to just **delete** (as above), that’s enough to stop them.

---

## What to look for (trader stats and similar)

- **trader_global_stats** – usually built by something like  
  `CREATE OR REPLACE TABLE ... trader_global_stats AS SELECT ... FROM trades ...`
- **trader_profile_stats** – usually built by  
  `CREATE OR REPLACE TABLE ... trader_profile_stats AS SELECT ...`
- Any **daily** or **hourly** schedule that runs in the early morning (e.g. 1am, 2am UTC) and touches big tables (**trades**, **markets**, **trader_global_stats**, **trader_profile_stats**).

Those are the ones that can burn a lot of bytes; stop or delete all of them you don’t need.

---

## GCS → BigQuery transfer (DTS)

If you use **Data Transfer** to load from GCS into BigQuery (e.g. **gcs-to-trades-staging** from `DTS_SETUP_GUIDE.md`), that also appears under the same **Data transfer** / **Scheduled queries** area. If you want to stop **all** scheduled BigQuery work:

- Find that transfer config in the list and **disable** or **delete** it the same way.

To list and then remove it by ID:

```bash
bq ls --transfer_config --transfer_location=us --project_id=gen-lang-client-0299056258
# then:
bq rm --transfer_config projects/gen-lang-client-0299056258/locations/us/transferConfigs/gcs-to-trades-staging
```

(Use the exact config ID shown by `bq ls` if it’s different.)

---

## External schedulers (cron / Cloud Scheduler)

- **trader_global_stats** and **trader_profile_stats** can also be updated by running **rebuild-all-trader-stats.py** on a schedule (cron, Cloud Scheduler, or a VM).
- That script is **not** a BigQuery scheduled query; it runs on your side and calls BigQuery.
- So in addition to stopping scheduled queries in BigQuery:
  - Check **Cloud Scheduler**:  
    https://console.cloud.google.com/cloudscheduler?project=gen-lang-client-0299056258  
    and disable/delete any job that runs `rebuild-all-trader-stats.py` or similar.
  - Check any **cron** or **CI/CD** that might run that script and disable it.

---

## Quick checklist

1. **BigQuery** → **Data transfer** / **Scheduled queries** → disable or delete every config you want to stop (trader profile, global stats, and any others).
2. **Cloud Scheduler** → disable/delete any job that runs trader-stats rebuilds or other heavy BQ scripts.
3. **Cron / other schedulers** → turn off anything that runs `rebuild-all-trader-stats.py` or similar.
4. Optionally **disable the BigQuery API** for the project to block all queries and loads until you’re ready to turn things back on.

After this, no scheduled queries in BigQuery will run for trader profile, global stats, or the other configs you removed/disabled.
