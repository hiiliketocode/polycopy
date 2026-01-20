# ROI Bug Fixes - Debug Enhancements

## Overview

Added comprehensive debug logging to diagnose and fix two ROI calculation bugs:

1. **Profile Page Bug**: User-closed trades showing incorrect ROI (-99.9% instead of +3.9%)
2. **Trader Profile Bug**: Cache key mismatch preventing ROI display for esports markets

---

## Bug 1: Profile Page "You Closed" ROI Incorrect

### Problem Report

A trade with:
- Entry: 51¢
- Closed Price: 53¢
- Expected ROI: +3.9%
- Actual ROI: -99.9%

### Suspected Cause

Either:
1. `user_exit_price` stored incorrectly (53 instead of 0.53)
2. ROI calculation using wrong values
3. Data type conversion issue

### Debug Enhancements Added

#### 1. Mark as Closed Debug Logging

**File:** `app/profile/page.tsx`
**Function:** `handleMarkAsClosed`

```typescript
const handleMarkAsClosed = async () => {
  if (!tradeToClose || !exitPriceCents || !user) return;
  
  const exitPrice = parseFloat(exitPriceCents) / 100; // Convert cents to decimal
  const entryPrice = tradeToClose.price_when_copied;
  const finalRoi = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : null;
  
  // Debug logging
  console.log('💰 Mark as Closed - ROI Calculation:', {
    exitPriceCents,           // Input: "53"
    exitPriceDecimal: exitPrice,  // Converted: 0.53
    entryPrice,               // From DB: 0.51
    calculation: `((${exitPrice} - ${entryPrice}) / ${entryPrice}) * 100`,
    finalRoi,                 // Should be ~3.9
    finalRoiRounded: finalRoi ? parseFloat(finalRoi.toFixed(2)) : null
  });
  
  // ... save to database
}
```

**What to Look For:**
```javascript
// Expected output:
💰 Mark as Closed - ROI Calculation: {
  exitPriceCents: "53",
  exitPriceDecimal: 0.53,
  entryPrice: 0.51,
  calculation: "((0.53 - 0.51) / 0.51) * 100",
  finalRoi: 3.9215686274509802,
  finalRoiRounded: 3.92
}

// If you see this instead, exitPrice is wrong:
💰 Mark as Closed - ROI Calculation: {
  exitPriceCents: "53",
  exitPriceDecimal: 53,    // ❌ Should be 0.53!
  entryPrice: 0.51,
  calculation: "((53 - 0.51) / 0.51) * 100",
  finalRoi: 10291.176...,  // ❌ Wrong!
  finalRoiRounded: 10291.18
}

// If you see -99.9%, entry price is wrong:
💰 Mark as Closed - ROI Calculation: {
  exitPriceCents: "53",
  exitPriceDecimal: 0.53,
  entryPrice: 53,          // ❌ Should be 0.53!
  calculation: "((0.53 - 53) / 53) * 100",
  finalRoi: -99.0,
  finalRoiRounded: -99.00
}
```

---

#### 2. Price Refresh Debug Logging

**File:** `app/profile/page.tsx`
**Function:** `fetchCurrentPriceFromPolymarket`

```typescript
// Calculate ROI
let roi: number | null = null;
if (trade.price_when_copied) {
  const entryPrice = trade.price_when_copied;
  
  // Use user's exit price if they manually closed the trade
  // Otherwise use current market price
  const exitPrice = trade.user_exit_price ?? currentPrice;
  
  if (entryPrice > 0 && exitPrice !== null) {
    roi = ((exitPrice - entryPrice) / entryPrice) * 100;
    roi = parseFloat(roi.toFixed(2));
  }
  
  // Debug logging for user-closed trades
  if (trade.user_closed_at) {
    console.log('💰 User-Closed Trade ROI:', {
      market: trade.market_title?.substring(0, 30),
      entryPrice,
      userExitPrice: trade.user_exit_price,
      currentPrice,
      exitPriceUsed: exitPrice,
      calculation: `((${exitPrice} - ${entryPrice}) / ${entryPrice}) * 100`,
      roi
    });
  }
}
```

**What to Look For:**
```javascript
// Expected output:
💰 User-Closed Trade ROI: {
  market: "Will Trump win 2024?",
  entryPrice: 0.51,
  userExitPrice: 0.53,     // ✅ Stored correctly as decimal
  currentPrice: 0.60,      // Current market (ignored)
  exitPriceUsed: 0.53,     // ✅ Using user's exit price
  calculation: "((0.53 - 0.51) / 0.51) * 100",
  roi: 3.92
}

// If ROI is wrong, check these values:
💰 User-Closed Trade ROI: {
  market: "Will Trump win 2024?",
  entryPrice: 53,          // ❌ Wrong! Should be 0.51
  userExitPrice: 53,       // ❌ Wrong! Should be 0.53
  currentPrice: 0.60,
  exitPriceUsed: 53,       // ❌ Using wrong value
  calculation: "((53 - 53) / 53) * 100",
  roi: 0.00                // ❌ Should be 3.92
}
```

---

### Diagnosis Steps

1. **Mark a trade as closed** with entry 51¢, exit 53¢
2. **Check console for:** `💰 Mark as Closed - ROI Calculation:`
3. **Verify:**
   - `exitPriceCents` = "53"
   - `exitPriceDecimal` = 0.53 (not 53)
   - `entryPrice` = 0.51 (not 51)
   - `finalRoi` ≈ 3.92

4. **Refresh the page**
5. **Check console for:** `💰 User-Closed Trade ROI:`
6. **Verify:**
   - `userExitPrice` = 0.53 (confirms DB storage)
   - `exitPriceUsed` = 0.53 (confirms calculation)
   - `roi` = 3.92

---

## Bug 2: Trader Profile Cache Key Mismatch

### Problem Report

Gamma batch API working (57/57 markets fetched), but ROI shows "--" for all trades.

### Root Cause

**Cache key mismatch** for esports markets:

```
Regular markets:
  Outcomes: ["Yes", "No"] ✅ Works

Esports markets:
  Outcomes: ["PARIVISION", "3DMAX"] ❌ Failed
  Outcomes: ["MOUZ", "Spirit"] ❌ Failed

Cache stores: "0x123...-PARIVISION"
Trade looks up: "0x123...-PARIVISION" ✅ Should work!

But if outcomes have different casing or spacing:
Cache stores: "0x123...-PARIVISION"
Trade looks up: "0x123...-parivision" ❌ No match!
```

### Debug Enhancements Added

#### 1. Cache Population Debug

**File:** `app/trader/[wallet]/page.tsx`

```typescript
// Store price for each outcome
if (Array.isArray(outcomes) && Array.isArray(prices)) {
  outcomes.forEach((outcome: string, index: number) => {
    if (prices[index] !== undefined) {
      const key = `${conditionId}-${outcome}`;
      marketPriceCache.set(key, parseFloat(prices[index]));
    }
  });
  
  // Debug: Log for first market to show structure
  if (marketPriceCache.size <= outcomes.length) {
    console.log('🔍 Cache key example:', {
      conditionId: conditionId.substring(0, 12) + '...',
      outcomes,
      keys: outcomes.map(o => `${conditionId.substring(0, 12)}...-${o}`)
    });
  }
}
```

**What to Look For:**
```javascript
// For regular markets:
🔍 Cache key example: {
  conditionId: '0x123abc...',
  outcomes: ['Yes', 'No'],
  keys: ['0x123abc...-Yes', '0x123abc...-No']
}

// For esports markets:
🔍 Cache key example: {
  conditionId: '0x456def...',
  outcomes: ['PARIVISION', '3DMAX'],
  keys: ['0x456def...-PARIVISION', '0x456def...-3DMAX']
}
```

---

#### 2. Cache Lookup Debug

**File:** `app/trader/[wallet]/page.tsx`

```typescript
// Try to get from cache
const cacheKey = `${tradeConditionId}-${trade.outcome}`;
const cachedPrice = marketPriceCache.get(cacheKey);

// Debug logging for first 5 trades without price
if (!currentPrice && index < 5) {
  // Try case-insensitive lookup to diagnose issue
  const allCacheKeys = Array.from(marketPriceCache.keys());
  const conditionMatches = allCacheKeys.filter(k => 
    k.toLowerCase().includes(tradeConditionId?.toLowerCase() || 'none')
  );
  
  console.log(`❌ Trade ${index} missing price:`, {
    market: trade.title?.substring(0, 30),
    tradeOutcome: trade.outcome,
    conditionId: tradeConditionId?.substring(0, 12),
    exactCacheKey: cacheKey.substring(0, 40) + '...',
    cacheHasExactKey: marketPriceCache.has(cacheKey),
    cacheSize: marketPriceCache.size,
    conditionMatches: conditionMatches.slice(0, 3).map(k => ({
      key: k.substring(0, 40) + '...',
      price: marketPriceCache.get(k)
    }))
  });
}
```

**What to Look For:**

**Scenario A: Perfect Match (Should Work)**
```javascript
❌ Trade 0 missing price: {
  market: "MOUZ vs Spirit",
  tradeOutcome: "MOUZ",
  conditionId: "0x456def...",
  exactCacheKey: "0x456def...-MOUZ",
  cacheHasExactKey: true,   // ✅ Cache has this key
  cacheSize: 114,
  conditionMatches: [
    { key: "0x456def...-MOUZ", price: 0.55 },
    { key: "0x456def...-Spirit", price: 0.45 }
  ]
}
// If cacheHasExactKey is true but price still null,
// the lookup logic has a bug!
```

**Scenario B: Case Mismatch**
```javascript
❌ Trade 0 missing price: {
  market: "MOUZ vs Spirit",
  tradeOutcome: "mouz",       // lowercase
  conditionId: "0x456def...",
  exactCacheKey: "0x456def...-mouz",
  cacheHasExactKey: false,    // ❌ No exact match
  cacheSize: 114,
  conditionMatches: [
    { key: "0x456def...-MOUZ", price: 0.55 },    // Uppercase
    { key: "0x456def...-Spirit", price: 0.45 }
  ]
}
// Cache has "MOUZ" but trade looks for "mouz"
// FIX: Need case-insensitive lookup or normalization
```

**Scenario C: Spacing/Formatting Mismatch**
```javascript
❌ Trade 0 missing price: {
  market: "PARI VISION vs 3DMAX",
  tradeOutcome: "PARI VISION",  // Space
  conditionId: "0x789ghi...",
  exactCacheKey: "0x789ghi...-PARI VISION",
  cacheHasExactKey: false,      // ❌ No exact match
  cacheSize: 114,
  conditionMatches: [
    { key: "0x789ghi...-PARIVISION", price: 0.62 },  // No space
    { key: "0x789ghi...-3DMAX", price: 0.38 }
  ]
}
// Trade has "PARI VISION" but cache has "PARIVISION"
// FIX: Need outcome normalization
```

**Scenario D: Condition ID Mismatch**
```javascript
❌ Trade 0 missing price: {
  market: "MOUZ vs Spirit",
  tradeOutcome: "MOUZ",
  conditionId: "0xABC...",      // Different ID
  exactCacheKey: "0xABC...-MOUZ",
  cacheHasExactKey: false,
  cacheSize: 114,
  conditionMatches: []          // ❌ No matches at all!
}
// Trade has wrong condition ID
// FIX: Check how conditionId is extracted from trade data
```

---

### Diagnosis Steps

1. **Visit trader profile page** with esports trades
2. **Open console** and look for:
   - `📊 Batch API returned X out of Y markets` (should be high success rate)
   - `🔍 Cache key example:` (shows outcome structure)
   - `❌ Trade X missing price:` (shows mismatches)

3. **Check cache population:**
   - Are outcomes correct? `['PARIVISION', '3DMAX']` not `['Yes', 'No']`
   - Are keys formatted correctly? `conditionId-outcome`

4. **Check cache lookup:**
   - Is `tradeOutcome` the same as cached outcome?
   - Case sensitivity: `MOUZ` vs `mouz`?
   - Spacing: `PARI VISION` vs `PARIVISION`?
   - Condition ID matches?

5. **If `cacheHasExactKey: true` but still no price:**
   - Bug in lookup logic (line 898-902)

6. **If `conditionMatches` is empty:**
   - Trade has wrong `conditionId`

7. **If `conditionMatches` has similar keys:**
   - Outcome formatting/casing issue

---

## Possible Fixes Based on Diagnosis

### Fix 1: Case-Insensitive Lookup

If debug shows case mismatch (e.g., "MOUZ" vs "mouz"):

```typescript
// Current (case-sensitive):
const cacheKey = `${tradeConditionId}-${trade.outcome}`;
const cachedPrice = marketPriceCache.get(cacheKey);

// Fix (case-insensitive):
const cacheKey = `${tradeConditionId}-${trade.outcome}`.toLowerCase();
const cachedPrice = marketPriceCache.get(cacheKey);

// AND update cache population to store lowercase:
const key = `${conditionId}-${outcome}`.toLowerCase();
marketPriceCache.set(key, parseFloat(prices[index]));
```

---

### Fix 2: Outcome Normalization

If debug shows spacing/formatting differences:

```typescript
// Normalize outcome function
const normalizeOutcome = (outcome: string) => {
  return outcome
    .toLowerCase()
    .replace(/\s+/g, '')  // Remove spaces
    .trim();
};

// Cache population:
const key = `${conditionId}-${normalizeOutcome(outcome)}`;
marketPriceCache.set(key, parseFloat(prices[index]));

// Cache lookup:
const cacheKey = `${tradeConditionId}-${normalizeOutcome(trade.outcome)}`;
const cachedPrice = marketPriceCache.get(cacheKey);
```

---

### Fix 3: Multiple Lookup Attempts

If outcomes vary, try multiple formats:

```typescript
// Try exact match first
let cachedPrice = marketPriceCache.get(`${tradeConditionId}-${trade.outcome}`);

// Try lowercase
if (!cachedPrice) {
  cachedPrice = marketPriceCache.get(`${tradeConditionId}-${trade.outcome.toLowerCase()}`);
}

// Try uppercase
if (!cachedPrice) {
  cachedPrice = marketPriceCache.get(`${tradeConditionId}-${trade.outcome.toUpperCase()}`);
}

// Try normalized
if (!cachedPrice) {
  const normalized = trade.outcome.toLowerCase().replace(/\s+/g, '');
  // Search through all cache keys for this condition ID
  for (const [key, price] of marketPriceCache.entries()) {
    if (key.startsWith(tradeConditionId) && 
        key.toLowerCase().replace(/\s+/g, '').includes(normalized)) {
      cachedPrice = price;
      break;
    }
  }
}
```

---

## Testing Both Fixes

### Test Bug 1 (Profile Page)

1. Go to profile page
2. Find a trade with entry price ~50¢
3. Click "Mark as Closed"
4. Enter exit price: 53
5. **Check console:** `💰 Mark as Closed - ROI Calculation:`
6. **Verify:** ROI should be ~6% for 50→53 or ~4% for 51→53
7. Refresh page
8. **Check console:** `💰 User-Closed Trade ROI:`
9. **Verify:** ROI matches what was saved

---

### Test Bug 2 (Trader Profile)

1. Go to trader profile page with esports trades
2. **Check console:** 
   - `📊 Batch API returned X out of Y` (high number = good)
   - `🔍 Cache key example:` (shows outcome format)
   - `❌ Trade X missing price:` (diagnose mismatch)
3. Compare `exactCacheKey` vs `conditionMatches`
4. If mismatch found, apply appropriate fix
5. Reload page and verify ROI displays

---

## Files Modified

- `app/profile/page.tsx`
  - Added debug logging to `handleMarkAsClosed`
  - Added debug logging to `fetchCurrentPriceFromPolymarket`

- `app/trader/[wallet]/page.tsx`
  - Added cache key example logging
  - Enhanced cache lookup debug with case-insensitive matching

---

## Console Output Examples

### Bug 1 Output (Profile Page)

```javascript
// When marking trade as closed:
💰 Mark as Closed - ROI Calculation: {
  exitPriceCents: "53",
  exitPriceDecimal: 0.53,
  entryPrice: 0.51,
  calculation: "((0.53 - 0.51) / 0.51) * 100",
  finalRoi: 3.9215686274509802,
  finalRoiRounded: 3.92
}

// On page refresh:
[Price] Fetching price for trade: Will Trump win 2024?
💰 User-Closed Trade ROI: {
  market: "Will Trump win 2024?",
  entryPrice: 0.51,
  userExitPrice: 0.53,
  currentPrice: 0.60,
  exitPriceUsed: 0.53,
  calculation: "((0.53 - 0.51) / 0.51) * 100",
  roi: 3.92
}
[Price] ✓ Final: price=0.60, exitPrice=0.53, roi=3.92%
```

---

### Bug 2 Output (Trader Profile)

```javascript
// Cache population:
📊 Fetching current prices for 57 unique markets via API proxy...
📊 Batch API returned 57 out of 57 markets
🔍 Cache key example: {
  conditionId: '0x123abc...',
  outcomes: ['Yes', 'No'],
  keys: ['0x123abc...-Yes', '0x123abc...-No']
}
🔍 Cache key example: {
  conditionId: '0x456def...',
  outcomes: ['PARIVISION', '3DMAX'],
  keys: ['0x456def...-PARIVISION', '0x456def...-3DMAX']
}
📊 Successfully cached 114 outcome prices

// Cache lookup (with mismatch):
❌ Trade 0 missing price: {
  market: "PARIVISION vs 3DMAX",
  tradeOutcome: "parivision",    // lowercase!
  conditionId: "0x456def...",
  exactCacheKey: "0x456def...-parivision",
  cacheHasExactKey: false,       // ❌ No match
  cacheSize: 114,
  conditionMatches: [
    { key: "0x456def...-PARIVISION", price: 0.55 },  // Uppercase
    { key: "0x456def...-3DMAX", price: 0.45 }
  ]
}
// Diagnosis: Case mismatch. Need case-insensitive lookup.
```

---

**Status:** ✅ Debug logging added - Ready to diagnose both ROI bugs!
