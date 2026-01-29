# DTS URI Troubleshooting

## The Error
"Bucket names may only contain lowercase letters, numbers, dashes, underscores, and dots."

## Your URI
```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

## Bucket Name Analysis
`gen-lang-client-0299056258-backfill-temp`
- ✅ Lowercase letters: `genlangclientbackfilltemp`
- ✅ Numbers: `0299056258`
- ✅ Dashes: `-` (allowed)
- ✅ No uppercase
- ✅ No special characters

**The bucket name IS valid!** The error is likely a UI validation bug.

## Solutions to Try

### Solution 1: Separate Fields (Most Likely)
Look for **TWO separate fields** instead of one URI field:

**Field 1 - Bucket:**
```
gen-lang-client-0299056258-backfill-temp
```

**Field 2 - Path Pattern or File Pattern:**
```
trades/*.jsonl
```

Or it might be labeled as:
- "Path template"
- "File pattern"
- "Source path"
- "Object name pattern"

### Solution 2: Try Without Wildcard First
1. Enter just: `gs://gen-lang-client-0299056258-backfill-temp/trades/`
2. See if error goes away
3. Then look for a separate field for the file pattern: `*.jsonl`

### Solution 3: Use "Select bucket" Then Add Path
1. Click "Select bucket"
2. Select: `gen-lang-client-0299056258-backfill-temp`
3. After selecting, see if a "Path" or "Pattern" field appears
4. Enter: `trades/*.jsonl` in that field

### Solution 4: Check for "Data Path Template"
Some DTS UIs use:
- **Data path template:** `gs://{bucket}/trades/*.jsonl`
- Or: `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`

### Solution 5: Try Different Format
If there's a "Path template" field, try:
```
trades/*.jsonl
```

And bucket separately:
```
gen-lang-client-0299056258-backfill-temp
```

## What to Look For
Scroll down or look around the form for:
- A second input field below the Cloud Storage URI field
- A field labeled "Path", "Pattern", "File pattern", or "Object name"
- A section that expands after selecting a bucket

## If Nothing Works
The UI might have a bug. Try:
1. Refresh the page
2. Try in a different browser
3. Or use the gcloud CLI to create it programmatically
