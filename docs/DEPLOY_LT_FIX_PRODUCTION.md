# Fix production: /lt 404 and remove Auto Copy

**Status: Merge and push to `main` are done.** Vercel will deploy automatically.

---

## Done

1. **Redirect** – `/admin/auto-copy` and `/admin/auto-copy/:path*` now redirect to `/lt` (in `next.config.ts`).
2. **Merge** – `chore/remove-auto-copy-add-lt-push` merged into `main` (conflicts in `vercel.json` and `app/api/ft/wallets/[id]/route.ts` resolved).
3. **Push** – `main` pushed to `origin`; production deploy should be in progress or complete.

---

## You still need to do

**Run the drop–auto-copy migration on the production database** (if not already run):

- **Migration file:** `supabase/migrations/20260326_drop_auto_copy_tables.sql`
- **Option A – Supabase Dashboard:** Project → SQL Editor → paste the contents of that file → Run.
- **Option B – CLI:** From repo root, `supabase link` to your production project (if not already), then `supabase db push` (this applies all pending migrations; ensure that’s what you want).

Contents of the migration (for copy-paste):

```sql
-- Remove deprecated Auto Copy feature (replaced by Live Trading).
DROP INDEX IF EXISTS public.idx_auto_copy_configs_last_trade_ts;
DROP TABLE IF EXISTS public.auto_copy_logs;
DROP TABLE IF EXISTS public.auto_copy_configs;
```

---

## Verify

- Open https://polycopy.app/lt as an admin user → you should see the Live Trading strategies page.
- Old Auto Copy URL https://polycopy.app/admin/auto-copy should redirect to `/lt`.
