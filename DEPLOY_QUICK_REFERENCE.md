# Quick Deploy - Polycopy ROI Fixes

## 🚀 Quick Commands

### Option 1: Interactive Script
```bash
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy
./deploy.sh
```

### Option 2: Manual Steps
```bash
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy

# 1. Run migration in Supabase SQL Editor
cat supabase/migrations/008_add_market_slug.sql
# Copy output and paste in: https://supabase.com/dashboard

# 2. Commit changes
git add .
git commit -m "Fix ROI calculations and CORS issues"

# 3. Deploy
vercel --prod
# OR
git push origin main  # (if auto-deploy enabled)
```

---

## ⚠️ Required: Database Migration

**Before deploying, run this SQL in Supabase:**

```sql
ALTER TABLE copied_trades
ADD COLUMN IF NOT EXISTS market_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_copied_trades_slug ON copied_trades(market_slug);
```

**Verify it worked:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'copied_trades' AND column_name = 'market_slug';
```

---

## ✅ What's Being Deployed

1. **User-closed trade ROI fixes**
   - ROI recalculated on load
   - Status API skips user-closed trades
   - No more overwriting user exit prices

2. **CLOB API integration** 
   - Actual outcome names (PARIVISION, MOUZ, etc.)
   - 95%+ ROI coverage (was 0%)
   - No CORS errors

3. **Price=0 handling**
   - Lost trades show -100% ROI (not "--")
   - 100% coverage instead of 95%

4. **Weighted ROI**
   - By investment amount
   - Matches actual Polymarket profit

5. **Market resolution detection**
   - Detects markets at $0 or $1
   - Shows "Resolved" status

6. **Market slug support**
   - Direct links to Polymarket markets
   - No more search results

---

## 🧪 Test After Deploy

```bash
# 1. Profile page
open https://polycopy.app/profile
# - Check user-closed trade ROI is correct
# - Check weighted ROI matches Polymarket profit

# 2. Trader profile page  
open https://polycopy.app/trader/[wallet]
# - Check ROI shows for esports markets
# - Check no CORS errors in console

# 3. Browser console
# - Look for: ✅ Matched by outcome name
# - Look for: 📊 ROI Coverage: 95%+
# - Should NOT see: ❌ CORS error
```

---

## 🔄 Rollback (If Needed)

```bash
# Revert migration
# Run in Supabase SQL Editor:
ALTER TABLE copied_trades DROP COLUMN IF EXISTS market_slug;

# Revert code
git revert HEAD
git push origin main
```

---

## 📊 Files Changed

- ✅ `app/profile/page.tsx` - User-closed ROI fixes, weighted ROI
- ✅ `app/trader/[wallet]/page.tsx` - CLOB API, price=0 handling
- ✅ `app/api/copied-trades/route.ts` - Accept market_slug
- ✅ `app/api/copied-trades/[id]/status/route.ts` - Resolution detection, skip user-closed
- ✅ `app/api/gamma/markets/route.ts` - Created batch proxy API
- ✅ `supabase/migrations/008_add_market_slug.sql` - New migration

**Total:** 6 files modified/created

---

**Status:** ✅ Ready to deploy!
