# Quick Start: Daily Refresh & Newest-First Setup

## 1. Set Up Incremental Daily Refresh

### Option A: BigQuery Scheduled Query (Easiest)

1. Open BigQuery Console: https://console.cloud.google.com/bigquery
2. Click "Scheduled Queries" → "Create Scheduled Query"
3. **Name:** `i_wish_i_copied_that_daily_refresh`
4. **Schedule:** `every day 02:00` (2 AM UTC)
5. **Query:** Copy contents of `create-i-wish-i-copied-that-incremental.sql`
6. **Destination:** Table `polycopy_v1.i_wish_i_copied_that`
7. **Write Preference:** "Write if empty" (for first run) or "Append" (for subsequent runs)
8. Click "Create"

### Option B: Cloud Scheduler + Script

1. Upload `refresh-i-wish-i-copied-that-daily.sh` to Cloud Storage
2. Create Cloud Function or Cloud Run job to execute script
3. Create Cloud Scheduler job to trigger daily at 2 AM UTC

### Option C: n8n Schedule Trigger

1. Add "Schedule Trigger" node at start of workflow
2. Set to run daily at 3 AM UTC (after BigQuery refresh)
3. Add "BigQuery" node to execute incremental SQL
4. Continue with existing workflow

## 2. Update n8n Workflow for New Trades Only

### Step 1: Update BigQuery Fetch Query

Replace the query in your "Fetch Trades" BigQuery node with:

```sql
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
WHERE last_processed_at IS NULL
ORDER BY excitement_score DESC
LIMIT 30
```

**File:** `n8n-bigquery-fetch-new-trades.sql`

### Step 2: Add "Mark as Processed" Step

**After** the Google Sheets node, add:

1. **Function Node:** "Mark Trades Processed"
   - **Code:** Copy from `n8n-function-node-mark-trades-processed.js`
   - **Mode:** "Run Once for All Items"
   - **Input:** Output from Format Final Output node

2. **BigQuery Node:** "Update Processed Trades"
   - **Operation:** Execute Query
   - **Query:** Use output from Function Node above
   - **Query Field:** `{{ $json.query }}`

**Note:** The Function Node generates the UPDATE query dynamically.

## 3. Configure Google Sheets for Newest-First

### Option 1: Reverse Array (Simplest)

**Add Function Node BEFORE Google Sheets:**

1. **Function Node:** "Reverse for Newest First"
   - **Code:**
     ```javascript
     const inputItems = $input.all();
     return inputItems.reverse();
     ```
   - **Mode:** "Run Once for All Items"

2. **Google Sheets Node:**
   - **Operation:** "Append"
   - **Sheet:** "Tweets"
   - **Use First Row as Headers:** Yes
   - **Result:** Newest tweets appear at top

### Option 2: Insert Rows (If Available)

**Google Sheets Node:**
- **Operation:** "Insert Rows"
- **Row:** `2` (after header)
- **Use First Row as Headers:** Yes
- **Result:** New rows inserted at top

**See:** `n8n-google-sheets-newest-first-guide.md` for full details.

## 4. Verify Setup

### Test Incremental Refresh

```bash
# Run manually to test
bq query --use_legacy_sql=false < create-i-wish-i-copied-that-incremental.sql

# Check new trades added
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as new_trades 
   FROM \`gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that\` 
   WHERE DATE(created_at) = CURRENT_DATE()"
```

### Test n8n Workflow

1. Run workflow manually
2. Check Google Sheets - newest tweets should be at top
3. Check BigQuery - `last_processed_at` should be updated
4. Run again - should only process new trades

## 5. Monitoring

### Check Daily Refresh

```sql
-- New trades added today
SELECT COUNT(*) as new_trades
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
WHERE DATE(created_at) = CURRENT_DATE();

-- Unprocessed trades
SELECT COUNT(*) as unprocessed
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
WHERE last_processed_at IS NULL;
```

### Check n8n Execution

- Monitor workflow execution logs
- Check for errors in BigQuery nodes
- Verify Google Sheets writes succeed
- Confirm `last_processed_at` updates

## 6. Troubleshooting

**Issue:** No new trades being added
- **Check:** BigQuery scheduled query is running
- **Check:** Markets are closing and resolving
- **Check:** SQL query has no errors

**Issue:** Same trades processed repeatedly
- **Check:** `last_processed_at` is being updated
- **Check:** BigQuery UPDATE query is executing
- **Check:** Trade IDs match between nodes

**Issue:** Tweets still appearing at bottom
- **Check:** Reverse Function Node is before Google Sheets
- **Check:** Array is actually reversed (add console.log)
- **Check:** Google Sheets node uses reversed data

## Files Created

- `create-i-wish-i-copied-that-incremental.sql` - Incremental INSERT query
- `n8n-bigquery-fetch-new-trades.sql` - Fetch unprocessed trades
- `n8n-bigquery-mark-processed.sql` - Mark trades as processed
- `refresh-i-wish-i-copied-that-daily.sh` - Daily refresh script
- `n8n-function-node-mark-trades-processed.js` - Generate UPDATE query
- `n8n-google-sheets-newest-first-guide.md` - Detailed Sheets guide
- `I_WISH_I_COPIED_THAT_PRD.md` - Full system documentation

## Next Steps

1. ✅ Set up incremental refresh (choose option above)
2. ✅ Update n8n workflow for new trades only
3. ✅ Configure Google Sheets for newest-first
4. ✅ Test end-to-end workflow
5. ✅ Monitor daily execution
6. 📈 Review PRD for improvement suggestions
7. 🎨 Add chart generation (see PRD Section 7)

---

**Questions?** See full PRD: `I_WISH_I_COPIED_THAT_PRD.md`
