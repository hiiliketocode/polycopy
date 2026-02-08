# Fix production: /lt 404 and remove Auto Copy

**Status: Merge and push to `main` are done.** Vercel will deploy automatically.

---

## Done

1. **Redirect** – `/admin/auto-copy` and `/admin/auto-copy/:path*` now redirect to `/lt` (in `next.config.ts`).
2. **Merge** – `chore/remove-auto-copy-add-lt-push` merged into `main` (conflicts in `vercel.json` and `app/api/ft/wallets/[id]/route.ts` resolved).
3. **Push** – `main` pushed to `origin`; production deploy should be in progress or complete.

---

## You still need to do

### 1. Create Live Trading tables (fixes “Could not find table public.lt_strategies”)

Run these migrations **in order** on your **production** Supabase project (SQL Editor or `supabase db push`):

1. **`supabase/migrations/20260208_create_live_trading_tables.sql`**  
   Creates `lt_strategies`, `lt_orders`, `lt_risk_rules`, `lt_risk_state`, `lt_redemptions`, `lt_health_checks`, `lt_alerts`.  
   Requires `public.ft_wallets` and `public.orders` to already exist.

2. **`supabase/migrations/20260208_extend_orders_for_live_trading.sql`**  
   Adds `lt_strategy_id`, `lt_order_id`, `signal_price`, `signal_size_usd` to `public.orders`.

- **Option A – Supabase Dashboard:** Project → SQL Editor → open each file, paste contents → Run (first file first).
- **Option B – CLI:** From repo root, `supabase link` to production, then `supabase db push` to run all pending migrations.

After these run, the Live Trading page at `/lt` will stop showing the “Could not find the table 'public.lt_strategies'” error.

### 2. Run the drop–auto-copy migration (if not already run)

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
