# Backfill Open Markets Classifications

This script backfills market classifications (market_type, market_subtype, bet_structure) for open markets using the semantic_mapping table.

## Overview

The script:
1. Finds open markets missing classifications
2. Uses `semantic_mapping` table to classify markets by tags (core semantic engine)
3. Updates markets table with classifications
4. Normalizes and stores tags

## Prerequisites

1. **semantic_mapping table must exist and have data**
   ```sql
   SELECT COUNT(*) FROM semantic_mapping;
   ```
   If empty, populate it first with tag-to-niche mappings.

2. **Environment variables** (in `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Usage

### Basic Usage (Open Markets Only)
```bash
node scripts/backfill-open-markets-classifications.js
```

### Options via Environment Variables

```bash
# Process only 100 markets
LIMIT=100 node scripts/backfill-open-markets-classifications.js

# Process all markets (including closed)
OPEN_ONLY=false node scripts/backfill-open-markets-classifications.js

# Overwrite existing classifications
SKIP_EXISTING=false node scripts/backfill-open-markets-classifications.js

# Custom batch size and sleep
BATCH_SIZE=25 SLEEP_MS=200 node scripts/backfill-open-markets-classifications.js
```

### Environment Variables

- `BATCH_SIZE` (default: 50) - Number of markets to process per batch
- `SLEEP_MS` (default: 100) - Milliseconds to sleep between batches
- `LIMIT` (optional) - Maximum number of markets to process
- `SKIP_EXISTING` (default: true) - Skip markets that already have classifications
- `OPEN_ONLY` (default: true) - Only process open markets

## What It Does

1. **Queries markets** missing classifications (market_type, market_subtype, or bet_structure)
2. **Normalizes tags** from various formats (JSON string, array, etc.)
3. **Queries semantic_mapping** table to find niche and type based on tags
4. **Infers bet_structure** from market title (OVER_UNDER, SPREAD, WINNER, STANDARD)
5. **Updates markets table** with classifications and normalized tags

## Classification Logic

- **market_type**: From `semantic_mapping.type` field (e.g., SPORTS, CRYPTO, POLITICS)
- **market_subtype**: From `semantic_mapping.clean_niche` field (e.g., NBA, BITCOIN, ELECTION)
- **bet_structure**: Inferred from title keywords:
  - "over"/"under"/"o/u" → OVER_UNDER
  - "spread"/"handicap" → SPREAD
  - "will"/"winner" → WINNER
  - Default → STANDARD

## Output

The script provides:
- Progress logs for each market processed
- Summary statistics:
  - Processed: Total markets processed
  - Updated: Markets successfully classified
  - Skipped: Markets already classified (if SKIP_EXISTING=true)
  - Errors: Markets that failed to classify

## Example Output

```
🚀 Starting open markets classification backfill
📊 Using semantic_mapping table for classification
⚙️  Batch size: 50, Sleep: 100ms
⏭️  Skipping markets with existing classifications
🔓 Only processing open markets

✅ semantic_mapping table has data

📦 Processing batch: 50 markets (offset: 0)
  ✅ abc12345... → SPORTS/NBA (semantic_mapping)
  ✅ def67890... → CRYPTO/BITCOIN (semantic_mapping)
  ⚠️  ghi11111... → No match (no_match)
  💾 Updated 48 markets with classifications

📊 Backfill Summary
======================================================================
✅ Processed: 50 markets
💾 Updated: 48 markets
⏭️  Skipped: 0 markets
❌ Errors: 0 markets
======================================================================
```

## Troubleshooting

### "semantic_mapping table appears to be empty"
- Populate the semantic_mapping table with tag mappings first
- Check that tags in markets match original_tag values in semantic_mapping

### "No match" for many markets
- Verify tags exist in markets table
- Check that tags match semantic_mapping.original_tag (case-insensitive)
- Consider adding more mappings to semantic_mapping table

### Network errors
- Script includes automatic retries for network errors
- Increase SLEEP_MS if hitting rate limits

## Related Files

- `/app/api/markets/ensure/route.ts` - Uses same classification logic
- `/components/polyscore/PredictionStats.tsx` - Uses classifications for badges
- `/supabase/migrations/20260125_add_market_classification_columns.sql` - Schema
