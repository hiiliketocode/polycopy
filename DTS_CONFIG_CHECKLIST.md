# DTS Configuration Checklist

## ✅ CORRECT Settings (Keep These)

- **Display name:** `GCS to Trades Staging` ✓
- **Dataset:** `polycopy_v1` ✓
- **Destination table:** `trades_staging` ✓
- **Write preference:** `APPEND` ✓
- **File format:** `JSON` ✓
- **Number of errors allowed:** `0` ✓
- **Encoding:** `UTF8` ✓
- **Encryption:** Google-managed ✓

## ❌ FIXES NEEDED

### 1. Schedule (CRITICAL)
**Current:** "Every 24 hours"  
**Should be:** "On-demand" (manual runs only)

**Why:** You want to control when transfers run, not have them run automatically every 24 hours.

**How to fix:**
- Change "Repeat frequency" dropdown to "On-demand" or "Manual"
- Or select "Start at set time" and leave schedule empty

### 2. Cloud Storage URI (CRITICAL - MISSING!)
**Current:** Empty/Not filled  
**Should be:** `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`

**How to fix:**
- Click "Select bucket" button
- Navigate to: `gen-lang-client-0299056258-backfill-temp`
- Select folder: `trades/`
- Or manually paste: `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`

### 3. Service Account (OPTIONAL but Recommended)
**Current:** Not specified  
**Should be:** Leave default or specify service account

**Note:** If you don't specify one, it will use the default. This is usually fine, but you can specify:
- `supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com`

## 📋 Final Checklist Before Saving

- [ ] Schedule set to "On-demand" or "Manual"
- [ ] Cloud Storage URI filled: `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`
- [ ] Display name: `GCS to Trades Staging`
- [ ] Dataset: `polycopy_v1`
- [ ] Table: `trades_staging`
- [ ] Write preference: `APPEND`
- [ ] File format: `JSON`
- [ ] Errors allowed: `0`

## After Saving

1. Click "SAVE" button
2. Find your transfer in the list
3. Click "RUN NOW" to load existing 830 files
4. Monitor the transfer status
