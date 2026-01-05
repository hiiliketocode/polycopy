# Archived SQL Migrations

These SQL files have been archived as they were one-off manual migrations that have already been applied to the production database.

## Files in this Archive

### RLS Policy Files (Applied Dec 2024)
- `FIX_RLS_SECURITY_VULNERABILITIES.sql` - Security fixes for RLS policies
- `RUN_BOTH_POLICIES.sql` - Combined follows + profiles RLS fix
- `RUN_THIS_FOR_PROFILES.sql` - Profiles table RLS policies
- `RUN_THIS_IN_SUPABASE.sql` - Follows table RLS policies
- `supabase-rls-policies.sql` - Original comprehensive RLS setup

### Feature Migrations (Applied Dec 2024 - Jan 2025)
- `RUN_THIS_ADD_WALLET.sql` - Added wallet_address column to profiles
- `RUN_THIS_ADD_USER_CLOSED.sql` - Added user_closed_at and user_exit_price columns

## Current Migration

The only active migration file you should reference is:
- **`RUN_THIS_ADD_PROFILE_IMAGE.sql`** (root directory) - Adds profile_image_url column

## Status

✅ All files in this archive have been applied to production
✅ These are kept for historical reference only
⚠️ Do NOT re-run these migrations unless you're setting up a new database from scratch

## Migration History

For the complete migration history, see:
- `supabase/migrations/20251228231853_create_truncate_trades_function.sql` - Active migration
- `SQL_FILES_README.md` (root) - Guide to SQL files

---

**Archived on**: January 5, 2025
**Branch**: cleanup-jan5

