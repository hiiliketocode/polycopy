# Emergency Database Access - When SQL Editor Won't Connect

## Current Situation
- Database is down (57P03 error - not accepting connections)
- SQL Editor returns: `ECONNREFUSED` 
- Disk is full (26.47 GB / 27 GB)
- Need to free space but can't connect

## Alternative Access Methods

### Option 1: Supabase CLI (If Installed)

If you have Supabase CLI installed:

```bash
# Check if installed
which supabase

# If installed, try connecting
supabase db execute --file scripts/smart-trades-cleanup.sql
```

### Option 2: Direct PostgreSQL Connection

Try connecting directly via psql:

```bash
# Get connection string from Supabase Dashboard → Settings → Database
# Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f scripts/smart-trades-cleanup.sql
```

### Option 3: Supabase Management API

If SQL Editor is down, Supabase support can:
- Run SQL queries on your behalf
- Temporarily increase disk space
- Restore database access

**Contact them immediately:**
- Email: support@supabase.com (you already sent)
- Discord: https://discord.supabase.com (often faster for critical issues)
- Include this message: "Database down due to disk space (26.47/27 GB). Need emergency cleanup script run. Error: 57P03, ECONNREFUSED"

### Option 4: Wait for Database Restart

Sometimes after a restart, there's a brief window where connections work:
1. Wait 5-10 minutes after restart
2. Try SQL Editor again
3. If it connects, immediately run the cleanup script

### Option 5: Upgrade Plan Temporarily

If you're on Free/Pro plan:
1. Upgrade to higher tier (more disk space)
2. This might restore database access
3. Run cleanup script
4. Downgrade after cleanup

## What to Tell Supabase Support

**Subject**: URGENT: Database Down - Disk Space Full (26.47/27 GB)

**Message**:
```
Hi Supabase Team,

My database is completely down due to disk space exhaustion:
- Current usage: 26.47 GB / 27 GB (98% full)
- Error: 57P03 - database system is not accepting connections
- SQL Editor: ECONNREFUSED
- Project: [your project name/ID]

I need emergency help to:
1. Run a cleanup script to archive old trades data
2. Or temporarily increase disk space so I can run cleanup

I have prepared cleanup scripts that:
- Archive old trades to trades_archive table (preserves all data)
- Delete old trades from main table
- Run VACUUM FULL to reclaim space

The cleanup script is ready at: scripts/smart-trades-cleanup.sql

Can you please:
1. Run this cleanup script on my behalf, OR
2. Temporarily increase disk space so I can run it myself?

This is critical - my production app is down.

Thank you!
```

## While Waiting: Prepare Scripts

Even if you can't run them now, prepare:

1. **Review cleanup scripts** - Make sure date ranges are correct
2. **Document what you'll archive** - Know how much data you're moving
3. **Plan query changes** - Update your app to query both `trades` and `trades_archive` if needed

## Prevention (After Recovery)

Once database is back:
1. Set up auto-archiving (see trades-cleanup-guide.md)
2. Monitor disk usage in dashboard
3. Enable autoscaling
4. Set up alerts for disk usage > 80%
