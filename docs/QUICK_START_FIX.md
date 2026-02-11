# 🚀 Quick Start - Fix Your Live Trading Bot NOW

**Status:** Your bot is not executing trades. Here's how to fix it in the next 10 minutes.

---

## Step 1: Run Diagnostic (2 minutes)

### Option A: Via API (Recommended)
Open your browser or use curl:
```bash
GET https://your-app.vercel.app/api/lt/diagnostic
```

### Option B: Via Database
```sql
-- Check if you have any LT strategies
SELECT strategy_id, ft_wallet_id, is_active, is_paused, last_sync_time
FROM lt_strategies;

-- Check if you have any FT orders
SELECT wallet_id, COUNT(*) as count
FROM ft_orders
WHERE outcome = 'OPEN'
GROUP BY wallet_id;

-- Check if you have any LT orders
SELECT strategy_id, status, COUNT(*) as count
FROM lt_orders
GROUP BY strategy_id, status;
```

---

## Step 2: Identify Your Issue

### Issue A: "No LT Strategies" ❌
**What it means:** You haven't created any live trading strategies yet.

**Fix (2 minutes):**
1. Go to your app: `https://your-app.vercel.app/lt`
2. Click "New Live Strategy"
3. Select an FT wallet (e.g., "FT_HIGH_CONVICTION")
4. Set starting capital: `$10` (for testing)
5. Use your connected Polymarket account (or enter wallet address)
6. Click "Create"

**Or via API:**
```bash
POST /api/lt/strategies
Content-Type: application/json

{
  "ft_wallet_id": "FT_HIGH_CONVICTION",
  "starting_capital": 10,
  "display_name": "Test Strategy"
}
```

✅ **After fix:** Run diagnostic again - should show "Found 1 active strategy"

---

### Issue B: "No FT Orders" ❌
**What it means:** Forward testing isn't generating any trade signals for LT to execute.

**Fix (5 minutes):**

**Step 1: Check FT Wallets**
```sql
SELECT wallet_id, display_name, is_active, total_trades, last_sync_time
FROM ft_wallets
WHERE is_active = true;
```

If no active wallets, activate one:
```sql
UPDATE ft_wallets
SET is_active = true
WHERE wallet_id = 'FT_HIGH_CONVICTION';
```

**Step 2: Manually Trigger FT Sync**
```bash
POST /api/ft/sync
```

**Step 3: Wait 30 seconds, then check for orders**
```sql
SELECT wallet_id, COUNT(*) as count
FROM ft_orders
WHERE outcome = 'OPEN'
GROUP BY wallet_id;
```

**If still empty, check FT configuration:**
```sql
SELECT wallet_id, display_name, 
       model_threshold, price_min, price_max, min_edge,
       min_trader_resolved_count
FROM ft_wallets
WHERE wallet_id = 'FT_HIGH_CONVICTION';
```

**Common Issues:**
- `model_threshold` too high (>0.60) - Lower to 0.50
- `price_min`/`price_max` too narrow - Expand to 0.20-0.80
- `min_edge` too high (>0.10) - Lower to 0.05
- No traders match your filters - Check trader filters

✅ **After fix:** Should see OPEN orders in `ft_orders`

---

### Issue C: "Strategies Active, FT Orders Exist, but No LT Orders" ⚠️
**What it means:** Execution is running but trades are being skipped or failing.

**Fix (2 minutes):**

**Step 1: Manually Trigger LT Execution**
```bash
POST /api/lt/execute
```

**Step 2: Check the response for skip reasons**
```json
{
  "success": true,
  "strategies_processed": 1,
  "total_executed": 0,
  "total_skipped": 5,
  "results": {
    "LT_TEST": {
      "executed": 0,
      "skipped": 5,
      "errors": 0,
      "reasons": {
        "no_token_id": 3,
        "insufficient_cash": 2
      }
    }
  }
}
```

**Common Skip Reasons:**

1. **`no_token_id`** - Token resolution failing
   - **Fix:** Already implemented in today's update (retry logic)
   - Redeploy your app to get the fix

2. **`insufficient_cash`** - Not enough balance
   - **Check risk state:**
     ```sql
     SELECT current_equity, daily_spent_usd
     FROM lt_risk_state
     WHERE strategy_id = 'YOUR_STRATEGY_ID';
     ```
   - **Increase starting capital:**
     ```sql
     UPDATE lt_strategies
     SET starting_capital = 100
     WHERE strategy_id = 'YOUR_STRATEGY_ID';
     ```

3. **`daily_budget_exceeded`** - Risk limit hit
   - **Check and reset:**
     ```sql
     UPDATE lt_risk_state
     SET daily_spent_usd = 0,
         daily_trades_count = 0
     WHERE strategy_id = 'YOUR_STRATEGY_ID';
     ```

4. **`max_drawdown_exceeded`** - Circuit breaker triggered
   - **Reset circuit breaker:**
     ```sql
     UPDATE lt_risk_state
     SET circuit_breaker_active = false,
         circuit_breaker_reason = null
     WHERE strategy_id = 'YOUR_STRATEGY_ID';
     ```

5. **`trade_too_old`** - FT order predates strategy
   - **Update last_sync_time:**
     ```sql
     UPDATE lt_strategies
     SET last_sync_time = NOW() - INTERVAL '1 hour'
     WHERE strategy_id = 'YOUR_STRATEGY_ID';
     ```

✅ **After fix:** Run `POST /api/lt/execute` again - should see `total_executed > 0`

---

## Step 3: Test Execution (3 minutes)

### Option 1: Force Test Trade (Safest)
This creates a small test order ($5 max, 5 contracts) and you can cancel it immediately:

```bash
POST /api/lt/force-test-trade
Content-Type: application/json

{
  "cancel_after": true
}
```

**Expected Response:**
```json
{
  "ok": true,
  "summary": "1 trades placed, 0 failed",
  "results": [
    {
      "strategy_id": "LT_TEST",
      "ok": true,
      "order_id": "0x...",
      "lt_order_id": "uuid",
      "cancelled": true,
      "steps": [
        "Found last FT order: ...",
        "Token ID resolved via CLOB: ...",
        "Placing order: BUY 5 contracts @ $0.50 (~$2.50)",
        "Order posted ✓ — Order ID: 0x...",
        "Order cancelled ✓"
      ]
    }
  ]
}
```

**If it fails, check the `steps` array to see where it broke.**

### Option 2: Real Small Trade
Create a strategy with $10 capital and let it run:

```bash
# 1. Create strategy
POST /api/lt/strategies
{
  "ft_wallet_id": "FT_HIGH_CONVICTION",
  "starting_capital": 10
}

# 2. Trigger execution
POST /api/lt/execute

# 3. Check results
GET /api/lt/strategies/{strategy_id}/orders
```

✅ **Success:** You should see an order with `status: PENDING` or `FILLED`

---

## Step 4: Monitor (Ongoing)

### Check Execution Logs (Vercel Dashboard)
```bash
# Filter logs for your app
vercel logs --since 1h | grep "lt/execute"
```

Look for:
- ✅ `[lt/execute] ✅ Successfully executed` - Good!
- ❌ `[lt/execute] ❌ Skipping` - Check reason
- ⚠️  `[lt/execute] ⚠️  Exception` - Error occurred

### Check Database

**LT Orders (should be growing):**
```sql
SELECT strategy_id, status, COUNT(*) as count
FROM lt_orders
WHERE order_placed_at > NOW() - INTERVAL '1 day'
GROUP BY strategy_id, status;
```

**Order Events Log (should show "submitted"):**
```sql
SELECT status, COUNT(*) as count
FROM order_events_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

**Expected:**
- `attempted`: Initial attempts
- `submitted`: Successfully placed
- `rejected`: Failed (check `error_message`)

---

## Step 5: If Still Not Working

### Run Full Diagnostic
```bash
GET /api/lt/diagnostic
```

Check the `recommended_actions` field in the response.

### Check Cron Jobs
Verify crons are running:
```bash
# In vercel.json
{
  "crons": [
    {"path": "/api/cron/ft-sync", "schedule": "*/2 * * * *"},
    {"path": "/api/cron/lt-execute", "schedule": "*/2 * * * *"}
  ]
}
```

### Check Vercel Logs
```bash
# FT Sync
vercel logs --since 30m | grep "ft/sync"

# LT Execute
vercel logs --since 30m | grep "lt/execute"
```

### Enable Debug Logging
In your `.env.local`:
```bash
DEBUG=true
LOG_LEVEL=debug
```

Redeploy and check logs again.

---

## Quick Reference

### Essential API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/lt/diagnostic` | GET | Full system health check |
| `/api/lt/strategies` | GET | List all strategies |
| `/api/lt/strategies` | POST | Create new strategy |
| `/api/lt/strategies/{id}/resume` | POST | Resume paused strategy |
| `/api/ft/sync` | POST | Manually trigger FT sync |
| `/api/lt/execute` | POST | Manually trigger LT execution |
| `/api/lt/force-test-trade` | POST | Test trade execution |

### Essential SQL Queries

```sql
-- Active strategies
SELECT * FROM lt_strategies WHERE is_active = true;

-- Open FT orders
SELECT * FROM ft_orders WHERE outcome = 'OPEN' LIMIT 10;

-- Recent LT orders
SELECT * FROM lt_orders ORDER BY order_placed_at DESC LIMIT 10;

-- Risk state
SELECT * FROM lt_risk_state;

-- Recent errors
SELECT * FROM order_events_log 
WHERE status = 'rejected' 
ORDER BY created_at DESC LIMIT 10;
```

---

## Success Checklist

- [ ] Diagnostic shows "Active Strategies: PASS"
- [ ] Diagnostic shows "FT Orders: PASS"
- [ ] Force test trade succeeds (or executes and cancels)
- [ ] `POST /api/lt/execute` returns `total_executed > 0`
- [ ] New rows appear in `lt_orders` table
- [ ] Vercel logs show "✅ Successfully executed"
- [ ] No repeated errors in `order_events_log`

---

## What's Been Fixed Today

1. ✅ **Improved Token Resolution** - Now retries 3 times with exponential backoff
2. ✅ **Enhanced Logging** - Detailed logs at every step for easy debugging
3. ✅ **Diagnostic Endpoint** - Comprehensive health check at `/api/lt/diagnostic`
4. ✅ **Comprehensive Audit** - Full system review in `docs/LIVE_TRADING_AUDIT_2026.md`

---

## Next Steps After It's Working

1. **Increase Capital** - Once testing succeeds, increase to real amounts
2. **Add Multiple Strategies** - Mirror different FT wallets
3. **Implement Quick Wins** - Trade aggregation, health checks (see audit doc)
4. **Monitor Daily** - Check diagnostic endpoint daily
5. **Optimize** - Adjust risk rules, bet sizing based on performance

---

## Need Help?

1. **Check the audit:** `docs/LIVE_TRADING_AUDIT_2026.md`
2. **Run diagnostic:** `GET /api/lt/diagnostic`
3. **Check logs:** Vercel dashboard → Logs tab
4. **Review database:** Run the essential SQL queries above

---

**Last Updated:** February 10, 2026  
**Version:** 1.0 - Initial Quick Fix Guide
