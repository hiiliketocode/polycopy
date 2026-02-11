# IMMEDIATE DEBUG - Orders Not Executing

**Symptom:** Seeing FT_SYNC but no LT_EXECUTE entries in logs

---

## 🔍 **Run These Commands NOW**

Open browser console on polycopy.app and run these one by one:

### 1. Check What LT Execute Sees
```javascript
fetch('/api/lt/execute', { method: 'POST' })
  .then(r => r.json())
  .then(data => {
    console.log('=== EXECUTION RESULTS ===');
    console.log('Executed:', data.total_executed);
    console.log('Skipped:', data.total_skipped);
    console.log('Errors:', data.total_errors);
    console.log('\n=== BY STRATEGY ===');
    Object.entries(data.results).forEach(([strategy, stats]) => {
      console.log(`\n${strategy}:`);
      console.log('  Executed:', stats.executed);
      console.log('  Skipped:', stats.skipped);
      console.log('  Errors:', stats.errors);
      console.log('  REASONS:', stats.reasons);  // ← KEY!
    });
  });
```

**Share the REASONS with me!** This will tell us exactly why orders aren't executing.

---

### 2. Check Execution Audit
```javascript
fetch('/api/lt/execution-audit')
  .then(r => r.json())
  .then(data => {
    console.log('=== AUDIT ===');
    console.log('Total FT orders:', data.summary.total_ft_orders);
    console.log('Already executed:', data.summary.already_executed);
    console.log('Too old:', data.summary.too_old);
    console.log('Eligible:', data.summary.eligible);
    console.log('\nRecommendations:', data.recommendations);
  });
```

---

### 3. Check Sync Times
```javascript
fetch('/api/lt/strategies')
  .then(r => r.json())
  .then(data => {
    console.log('=== STRATEGIES ===');
    data.strategies.forEach(s => {
      console.log(`${s.strategy_id}:`);
      console.log('  Active:', s.is_active);
      console.log('  Paused:', s.is_paused);
      console.log('  Last sync:', s.last_sync_time);
      console.log('  FT wallet:', s.ft_wallet_id);
    });
  });
```

---

## 🎯 **Most Likely Causes**

### Cause 1: Sync Times Still Too Recent
**If execution-audit shows "too_old: 95%"**

Fix:
```javascript
fetch('/api/lt/reset-to-realtime', { method: 'POST' })
  .then(r => r.json())
  .then(console.log);
```

### Cause 2: Strategies Paused
**If strategies show "is_paused: true"**

Fix via SQL:
```sql
UPDATE lt_strategies SET is_paused = false WHERE is_active = true;
UPDATE lt_risk_state SET is_paused = false WHERE is_paused = true;
```

### Cause 3: No Matching FT Wallets
**If LT strategies point to wrong FT wallet IDs**

Check:
```sql
SELECT 
  s.strategy_id,
  s.ft_wallet_id,
  s.is_active,
  s.last_sync_time,
  fw.wallet_id as ft_exists
FROM lt_strategies s
LEFT JOIN ft_wallets fw ON fw.wallet_id = s.ft_wallet_id
WHERE s.is_active = true;
```

---

## ⚡ **Quick Fix Sequence**

Run these in order:

```javascript
// 1. Check what's wrong
const audit = await fetch('/api/lt/execution-audit').then(r => r.json());
console.log('Eligible:', audit.summary.eligible);
console.log('Too old:', audit.summary.too_old);

// 2. If too_old > 0, reset
if (audit.summary.too_old > 0) {
  await fetch('/api/lt/reset-to-realtime', { method: 'POST' })
    .then(r => r.json())
    .then(d => console.log('Reset:', d));
}

// 3. Wait 2 min for new FT orders
await new Promise(r => setTimeout(r, 2 * 60 * 1000));

// 4. Trigger execution
await fetch('/api/lt/execute', { method: 'POST' })
  .then(r => r.json())
  .then(d => {
    console.log('Executed:', d.total_executed);
    console.log('Results:', d.results);
  });

// 5. Check logs page
console.log('Now check: https://polycopy.app/lt/logs');
```

---

## 📊 **What You Should See**

After fixes, logs page should show:

```
🔵 FT_SYNC ✅ 1m ago
   FT Sync created order: Will Bitcoin...

🟣 LT_EXECUTE ✅ 1m ago    ← YOU'RE MISSING THESE
   LT Execute triggered order for LT_FT_ML_EDGE

🟢 ORDER_PLACED ✅ 1m ago  ← AND THESE
   Order placed: Will Bitcoin...

✅ ORDER_FILLED ✅ 30s ago  ← AND THESE
   ✅ Order filled: Will Bitcoin...
```

If you ONLY see FT_SYNC, LT is not executing.

---

## 🚨 **CRITICAL: Run This Right Now**

```javascript
// This will tell us EXACTLY why LT isn't executing
fetch('/api/lt/execute', { method: 'POST' })
  .then(r => r.json())
  .then(data => {
    console.log('===== CRITICAL DEBUG =====');
    console.log('Strategies processed:', data.strategies_processed);
    console.log('Total executed:', data.total_executed);
    
    if (data.total_executed === 0) {
      console.log('\n⚠️ ZERO EXECUTIONS - Reasons by strategy:');
      Object.entries(data.results).forEach(([strat, stats]) => {
        if (stats.skipped > 0 || stats.errors > 0) {
          console.log(`\n${strat}:`);
          console.log('  Reasons:', stats.reasons);
        }
      });
    }
  });
```

**Share the output of the "REASONS" field with me!**

This will show why LT isn't picking up those FT orders.
