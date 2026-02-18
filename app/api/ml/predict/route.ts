/**
 * Local ML prediction for poly_predictor_v11 (no BigQuery).
 * POST body: JSON object with the 41 feature names/values (same as predict-trade sends to BQ).
 * Returns { winProb: number } for P(WON).
 *
 * Weights: set POLY_PREDICTOR_V11_WEIGHTS_JSON (stringified array from ML.WEIGHTS)
 * or place poly_predictor_v11_weights.json in lib/ml/ and it will be loaded at runtime.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { predictWithWeights, type WeightRow } from '@/lib/ml/poly-predictor-v11';

function loadWeights(): WeightRow[] | null {
  const fromEnv = process.env.POLY_PREDICTOR_V11_WEIGHTS_JSON;
  if (fromEnv) {
    try {
      return JSON.parse(fromEnv) as WeightRow[];
    } catch {
      return null;
    }
  }
  try {
    const p = path.join(process.cwd(), 'lib/ml/poly_predictor_v11_weights.json');
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as WeightRow[];
  } catch {
    return null;
  }
}

let weightsCache: WeightRow[] | null = null;

function getWeights(): WeightRow[] | null {
  if (weightsCache) return weightsCache;
  weightsCache = loadWeights();
  return weightsCache;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const features = body.features ?? body;
    if (typeof features !== 'object' || features === null) {
      return NextResponse.json(
        { error: 'Missing or invalid body: expected { features: { ... } }' },
        { status: 400 }
      );
    }

    const weights = getWeights();
    if (!weights || weights.length === 0) {
      return NextResponse.json(
        {
          error:
            'Weights not loaded. Export ML.WEIGHTS to lib/ml/poly_predictor_v11_weights.json or set POLY_PREDICTOR_V11_WEIGHTS_JSON.',
          winProb: 0.5,
        },
        { status: 503 }
      );
    }

    const winProb = predictWithWeights(weights, features as Record<string, number | string>);
    return NextResponse.json({ winProb });
  } catch (e) {
    console.error('[ml/predict]', e);
    return NextResponse.json(
      { error: String(e), winProb: 0.5 },
      { status: 500 }
    );
  }
}
