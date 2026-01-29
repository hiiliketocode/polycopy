# Fetch Missing Markets from Dome API

## Status
- **Total condition_ids in trades:** 204,890
- **Have markets:** 203,717 (99.43%)
- **Missing markets:** 1,173 (0.57%)

## Solution

Created `fetch-all-markets-events.py` that:
1. Finds the 1,173 missing condition_ids
2. Fetches markets from Dome API (`/polymarket/markets`)
3. Extracts events from markets
4. Loads to BigQuery with deduplication

## To Run

### Option 1: Cloud Run (Recommended)
Deploy as a Cloud Run Job (has all dependencies):
```bash
# Build and deploy
docker build -t fetch-markets .
gcloud run jobs deploy fetch-markets --image=...
```

### Option 2: Local (if dependencies installed)
```bash
export DOME_API_KEY="your-key"
python3 fetch-all-markets-events.py
```

### Option 3: Use Backfill Script Phase 3
Modify `backfill_v3_hybrid.py` to ensure Phase 3 runs for all wallets, not just "successful" ones.

## What It Does

1. Queries BigQuery for missing condition_ids
2. Fetches markets in batches of 100 (Dome API limit)
3. Extracts events from fetched markets
4. Uses MERGE to load with deduplication
5. Keeps latest record per condition_id/event_slug

## Expected Duration

- 1,173 condition_ids ÷ 100 per batch = ~12 batches
- ~0.6 seconds per batch = ~7 seconds total fetch time
- Plus BigQuery load time (~1-2 minutes)

Total: ~2-3 minutes
