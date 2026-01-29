# DTS Pattern Instructions

## The Issue
The file browser only lets you select one file at a time, but DTS needs a **pattern** to match multiple files.

## Solution: Use URI Pattern Instead

### Step 1: Close the File Browser
- Click **"Cancel"** to close the file selection dialog

### Step 2: Enter Pattern Manually
Go back to the **"Cloud Storage URI"** field and manually type:

```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

### What This Does
- `gs://` - Google Cloud Storage protocol
- `gen-lang-client-0299056258-backfill-temp` - Your bucket name
- `/trades/` - The folder containing your files
- `*.jsonl` - Wildcard pattern matching ALL `.jsonl` files

### Result
This single pattern will match and load **all 830+ files** automatically!

## Alternative: If Pattern Doesn't Work

Some DTS UIs have separate fields:

1. **Bucket:** `gen-lang-client-0299056258-backfill-temp`
2. **Path pattern:** `trades/*.jsonl`

Look for a separate "Path" or "File pattern" field below the bucket field.

## Why This Works

DTS is designed to handle **patterns**, not individual files. The `*` wildcard tells it:
- "Match all files ending in .jsonl"
- "In the trades/ folder"
- "Load them all in one transfer"

This is much more efficient than selecting files one by one!
