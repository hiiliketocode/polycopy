# Moving ML Score Off BigQuery: Export Model and Run Elsewhere

Your production model **poly_predictor_v11** is a **BigQuery ML logistic regression** model. You can stop using BigQuery for scoring by (1) exporting the model weights once, then (2) running prediction in your own stack with no BQ dependency.

---

## Options (high level)

| Option | What you do | Where it runs | Pros / cons |
|--------|-------------|---------------|-------------|
| **A. Export weights + local predictor** | Run `ML.WEIGHTS` in BQ once, save JSON. Implement `probability = sigmoid(intercept + Σ weight_i × feature_i)` in TypeScript. | Next.js API route or Supabase Edge | No BQ at inference, no extra infra. You must replicate feature order and categorical encoding. |
| **B. Export model to GCS, serve with TensorFlow** | Use BigQuery `EXPORT MODEL` to GCS (TensorFlow SavedModel). Run inference with TensorFlow.js or a small Python service. | Cloud Run / Vertex / Vercel / Supabase | Portable model; need to run TF or Python. |
| **C. Re-train outside BQ** | Export a sample of training data from BQ once; re-train a logistic regression in Python (e.g. sklearn), save coefficients; serve via API. | Same as A | Full control; need to re-train and validate. |

**Recommended:** **Option A** – one-time export of weights, then a small predictor in your app. No BigQuery at inference, no new services.

---

## Option A: Weights export + local predictor (recommended)

### 1. One-time: Export weights from BigQuery

You need **one-time** access to BigQuery (e.g. re-enable the API briefly, or use a saved export from when it was on).

**In BigQuery (Console or `bq`):**

```sql
SELECT
  processed_input,
  weight,
  category_weights
FROM ML.WEIGHTS(MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11`);
```

- **processed_input** = feature name (or intercept).
- **weight** = coefficient for numeric features; NULL for categoricals.
- **category_weights** = one-hot weights for categoricals (e.g. `[{"category": "SPORTS", "weight": 0.02}, ...]`).

Save the result as JSON (e.g. `poly_predictor_v11_weights.json`) and commit it to the repo or store it in env (e.g. as a build-time or runtime asset). The intercept is usually a row with `processed_input` like `'__INTERCEPT__'` or empty; `weight` there is the intercept.

If you use the script below, it runs this query and writes the JSON file.

**Script (run once with BQ access):**

```bash
# From project root, with GOOGLE_APPLICATION_CREDENTIALS or gcloud auth
bq query --format=json --use_legacy_sql=false \
  "SELECT processed_input, weight, category_weights FROM ML.WEIGHTS(MODEL \`gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11\`)" \
  > lib/ml/poly_predictor_v11_weights.json
```

(Or run the SQL in the Console and download/export as JSON.)

### 2. Implement the predictor (your repo)

- **Input:** One row of the **same 41 features** as in `create-poly-predictor-v11.sql`, in the **same order** and with the **same names** BQ uses (including categoricals: `performance_regime`, `final_niche`, `bet_structure`, `trader_experience_bucket`, `market_age_bucket`, `trade_size_tier`, `position_direction`).
- **Math:**  
  - Numeric: `contribution = weight * value`.  
  - Categorical: one-hot → `contribution = category_weights[value]` (or 0 if missing).  
  - Intercept: one row from `ML.WEIGHTS` (e.g. `processed_input = '__INTERCEPT__'`).  
  - `logit = intercept + sum(contributions)`  
  - `probability = 1 / (1 + Math.exp(-logit))` (probability of WON).

Implement this in:

- **lib/ml/poly-predictor-v11.ts** (or similar): load `poly_predictor_v11_weights.json`, expose `predict(features: Record<string, number | string>): number` returning the WON probability.

Feature names and types must match what you send from **predict-trade** (see below).

### 3. Expose an HTTP endpoint

- **Next.js:** Add **POST /api/ml/predict** that:
  - Accepts a JSON body with the 41 feature names and values (numerics and categoricals).
  - Calls the local predictor and returns `{ winProb: number }` (and optionally `edge`, etc.).

So at inference time:

- **No BigQuery** is called.
- **No per-query BQ cost**; only your own hosting (e.g. Vercel).

### 4. Point predict-trade at your API (instead of BQ)

In **supabase/functions/predict-trade/index.ts**:

- Keep building the **same 41 features** as today (you already have all the variables).
- **Remove** the BigQuery `createQueryJob` / `ML.PREDICT` call.
- **Add** a `fetch` to your app, e.g.:

  `POST https://your-app.vercel.app/api/ml/predict`  
  Body: JSON object with the same feature names and values (numbers and strings).

- Use the returned `winProb` exactly as you do now (edge, Kelly, PolyScore, etc.).

Use an env var (e.g. `POLYCOPY_ML_PREDICT_URL`) so you can point to localhost in dev and production URL in prod.

### 5. Bots and signals

- **FT sync** already calls **getPolyScore** → **predict-trade**. Once predict-trade uses your **/api/ml/predict** instead of BQ, bots and signals get ML score with **no BigQuery**.
- **Trader stats** (trader_global_stats, trader_profile_stats) stay in **Supabase**; no change.

---

## Option B: Export model to GCS and serve with TensorFlow

1. **One-time in BigQuery (with BQ enabled):**
   - `EXPORT MODEL` to a GCS path (e.g. `gs://your-bucket/poly_predictor_v11/`).  
   - BigQuery ML exports LOGISTIC_REG as TensorFlow SavedModel.

2. **Serve predictions:**
   - **TensorFlow.js** in Node or the browser: load the SavedModel and run `model.predict(featureTensor)`.
   - Or a **small Python service** (Flask/FastAPI) that loads the SavedModel and exposes a REST endpoint; deploy on Cloud Run, Fly.io, or a VPS.
   - **predict-trade** then calls that endpoint instead of BQ.

You must build the same 41 features and feed them in the same order/shape the SavedModel expects (often a single vector).

---

## Option C: Re-train outside BigQuery

1. Export a sample of **enriched_trades_training_v11** (or the table used in `create-poly-predictor-v11.sql`) from BigQuery once (e.g. to GCS or CSV).
2. Train a logistic regression in Python (e.g. `sklearn.linear_model.LogisticRegression`) on the same 41 features and target `outcome`.
3. Save coefficients and intercept (e.g. JSON or joblib); implement the same `sigmoid(intercept + Σ coef_i * x_i)` in TypeScript or call a small Python API that loads the model and predicts.
4. Wire **predict-trade** to that API instead of BQ.

---

## Getting the weights when you can’t use BigQuery

If the BigQuery API is disabled (e.g. billing dispute, “turn it off” instruction) and you have **no other way** to run a query yourself, you still need the weights once. Options:

### 1. Ask Google / support for a one-time data export (recommended)

Frame it as **data portability**: you need to export your model weights so you can migrate off the platform. Request one of:

- **Option A:** They run the query (read-only, no writes, minimal bytes) and send you the JSON result, or  
- **Option B:** They temporarily enable **read-only** access (or a short window) so you can run the query yourself, with a strict **maximum_bytes_billed** if they’re worried about cost.

**Exact query** (single, small read from the model — no table scan):

```sql
SELECT processed_input, weight, category_weights
FROM ML.WEIGHTS(MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11`);
```

You can send support this SQL and say: “This is the only query I need to run. It reads only the stored model coefficients (no scan of large tables). I need the result as JSON so I can stop using BigQuery for predictions.”

**Why this is not a big data pull:** The model `poly_predictor_v11` was already trained and is stored by BigQuery as a **saved artifact** in your dataset (metadata + coefficients). `ML.WEIGHTS()` only **reads that saved model** — it does not re-run training, does not read the training table (e.g. `enriched_trades_training_v11`), and does not scan any other tables. The "bytes processed" for this query are roughly the size of the model itself (dozens of coefficients + intercept + category weights), i.e. on the order of **kilobytes**. So it's a tiny, metadata-only read, not a table scan.

### 2. Check for an existing copy of the weights

- Another machine or backup where `bq query ... > poly_predictor_v11_weights.json` was run.
- A cofounder, contractor, or former teammate who might have the file.
- Old backups of the repo or a drive (the file might have been committed then later removed or gitignored).
- If you find a JSON array of `{ processed_input, weight, category_weights }`, put it in `lib/ml/poly_predictor_v11_weights.json` or set `POLY_PREDICTOR_V11_WEIGHTS_JSON` and you’re done.

### 3. Re-train outside BigQuery (only if you have training data elsewhere)

If you **never** get BQ access again but you **do** have a copy of the training data (e.g. exported `enriched_trades_training_v11` or equivalent to CSV/GCS before the dispute), you can train a logistic regression in Python (e.g. `sklearn.linear_model.LogisticRegression`) on the same 41 features and target, then export coefficients + intercept and use them as “weights” in the same way. The app expects the same formula (intercept + sum of weight×feature, then sigmoid). This does **not** require re-enabling BigQuery, but it does require the training dataset to exist somewhere other than BQ.

### 4. If support allows a short read-only window

If they agree to a brief, read-only re-enable (e.g. 5–10 minutes) with a cost cap:

- In BigQuery, set **Query settings → Additional settings → Maximum bytes billed** to a low cap (e.g. 10 MB). `ML.WEIGHTS` only reads model metadata, so it should stay well under that.
- Run the SQL above, download the result as JSON, save as `lib/ml/poly_predictor_v11_weights.json`.
- Turn the API off again. You only need this once.

---

## Summary

- **Fastest path to “ML score without BigQuery”:** Option A (export weights once → local predictor → **/api/ml/predict** → predict-trade calls it).
- **What you need:** One-time run of `ML.WEIGHTS` (and saving the JSON), then a predictor module + **POST /api/ml/predict** and a small change in predict-trade to call that URL instead of BigQuery.
- After that, **bots and signals** work again with ML score and no BigQuery cost at inference.

---

## What’s in the repo (done)

- **sql/export-poly-predictor-v11-weights.sql** – SQL to run in BQ to export weights.
- **lib/ml/poly-predictor-v11.ts** – Local predictor: `predictWithWeights(weights, features)` → P(WON). No BQ.
- **app/api/ml/predict/route.ts** – POST **/api/ml/predict** with body `{ features: { ...41 keys... } }` → `{ winProb }`. Loads weights from `lib/ml/poly_predictor_v11_weights.json` or env **POLY_PREDICTOR_V11_WEIGHTS_JSON**.
- **lib/ml/README.md** – Export instructions and API usage.

---

## Wiring predict-trade to /api/ml/predict (done)

- **predict-trade** now checks **POLYCOPY_ML_PREDICT_URL** first. If set, it builds the 41 feature object and calls `POST {POLYCOPY_ML_PREDICT_URL}/api/ml/predict`; if not set, it falls back to BigQuery (or 0.5 if no BQ credentials).
- You do **not** need **GOOGLE_SERVICE_ACCOUNT_JSON** when using the local ML API.

### Production testing (admin-only)

1. **Deploy Next.js** (e.g. Vercel) with the weights available:
   - Either commit **lib/ml/poly_predictor_v11_weights.json** so the app loads it at runtime, or set **POLY_PREDICTOR_V11_WEIGHTS_JSON** in Vercel env (stringified array).
2. **Supabase:** Set the Edge Function secret **POLYCOPY_ML_PREDICT_URL** to your production app URL (e.g. `https://your-app.vercel.app`) with no trailing slash.
   - In Dashboard: Project → Edge Functions → predict-trade → Secrets, or CLI: `supabase secrets set POLYCOPY_ML_PREDICT_URL=https://your-app.vercel.app`
3. **Deploy predict-trade:** `supabase functions deploy predict-trade`
4. Test in production (e.g. trigger a trade card or FT sync that calls getPolyScore → predict-trade). The Edge Function will call your app’s `/api/ml/predict`; no BigQuery is used when **POLYCOPY_ML_PREDICT_URL** is set.

**If `supabase functions deploy predict-trade` fails with “unexpected character \\n in variable name”:** the CLI is loading an env file that has a value with newlines (e.g. JSON). From the repo root, temporarily rename it and deploy, then restore:  
`mv .env.local .env.local.bak && supabase functions deploy predict-trade && mv .env.local.bak .env.local`
