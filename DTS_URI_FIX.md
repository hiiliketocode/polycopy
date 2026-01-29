# Fixing Cloud Storage URI Error

## The Error
"Bucket names may only contain lowercase letters, numbers, dashes, underscores, and dots."

## Your Bucket Name
`gen-lang-client-0299056258-backfill-temp`

✅ This is **valid** - contains only lowercase letters, numbers, and dashes.

## Solutions to Try

### Option 1: Use "Select bucket" Button (Recommended)
1. Click the **"Select bucket"** button (to the right of the URI field)
2. Browse to find: `gen-lang-client-0299056258-backfill-temp`
3. Select it
4. Then specify the path pattern: `trades/*.jsonl`

### Option 2: Enter Full Path
Try entering the complete URI:
```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

### Option 3: Enter Bucket Only First
1. Clear the field
2. Enter just: `gs://gen-lang-client-0299056258-backfill-temp`
3. See if there's a separate field for the path pattern
4. Enter: `trades/*.jsonl` in that field

### Option 4: Check for Path Pattern Field
Some DTS UIs have:
- **Bucket field:** `gen-lang-client-0299056258-backfill-temp`
- **Path pattern field:** `trades/*.jsonl`

Look for a separate "Path" or "File pattern" field below the bucket field.

## What Should Work
The full URI should be:
```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

This will match all `.jsonl` files in the `trades/` folder.

## If Still Having Issues
- Try without the wildcard first: `gs://gen-lang-client-0299056258-backfill-temp/trades/`
- Or check if there's a file browser/selector in the UI
- The bucket definitely exists and is accessible (verified)
