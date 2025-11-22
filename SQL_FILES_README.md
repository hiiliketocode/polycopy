# SQL Files Overview

This project has several SQL files for setting up your Supabase database. Here's which one to use:

## 🎯 Quick Start (Use This!)

### `RUN_BOTH_POLICIES.sql` ⭐ RECOMMENDED
Run this ONE file to fix both the `follows` and `profiles` table RLS policies at once.

**When to use:** You're getting "query timeout" or the app is stuck loading.

---

## 📁 Individual Files (If You Need Them)

### `RUN_THIS_IN_SUPABASE.sql`
Fixes RLS policies for the `follows` table only.

### `RUN_THIS_FOR_PROFILES.sql`
Fixes RLS policies for the `profiles` table only.

### `RUN_THIS_ADD_WALLET.sql` 🆕
Adds `wallet_address` column to `profiles` table for wallet connection feature.

### `supabase-rls-policies.sql`
Original comprehensive RLS setup (includes both tables + extra policies).

---

## 🗂️ Migration Files

Located in `supabase/migrations/`:

- **002_fix_follows_policies.sql** - Follows table RLS migration
- **003_fix_profiles_policies.sql** - Profiles table RLS migration
- **004_add_wallet_to_profiles.sql** - Adds wallet_address column

These are the same as the individual files above, just formatted as migrations if you're using Supabase CLI.

---

## 📖 Documentation Files

- **QUICK_FIX.md** - Step-by-step visual guide to fix RLS issues
- **SUPABASE_SETUP.md** - Complete database setup from scratch
- **WALLET_CONNECTION.md** - Wallet connection feature documentation
- **supabase/migrations/README.md** - How to run migrations

---

## Which File Should I Use?

| Situation | File to Use |
|-----------|-------------|
| 🆕 First time setup | `RUN_BOTH_POLICIES.sql` |
| 🐛 App stuck loading | `RUN_BOTH_POLICIES.sql` |
| ⚠️ "Query timeout" error | `RUN_BOTH_POLICIES.sql` |
| 📋 Only follows broken | `RUN_THIS_IN_SUPABASE.sql` |
| 👤 Only profiles broken | `RUN_THIS_FOR_PROFILES.sql` |
| 👛 Add wallet connection | `RUN_THIS_ADD_WALLET.sql` |
| 🔄 Using Supabase CLI | Files in `supabase/migrations/` |

---

## How to Run

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor**
4. Click **New Query**
5. Copy entire contents of the SQL file
6. Paste and click **Run**

See `QUICK_FIX.md` for detailed instructions with screenshots!

