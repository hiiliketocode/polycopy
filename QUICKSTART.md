# Quick Start Guide - Trade History Updates

## 🎯 What's Been Done

All code changes are complete! Here's what was implemented:

### ✅ Trader Profile Page (`app/trader/[wallet]/page.tsx`)
- Fixed ROI calculation to show for all trades (open and closed)
- Removed Actions column - table is now ~100px narrower
- Made market names clickable with external link icon
- Made outcome badges more compact

### ✅ User Profile Page (`app/profile/page.tsx`)
- Added "Mark as Closed" feature with exit price input
- New status type: "You Closed" (purple badge)
- Updated filter logic to handle user-closed trades
- Modal UI for entering exit price in cents

---

## ⚡ Required Action: Run Database Migration

**You must run this SQL in Supabase before the new features work!**

### Option 1: Run the standalone SQL file
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `RUN_THIS_ADD_USER_CLOSED.sql`
3. Execute it

### Option 2: Use the migration file
```bash
# If using Supabase CLI
supabase migration up
```

### What it does:
```sql
ALTER TABLE copied_trades 
ADD COLUMN user_closed_at TIMESTAMP,
ADD COLUMN user_exit_price DECIMAL(10,4);
```

---

## 🧪 Test It

### Test Trader Profile Page:
1. Go to any trader's profile (e.g., `/trader/0x...`)
2. Verify ROI shows for most/all trades (not just "--")
3. Click on a market name - should open Polymarket in new tab
4. Check table width is narrower and scrolls well on mobile

### Test User Profile Page:
1. Go to `/profile`
2. Find an open trade (green "Open" badge)
3. Expand the trade details
4. Click "Mark as Closed"
5. Enter an exit price (e.g., 65 for 65 cents)
6. Confirm - trade should show "You Closed" (purple badge)
7. ROI should update based on your exit price

### Test Filters:
- **All Trades** - should show everything
- **Open** - should NOT show user-closed trades
- **Closed** - should include both trader-closed and user-closed trades
- **Resolved** - should show only market-resolved trades

---

## 🐛 Troubleshooting

### "Mark as Closed" button doesn't appear
- **Problem:** Database columns not added yet
- **Solution:** Run the SQL migration (see above)

### ROI still showing "--" for some trades
- **Possible causes:**
  1. Market doesn't exist on Gamma API (rare)
  2. Network issues
  3. conditionId doesn't match (check console logs)
- **Check:** Browser console for any API errors

### Error when marking trade as closed
- **Problem:** Database columns don't exist
- **Solution:** Run `RUN_THIS_ADD_USER_CLOSED.sql` in Supabase

---

## 📊 Status Types Reference

| Status | Color | Meaning |
|--------|-------|---------|
| Open | Green | Trader still holds, you haven't closed |
| Trader Closed | Red | Trader exited, you haven't marked as closed |
| You Closed | Purple | You manually closed with exit price |
| Resolved | Blue | Market officially resolved by Polymarket |

---

## 📁 Files Created/Modified

### Modified:
- `app/trader/[wallet]/page.tsx`
- `app/profile/page.tsx`

### Created:
- `supabase/migrations/007_add_user_closed_columns.sql`
- `RUN_THIS_ADD_USER_CLOSED.sql`
- `TRADE_HISTORY_UPDATES.md` (detailed docs)
- `QUICKSTART.md` (this file)

---

## 🚀 Deploy

1. **Run database migration** (required!)
2. Commit and push changes:
   ```bash
   git add .
   git commit -m "Add Mark as Closed feature and fix ROI calculation"
   git push
   ```
3. Deploy to production (Vercel/etc will auto-deploy)

---

## ❓ Need Help?

- Review `TRADE_HISTORY_UPDATES.md` for full technical details
- Check browser console for errors
- Verify database columns exist in Supabase
- Contact @polycopyapp on X/Twitter

---

## ✨ Enjoy the Updates!

Your users can now:
- See ROI for all their trades
- Manually track when they close positions
- Have a cleaner, more compact trade history table
