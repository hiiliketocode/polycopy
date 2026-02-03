# P&L Discrepancy Debug Guide

## Issue
User profile shows **$37 P&L** on Polycopy vs **$60.22 P&L** on Polymarket - a **$23.22 discrepancy (38%)**.

## Potential Causes

### 1. **Trading Fees** (Most Likely)
Polymarket charges fees on trades:
- **Maker fee**: ~0.5% (when you provide liquidity)
- **Taker fee**: ~2% (when you take liquidity)
- **Profit fee**: Some markets have a ~2% fee on profits

**Impact**: If you made $60.22 gross profit but paid ~$23 in fees, your net would be ~$37.

**How to Check**:
1. Go to Polymarket → Settings → Transaction History
2. Look for "Fee" columns in your trades
3. Sum up all fees paid

### 2. **Stale Prices for Open Positions**
We fetch fresh prices for open positions, but:
- Limited to 40 markets max
- 6-second timeout per market
- Falls back to stale `current_price` if fetch fails

**Impact**: If you have open positions and we're using stale prices, your unrealized P&L might be off.

**How to Check**:
1. Open browser console (F12)
2. Refresh your Polycopy profile page
3. Look for log: `📊 Portfolio Stats Calculated:`
4. Check `pricesFetched` vs `pricesNeeded`
5. If they don't match, some prices are stale

### 3. **Calculation Methodology Difference**

**Polymarket calculates**:
```
Total P&L = (Current Portfolio Value) - (Total Deposited)
Current Portfolio Value = Cash + (Open Positions Value)
```

**Polycopy calculates**:
```
Total P&L = Realized P&L + Unrealized P&L
Realized P&L = Sum of (exit_price - entry_price) * size for closed trades
Unrealized P&L = Sum of (current_price - entry_price) * size for open trades
```

These **should** be equivalent, but might differ due to:
- Fees (Polymarket includes in portfolio value, we don't deduct from P&L)
- Price timing (we fetch prices at a specific moment, Polymarket updates continuously)
- Rounding differences

### 4. **Missing Trades**
If some trades aren't in our `orders` table, they won't be counted.

**How to Check**:
1. Compare trade count on Polymarket vs Polycopy
2. Check browser console for `totalTrades` in the stats log
3. On Polymarket, go to Portfolio → History and count trades
4. Numbers should match

### 5. **Partial Fills**
If an order was partially filled, we might calculate the invested amount differently than Polymarket.

**How to Check**:
1. Look for `totalVolume` vs `totalFilledCost` in console logs
2. If they're significantly different, partial fills might be an issue

## Debug Steps

### Step 1: Check Browser Console
1. Open your Polycopy profile page
2. Press F12 to open browser console
3. Refresh the page
4. Look for these logs:
   ```
   📊 Portfolio Stats Calculated:
   ⚠️ P&L Analysis:
   ```
5. Screenshot and send these logs

### Step 2: Compare the Numbers
From the logs, note:
- `totalTrades`: Number of trades we counted
- `closedTrades`: Number of closed/resolved positions
- `openTrades`: Number of open positions
- `totalPnl`: Our calculated P&L ($37)
- `alternativePnl`: Alternative calculation method
- `pricesFetched` vs `pricesNeeded`: How many prices we successfully fetched

### Step 3: Check Polymarket Data
1. Go to Polymarket → Your Profile
2. Note:
   - "Predictions" count (should match `totalTrades`)
   - "Profit/Loss" ($60.22)
   - "Positions Value" ($111.86)
3. Go to Portfolio → History
4. Look for any fees paid

### Step 4: Calculate Expected P&L
If you have open positions at current prices:
```
Expected P&L = Realized P&L (from closed) + Unrealized P&L (from open)
```

If your open positions are worth more now than when you bought them, the difference should show up in unrealized P&L.

## Logging Added

We've added detailed logging to help debug:

### Console Log Output
```javascript
📊 Portfolio Stats Calculated: {
  totalTrades: X,
  closedTrades: Y,
  openTrades: Z,
  totalPnl: '$37.00',
  alternativePnl: '$XX.XX', // Different calculation method
  pricesFetched: N,
  pricesNeeded: M,
  calculation: {
    method1: '(realized) + (unrealized) = total',
    method2: '((exits) + (current)) - (cost) = total'
  },
  sampleClosedTrades: [...], // First 3 closed trades with details
  sampleOpenTrades: [...] // First 3 open trades with details
}
```

## Most Likely Explanation

**The $23 discrepancy is most likely due to trading fees.**

Polymarket's "Profit/Loss" might be **gross profit before fees**, while your actual net profit after fees is closer to $37.

To confirm:
1. Check your Polymarket transaction history for fees
2. Sum up all fees paid
3. See if `$60.22 - fees ≈ $37`

## If Fees Aren't the Cause

If fees don't account for the difference:
1. Share the browser console logs
2. Share screenshots of:
   - Polycopy profile (P&L section)
   - Polymarket profile (Profit/Loss section)
   - Polymarket transaction history
3. We'll investigate further

## Technical Notes

### P&L Calculation Formula
```typescript
For each trade:
  entry_cost = entry_price * filled_size
  
  If closed:
    exit_value = exit_price * filled_size
    pnl = exit_value - entry_cost
  
  If open:
    current_value = current_price * filled_size
    pnl = current_value - entry_cost

Total P&L = Sum of all trade P&Ls
```

### Why We Calculate Per-Trade
- Easier to track individual trade performance
- Handles partial closes correctly
- Matches how copy trades work (each copy is a separate trade)
- Should be mathematically equivalent to Polymarket's aggregated position approach

## Next Steps

1. **User**: Check browser console logs and Polymarket fees
2. **If discrepancy remains**: Share detailed logs and screenshots
3. **Dev**: Investigate specific trades causing the difference
4. **Consider**: Adding fee tracking to our P&L calculation if fees are the issue
