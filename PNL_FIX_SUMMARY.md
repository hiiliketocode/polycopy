# P&L Discrepancy - Fix Summary

**Date:** February 6, 2026  
**Issue:** Polycopy showing +$67, Polymarket showing -$158.11 (difference of $225)  
**Root Cause:** 234 orders (23.7%) missing `current_price` data due to cron job excluding resolved markets

---

## 🔍 Problem Identified

### Data Analysis Results
- **Total Orders:** 988
- **Orders WITH price:** 754 (76.3%)
- **Orders WITHOUT price:** 234 (23.7%) ← **The Problem**
- **Total Invested:** $81,726.99
- **Current P&L shown:** +$609.82 (INCOMPLETE - missing ~$18k in resolved positions)

### Why This Happens
The price refresh cron job (`/api/cron/refresh-copy-pnl`) had this filter:
```typescript
.eq('market_resolved', false)  // ❌ Only updates unresolved markets
```

This meant once a market resolved, its prices stopped being updated, leaving those positions without final prices (0 or 1).

---

## ✅ Changes Made

### 1. Fixed Cron Job to Include Resolved Markets
**File:** `app/api/cron/refresh-copy-pnl/route.ts`  
**Change:** Removed the `market_resolved` filter so resolved markets can get their final prices updated

```diff
- // Fetch a batch of open/unresolved copy orders
+ // Fetch a batch of copy orders (including resolved markets that need price data)
  let openOrdersQuery = supabase
    .from(ordersTable)
    .select('order_id, market_id, outcome')
-   .eq('market_resolved', false)
+   // Allow both resolved and unresolved markets - resolved markets need final prices (0 or 1)
    .is('user_exit_price', null)
    .not('market_id', 'is', null)
    .range(from, to)
```

### 2. Enhanced Resolution Price Inference
**File:** `app/api/portfolio/stats/route.ts`  
**Change:** Improved `inferResolutionPrice()` to check multiple sources for resolution data

**Added:**
- Check `marketMeta.winningSide` as additional source
- Validate resolved market prices are 0 or 1
- Better fallback logic for resolved markets

### 3. Added Data Quality Warnings
**File:** `app/api/portfolio/stats/route.ts`  
**Added:**
- Warnings when resolved markets are missing price data
- Summary statistics showing how many positions lack prices
- Alert message suggesting backfill when data quality is poor

---

## 🧪 How to Test Locally

### Step 1: Reload Your Portfolio Page
1. Go to http://localhost:3000/portfolio
2. Open the browser console (F12 or Cmd+Option+I)
3. Click "Refresh" or reload the page
4. Look for logs like:

```
🎯 Position-Based P&L Calculated: {
  totalPositions: XXX,
  openPositions: XXX,
  closedPositions: XXX,
  resolvedPositionsMissingPrice: XXX,  ← Should show the count
  resolvedPositionsMissingPriceCost: "XXXX.XX",  ← $ value missing
  totalPnl: "XXX.XX",
  ...
}
```

### Step 2: Check for Data Quality Warnings
Look for warnings like:
```
⚠️ [Portfolio Stats] DATA QUALITY WARNING: 234 resolved positions missing price data, 
representing $18135.45 in cost. P&L calculation is incomplete. 
Run: curl /api/cron/refresh-copy-pnl?mode=backfill
```

If you see this warning, it means we need to run the backfill.

---

## 🔧 Next Steps: Run the Backfill

### What is Backfill?
The backfill mode fetches prices for all orders that are currently missing `current_price` data. This will populate the 234 orders that are causing the discrepancy.

### How to Run Backfill

**Option 1: Using curl (production/local)**
```bash
curl -X GET "http://localhost:3000/api/cron/refresh-copy-pnl?mode=backfill&limit=500"
```

**Option 2: In browser**
Navigate to:
```
http://localhost:3000/api/cron/refresh-copy-pnl?mode=backfill&limit=500
```

### Expected Results
The backfill will:
1. Find all orders missing `current_price`
2. Fetch current/resolution prices from Polymarket
3. Update the database with the correct prices (0 or 1 for resolved markets)
4. Return: `{ ok: true, updated: XXX }`

### After Backfill
1. Reload your portfolio page
2. Check the console logs - `resolvedPositionsMissingPrice` should be 0 or much lower
3. Your P&L should now be accurate and closer to Polymarket's calculation

---

## 📊 Expected Impact

### Before Fix
- Missing price data: 234 orders (23.7%)
- P&L shown: +$67 (from your screenshot)
- Calculation incomplete for ~$18k in positions

### After Fix + Backfill
- Missing price data: 0 orders (0%)
- P&L shown: Should match Polymarket (-$158.11 or close to it)
- All positions properly valued

---

## 🎯 Why the Discrepancy Exists

Your Polycopy calculation was **missing losses** from resolved markets that didn't have price data. Here's the math:

- **Polycopy showing:** +$67
- **Polymarket showing:** -$158.11
- **Difference:** $225.29

This $225 difference is likely from:
1. Resolved markets where you lost (price = $0) but Polycopy didn't have that price data
2. Those positions were excluded from P&L calculation entirely
3. Result: P&L looked better than it actually was

Once the backfill runs and populates all the resolution prices (0 for losses, 1 for wins), your Polycopy P&L should align with Polymarket.

---

## 📝 Technical Details

### How Resolution Pricing Works
- When a market resolves, the winning outcome = $1.00, losing outcome = $0.00
- For accurate P&L, we need to know:
  - Which outcome won (from `resolved_outcome` or `winning_side`)
  - Which outcome each position was on
  - Calculate: (shares × finalPrice) - invested

### Where the Fix Helps
1. **Cron job now updates resolved markets** → populates missing prices
2. **Enhanced inference logic** → checks multiple sources for resolution data
3. **Data quality warnings** → alerts when calculation is incomplete

---

## 🚀 Ready to Test?

1. ✅ Changes are already deployed to your local dev server (port 3000)
2. ✅ Code improvements are live
3. ⏳ **Next:** Run the backfill command above to populate missing prices
4. ✅ Verify the P&L matches Polymarket

Let me know when you're ready to push to production!
