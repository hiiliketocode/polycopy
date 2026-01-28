# Gemini Market Classification - Quick Start

## Overview
Use Google Gemini to classify 50k+ markets, then build a heuristics model for future automated classifications.

## Prerequisites
- ✅ Gemini API key added to `.env.local` as `GEMINI_API_KEY`
- ✅ `@google/generative-ai` package installed
- ✅ Supabase credentials in `.env.local`

## Quick Start

### 1. Test with Small Sample (Recommended First)
```bash
# Test with 100 markets first
LIMIT=100 node scripts/gemini-classify-markets.js
```

### 2. Run Full Classification
```bash
# Classify all markets (will overwrite existing classifications)
node scripts/gemini-classify-markets.js
```

**Expected Runtime:** 
- ~50 markets per API call
- ~1 second sleep between calls
- ~50k markets = ~1000 API calls = ~17 minutes

### 3. Build Heuristics Model
```bash
# Analyze Gemini results and build heuristics model
node scripts/build-heuristics-from-gemini.js
```

### 4. Validate Model Accuracy
```bash
# Compare heuristics vs Gemini (target: 95%+ accuracy)
node scripts/validate-heuristics.js
```

### 5. Use for New Markets
```bash
# Use heuristics model for future classifications (no API calls needed)
node scripts/backfill-market-heuristics.js
```

## Output Files

- `gemini-classifications.json` - All Gemini classifications
- `markets_data.json` - Market data used for analysis
- `combined_heuristics_model.json` - Generated heuristics model

## Configuration

Edit these in `.env.local` or pass as environment variables:

```bash
# Gemini API settings
BATCH_SIZE=50              # Markets per API call
SLEEP_MS=1000              # Sleep between API calls (rate limiting)
DB_BATCH_SIZE=100          # Markets per database fetch

# File paths
OUTPUT_FILE=./gemini-classifications.json
GEMINI_CLASSIFICATIONS_FILE=./gemini-classifications.json
HEURISTICS_MODEL_PATH=./combined_heuristics_model.json
```

## Troubleshooting

**Rate Limit Errors:**
- Increase `SLEEP_MS` (e.g., `SLEEP_MS=2000`)
- Reduce `BATCH_SIZE` (e.g., `BATCH_SIZE=25`)

**Memory Issues:**
- Process in smaller chunks using `LIMIT` and multiple runs
- Adjust `DB_BATCH_SIZE` to fetch fewer markets at once

**API Errors:**
- Check `GEMINI_API_KEY` is correct
- Verify API quota/limits in Google Cloud Console
- Check network connectivity

## Cost Monitoring

Monitor costs in Google Cloud Console:
- Navigate to: APIs & Services > Dashboard > Gemini API
- Check usage and billing

Expected cost: ~$1-2 for 50k markets
