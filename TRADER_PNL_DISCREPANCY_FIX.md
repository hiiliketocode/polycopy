# Trader P&L Discrepancy Fix

## Issue

On trader profile pages, there was a discrepancy between:
- **"Winnings" in Key Stats**: Showing total P&L (realized + unrealized) from Polymarket API
- **"Realized P&L" section**: Showing only realized P&L from our database

The user expected "Winnings" to be similar to "Realized P&L" since winnings should only reflect realized profits/losses.

## Root Cause

The "Winnings" metric was displaying `traderData.pnl` which comes from Polymarket's leaderboard API (`/api/trader/[wallet]/route.ts`). This value includes:
- Realized P&L (from closed/resolved positions)
- Unrealized P&L (from open positions)

However, "Winnings" should only show realized P&L to match the "Realized P&L" section.

## Fix Applied

**File:** `app/trader/[wallet]/page.tsx`

1. **Added calculation for all-time realized P&L** (lines ~1760-1778):
   - Created `allTimeRealizedPnl` useMemo hook
   - Calculates from `realizedPnlRows` (data from `wallet_realized_pnl_daily` table)
   - Uses `pnl_to_date` from latest row (cumulative realized P&L) if available
   - Falls back to summing all `realized_pnl` values if `pnl_to_date` not available

2. **Updated "Winnings" display** (line ~2727):
   - Changed from `effectivePnl` (total P&L) to `allTimeRealizedPnl` (realized P&L only)
   - Now matches the "Realized P&L" section's "All Time" value

## BigQuery Audit Query

To verify the realized P&L calculation from BigQuery, run:

```bash
# Run the comprehensive audit query
bq query --use_legacy_sql=false < audit-trader-pnl-bigquery-comprehensive.sql
```

Or manually run `audit-trader-pnl-bigquery-comprehensive.sql` in BigQuery Console for trader:
`0xc257ea7e3a81ca8e16df8935d44d513959fa358e`

The query calculates:
1. **Realized P&L from SELL trades**: Matching SELLs to BUYs using average cost basis
2. **Realized P&L from resolved markets**: For BUY positions that resolved without being sold
3. **Total Realized P&L**: Sum of both sources
4. **Open positions**: Current unrealized positions

## Expected Result

After the fix:
- **"Winnings"** in Key Stats will show the same value as **"Total P&L"** in the Realized P&L section (when "All Time" is selected)
- Both values represent realized P&L only (excluding unrealized gains/losses)
- The discrepancy between Key Stats and Realized P&L section should be resolved

## Testing

1. Navigate to a trader profile page: `/trader/[wallet]`
2. Check "Winnings" in Key Stats section
3. Check "Total P&L" in Realized P&L section (with "All Time" selected)
4. Both should now show the same value (realized P&L only)

## Notes

- The Polymarket API `pnl` value (total P&L) is still used for other metrics where appropriate
- This fix only affects the "Winnings" display in Key Stats
- The Realized P&L section was already correct - it was showing realized P&L from `wallet_realized_pnl_daily` table
