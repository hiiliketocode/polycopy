# SQL Files Overview

This project has SQL files for setting up your Supabase database.

## 🎯 Current Active Migration

### `RUN_THIS_ADD_PROFILE_IMAGE.sql` ⭐ LATEST
Adds `profile_image_url` column to `profiles` table for syncing profile pictures from Polymarket.

**Status:** ✅ Applied to production (Jan 5, 2025)

---

## 📁 Archived Files

All previous SQL migration files have been moved to `supabase/migrations/archive/`:
- RLS policy fixes (Dec 2024)
- Wallet address column
- User closed trades columns
- Security vulnerability fixes

**Note:** These files are kept for reference only. They have already been applied to production.

---

## 🗂️ Migration Files

Located in `supabase/migrations/`:

- **20251228231853_create_truncate_trades_function.sql** - Active migration for truncate function
- **archive/** - Historical migrations (already applied)

If you're setting up a new database from scratch, see `SUPABASE_SETUP.md`.

---

## 📖 Documentation Files

- **SUPABASE_SETUP.md** - Complete database setup from scratch
- **supabase/migrations/README.md** - How to run migrations
- **supabase/migrations/archive/README.md** - Historical migrations reference

---

## Which File Should I Use?

| Situation | File to Use |
|-----------|-------------|
| 🆕 Add profile images | `RUN_THIS_ADD_PROFILE_IMAGE.sql` |
| 🔄 Using Supabase CLI | Files in `supabase/migrations/` |
| 📚 Reference old migrations | `supabase/migrations/archive/` |
| 🆕 New database setup | See `SUPABASE_SETUP.md` |

---

## How to Run

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor**
4. Click **New Query**
5. Copy entire contents of the SQL file
6. Paste and click **Run**

See `QUICK_FIX.md` for detailed instructions with screenshots!

