# Next Steps After Migration

## ✅ Migration Complete!

You've successfully run migration `038_worker_polling_system.sql`. 

## Quick Test (Optional)

Before deploying to Fly.io, you can test the workers locally:

```bash
# Set environment variables
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Test hot worker (Ctrl+C to stop)
node workers/worker-hot.js

# Test cold worker (Ctrl+C to stop)  
node workers/worker-cold.js
```

## Deploy to Fly.io

See `DEPLOYMENT_CHECKLIST.md` for detailed deployment steps.

Quick version:
1. Install flyctl: `brew install flyctl`
2. Authenticate: `flyctl auth login`
3. Create apps: `flyctl launch --name polycopy-hot-worker --config fly.worker-hot.toml --no-deploy`
4. Set secrets: `flyctl secrets set NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... -a polycopy-hot-worker`
5. Deploy: `flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker`
6. Repeat for cold worker

## Verify Migration

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('wallet_poll_state', 'positions_current', 'positions_closed', 'job_locks');

-- Check function exists
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'acquire_job_lock';
```

## What Happens Next

Once deployed, the workers will:

1. **Hot Worker**: Poll wallets from `follows` table every 1-3 seconds
2. **Cold Worker**: Poll all other active traders hourly (with locking)
3. **Both**: Update `wallet_poll_state`, `trades_public`, `positions_current`, and `positions_closed` tables

See `README.md` for architecture details and `DEPLOYMENT_CHECKLIST.md` for deployment guide.
