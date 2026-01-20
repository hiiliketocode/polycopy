# Deployment Checklist

## ✅ Pre-Deployment

- [x] Migration `038_worker_polling_system.sql` run successfully
- [ ] Verify migration created tables: `wallet_poll_state`, `positions_current`, `positions_closed`, `job_locks`
- [ ] Verify `acquire_job_lock()` function exists

```sql
-- Quick verification queries
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('wallet_poll_state', 'positions_current', 'positions_closed', 'job_locks');

SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'acquire_job_lock';
```

## 📋 Deployment Steps

### 1. Install/Update flyctl

```bash
# macOS
brew install flyctl

# Or update if already installed
brew upgrade flyctl
```

### 2. Authenticate with Fly.io

```bash
flyctl auth login
```

### 3. Create Hot Worker App

```bash
cd /Users/rawdonmessenger/PolyCopy

# Create hot worker app (if not exists)
flyctl launch --name polycopy-hot-worker --config fly.worker-hot.toml --no-deploy

# Or if app already exists, just set config:
# flyctl config save -a polycopy-hot-worker -c fly.worker-hot.toml
```

### 4. Create Cold Worker App

```bash
# Create cold worker app (if not exists)
flyctl launch --name polycopy-cold-worker --config fly.worker-cold.toml --no-deploy

# Or if app already exists:
# flyctl config save -a polycopy-cold-worker -c fly.worker-cold.toml
```

### 5. Set Environment Variables

**Hot Worker:**
```bash
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  -a polycopy-hot-worker
```

**Cold Worker:**
```bash
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  -a polycopy-cold-worker
```

**Get your Supabase credentials:**
- URL: From Supabase dashboard → Settings → API
- Service Role Key: From Supabase dashboard → Settings → API → `service_role` key (keep secret!)

### 6. Deploy Workers

**Hot Worker:**
```bash
flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker
```

**Cold Worker:**
```bash
flyctl deploy -c fly.worker-cold.toml -a polycopy-cold-worker
```

### 7. Verify Deployment

**Check status:**
```bash
flyctl status -a polycopy-hot-worker
flyctl status -a polycopy-cold-worker
```

**View logs:**
```bash
# Hot worker logs
flyctl logs -a polycopy-hot-worker

# Cold worker logs
flyctl logs -a polycopy-cold-worker

# Follow logs in real-time
flyctl logs -a polycopy-hot-worker --follow
```

## 🔍 Post-Deployment Verification

### 1. Check Worker Logs

Look for:
- ✅ `🔥 Hot worker starting...` (hot worker)
- ✅ `❄️  Cold worker starting...` (cold worker)
- ✅ `[Cycle 1] Processing X hot wallets...` (hot worker)
- ✅ `[Cycle 1] Acquired lock, processing cold wallets...` (cold worker)
- ✅ `✅ 0x...: X trades, Y positions, Z closed (XXXms)` (processing messages)

### 2. Verify Database Updates

```sql
-- Check wallet poll state is being updated
SELECT * FROM wallet_poll_state ORDER BY updated_at DESC LIMIT 10;

-- Check trades are being inserted
SELECT COUNT(*) FROM trades_public WHERE last_seen_at > NOW() - INTERVAL '5 minutes';

-- Check positions are being tracked
SELECT COUNT(*) FROM positions_current;

-- Check job locks (should see cold_poll lock)
SELECT * FROM job_locks;
```

### 3. Test Hot Wallet Processing

If you have wallets in the `follows` table:

```sql
-- Check which wallets are being processed as hot
SELECT DISTINCT trader_wallet FROM follows WHERE active = true LIMIT 5;

-- Verify they appear in wallet_poll_state after first cycle
SELECT wallet_address, last_position_check_at 
FROM wallet_poll_state 
WHERE wallet_address IN (
  SELECT DISTINCT trader_wallet FROM follows WHERE active = true
)
ORDER BY last_position_check_at DESC;
```

## 🐛 Troubleshooting

### Worker Not Starting

1. Check logs: `flyctl logs -a polycopy-hot-worker`
2. Verify secrets: `flyctl secrets list -a polycopy-hot-worker`
3. Check Supabase connection (URL and service role key correct?)

**Note**: If `flyctl secrets list` shows "context canceled" warnings, this is normal and does NOT mean secrets are missing. Secrets are validated at runtime - the worker would fail with clear errors if secrets were actually absent.

### No Wallets Being Processed

1. **Hot worker**: Verify `follows` table has active entries:
   ```sql
   SELECT COUNT(*) FROM follows WHERE active = true;
   ```

2. **Cold worker**: Verify `traders` table has active entries:
   ```sql
   SELECT COUNT(*) FROM traders WHERE is_active = true;
   ```

### Lock Issues (Cold Worker)

If cold worker keeps skipping cycles:
```sql
-- Check if lock is stuck
SELECT * FROM job_locks WHERE job_name = 'cold_poll';

-- If locked_until is in the past but still blocking, manually release:
DELETE FROM job_locks WHERE job_name = 'cold_poll';
```

### Rate Limit Errors

- Check logs for 429 errors
- Reduce `requestsPerSecond` in `workers/shared/polling.js` if needed
- Increase cooldown intervals

## 📊 Monitoring

### View Real-Time Logs

```bash
# Hot worker
flyctl logs -a polycopy-hot-worker --follow

# Cold worker  
flyctl logs -a polycopy-cold-worker --follow
```

### Check Worker Health

```bash
# Status
flyctl status -a polycopy-hot-worker
flyctl status -a polycopy-cold-worker

# Metrics (if configured)
flyctl metrics -a polycopy-hot-worker
```

### Database Monitoring Queries

```sql
-- Recent activity
SELECT 
  wallet_address,
  last_position_check_at,
  last_trade_time_seen,
  updated_at
FROM wallet_poll_state
ORDER BY updated_at DESC
LIMIT 20;

-- Trade ingestion rate
SELECT 
  DATE_TRUNC('minute', last_seen_at) as minute,
  COUNT(*) as trades
FROM trades_public
WHERE last_seen_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- Position changes
SELECT 
  wallet_address,
  COUNT(*) as position_count,
  MAX(last_seen_at) as last_updated
FROM positions_current
GROUP BY wallet_address
ORDER BY last_updated DESC
LIMIT 20;
```

## ✅ Success Criteria

After deployment, you should see:

1. ✅ Workers start without errors
2. ✅ Hot worker processes wallets from `follows` table every 1-3 seconds
3. ✅ Cold worker acquires lock and processes wallets hourly
4. ✅ `wallet_poll_state` table being updated with `last_position_check_at`
5. ✅ `trades_public` table receiving new trades
6. ✅ `positions_current` table tracking current positions
7. ✅ No duplicate cold worker runs (lock working correctly)

