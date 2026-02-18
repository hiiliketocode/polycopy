/**
 * Local predictor for poly_predictor_v11 (logistic regression).
 * Uses weights exported from BigQuery ML.WEIGHTS so inference does not call BigQuery.
 *
 * One-time setup: run sql/export-poly-predictor-v11-weights.sql and save output
 * as poly_predictor_v11_weights.json in this directory (or pass weights to init).
 */

export type WeightRow = {
  processed_input?: string | null;
  weight?: number | null;
  category_weights?: Array<{ category?: string; weight?: number }> | null;
};

/** Sigmoid: 1 / (1 + exp(-x)) */
function sigmoid(x: number): number {
  const v = Math.max(-20, Math.min(20, x));
  return 1 / (1 + Math.exp(-v));
}

/**
 * Compute P(WON) from features using exported BQ ML weights.
 * features: flat object with same names as model (numeric and string for categoricals).
 */
export function predictWithWeights(
  weights: WeightRow[],
  features: Record<string, number | string>
): number {
  let logit = 0;

  for (const row of weights) {
    const input = row.processed_input ?? '';
    const isIntercept =
      input === '' ||
      input === '__INTERCEPT__' ||
      input.toUpperCase() === 'INTERCEPT';

    if (isIntercept && typeof row.weight === 'number') {
      logit += row.weight;
      continue;
    }

    const value = features[input];
    if (value === undefined) continue;

    if (row.category_weights != null && row.category_weights.length > 0) {
      const category = String(value);
      const catRow = row.category_weights.find(
        (c) => String(c?.category ?? '').toUpperCase() === category.toUpperCase()
      );
      if (catRow != null && typeof catRow.weight === 'number') {
        logit += catRow.weight;
      }
    } else if (typeof row.weight === 'number' && typeof value === 'number') {
      logit += row.weight * value;
    }
  }

  return sigmoid(logit);
}

let cachedWeights: WeightRow[] | null = null;

/**
 * Load weights from JSON file (Node). In Next.js, the file must be present at
 * runtime (e.g. in lib/ml/poly_predictor_v11_weights.json after you export from BQ).
 */
export function loadWeightsFromModule(weights: WeightRow[]): void {
  cachedWeights = weights;
}

export function getCachedWeights(): WeightRow[] | null {
  return cachedWeights;
}

/**
 * Predict P(WON) using cached weights. Returns 0.5 if weights not loaded.
 */
export function predict(features: Record<string, number | string>): number {
  const w = cachedWeights;
  if (!w || w.length === 0) return 0.5;
  return predictWithWeights(w, features);
}
