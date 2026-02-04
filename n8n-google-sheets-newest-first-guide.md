# Google Sheets: Newest-First Configuration Guide

## Problem
By default, Google Sheets "Append" operation adds rows at the bottom. For a tweet feed, we want newest tweets at the top.

## Solution Options

### Option 1: Use "Insert Rows" Operation (Recommended)

**If your n8n Google Sheets node supports "Insert Rows":**

1. **Change Operation:** From "Append" to "Insert Rows"
2. **Row Number:** Set to `2` (inserts after header row)
3. **Data:** Map all columns from Function Node output
4. **Result:** New rows appear at top, pushing old rows down

**Configuration:**
```
Operation: Insert Rows
Row: 2
Use First Row as Headers: Yes
```

### Option 2: Reverse Array Before Append

**If "Insert Rows" is not available, reverse the array in a Function Node:**

Add a Function Node **before** Google Sheets node:

```javascript
// Function Node: Reverse Array for Newest-First
// Mode: "Run Once for All Items"

const inputItems = $input.all();

// Reverse the array so newest trades are first
const reversedItems = inputItems.reverse();

return reversedItems;
```

**Then:** Use normal "Append" operation - newest will be at top after reverse.

### Option 3: Read, Merge, Write (Advanced)

**For more control, read existing rows, merge, and rewrite:**

1. **Read existing rows** from Google Sheets
2. **Prepend new rows** to existing data
3. **Clear sheet** (optional, or use range update)
4. **Write merged data** back to sheet

**Function Node Code:**

```javascript
// Function Node: Merge New Trades with Existing (Newest First)
// Mode: "Run Once for All Items"
// Note: Requires "Read" node before this

const newTrades = $input.all();
const existingTrades = $('Read Google Sheets').all(); // Reference previous node

// Combine: new trades first, then existing
const merged = [...newTrades, ...existingTrades];

return merged;
```

**Then:** Use "Update" operation to write merged data.

### Option 4: Use Google Apps Script (Most Reliable)

**Create a Google Apps Script function:**

1. Open Google Sheets
2. Go to Extensions → Apps Script
3. Add this function:

```javascript
function insertRowsAtTop(sheetName, data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const numRows = data.length;
  const numCols = data[0].length;
  
  // Insert rows at row 2 (after header)
  sheet.insertRowsAfter(1, numRows);
  
  // Write data starting at row 2
  const range = sheet.getRange(2, 1, numRows, numCols);
  range.setValues(data);
}
```

4. **In n8n:** Use HTTP Request node to call Apps Script web app URL
5. **Pass data** as JSON payload

## Recommended Setup

**For simplicity, use Option 2 (Reverse Array):**

1. **Function Node:** Reverse array (code above)
2. **Google Sheets Node:** 
   - Operation: "Append"
   - Sheet: "Tweets"
   - Use First Row as Headers: Yes
   - Map all columns

**Result:** Newest tweets appear at top of sheet.

## Data Retention

**Keep all tweets indefinitely:**
- Google Sheets supports 10 million rows
- At 30 tweets/day, that's ~900 years of capacity
- No need to delete old tweets

**If sheet gets slow:**
- Archive tweets older than 1 year to separate sheet
- Use Google Apps Script to auto-archive monthly
- Keep last 1000 tweets in main sheet for performance

## Column Order

Ensure columns match this order (see PRD Section 8.1):

1. tweet_main
2. tweet_reply
3. tweet_full
4. tweet_ready_to_post
5. trade_id
6. wallet_address
7. wallet_truncated
8. polycopy_url
9. market_title
10. ... (see full list in PRD)

## Testing

**Test the configuration:**
1. Run workflow with 2-3 test trades
2. Verify rows appear at top (after header)
3. Run again with more trades
4. Verify newest still at top
5. Check that old tweets aren't lost

## Troubleshooting

**Issue:** Rows still appearing at bottom
- **Fix:** Check Function Node is reversing array correctly
- **Fix:** Verify Google Sheets node is using reversed data

**Issue:** Header row getting overwritten
- **Fix:** Set "Use First Row as Headers" to Yes
- **Fix:** Ensure row insertion starts at row 2, not row 1

**Issue:** Old tweets disappearing
- **Fix:** Don't use "Clear" operation
- **Fix:** Use "Append" or "Insert Rows", not "Update Range" with overwrite
