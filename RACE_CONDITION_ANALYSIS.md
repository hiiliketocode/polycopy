# 🔒 Race Condition Analysis - Critical Vulnerability #3

**Date:** January 10, 2026  
**Status:** 🔴 CRITICAL VULNERABILITY CONFIRMED  
**Risk Level:** HIGH - Duplicate orders, balance overdrafts possible

---

## 🎯 **VULNERABILITY CONFIRMED**

### **Threat #86: Race Conditions in Order Placement**

**Current Implementation:** `app/api/polymarket/orders/place/route.ts`

---

## 🔍 **SPECIFIC RACE CONDITIONS FOUND**

### **1. No Idempotency Protection** 🔴 CRITICAL
**Location:** Lines 346-347, 462, 646-649

**The Problem:**
```typescript
// Line 462: orderIntentId is optional, can be missing or duplicated
const resolvedOrderIntentId = normalizeOptionalString(orderIntentId) ?? makeRequestId()

// Line 646-649: Order is sent to Polymarket WITHOUT deduplication check
const order = await client.createOrder(
  { tokenID: validatedTokenId, price: roundedPrice, size: adjustedAmount, side: side as any },
  { signatureType } as any
)
```

**Attack Scenario:**
```
Time    User Action              System State                    Result
-----   --------------------     ---------------------------     -------
T+0ms   User clicks "Buy"       → Request 1 starts              
T+10ms  User double-clicks      → Request 2 starts              
T+20ms  Request 1: Validate     → Pass (balance: $100)          
T+22ms  Request 2: Validate     → Pass (balance: $100)         ❌ BOTH PASS!
T+50ms  Request 1: Place order  → Polymarket accepts ($50)      
T+52ms  Request 2: Place order  → Polymarket accepts ($50)     ❌ DUPLICATE!
Result: User wanted $50 trade, got $100 trade (2x exposure)
```

**Impact:**
- Double-clicking = Double orders
- Network retries = Duplicate trades
- Race on button click = Multiple orders
- **USER LOSES MONEY** 💸

---

### **2. No Balance Check Before Submission** 🔴 CRITICAL
**Location:** Entire flow

**The Problem:**
```typescript
// NO balance check before sending order to Polymarket!
// Order is sent blindly:
const order = await client.createOrder(...)
const rawResult = await client.postOrder(order, normalizedOrderType as any, false)

// Polymarket MAY reject, but by then it's too late for concurrent requests
```

**Attack Scenario:**
```
User Balance: $100

Time    Request     Action                  Balance Check       Result
-----   --------    --------------------    ----------------    -------
T+0ms   Order 1     Place $80 order        → No check           Sent to PM
T+5ms   Order 2     Place $80 order        → No check           Sent to PM
T+50ms  Order 1     PM accepts             → Deducts $80        ✅ Success
T+52ms  Order 2     PM accepts             → Tries $80          ❌ Insufficient!

Result: Order 1 succeeds, Order 2 fails, but both were attempted
Alternative: If PM batches, BOTH might succeed → $160 deducted from $100 balance → OVERDRAFT
```

**Impact:**
- Users can attempt orders exceeding balance
- Race conditions on concurrent orders
- Polymarket may reject, but orders are in-flight
- **Overdrafts possible** if Polymarket processes before balance update

---

### **3. No Database Transaction Isolation** 🔴 HIGH
**Location:** Lines 617-628, 758-765, 784-810

**The Problem:**
```typescript
// Three separate database operations with NO transaction:

// 1. Insert order event
const { data: insertedEvent } = await serviceRole
  .from(ORDER_EVENTS_TABLE)
  .insert(orderEventPayload)  // ← Separate operation

// 2. Update order event status  
await updateOrderEventStatus(serviceRole, orderEventId, { status: 'submitted' })  // ← Separate operation

// 3. Persist copied trader metadata
await persistCopiedTraderMetadata({ ... })  // ← Separate operation

// NO TRANSACTION! Each can succeed/fail independently
```

**Attack Scenario:**
```
Request 1: Insert event → SUCCESS
Request 2: Insert event → SUCCESS (same order_intent_id!)
Request 1: Place order → SUCCESS
Request 2: Place order → SUCCESS
Result: Duplicate orders, duplicate event logs, data inconsistency
```

**Impact:**
- Incomplete order records if any step fails
- Duplicate event logs for same order
- Data inconsistency between tables
- **Difficult to audit/debug**

---

### **4. orderIntentId Not Enforced as Unique** 🔴 HIGH
**Location:** Line 462, database schema

**The Problem:**
```typescript
// orderIntentId CAN be client-provided or server-generated
const resolvedOrderIntentId = normalizeOptionalString(orderIntentId) ?? makeRequestId()

// But there's NO database constraint preventing duplicates!
// orderIntentId is just a field in order_events_log, not a unique key
```

**Attack Scenario:**
```
Malicious client:
1. Generates orderIntentId: "abc-123"
2. Sends 10 concurrent requests with same orderIntentId
3. All 10 requests pass validation
4. All 10 orders are placed
5. All 10 create separate order_events_log entries
Result: 10 duplicate orders with same "intent"
```

**Impact:**
- No deduplication at database level
- Client can intentionally bypass idempotency
- **Malicious users can exploit this**

---

### **5. No Distributed Lock for Copy Trades** 🔴 MEDIUM
**Location:** `persistCopiedTraderMetadata` (lines 208-348)

**The Problem:**
```typescript
// When copying a trader's position:
const { data: credential } = await service
  .from('clob_credentials')
  .select('polymarket_account_address')
  .eq('user_id', userId)
  // NO LOCK! Concurrent requests can read same data

// Then inserts/upserts without coordination:
await service.from(ordersTable).upsert(payload, { onConflict: 'order_id' })
// But order_id doesn't exist yet! It comes from Polymarket response
```

**Attack Scenario:**
```
User clicks "Copy" on trader position twice (slow network):
Request 1: Read user credentials → Copy trade data → Upsert
Request 2: Read user credentials → Copy trade data → Upsert
Result: TWO copied trades for same position (duplicate)
```

**Impact:**
- Duplicate copy trade records
- User copies same trade twice
- **Accidental double exposure**

---

## 🛡️ **SOLUTIONS REQUIRED**

### **Solution 1: Idempotency Table** 🎯 CRITICAL

Create a deduplication table:

```sql
CREATE TABLE order_idempotency (
  order_intent_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL,  -- 'pending', 'completed', 'failed'
  polymarket_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

-- Auto-cleanup old entries
CREATE INDEX idx_order_idempotency_expires ON order_idempotency(expires_at);

-- Ensure user can't reuse same intent ID
CREATE UNIQUE INDEX idx_order_idempotency_user_intent 
ON order_idempotency(user_id, order_intent_id);
```

**How it works:**
1. Before placing order, INSERT into order_idempotency with status='pending'
2. If INSERT fails (duplicate), return cached result
3. After order completes, UPDATE status='completed' and polymarket_order_id
4. Expired entries (>1 hour) are cleaned up automatically

---

### **Solution 2: Database Transaction with Locking** 🎯 CRITICAL

Wrap all order operations in a transaction:

```typescript
// Pseudocode:
const result = await serviceRole.rpc('place_order_atomic', {
  p_user_id: userId,
  p_order_intent_id: orderIntentId,
  p_token_id: tokenId,
  p_price: price,
  p_amount: amount,
  p_side: side
})

// SQL function:
CREATE OR REPLACE FUNCTION place_order_atomic(...)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Check idempotency (atomic)
  INSERT INTO order_idempotency (order_intent_id, user_id, status)
  VALUES (p_order_intent_id, p_user_id, 'pending')
  ON CONFLICT (order_intent_id) DO NOTHING;
  
  IF NOT FOUND THEN
    -- Order already exists, return cached result
    RETURN (SELECT result FROM order_idempotency WHERE order_intent_id = p_order_intent_id);
  END IF;
  
  -- 2. Check balance (with row lock)
  SELECT balance INTO v_balance
  FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;  -- ← LOCKS THE ROW
  
  IF v_balance < (p_price * p_amount) THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  
  -- 3. Insert order event
  INSERT INTO order_events_log (...) VALUES (...);
  
  -- 4. Return success
  RETURN json_build_object('success', true, ...);
END;
$$;
```

---

### **Solution 3: Client-Side Deduplication** 🎯 HIGH

Add button state management:

```typescript
// In trade form component:
const [isSubmitting, setIsSubmitting] = useState(false)
const [lastOrderIntentId, setLastOrderIntentId] = useState<string | null>(null)

const handleSubmit = async () => {
  if (isSubmitting) {
    console.warn('Order already in progress, ignoring duplicate click')
    return  // ← BLOCKS DUPLICATE CLICKS
  }
  
  setIsSubmitting(true)
  const orderIntentId = generateOrderIntentId()  // Generate ONCE
  setLastOrderIntentId(orderIntentId)
  
  try {
    await placeOrder({ ...params, orderIntentId })
  } finally {
    setIsSubmitting(false)
  }
}
```

---

### **Solution 4: Rate Limiting Enhancement** 🎯 MEDIUM

Current rate limit: 10 requests/minute (CRITICAL tier)

**Enhance with:**
- Per-user order deduplication window (5 seconds)
- Track order_intent_id in cache
- Reject duplicates within window

```typescript
// In checkRateLimit:
const dedupKey = `order:dedup:${userId}:${orderIntentId}`
const existing = await redis.get(dedupKey)

if (existing) {
  return {
    success: false,
    error: 'Duplicate order detected',
    retryAfter: 5
  }
}

// Set with 5-second TTL
await redis.set(dedupKey, Date.now(), { ex: 5 })
```

---

## 📊 **RISK MATRIX**

| Vulnerability | Likelihood | Impact | Risk Level | Solution Priority |
|---------------|------------|--------|------------|------------------|
| **No Idempotency** | HIGH | CRITICAL | 🔴 CRITICAL | P0 - IMMEDIATE |
| **No Balance Check** | HIGH | HIGH | 🔴 CRITICAL | P0 - IMMEDIATE |
| **No Transactions** | MEDIUM | HIGH | 🔴 HIGH | P1 - URGENT |
| **Duplicate orderIntentId** | MEDIUM | MEDIUM | 🟠 MEDIUM | P1 - URGENT |
| **Copy Trade Races** | LOW | MEDIUM | 🟡 LOW | P2 - SOON |

---

## 🎯 **IMPLEMENTATION PLAN**

### **Phase 1: Database Schema** (30 mins)
1. Create `order_idempotency` table
2. Add unique constraint on `order_intent_id`
3. Create cleanup job for expired entries

### **Phase 2: Server-Side Protection** (2-3 hours)
1. Add idempotency check before order placement
2. Create PostgreSQL function for atomic order placement
3. Implement balance check with row locking
4. Wrap all operations in transaction

### **Phase 3: Client-Side Protection** (1 hour)
1. Add button state management
2. Generate orderIntentId on client
3. Disable button during submission
4. Show loading state

### **Phase 4: Testing** (1-2 hours)
1. Test double-click scenario
2. Test concurrent requests
3. Test balance overdraft prevention
4. Test error handling

---

## 🏆 **SUCCESS METRICS**

### Before Fix:
- ❌ Double-click = Double order
- ❌ Network retry = Duplicate order
- ❌ No balance check = Overdraft possible
- ❌ No transaction = Data inconsistency

### After Fix:
- ✅ Double-click = Single order (idempotent)
- ✅ Network retry = Returns cached result
- ✅ Balance checked atomically with lock
- ✅ All operations in transaction

---

## 💡 **EXAMPLE: Race Condition Prevention**

### BEFORE (Vulnerable):
```
Time    Request     Action                  Result
-----   --------    --------------------    -------
T+0ms   Order 1     Click "Buy $50"        → Starts
T+10ms  Order 2     Double-click           → Starts
T+50ms  Order 1     Place order            → SUCCESS ($50)
T+52ms  Order 2     Place order            → SUCCESS ($50)
Result: $100 spent (user wanted $50) ❌
```

### AFTER (Protected):
```
Time    Request     Action                           Result
-----   --------    -------------------------------  -------
T+0ms   Order 1     Click "Buy $50"                 → Starts
          ↓         Generate orderIntentId: "abc"    
          ↓         INSERT into idempotency          → SUCCESS
T+10ms  Order 2     Double-click                    → Starts
          ↓         Same orderIntentId: "abc"        
          ↓         INSERT into idempotency          → DUPLICATE! (constraint violation)
          ↓         Return cached result             → "Order already in progress"
T+50ms  Order 1     Place order                      → SUCCESS ($50)
T+52ms  Order 2     Return cached from T+10ms        → Same result as Order 1
Result: $50 spent (exactly as user intended) ✅
```

---

*Analysis completed: January 10, 2026*  
*Critical vulnerabilities: 5 confirmed*  
*Estimated fix time: 4-6 hours*  
*Security improvement: HIGH → LOW*
