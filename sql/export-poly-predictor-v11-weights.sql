-- ============================================================================
-- Export weights for poly_predictor_v11 (one-time run when BQ is available)
-- ============================================================================
-- Run in BigQuery Console or:
--   bq query --format=json --use_legacy_sql=false < sql/export-poly-predictor-v11-weights.sql > lib/ml/poly_predictor_v11_weights.json
--
-- Use the output JSON in lib/ml/poly-predictor-v11.ts for local prediction.

SELECT
  processed_input,
  weight,
  category_weights
FROM ML.WEIGHTS(MODEL `gen-lang-client-0299056258.polycopy_v1.poly_predictor_v11`);
