# Predict Trade Edge Function

This Supabase Edge Function predicts trade outcomes using BigQuery ML models and market classification.

## Structure

```
supabase/functions/predict-trade/
├── index.ts         # Main entry point - handles requests and BigQuery inference
└── classifier.ts    # Helper functions for bet structure and market classification
```

## Setup

### 1. Set Google Cloud Service Account Secret

You need to provide your Google Service Account JSON key as a Supabase secret:

```bash
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{ "type": "service_account", ... PASTE THE WHOLE JSON HERE ... }'
```

**To get the service account key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** → **Service Accounts**
3. Find or create a service account with BigQuery access
4. Click **Keys** → **Add Key** → **Create new key** → **JSON**
5. Copy the entire JSON content and paste it into the command above

### 2. Deploy the Function

```bash
supabase functions deploy predict-trade
```

## Request Format

```json
{
  "trade": {
    "price": 0.65,
    "size": 100,
    "tokenLabel": "Yes" // or "No"
  },
  "trader": {
    "wallet": "0x1234..."
  },
  "market": {
    "title": "Will Bitcoin hit $100k?",
    "tags": ["crypto", "bitcoin"],
    "betStructure": "STANDARD",
    "gameStartTime": "2026-01-30T12:00:00Z",
    "startTime": "2026-01-29T00:00:00Z",
    "endTime": "2026-02-01T00:00:00Z",
    "volumeTotal": 100000,
    "volume1Week": 50000
  },
  "otherTrades": [
    {
      "price": 0.60,
      "size": 50
    }
  ],
  "hedgingInfo": {
    "isHedging": false
  }
}
```

## Response Format

```json
{
  "success": true,
  "prediction": {
    "probability": 0.82,
    "edge_percent": 15.4
  },
  "analysis": {
    "z_score": 2.5,
    "niche": "BITCOIN",
    "is_smart": true
  }
}
```

## Features

1. **Market Classification**: Uses `semantic_mapping` table to classify markets by niche
2. **Bet Structure Detection**: Determines bet structure from title and payload
3. **Trader DNA Lookup**: Fetches trader performance history from `trader_dna_snapshots`
4. **Feature Engineering**: Calculates behavioral patterns, z-scores, and timing metrics
5. **BigQuery ML Inference**: Uses `poly_predictor_v6_audit` model for predictions

## Dependencies

- Requires `semantic_mapping` table with columns: `original_tag`, `clean_niche`, `type`, `specificity_score`
- Requires `trader_dna_snapshots` table with trader performance data
- Requires BigQuery ML model: `polycopy_v1.poly_predictor_v6_audit`

## Error Handling

- Returns 500 status with error message if something fails
- Falls back to neutral prediction (0.5) if BigQuery query fails
- Falls back to default DNA values for new traders
