# Deployment Instructions

## Overview

This deployment includes:
- ✅ ROI calculation fixes for user-closed trades
- ✅ CORS fix with CLOB API integration
- ✅ Market resolution detection improvements
- ✅ Price=0 handling for lost trades
- ✅ Weighted ROI by investment amount
- ✅ Market slug support for proper linking

---

## Pre-Deployment Checklist

1. ✅ No linter errors
2. ⚠️ Database migration required (market_slug column)
3. ✅ All TypeScript types updated
4. ✅ No breaking changes to existing functionality

---

## Deployment Steps

### Step 1: Database Migration

Run the SQL migration in Supabase SQL Editor:

```bash
# Copy the migration file content
cat supabase/migrations/008_add_market_slug.sql
```

**SQL to run in Supabase:**
```sql
-- Add market_slug column to copied_trades table
-- This allows us to link directly to markets on Polymarket

ALTER TABLE copied_trades
ADD COLUMN IF NOT EXISTS market_slug TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_copied_trades_slug ON copied_trades(market_slug);

-- Add comment to explain the column
COMMENT ON COLUMN copied_trades.market_slug IS 'The Polymarket market slug for direct linking (e.g., "hellas-verona-fc-vs-atalanta-bc")';
```

**Verify migration:**
```sql
-- Check that column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'copied_trades' 
AND column_name = 'market_slug';

-- Should return:
-- | column_name  | data_type |
-- | market_slug  | text      |
```

---

### Step 2: Build and Deploy

```bash
# Navigate to project directory
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy

# Install dependencies (if needed)
npm install

# Build the project
npm run build

# If build succeeds, deploy to Vercel
vercel --prod

# Or if using a different deployment platform:
# - For Vercel: git push (if auto-deploy is enabled)
# - For other platforms: follow their deployment guide
```

---

### Step 3: Verify Deployment

#### 1. Check Profile Page (User-Closed Trades)

1. Go to: `https://polycopy.app/profile`
2. Open browser console
3. Look for:
   ```javascript
   🔧 Recalculated ROI for user-closed trade: ... {
     oldRoi: -99.9,
     newRoi: 3.92  // ✅ Should be corrected
   }
   ```
4. Verify user-closed trades show correct ROI

---

#### 2. Check Trader Profile Page (ROI Display)

1. Go to: `https://polycopy.app/trader/[any-wallet]`
2. Open browser console
3. Look for:
   ```javascript
   📊 Fetching current prices for X unique markets via CLOB API...
   🔍 Cache entry example (CLOB): {
     outcomes: ['PARIVISION', '3DMAX'],  // ✅ Actual team names
     prices: [0.55, 0.45]
   }
   
   ✅ Matched by outcome name: PARIVISION → index 0 → price 0
   // Should NOT see: ❌ Trade X missing price
   
   📊 ROI Coverage: { coveragePercent: '95%+' }  // ✅ High coverage
   ```
4. Verify ROI shows for esports markets and trades with price=0

---

#### 3. Check Market Resolution Detection

1. Go to profile page
2. Find trades with price at $0 or $1
3. Check console for:
   ```javascript
   🔍 Resolution detected via current price: {
     currentPrice: 1,
     marketResolved: true  // ✅
   }
   ```
4. Verify resolved markets show "Resolved" status badge

---

### Step 4: Known Issues & Future Work

#### Issue: Market Title/Slug Mismatch (Partial Fix)

**Problem discovered:**
- Feed shows: "Will Atalanta BC win on 2025-12-06?"
- User clicks copy
- Actually trades on: "Will Hellas Verona FC win on 2025-12-06?" (same market, opposite side)
- Wrong market title stored, wrong link generated

**Current fix:**
- ✅ Added `market_slug` column
- ✅ Updated API to accept slug
- ✅ Updated links to use slug when available
- ⚠️ Feed/trader page copy buttons not yet updated to pass slug

**To complete this fix (future work):**
1. Find where copy trade button is implemented (likely in feed/trader pages)
2. Update to pass `marketSlug` when calling the copy API
3. Fetch the slug from Polymarket position data or CLOB API

---

## Rollback Plan (If Needed)

If deployment causes issues:

### Rollback Step 1: Revert Database Migration

```sql
-- Remove market_slug column
ALTER TABLE copied_trades
DROP COLUMN IF EXISTS market_slug;

-- Remove index
DROP INDEX IF EXISTS idx_copied_trades_slug;
```

### Rollback Step 2: Revert Code

```bash
# Checkout previous commit
git log --oneline -5  # Find commit before changes
git checkout <previous-commit-hash>

# Force deploy
vercel --prod --force
```

---

## Environment Variables Required

No new environment variables needed! All existing vars are sufficient:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `CRON_SECRET` (if using cron jobs)

---

## Performance Considerations

### New API Calls

**CLOB API calls** (trader profile page):
- **Before:** Batch Gamma API (1 request)
- **After:** CLOB API parallel (N requests, where N = unique markets)
- **Impact:** Slightly slower but more accurate
- **Typical:** 20-50 markets = 20-50 parallel requests (still fast)

**Recommendation:** Monitor server logs for CLOB API response times. If slow, consider:
- Adding caching layer (Redis)
- Implementing rate limiting
- Batching requests with a custom endpoint

---

## Testing Checklist

After deployment, test these scenarios:

### ✅ Profile Page
- [ ] User-closed trades show correct ROI (not -99.9%)
- [ ] Avg ROI shows positive if user is profitable
- [ ] "View on Polymarket" links work (or show search if no slug)
- [ ] Status refresh skips user-closed trades
- [ ] Resolved markets show "Resolved" badge

### ✅ Trader Profile Page  
- [ ] ROI shows for prediction markets (Yes/No)
- [ ] ROI shows for esports markets (team names)
- [ ] Trades with price=0 show ROI: -100%
- [ ] ROI coverage is 95%+
- [ ] No CORS errors in console

### ✅ Status API
- [ ] Markets at $0 or $1 detected as resolved
- [ ] User-closed trades not overwritten
- [ ] Console shows resolution detection logs

---

## Monitoring

**Key metrics to watch:**
1. **CLOB API success rate** (should be 95%+)
2. **ROI coverage** (should be 95%+, was 0% before)
3. **User complaints** about wrong ROI (should decrease)
4. **Console errors** (CORS errors should be gone)

**Console logs to monitor:**
```javascript
// Good signs:
✅ Matched by outcome name: ... → price X
📊 Successfully cached X markets from CLOB
📊 ROI Coverage: { coveragePercent: '95%+' }
⏭️ Skipping user-closed trade...

// Bad signs:
❌ Trade X missing price  // Should be rare
❌ CORS error  // Should never appear
📊 ROI Coverage: 0%  // Should be fixed
```

---

## Quick Deploy Commands

```bash
# 1. Navigate to project
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy

# 2. Run database migration in Supabase SQL Editor
# (Copy content from supabase/migrations/008_add_market_slug.sql)

# 3. Commit changes (optional but recommended)
git add .
git commit -m "Fix ROI calculations, CORS issues, and add market slug support

- Fix user-closed trade ROI calculation and prevent overwrites
- Switch from Gamma to CLOB API for accurate outcome names
- Fix price=0 handling for lost trades
- Add weighted ROI calculation by investment amount
- Add market_slug column for proper Polymarket linking
- Enhance market resolution detection
- Add comprehensive debug logging"

# 4. Deploy to Vercel
vercel --prod

# Or if using git-based deployment:
git push origin main
# (Vercel will auto-deploy)
```

---

## Alternative: Deploy Without Migration

If you want to deploy code changes WITHOUT the database migration:

```bash
# Deploy code only
vercel --prod

# Note: market_slug will be null for all trades
# Links will fall back to search URLs (current behavior)
# Can run migration later without redeploying
```

---

## Post-Deployment

### Immediate Actions

1. **Test on production** with the checklist above
2. **Monitor console** for any unexpected errors
3. **Check Vercel logs** for server-side errors

### Within 24 Hours

1. **Check user feedback** - are ROI calculations correct?
2. **Monitor CLOB API** - is it fast enough?
3. **Verify resolution detection** - are markets being marked as resolved?

### Within 1 Week

1. **Complete market slug integration**
   - Update copy trade buttons to pass slug
   - Fix feed market title mismatch issue
2. **Consider caching** if CLOB API is slow
3. **Review console logs** to remove debug logging

---

## Summary

**Ready to deploy:** ✅ Yes (with migration)

**Critical changes:**
- User-closed trade ROI fixes
- CLOB API integration
- Price=0 handling
- Weighted ROI

**Requires:**
- Database migration (008_add_market_slug.sql)
- Code deployment

**Rollback available:** ✅ Yes

---

**Status:** ✅ Ready for deployment!
