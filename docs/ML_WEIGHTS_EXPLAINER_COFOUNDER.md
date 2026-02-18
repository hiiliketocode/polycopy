# ML Score Without BigQuery — Cofounder Explainer

**TL;DR:** Our “AI score” for trades comes from a logistic regression model that lives in BigQuery. We can **export the model’s “weights” once** and run the exact same math in our own app. No BigQuery at prediction time, no retraining — same scores until we decide the model is stale and retrain.

---

## What “weights” means

The model is a **logistic regression**: it takes ~41 numbers and categories (win rate, ROI, price, niche, etc.) and outputs one number — the **probability that the trade will win** (0–100%).

Under the hood it’s just:

- **One number per input** (the “weight” for that input)
- **One extra number** (the “intercept”)
- **A simple formula:**  
  `score = intercept + (weight₁×input₁ + weight₂×input₂ + … )`  
  then squash that into 0–1 with a standard curve (sigmoid).

So the **entire model** is: that list of weights + the intercept. No “black box” — it’s a fixed formula. Once we have those numbers, we can run that formula anywhere (our API, Supabase, a spreadsheet) and get the same result as BigQuery.

**“Weights” = the saved list of those numbers.** Export them once from BigQuery, store them in our repo or config, and we never need to call BigQuery for predictions again.

---

## Why we can run it in our app without retraining

- **Training** = using historical trades to *learn* the weights (we did that in BigQuery; the model is already trained).
- **Prediction** = given a *new* trade’s 41 inputs, plug them into the formula with those same weights → get the win probability.

We’re only doing **prediction**. We take the **already-learned weights** from BigQuery (via a one-time export) and reuse them. So:

- **No retraining** — we keep using the same weights.
- **Same behavior** — same inputs → same score as when we used BigQuery.
- **No BigQuery at runtime** — the formula runs in our app (Next.js API or Supabase), so no per-request BigQuery cost.

The model will only get “stale” when the real world has moved on (e.g. market regime, user behavior) and the old weights don’t fit as well. Until then, running the same weights in our app is correct and intentional.

---

## What we’re actually doing

1. **One-time:** Export the weights from BigQuery (single query: “give me the weights for this model”). Save them as a JSON file or env config in our app. *If BigQuery is turned off (e.g. billing dispute), we can ask support for a one-time read-only export of this query result, or use any existing backup of the weights file — see "Getting the weights when you can't use BigQuery" in ML_OFF_BIGQUERY_MIGRATION.md.*
2. **Every time we need a score:** Our app has a small function that takes the 41 inputs for that trade, multiplies each by its weight, adds the intercept, runs the sigmoid — and returns the probability. No network call to BigQuery, no BigQuery bill for that request.
3. **predict-trade (and thus bots/signals):** Instead of calling BigQuery, we call our own **/api/ml/predict** (or equivalent) with those same 41 inputs; we get back the same number we used to get from BigQuery.

So “running it in our app” = **running the same formula with the same weights in our own code** until we decide to retrain and replace the weights.

---

## When we’d retrain

- When we think the model is **stale** (e.g. performance drops, big market or product change).
- Retraining would mean: get fresh training data (we can export from BigQuery or use another source), train a new logistic regression (e.g. in Python or back in BigQuery), get **new** weights, then update the JSON/config in our app and redeploy. No need to do that until we’re ready.

---

## Do we need Supabase (or anything else)?

**For the prediction itself: no.** The formula runs in our Next.js app using the saved weights. No Supabase, no BigQuery, and no other new service is required for the ML math.

**In our current setup:** The flow that *requests* a score (e.g. feed, FT sync, bots) calls **predict-trade**, which is a **Supabase Edge Function**. So we already use Supabase to run that function. After the migration, predict-trade will call our own **/api/ml/predict** (on Vercel or wherever the Next.js app is hosted) instead of BigQuery. So:

- **Supabase** = where predict-trade lives (we already have it).
- **Next.js app** = where the weights live and where the score is computed; no extra DB or ML service needed.

Nothing else is required — no new database, no TensorFlow, no separate ML API. Option A is just: export weights once → serve them from the app → predict-trade calls our API instead of BigQuery.

---

## Summary for product/ops

- **Weights** = the saved numbers that define our current “AI score” formula. Export once from BigQuery.
- **Running without BigQuery** = we run that formula in our app using those weights; no BigQuery call per prediction, no extra cost there.
- **No retraining for now** = we keep using the same weights until we decide the model is stale and we retrain and replace them.

Same scores, same product; we just moved where the math runs so we’re not tied to BigQuery for the time being.

**Separate issue — conviction, ROI, win rate:** Those come from **trader_global_stats** and **trader_profile_stats** in Supabase, which were previously synced from BigQuery every 30 minutes. Without that sync, those tables go stale. We have a plan to refresh them using the **Polymarket Data API** (no BigQuery): see **docs/TRADER_STATS_WITHOUT_BIGQUERY.md**.
