# Automatic Execution Troubleshooting

## 🚨 **Current Situation**

**User reports:**
- Only test orders exist (from force-test-trade)
- No automatic executions happening
- Logs show FT_SYNC but no LT_EXECUTE creating orders
- Last LT Execute: 41 minutes ago (should be every 1 min)

## 🔍 **Diagnosis Steps**

### Step 1: Check Vercel Cron Status
Go to: **Vercel Dashboard → Your Project → Cron**

Look for:
- `/api/cron/ft-sync` - Should show "Enabled" and recent runs
- `/api/cron/lt-execute` - Should show "Enabled" and recent runs

**If showing "Paused" or "Disabled":**
- Click "Enable"
- Crons may have been auto-paused due to timeouts or errors

### Step 2: Manually Trigger Full Cycle
```javascript
console.log('🔄 Manual execution test...\n');

// A. Trigger FT sync
console.log('1️⃣ Triggering FT sync...');
const ftResult = await fetch('/api/ft/sync', { method: 'POST' })
  .then(r => r.json());
console.log('FT Sync:', ftResult.success ? '✅' : '❌', ftResult);

// B. Wait 30 seconds
console.log('\n⏳ Waiting 30 seconds for FT to process...');
await new Promise(r => setTimeout(r, 30000));

// C. Check if FT created orders
const ftOrderCheck = await fetch('/api/lt/execution-audit')
  .then(r => r.json());
console.log('\n2️⃣ FT Orders Available:');
console.log('  Total:', ftOrderCheck.summary.total_ft_orders);
console.log('  Eligible:', ftOrderCheck.summary.eligible);
console.log('  Too old:', ftOrderCheck.summary.too_old);

// D. Trigger LT execute
console.log('\n3️⃣ Triggering LT execute...');
const ltResult = await fetch('/api/lt/execute', { method: 'POST' })
  .then(r => r.json());
console.log('LT Execute:');
console.log('  Executed:', ltResult.total_executed);
console.log('  Skipped:', ltResult.total_skipped);
console.log('  Errors:', ltResult.total_errors);

if (ltResult.total_executed === 0) {
  console.log('\n⚠️ ZERO EXECUTIONS - Checking reasons:');
  Object.entries(ltResult.results).forEach(([strategy, stats]) => {
    if (stats.skipped > 0 || stats.errors > 0) {
      console.log(`\n${strategy}:`);
      console.log('  Skipped:', stats.skipped);
      console.log('  Errors:', stats.errors);
      console.log('  REASONS:', stats.reasons);
    }
  });
}

// E. Check logs page after 1 minute
console.log('\n4️⃣ In 1 minute, check /lt/logs');
console.log('Should see: LT_EXECUTE, ORDER_PLACED, ORDER_FILLED');
```

### Step 3: Check Strategy Status
```sql
-- Verify strategies are active and not paused
SELECT 
  strategy_id,
  ft_wallet_id,
  is_active,
  is_paused,
  last_sync_time,
  NOW() - last_sync_time as time_since_sync
FROM lt_strategies
WHERE is_active = true
ORDER BY last_sync_time DESC;
```

## 🎯 **Common Issues**

### Issue 1: Cron Disabled
**Fix:** Re-enable in Vercel dashboard

### Issue 2: All Strategies Paused  
**Fix:**
```sql
UPDATE lt_strategies SET is_paused = false WHERE is_active = true;
UPDATE lt_risk_state SET is_paused = false WHERE is_paused = true;
```

### Issue 3: Sync Times Blocking
**Fix:**
```javascript
fetch('/api/lt/reset-to-realtime', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

### Issue 4: FT Not Creating Orders
**Symptom:** eligible: 0, no recent FT orders
**Fix:** Check FT wallet configuration, filters may be too strict

## 📊 **Expected Healthy State**

```
Vercel Cron Dashboard:
  ✅ ft-sync: Enabled, last run 1m ago
  ✅ lt-execute: Enabled, last run 1m ago

Execution Audit:
  Total FT orders: 100+
  Eligible: 10-50
  Too old: <50%

LT Execute Result:
  Executed: 5-20
  Skipped: <10
  Errors: 0

Logs Page:
  FT_SYNC every 1-2 minutes
  LT_EXECUTE every 1-2 minutes
  ORDER_PLACED appearing
  ORDER_FILLED confirming
```

## ⚡ **ACTION REQUIRED**

Run Step 2 (the manual trigger test) and share:
1. Complete console output
2. Vercel cron dashboard screenshot
3. What the REASONS object shows

This will tell us exactly why automatic execution stopped!
