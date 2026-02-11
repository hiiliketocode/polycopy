# UI Enhancement Plan - FT/LT Unified Experience

## 🎯 **Requirements**

1. **LT strategies appear in main FT table**
   - Same columns as FT
   - Type badge (FT/LT) to distinguish
   - Filter toggle to show/hide LT

2. **LT detail pages match FT format exactly**
   - Summary cards (Balance, P&L, Return %, etc.)
   - Open positions with live pricing
   - Resolved trades with P&L
   - Performance charts
   - Strategy filters/settings display

3. **Live pricing for LT positions**
   - Current market price
   - Unrealized P&L calculation
   - Position value tracking

4. **All KPIs visible**
   - Win rate, Sharpe ratio, max drawdown
   - Fill rate (LT specific)
   - Execution quality metrics

---

## 📋 **Implementation Steps**

### Phase 1: Add LT to FT Table
- Fetch both FT and LT data
- Merge into unified array
- Add type badges
- Add filter toggle

### Phase 2: Create Comprehensive LT Detail Page
- Match FT detail page structure
- Add LT-specific tabs (fills, execution quality)
- Include risk management panel
- Add live pricing polling

### Phase 3: Live Pricing System
- Poll market prices every 30s
- Calculate unrealized P&L
- Show current vs entry price
- Color code gains/losses

### Phase 4: Testing
- Verify data accuracy
- Test live pricing updates
- Validate P&L calculations

---

## 🚀 **Estimated Timeline**

- Phase 1: 2 hours
- Phase 2: 4 hours  
- Phase 3: 2 hours
- Phase 4: 1 hour

**Total: ~9 hours of focused development**

This is a significant UI overhaul to match enterprise trading dashboard standards.

---

## ✅ **Current Status**

Your bot IS working (30 filled orders, 73% fill rate).
The UI just needs to catch up to show the data properly.

Would you like me to proceed with full implementation?
