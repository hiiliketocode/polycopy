# Get PolyScore Edge Function

This Supabase Edge Function serves as the API endpoint for calculating PolyScore for live trades on Polymarket. It queries Google BigQuery ML models to analyze trades and return comprehensive scoring.

## Overview

**Endpoint**: `POST /functions/v1/get-polyscore`

**Purpose**: Calculate PolyScore, Alpha Score, Conviction Score, and Value Score for a specific trade using pre-trained ML models in BigQuery.

## Request Format

```json
{
  "wallet_address": "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee",
  "condition_id": "0x1b09ac075e84860496aa9e11b7b6c63aec170a955cf3ee1fa0b4f383d4ba0a8c",
  "current_price": 0.6815,
  "user_slippage": 0.05
}
```

### Request Fields

- `wallet_address` (string, required): The Ethereum wallet address of the trader
- `condition_id` (string, required): The Polymarket condition ID for the market
- `current_price` (number, required): Current market price (0-1)
- `user_slippage` (number, required): User's slippage tolerance (e.g., 0.05 for 5%)

## Response Format

```json
{
  "poly_score": 78,
  "alpha_score": 85,
  "conviction_score": 72,
  "value_score": 65,
  "ai_profit_probability": 0.81,
  "subtype_specific_win_rate": 0.75,
  "bet_type_specific_win_rate": 0.88,
  "position_adjustment_style": "Averaging Up",
  "trade_sequence": 3,
  "is_hedged": 0
}
```

### Response Fields

- `poly_score` (number): Overall PolyScore (1-100) - weighted combination of Alpha, Conviction, and Value
- `alpha_score` (number): Trader expertise score (1-100) based on league-specific win rate
- `conviction_score` (number): Trader confidence score (1-100) based on trade patterns
- `value_score` (number): Price value score (1-100) accounting for slippage
- `ai_profit_probability` (number): ML model's predicted profit probability (0-1)
- `subtype_specific_win_rate` (number): Trader's win rate for this market subtype
- `bet_type_specific_win_rate` (number): Trader's win rate for this bet type
- `position_adjustment_style` (string): How the trader adjusts positions (e.g., "Averaging Up")
- `trade_sequence` (number): Sequence number of this trade in the market
- `is_hedged` (number): Whether the trade is hedged (0 or 1)

## Error Responses

### 400 Bad Request
```json
{
  "error": "Missing required fields",
  "details": "wallet_address, condition_id, current_price, and user_slippage are required"
}
```

### 404 Not Found
```json
{
  "error": "Trade not found",
  "details": "No trade found for wallet 0x... and condition 0x..."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "details": "Error message details"
}
```

## Setup & Deployment

### Prerequisites

1. **Supabase CLI**: Install if not already installed
   ```bash
   npm install -g supabase
   ```

2. **Google Cloud Credentials**: You need a service account JSON key with BigQuery access

3. **Environment Variables**: Set these in your Supabase project dashboard:
   - `GOOGLE_CLOUD_PROJECT_ID`: Your Google Cloud project ID
   - `GOOGLE_CLOUD_CREDENTIALS_JSON`: Full JSON string of your service account credentials

### Setting Environment Variables

1. Go to your Supabase Dashboard → Project Settings → Edge Functions
2. Add the following secrets:
   ```
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   GOOGLE_CLOUD_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key_id":"...",...}
   ```

   **Important**: The `GOOGLE_CLOUD_CREDENTIALS_JSON` must be the complete JSON string, not a file path.

### Local Development

1. **Link to your Supabase project**:
   ```bash
   supabase link --project-ref your-project-ref
   ```

2. **Set local environment variables**:
   ```bash
   supabase secrets set GOOGLE_CLOUD_PROJECT_ID=your-project-id
   supabase secrets set GOOGLE_CLOUD_CREDENTIALS_JSON='{"type":"service_account",...}'
   ```

3. **Serve locally**:
   ```bash
   supabase functions serve get-polyscore
   ```

4. **Test locally**:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/get-polyscore \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -d '{
       "wallet_address": "0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee",
       "condition_id": "0x1b09ac075e84860496aa9e11b7b6c63aec170a955cf3ee1fa0b4f383d4ba0a8c",
       "current_price": 0.6815,
       "user_slippage": 0.05
     }'
   ```

### Deployment

1. **Deploy the function**:
   ```bash
   supabase functions deploy get-polyscore
   ```

2. **Verify deployment**:
   ```bash
   supabase functions list
   ```

### Production Usage

The function will be available at:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-polyscore
```

**Authentication**: Include your Supabase anon key in the Authorization header:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-polyscore \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{...}'
```

## BigQuery Requirements

This function requires:

1. **Dataset**: `polycopy_v1` in your BigQuery project
2. **View**: `enriched_trades_v5_final` - Contains enriched trade features
3. **ML Model**: `trade_predictor_v5` - Pre-trained model for profit prediction

Make sure your Google Cloud service account has:
- `bigquery.jobs.create` permission
- `bigquery.tables.getData` permission on the dataset
- `bigquery.models.getData` permission on the ML model

## Troubleshooting

### "GOOGLE_CLOUD_PROJECT_ID environment variable is required"
- Ensure you've set the environment variable in Supabase dashboard
- For local development, use `supabase secrets set`

### "Failed to parse GOOGLE_CLOUD_CREDENTIALS_JSON"
- Ensure the JSON is properly escaped when setting as a secret
- The entire JSON object should be a single string value

### "Trade not found"
- Verify the wallet_address and condition_id exist in `enriched_trades_v5_final`
- Check that the trade data has been properly synced to BigQuery

### BigQuery Query Errors
- Verify your service account has the necessary permissions
- Check that the dataset and model names match exactly
- Ensure the BigQuery location matches (default is "US")

## Performance Considerations

- Average query time: 2-5 seconds
- BigQuery queries are billed per query
- Consider implementing caching for frequently requested trades
- Monitor BigQuery usage to avoid unexpected costs

## Security Notes

- Never commit Google Cloud credentials to version control
- Use Supabase secrets management for all sensitive data
- The function validates all input parameters
- CORS headers are configured for cross-origin requests
