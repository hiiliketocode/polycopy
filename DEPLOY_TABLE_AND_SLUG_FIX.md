# Deploy: Table Width Fix + Market Slug Fix

## Changes in this deployment:

### 1. Trade History Table Width Reduction ✅
- Reduced OUTCOME column from 95px to 80px with truncation
- Reduced STATUS column from 95px to 85px
- Reduced SIZE column from 75px to 70px
- Reduced PRICE column from 65px to 60px
- Reduced ROI column from 70px to 65px
- Reduced table min-width from 650px to 600px
- **Result:** ROI column now visible without scrolling

### 2. Market Slug Storage Fix ✅
- Added `market_slug` storage when copying trades
- Added debug logging to track what's being saved
- **Result:** "View on Polymarket" links will work correctly for NEW copied trades

### ⚠️ Known Limitation
The market **title** issue (showing "Atalanta BC" when it should be "Hellas Verona FC") is a deeper problem:
- Binary markets on Polymarket share the same market but show different titles based on which outcome you bet on
- The trades API returns the title for ONE side only
- To fix this properly, we'd need to fetch market details from CLOB API for each trade
- **Current trades in your database will still show the wrong title**
- **NEW trades will have the correct slug so the link works**, even if the title is misleading

### Files Changed:
1. `app/trader/[wallet]/page.tsx` - Table width + market_slug storage

---

## Deploy Commands:

```bash
git add .

git commit -m "Fix Trade History table width and market slug storage

Table width fixes:
- Reduced column widths to prevent horizontal scrolling
- OUTCOME column: 95px → 80px with truncation
- STATUS column: 95px → 85px
- SIZE column: 75px → 70px
- PRICE column: 65px → 60px
- ROI column: 70px → 65px
- Table min-width: 650px → 600px
- ROI column now visible without scrolling on desktop

Market slug storage fix:
- Added market_slug storage when copying trades
- Links to Polymarket will now work correctly for NEW copied trades
- Added debug logging for copied trade data

Note: Existing copied trades in database still have wrong titles/links.
Database migration for market_slug column was already deployed."

git push origin main
```

---

## After Deployment Testing:

1. ✅ **Table width**: Visit trader profile page, verify ROI column is visible
2. ✅ **Copy a NEW trade**: Copy a trade and verify console logs show `market_slug` being saved
3. ✅ **Check link**: View your profile, find the NEW copied trade, click "View on Polymarket" - should go directly to market
4. ⚠️ **Old trades**: Existing copied trades will still have wrong links (no market_slug in database)

---

## Future Fix for Market Title Issue:

To properly fix the market title problem, we would need to:
1. When copying a trade, fetch the market details from CLOB API using conditionId
2. Store both outcomes' titles in the database
3. Display the correct title based on which outcome the user bet on
4. This would require a new migration and API call during copy

This is a larger change and should be a separate task.
