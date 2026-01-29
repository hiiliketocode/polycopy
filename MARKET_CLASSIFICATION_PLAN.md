# Market Classification Plan for ML Model

## Overview
Prepare market data for ML model by applying heuristics-based classifications to all markets in BigQuery.

## Current State

### BigQuery Markets Table
- ✅ Has `market_subtype` column
- ✅ Has `bet_structure` column  
- ❌ Missing `market_type` column (needs to be added)

### Heuristics Model
- ✅ Exists at `combined_heuristics_model.json`
- ✅ Classifies: `market_type`, `market_subtype`, `bet_structure`
- ✅ Built from Gemini classifications of previous markets

## Process

### Step 1: Add Missing Column
The script automatically adds `market_type` column to BigQuery markets table if it doesn't exist.

### Step 2: Fetch Markets Needing Classification
Query BigQuery for markets that are missing any of the three classification fields:
- `market_type`
- `market_subtype`  
- `bet_structure`

### Step 3: Fetch Market Details from Dome API
For each market, fetch full details (title, description, tags) from Dome API `/polymarket/markets` endpoint.

### Step 4: Apply Heuristics Classification
Use the heuristics model to classify each market:
1. Extract text from title, description, and tags
2. Score market types based on keyword matches
3. Determine subtype based on market type and keywords
4. Classify bet structure using pattern matching rules

### Step 5: Update BigQuery
Use MERGE statement to update markets table with classifications.

## Usage

### Local Testing
```bash
export DOME_API_KEY="your-dome-api-key"
export GOOGLE_CLOUD_PROJECT="gen-lang-client-0299056258"
export DATASET="polycopy_v1"
export BATCH_SIZE=50
export API_RATE_LIMIT_DELAY=0.1
export SKIP_EXISTING=true

python3 classify-markets-bigquery.py
```

### Cloud Run Job Deployment
```bash
# Build Docker image
docker build --platform linux/amd64 \
  -f Dockerfile.classify-markets \
  -t us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/classify-markets:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/classify-markets:latest

# Create/update Cloud Run Job
gcloud run jobs create classify-markets \
  --image=us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/classify-markets:latest \
  --region=us-central1 \
  --project=gen-lang-client-0299056258 \
  --service-account=supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com \
  --set-env-vars="DOME_API_KEY=your-key,GOOGLE_CLOUD_PROJECT=gen-lang-client-0299056258,DATASET=polycopy_v1,BATCH_SIZE=100,API_RATE_LIMIT_DELAY=0.1,SKIP_EXISTING=true" \
  --max-retries=3 \
  --task-timeout=3600 \
  --tasks=1 \
  --parallelism=1

# Execute job
gcloud run jobs execute classify-markets \
  --region=us-central1 \
  --project=gen-lang-client-0299056258
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DOME_API_KEY` | *required* | Dome API authentication key |
| `GOOGLE_CLOUD_PROJECT` | `gen-lang-client-0299056258` | GCP project ID |
| `DATASET` | `polycopy_v1` | BigQuery dataset name |
| `HEURISTICS_MODEL_PATH` | `./combined_heuristics_model.json` | Path to heuristics model JSON |
| `BATCH_SIZE` | `100` | Number of markets to process per batch |
| `API_RATE_LIMIT_DELAY` | `0.1` | Delay between Dome API calls (seconds) |
| `SKIP_EXISTING` | `true` | Skip markets that already have all classifications |

## Classification Fields

### market_type
Main category: Sports, Crypto, Politics, Finance/Tech, Culture, Esports, Weather, Economics, Science, Tech

### market_subtype
Specific subcategory within type:
- Sports: NBA, NFL, NHL, Soccer (EPL, UCL), Tennis, UFC, etc.
- Crypto: Bitcoin, Ethereum, Solana, XRP, etc.
- Politics: US_Politics, Geopolitics, Elections, etc.
- Finance: Individual_Stocks, Market_Indices, Commodities
- etc.

### bet_structure
Bet type: Prop, Yes/No, Over/Under, Spread, Head-to-Head, Multiple Choice, Other

## Monitoring

### Check Progress
```bash
# Count markets with classifications
bq query --use_legacy_sql=false "
SELECT 
    COUNT(*) as total_markets,
    COUNT(market_type) as has_type,
    COUNT(market_subtype) as has_subtype,
    COUNT(bet_structure) as has_structure,
    COUNT(CASE WHEN market_type IS NOT NULL AND market_subtype IS NOT NULL AND bet_structure IS NOT NULL THEN 1 END) as fully_classified
FROM \`gen-lang-client-0299056258.polycopy_v1.markets\`
"
```

### View Sample Classifications
```bash
bq query --use_legacy_sql=false "
SELECT 
    condition_id,
    market_type,
    market_subtype,
    bet_structure
FROM \`gen-lang-client-0299056258.polycopy_v1.markets\`
WHERE market_type IS NOT NULL
LIMIT 10
"
```

## Next Steps After Classification

1. **Verify Coverage**: Ensure all markets have classifications
2. **Feature Engineering**: Use classifications as features for ML model
3. **Market Segmentation**: Group trades by market type/subtype for analysis
4. **Model Training**: Use classified markets to train prediction model
