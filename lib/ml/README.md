# Local ML predictor (no BigQuery at inference)

## poly_predictor_v11

One-time export of weights from BigQuery, then prediction runs in-app with no BQ cost.

### 1. Export weights (once, when BQ is available)

Run in BigQuery or with `bq`:

```bash
bq query --format=json --use_legacy_sql=false \
  "SELECT processed_input, weight, category_weights FROM ML.WEIGHTS(MODEL \`gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11\`)" \
  > lib/ml/poly_predictor_v11_weights.json
```

Or run the SQL in `sql/export-poly-predictor-v11-weights.sql` in the BigQuery Console and download the result as JSON. Save it as `lib/ml/poly_predictor_v11_weights.json`.

**Note:** If the export is an object with a `rows` array, use the array inside (e.g. `result.rows` or the first key that is the array of rows). The predictor expects a JSON **array** of `{ processed_input, weight, category_weights }`.

### 2. Weights via env (alternative)

Set `POLY_PREDICTOR_V11_WEIGHTS_JSON` to the stringified array (e.g. in Vercel env). Same shape as above.

### 3. API

- **POST /api/ml/predict**  
  Body: `{ "features": { "global_win_rate": 0.55, "D30_win_rate": 0.52, ..., "performance_regime": "STABLE", ... } }`  
  (Same 41 feature names and types as the BigQuery model.)  
  Response: `{ "winProb": 0.62 }`.

### 4. predict-trade (Supabase)

Point the Edge Function at this API instead of BigQuery: build the same feature object, POST it to `https://your-app.vercel.app/api/ml/predict`, use the returned `winProb`. Set `POLYCOPY_ML_PREDICT_URL` in Supabase to your app URL.
