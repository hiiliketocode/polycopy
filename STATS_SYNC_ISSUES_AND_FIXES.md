# Stats Sync Issues and Fixes

## Current Issues

### 1. Old Code Still Running ❌
**Problem**: Docker image still has old code with wrong column names (`avg_bet_size_usdc`, `bet_structure`)
**Symptoms**: Errors like "Could not find the 'avg_bet_size_usdc' column"
**Fix**: Need to force rebuild Docker image without cache

### 2. Incomplete Data / Many Zeros ⚠️
**Problem**: Some data is inserted but many fields are zeros
**Possible Causes**:
- BigQuery queries not calculating correctly
- Market joins failing (markets table missing data)
- `winning_label` not matching `token_label` correctly
- CROSS JOIN failing when CTEs return 0 rows (fixed)

## Fixes Applied

1. ✅ Updated schema to match actual tables (`l_count`, `structure`, `bracket`)
2. ✅ Fixed CROSS JOIN → LEFT JOIN to handle empty results
3. ✅ Added proper NULL handling in queries

## Next Steps

### Step 1: Force Rebuild Docker Image
```bash
# Delete old image and rebuild
docker rmi us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/sync-trader-stats:latest 2>/dev/null || true
./deploy-stats-sync-job.sh
```

### Step 2: Verify BigQuery Data
Run `debug-stats-query.sql` in BigQuery to check:
- Are markets joining correctly?
- Is `winning_label` matching `token_label`?
- Are trades being counted correctly?

### Step 3: Check Actual Data in Supabase
```sql
-- Check what's actually in the tables
SELECT * FROM trader_global_stats 
WHERE l_count > 0 
ORDER BY updated_at DESC 
LIMIT 5;

SELECT * FROM trader_profile_stats 
WHERE l_count > 0 
ORDER BY updated_at DESC 
LIMIT 5;
```

### Step 4: Verify Market Data
The queries rely on markets table having:
- `status = 'resolved'` for closed markets
- `winning_label` matching trade `token_label`

If markets aren't populated or don't have this data, stats will be zeros.

## Debugging Queries

See `debug-stats-query.sql` - run it in BigQuery to test a specific wallet and see:
- What trades are being found
- What markets are being joined
- What the calculated stats look like
