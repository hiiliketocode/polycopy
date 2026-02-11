# Live Trading Execution Issues - Root Causes & Solutions

**Date:** February 11, 2026  
**Status:** CRITICAL - System is creating orders but they're not filling

---

## 🎯 **The Three Core Problems**

### Problem 1: Orders Not Triggering (75% Skip Rate)
**Status:** ❌ BLOCKING  
**Impact:** Only 25 out of 100 FT orders result in LT orders

**Root Cause:**
```typescript
// In app/api/lt/execute/route.ts line 113
.gt('order_time', lastSyncTime.toISOString())
```

The executor **only looks at FT orders created AFTER `last_sync_time`**. Since:
- FT orders were created over days/weeks
- LT strategies were just created/updated recently
- `last_sync_time` is set to "now" on create/update
- Result: 75 FT orders are "too old" and skipped

**Why This Design:**
The cron-based approach assumes:
1. FT sync runs → creates FT orders
2. 2 minutes later, LT execute runs → picks up those NEW orders
3. `last_sync_time` prevents re-processing

**But the reality:**
- You have historical FT orders accumulated over time
- When you created LT strategies, they couldn't see historical orders
- Each cron run only processes orders from the last 2 minutes

---

### Problem 2: Orders Not Filling (100% Pending Rate)
**Status:** ❌ BLOCKING  
**Impact:** 21 orders PENDING, 0 FILLED

**Root Cause:**
Using **GTC (Good-Till-Cancelled)** orders with tight slippage (0.5-1%).

**What's happening:**
```
1. LT calculates entry price: $0.50
2. Adds slippage: $0.50 * 1.01 = $0.505 (limit price)
3. Submits GTC order to CLOB at $0.505
4. Current market price: $0.51 (moved away)
5. Order sits PENDING forever (GTC doesn't auto-cancel)
```

**GTC behavior:**
- Sits in order book until filled OR manually cancelled
- If market moves away from your limit price, never fills
- Good for: Limit orders where you're patient
- Bad for: Copy trading where you want immediate execution

---

### Problem 3: No Visibility
**Status:** ⚠️ UX ISSUE  
**Impact:** Can't debug or monitor in real-time

**Missing:**
1. Real-time order feed showing what's executing
2. Skip reason tracking (why 75 orders weren't triggered)
3. Fill status dashboard
4. Error visibility

---

## 🔧 **Solutions**

### Solution 1: Fix Order Triggering

#### Option A: Reset Sync Times (Quick Fix)
```sql
-- Look back 7 days to catch historical FT orders
UPDATE lt_strategies
SET last_sync_time = NOW() - INTERVAL '7 days'
WHERE is_active = true;
```

**Pros:** Immediate, simple  
**Cons:** One-time fix, doesn't solve fundamental issue

#### Option B: Event-Driven Architecture (Best Long-Term)
Instead of cron-based polling, trigger LT execution when FT creates an order:

```typescript
// In FT sync, after creating ft_order:
await supabase.from('ft_orders').insert(ftOrder);

// NEW: Trigger LT execution immediately
await fetch('/api/lt/execute', { method: 'POST' });
```

**Or use Supabase Realtime:**
```typescript
supabase
  .channel('ft_orders')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'ft_orders' },
    async (payload) => {
      // Trigger LT execution for this specific order
      await executeTrade(payload.new);
    }
  )
  .subscribe();
```

**Pros:** Real-time, no missed trades  
**Cons:** More complex, requires infrastructure

#### Option C: Longer Lookback Window (Medium-Term)
```typescript
// Change from last_sync_time to fixed window
const lookbackMinutes = 60; // Look back 1 hour
const cutoffTime = new Date(Date.now() - lookbackMinutes * 60 * 1000);

const { data: ftOrders } = await supabase
  .from('ft_orders')
  .select('*')
  .eq('wallet_id', strategy.ft_wallet_id)
  .eq('outcome', 'OPEN')
  .gte('order_time', cutoffTime.toISOString())  // Fixed 1-hour window
  .order('order_time', { ascending: true });
```

**Pros:** Catches recent trades even if sync failed  
**Cons:** May double-process if cron runs multiple times

---

### Solution 2: Fix Order Filling

#### Change to FOK Orders
```sql
UPDATE lt_strategies
SET 
  order_type = 'FOK',              -- Fill-Or-Kill: execute immediately or cancel
  slippage_tolerance_pct = 3.0     -- Allow 3% slippage for better fill rate
WHERE is_active = true;
```

**Order Type Comparison:**

| Type | Behavior | Fill Rate | Use Case |
|------|----------|-----------|----------|
| **GTC** | Sits until filled | Low (10-30%) | Patient limit orders |
| **FOK** | Fill completely or cancel | High (60-80%) | All-or-nothing |
| **IOC** | Fill partial, cancel rest | Highest (80-95%) | **Best for copy trading** |

**Recommended for Copy Trading: IOC**
```sql
UPDATE lt_strategies
SET 
  order_type = 'IOC',              -- Immediate-Or-Cancel: best fill rate
  slippage_tolerance_pct = 5.0     -- More aggressive slippage for fills
WHERE is_active = true;
```

#### Why IOC is Best:
- Fills whatever it can immediately
- Cancels remainder (no stuck pending orders)
- Highest fill rate for copy trading
- Accepts partial fills

---

### Solution 3: Add Visibility

#### New Endpoint: Execution Audit
Created: `/api/lt/execution-audit`

Shows exactly why FT orders aren't triggering:
```json
{
  "summary": {
    "total_ft_orders": 100,
    "already_executed": 25,
    "too_old": 70,
    "eligible": 5
  },
  "strategies": [{
    "strategy_id": "LT_FT_ML_EDGE",
    "breakdown": {
      "too_old": 30,
      "already_executed": 5,
      "eligible": 0
    },
    "sample_skipped": [{
      "market": "Will Trump win...",
      "order_time": "2026-02-08T12:00:00Z",
      "hours_before_sync": 72,
      "reason": "trade_too_old"
    }]
  }]
}
```

#### Enhanced Orders Endpoint
Already exists: `/api/lt/strategies/{id}/orders`

Returns:
- Open orders
- Pending orders (with time pending)
- Failed orders (with reasons)
- Execution stats (fill rate, slippage)

#### Real-Time Order Feed (To Build)
Component: `components/lt/live-order-feed.tsx`

```tsx
export function LiveOrderFeed() {
  const [orders, setOrders] = useState([]);
  
  useEffect(() => {
    // Poll every 10 seconds
    const interval = setInterval(async () => {
      const res = await fetch('/api/lt/recent-activity');
      const data = await res.json();
      setOrders(data.orders);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Order Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {orders.map(order => (
          <div key={order.lt_order_id} className="flex items-center gap-2 py-2">
            <Badge variant={order.status === 'FILLED' ? 'success' : 'warning'}>
              {order.status}
            </Badge>
            <span className="text-sm">
              {order.market_title?.substring(0, 40)}...
            </span>
            <span className="text-xs text-muted-foreground">
              ${order.signal_size_usd} @ ${order.executed_price}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {formatDistanceToNow(new Date(order.order_placed_at))} ago
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

---

## 🚀 **Implementation Plan**

### Phase 1: Immediate Fixes (Today - 30 minutes)

1. **Reset Sync Times**
   ```sql
   UPDATE lt_strategies
   SET last_sync_time = NOW() - INTERVAL '7 days'
   WHERE is_active = true;
   ```

2. **Switch to IOC Orders**
   ```sql
   UPDATE lt_strategies
   SET 
     order_type = 'IOC',
     slippage_tolerance_pct = 5.0,
     min_order_size_usd = 2.0
   WHERE is_active = true;
   ```

3. **Trigger Execution**
   ```bash
   curl -X POST https://polycopy.app/api/lt/execute
   ```

4. **Monitor Results**
   - Check `/api/lt/diagnostic`
   - Watch Vercel logs for fills
   - Query `lt_orders` for FILLED status

**Expected Results:**
- 50-70 new LT orders created (from backlog)
- 40-60% fill rate (IOC + higher slippage)
- Visible in LT screens

---

### Phase 2: Better Execution (This Week - 4 hours)

1. **Implement Execution Audit Endpoint** ✅ (Already created)
   - Shows skip reasons
   - Identifies "too old" trades
   - Recommends actions

2. **Add Skip Reason Tracking**
   ```typescript
   // In executor, track WHY each trade was skipped
   const skipReasons: Record<string, number> = {};
   
   if (executedSourceIds.has(sourceTradeId)) {
     skipReasons['already_executed']++;
     continue;
   }
   
   if (!tokenId) {
     skipReasons['no_token_id']++;
     continue;
   }
   // etc.
   
   // Store in database
   await supabase.from('lt_execution_log').insert({
     strategy_id,
     timestamp: new Date(),
     ft_orders_checked: ftOrders.length,
     executed: executedCount,
     skip_reasons: skipReasons
   });
   ```

3. **Add Order Status Polling**
   ```typescript
   // Cron job: every 30 seconds, check PENDING orders
   // If pending > 5 minutes and market price moved, cancel and retry
   
   const stuckOrders = await supabase
     .from('lt_orders')
     .select('*')
     .eq('status', 'PENDING')
     .lt('order_placed_at', new Date(Date.now() - 5 * 60 * 1000));
   
   for (const order of stuckOrders) {
     await cancelOrder(order.order_id);
     await retryOrderWithCurrentPrice(order);
   }
   ```

---

### Phase 3: Real-Time Architecture (Next 2 Weeks - 16 hours)

1. **Event-Driven Execution**
   - Trigger LT when FT creates order
   - Use Supabase Realtime or webhooks
   - Sub-second latency

2. **Live Order Feed UI**
   - Real-time order stream
   - WebSocket connection
   - Toast notifications for fills

3. **Advanced Monitoring Dashboard**
   - Execution rate charts
   - Fill rate by strategy
   - Skip reason breakdown
   - Latency metrics

---

## 📊 **Testing the Fixes**

### Test 1: Execution Audit
```bash
curl https://polycopy.app/api/lt/execution-audit
```

**Look for:**
```json
{
  "summary": {
    "too_old": 70,  // These are your skipped trades
    "eligible": 5   // These should execute
  },
  "recommendations": [
    {
      "priority": "HIGH",
      "issue": "70 FT orders skipped as too old",
      "sql": "UPDATE lt_strategies SET last_sync_time = NOW() - INTERVAL '7 days'..."
    }
  ]
}
```

### Test 2: After Resetting Sync Times
```bash
# 1. Reset
psql -c "UPDATE lt_strategies SET last_sync_time = NOW() - INTERVAL '7 days' WHERE is_active = true;"

# 2. Execute
curl -X POST https://polycopy.app/api/lt/execute

# 3. Check results
curl https://polycopy.app/api/lt/diagnostic
```

**Expected:**
- `total_executed`: 50-70 (much higher!)
- `LT Orders`: 70-90 total
- Some with `status: FILLED`

### Test 3: Check Fill Rate
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(AVG(EXTRACT(EPOCH FROM (fully_filled_at - order_placed_at))/60), 2) as avg_fill_time_minutes
FROM lt_orders
WHERE order_placed_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

**Target Metrics:**
- `FILLED`: >60% of orders
- `PENDING`: <20% of orders
- `avg_fill_time_minutes`: <5 minutes

---

## 🎯 **Success Criteria**

### Short-Term (Today):
- ✅ 70+ LT orders created (up from 25)
- ✅ 40+ orders FILLED (up from 0)
- ✅ Fill rate >60%
- ✅ Can see orders in LT screens

### Medium-Term (This Week):
- ✅ Execution audit shows <10% "too old"
- ✅ Fill rate >75%
- ✅ Average latency <30 seconds
- ✅ Skip reasons visible and tracked

### Long-Term (2 Weeks):
- ✅ Real-time execution (<5 sec from FT to LT)
- ✅ Fill rate >85%
- ✅ Live order feed in UI
- ✅ Comprehensive monitoring dashboard

---

## 🔍 **Why Current Design Doesn't Work for Copy Trading**

### Cron-Based Polling Issues:

```
FT Sync (2 min intervals):
  T+0: Creates FT order A
  T+2: Creates FT order B
  T+4: Creates FT order C

LT Execute (2 min intervals):
  T+2: Processes orders from T+0 to T+2 (gets A)
  T+4: Processes orders from T+2 to T+4 (gets B)
  T+6: Processes orders from T+4 to T+6 (gets C)

Problem: 2-6 minute lag between FT decision and LT execution
```

### Copy Trading Needs:
- **Immediate execution** (sub-second)
- **High fill rates** (>80%)
- **Real-time visibility**
- **No missed trades**

### Solution: Event-Driven
```
FT Sync creates order → Webhook/Event → LT Execute immediately
                                     → <1 second latency
                                     → 0 missed trades
```

---

## 📝 **Action Items**

### For You (Next 10 Minutes):

1. **Run execution audit:**
   ```
   https://polycopy.app/api/lt/execution-audit
   ```
   Share the results

2. **Run these SQL commands:**
   ```sql
   -- See exactly what's being skipped
   UPDATE lt_strategies
   SET last_sync_time = NOW() - INTERVAL '7 days'
   WHERE is_active = true;

   -- Switch to IOC for better fills
   UPDATE lt_strategies
   SET 
     order_type = 'IOC',
     slippage_tolerance_pct = 5.0
   WHERE is_active = true;
   ```

3. **Trigger execution:**
   ```javascript
   // In browser console on polycopy.app
   fetch('/api/lt/execute', { method: 'POST' })
     .then(r => r.json())
     .then(d => {
       console.log('Executed:', d.total_executed);
       console.log('Details:', d.results);
     });
   ```

4. **Check results:**
   - Wait 2 minutes
   - Refresh `/api/lt/diagnostic`
   - Should see 50-70 LT orders now
   - Some should show `FILLED` status

### For Me (Next Commit):
- ✅ Execution audit endpoint
- Add order status polling cron
- Create live order feed component
- Build skip reason tracking

---

**Last Updated:** February 11, 2026  
**Status:** Ready to test - run the audit endpoint and SQL fixes above
