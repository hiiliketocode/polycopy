# ML + Signals: Where We Are and What’s Next (Cofounder Brief)

**TL;DR:** We moved the ML score off BigQuery — it’s live and working. The **other signals** (conviction, ROI, win rate per trader) still come from Supabase tables that used to be refreshed from BigQuery every 30 minutes. Those tables are **going stale**. We need to refresh them soon (e.g. from the Polymarket Data API) so strategies and the feed use accurate data. Longer term we need a plan for **where and how to retrain** the model when it gets stale.

---

## What we just did (done)

- **ML score (PolyScore)** no longer uses BigQuery. We exported the model’s weights once and run the same formula in our app (`/api/ml/predict`). predict-trade calls that API when `POLYCOPY_ML_PREDICT_URL` is set. Trades are going through again and the ML score is correct.
- **Docs:** `ML_WEIGHTS_EXPLAINER_COFOUNDER.md` (what weights are), `ML_OFF_BIGQUERY_MIGRATION.md` (technical migration).

---

## What we need soon: the other signals

The **ML score** is only one input. The rest of the product relies on **trader stats**: win rate, ROI, average bet size, and (per niche) profile stats. Those live in Supabase in **trader_global_stats** and **trader_profile_stats**. They used to be updated every 30 minutes from BigQuery; with BigQuery off, that sync stopped, so the tables are **going stale**.

**Why it matters:**

- **Conviction** on the feed = trade size ÷ avg bet size (from these tables). Stale → wrong conviction.
- **ROI and win rate** on cards and in filters come from the same tables. Stale → wrong rankings and filters.
- **predict-trade** uses these stats as part of the 41 ML inputs. Stale stats → slightly worse ML inputs (score still runs, but on outdated trader performance).
- **FT sync and strategies** filter and display by win rate / ROI. We need **accurate** data so strategies (e.g. “only copy traders with 55%+ win rate and 15%+ ROI”) actually use current numbers.

So we need to **refresh these tables without BigQuery** as soon as we can. The plan is to use the **Polymarket Data API** (leaderboard, closed positions, activity) in a cron job that recomputes and upserts into `trader_global_stats` and `trader_profile_stats`. Full options and implementation sketch are in **`TRADER_STATS_WITHOUT_BIGQUERY.md`**. Priority: get a first version live so the data stops going stale; we can refine (e.g. profile stats by niche) after.

---

## Long term: retraining the model

Right now we’re only **using** the existing weights (prediction). We’re not **retraining**. The model will eventually become stale (market or user behavior shifts, performance drifts). When that happens we need to:

- **Retrain** = take historical trades + outcomes, recompute the 41-feature logistic regression, get new weights.
- **Where:** We no longer have BigQuery for this. Options: (1) Export training data once from wherever we have it (e.g. Supabase, or a one-off BQ export if we ever get access again), (2) Train in Python (e.g. sklearn) on that data, (3) Export the new coefficients and update the weights file / env in the app. We don’t have to decide the exact pipeline today, but we should **document** that retraining is “future work” and that it will happen outside BigQuery (or via a one-off export) and then we update the app’s weights.

---

## Summary for you

| Item | Status | Action |
|------|--------|--------|
| **ML score off BigQuery** | Done | None. Live in prod. |
| **Other signals (conviction, ROI, win rate)** | Going stale | Implement refresh from Polymarket Data API soon; see `TRADER_STATS_WITHOUT_BIGQUERY.md`. Need accurate data for strategies. |
| **Retraining the model** | Later | Plan where/how to retrain (e.g. Python + exported data) and how we’ll update the app’s weights when we do. |

We need to **get the signals refreshed as soon as possible** so strategy logic and the feed are using accurate data. Retraining can be figured out in parallel or once signals are stable.
