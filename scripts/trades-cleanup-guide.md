# Trades Table Cleanup Guide

## Problem
- Trades table is consuming too much disk space (26.47 GB / 27 GB)
- Database is down (57P03 error - not accepting connections)
- Need to free space WITHOUT losing data

## Solution: Archive Old Trades

We'll move old trades to an archive table, then delete from main table. This preserves all data while freeing space.

---

## Step-by-Step Process

### Step 1: Analyze Current Situation
Run this in Supabase SQL Editor to see what you're working with:

```sql
-- See trade distribution by age
SELECT 
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') as trades_90_days_old,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '60 days') as trades_60_days_old,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days') as trades_30_days_old,
  MIN(created_at) as oldest_trade,
  MAX(created_at) as newest_trade,
  pg_size_pretty(pg_total_relation_size('public.trades')) as table_size
FROM public.trades;
```

**Decision**: Based on results, decide how many days to archive. Common choices:
- **30 days**: Keep last month in main table
- **60 days**: Keep last 2 months in main table  
- **90 days**: Keep last 3 months in main table

---

### Step 2: Create Archive Table
Run this to create the archive table:

```sql
-- Create archive table (same structure as trades)
CREATE TABLE IF NOT EXISTS public.trades_archive (
  LIKE public.trades INCLUDING ALL
);

-- Add archive timestamp
ALTER TABLE public.trades_archive 
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes for future queries
CREATE INDEX IF NOT EXISTS idx_trades_archive_wallet_timestamp 
ON public.trades_archive (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trades_archive_created_at 
ON public.trades_archive (created_at DESC);
```

---

### Step 3: Archive Old Trades (Batched)

**Option A: Smart Batch Archiving** (Recommended - safer, handles large tables)

Run the `smart-trades-cleanup.sql` script. It does batched archiving automatically.

**Option B: Manual Batch Archiving**

Run this multiple times until it returns 0 rows:

```sql
-- Archive 10,000 trades at a time
INSERT INTO public.trades_archive
SELECT *, NOW() as archived_at
FROM public.trades
WHERE created_at < NOW() - INTERVAL '60 days'  -- Adjust days as needed
  AND id NOT IN (SELECT id FROM public.trades_archive WHERE id IS NOT NULL)
LIMIT 10000;
```

Keep running until no more rows are inserted.

---

### Step 4: Verify Archive Complete

```sql
-- Check that all old trades are archived
SELECT 
  (SELECT COUNT(*) FROM public.trades WHERE created_at < NOW() - INTERVAL '60 days') as remaining_old_trades,
  (SELECT COUNT(*) FROM public.trades_archive) as archived_trades,
  (SELECT COUNT(*) FROM public.trades) as total_current_trades;
```

**Important**: Only proceed to Step 5 if `remaining_old_trades` is 0!

---

### Step 5: Delete Archived Trades from Main Table

**ONLY RUN THIS AFTER VERIFYING STEP 4!**

```sql
-- Delete in batches to avoid long locks
DO $$
DECLARE
  batch_size INTEGER := 10000;
  rows_deleted INTEGER;
BEGIN
  LOOP
    DELETE FROM public.trades
    WHERE id IN (
      SELECT id FROM public.trades_archive
      WHERE id NOT IN (SELECT id FROM public.trades WHERE id IS NOT NULL)
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    
    EXIT WHEN rows_deleted = 0;
    
    RAISE NOTICE 'Deleted % rows from main table', rows_deleted;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

---

### Step 6: Reclaim Disk Space

```sql
-- Vacuum to reclaim space (this is critical!)
VACUUM FULL public.trades;

-- Also vacuum archive table
VACUUM FULL public.trades_archive;
```

---

### Step 7: Verify Space Freed

```sql
-- Check new sizes
SELECT 
  pg_size_pretty(pg_total_relation_size('public.trades')) as trades_table_size,
  pg_size_pretty(pg_total_relation_size('public.trades_archive')) as archive_table_size,
  (SELECT COUNT(*) FROM public.trades) as trades_count,
  (SELECT COUNT(*) FROM public.trades_archive) as archive_count;
```

---

## Querying Archived Data

After archiving, you can still query old trades:

```sql
-- Query recent trades (from main table)
SELECT * FROM public.trades 
WHERE wallet_address = '0x...'
ORDER BY timestamp DESC;

-- Query old trades (from archive)
SELECT * FROM public.trades_archive 
WHERE wallet_address = '0x...'
ORDER BY timestamp DESC;

-- Query all trades (union both tables)
SELECT * FROM public.trades 
WHERE wallet_address = '0x...'
UNION ALL
SELECT * FROM public.trades_archive 
WHERE wallet_address = '0x...'
ORDER BY timestamp DESC;
```

---

## Optional: Compress Raw JSONB Column

The `raw` JSONB column might be taking significant space. If you don't need the full raw data:

```sql
-- Option 1: Remove raw column from archive (saves space)
ALTER TABLE public.trades_archive DROP COLUMN IF EXISTS raw;

-- Option 2: Keep only essential fields in archive
-- Create a lighter archive table with fewer columns
```

---

## Emergency: If Database Still Won't Connect

If you still can't connect after cleanup:

1. **Try Quick Cleanup** (more aggressive):
   - Run `quick-trades-cleanup.sql` - archives and deletes in one go
   - Adjust the date interval to be more aggressive (e.g., 30 days instead of 60)

2. **Contact Supabase Support**:
   - They can help with emergency disk space issues
   - May be able to temporarily increase your limit

3. **Upgrade Plan**:
   - If you're on Free/Pro, upgrading gives more disk space
   - Can upgrade temporarily, then downgrade after cleanup

---

## Prevention: Set Up Auto-Archiving

After recovery, set up automatic archiving:

```sql
-- Create function to auto-archive old trades
CREATE OR REPLACE FUNCTION auto_archive_old_trades()
RETURNS void AS $$
BEGIN
  -- Archive trades older than 60 days
  INSERT INTO public.trades_archive
  SELECT *, NOW() as archived_at
  FROM public.trades
  WHERE created_at < NOW() - INTERVAL '60 days'
    AND id NOT IN (SELECT id FROM public.trades_archive WHERE id IS NOT NULL);
  
  -- Delete archived trades
  DELETE FROM public.trades
  WHERE id IN (SELECT id FROM public.trades_archive);
  
  -- Vacuum
  VACUUM ANALYZE public.trades;
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (if available)
-- SELECT cron.schedule('archive-old-trades', '0 2 * * *', 'SELECT auto_archive_old_trades();');
```
