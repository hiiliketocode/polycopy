# RLS Security Fix - January 10, 2025

## Issue
Supabase security linter identified 6 tables in the `public` schema that had Row Level Security (RLS) disabled, creating potential security vulnerabilities where any authenticated user could access or modify data they shouldn't have access to.

## Tables Affected
1. `wallet_backfills` - Tracks backfill progress for trader wallets
2. `wallet_poll_state` - Polling state per wallet (worker system)
3. `positions_current` - Current open positions snapshot
4. `positions_closed` - Historical closed positions
5. `job_locks` - Distributed locking for cold worker
6. `copy_trade_migration_failures` - Migration failure tracking

## Solution
Created migration `20250110_enable_rls_on_system_tables.sql` that:

### 1. Enables RLS on All Affected Tables
```sql
ALTER TABLE public.[table_name] ENABLE ROW LEVEL SECURITY;
```

### 2. Implements Secure Policy Model

**Service Role Access (for workers/system operations):**
- Full read/write access for service role
- Workers use service role key to manage these tables
- Required for automated polling, backfills, and job locking

**Authenticated User Access (for app users):**
- **Read-only** access to most tables for transparency
- Users can view:
  - Backfill status (`wallet_backfills`)
  - Polling state (`wallet_poll_state`)
  - Current positions (`positions_current`)
  - Closed positions (`positions_closed`)
- **No access** to internal infrastructure:
  - Job locks (`job_locks`) - internal worker coordination
  
**Admin Access:**
- Admins can view `copy_trade_migration_failures` for debugging
- Requires `profiles.is_admin = true`

## Security Improvements

### Before
- ❌ Any authenticated user could potentially read/modify system tables
- ❌ No access control on worker coordination tables
- ❌ Migration failures visible to all users

### After
- ✅ Service role required for write operations
- ✅ Users can only read relevant data (transparency)
- ✅ Internal infrastructure (job_locks) hidden from users
- ✅ Admin-only access to sensitive debugging info
- ✅ All tables protected by RLS policies

## Deployment

### To Apply This Migration:

1. **Via Supabase Dashboard:**
   ```
   1. Go to your Supabase project dashboard
   2. Navigate to SQL Editor
   3. Copy contents of supabase/migrations/20250110_enable_rls_on_system_tables.sql
   4. Paste and run the SQL
   ```

2. **Via Supabase CLI:**
   ```bash
   supabase db push
   ```

3. **Verify RLS is Enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND tablename IN (
     'wallet_backfills',
     'wallet_poll_state', 
     'positions_current',
     'positions_closed',
     'job_locks',
     'copy_trade_migration_failures'
   );
   ```
   All should show `rowsecurity = true`

## Testing

After applying the migration, verify:

1. **Worker operations still function:**
   - Hot/cold workers can still update `wallet_poll_state`
   - Backfill scripts can write to `wallet_backfills`
   - Job locks work correctly

2. **User access is appropriate:**
   - Regular users can view positions/backfill status
   - Regular users CANNOT write to system tables
   - Regular users CANNOT see job_locks

3. **Admin access:**
   - Admins can view migration failures
   - Non-admins cannot view migration failures

## Notes

- These tables are primarily managed by worker processes using the service role key
- The read-only access for authenticated users provides transparency without security risk
- If you add new system tables in the future, remember to enable RLS immediately
- Consider using Supabase's database linter regularly to catch these issues early

## Related Files
- Migration: `supabase/migrations/20250110_enable_rls_on_system_tables.sql`
- Worker docs: `WORKER_SYSTEM.md`
- General RLS: `supabase/migrations/20250109_lock_down_sensitive_user_tables.sql`
