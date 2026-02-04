# FIRE Feed Improvements

## Problem Analysis

The FIRE feed was only showing 2 trades despite being designed to highlight trades from top-performing traders with high conviction, high average P&L, or high win rates.

## Root Cause

After analyzing 496 trades from 50 top traders, the issue was identified as **overly strict filtering thresholds**:

### Current Thresholds (Before Fix)
- **Win Rate**: ≥65% (0.65)
- **ROI**: ≥25% (0.25)
- **Conviction Multiplier**: ≥5x

### Analysis Results
- **Total trades analyzed**: 496
- **Trades passing current filters**: 36 (7.3%)
- **Unique traders**: 4
- **Breakdown by reason**:
  - Win Rate: 16 trades
  - ROI: 26 trades
  - Conviction: 0 trades (avgBetSizeUsd often missing)

### Key Findings

1. **Conviction filter not working**: 0 trades passed via conviction because `avgBetSizeUsd` is often null/missing in the database
2. **ROI threshold too high**: 25% ROI is quite restrictive - median ROI across all trades was only 3%
3. **Win rate threshold restrictive**: 65% win rate filters out many quality traders
4. **Distribution insights**:
   - Win Rate median: 53%, p25: 47%, p75: 62%
   - ROI median: 3%, p25: -5%, p75: 17%

## Solution Implemented

Updated thresholds to a more balanced configuration:

### New Thresholds (After Fix)
- **Win Rate**: ≥55% (0.55) - lowered from 65%
- **ROI**: ≥15% (0.15) - lowered from 25%
- **Conviction Multiplier**: ≥2.5x - lowered from 5x

### Expected Impact

Based on analysis with these thresholds:
- **Expected passing trades**: ~96 trades (19.4% of analyzed trades)
- **Expected unique traders**: ~10 traders
- **Breakdown by reason**:
  - Win Rate: ~76 trades
  - ROI: ~56 trades
  - Conviction: Still 0 (avgBetSizeUsd issue remains)

## Additional Considerations

### 30-Day P&L Filtering

The FIRE feed already prioritizes traders with high 30-day P&L by:
1. Fetching top 100 traders from leaderboard sorted by PNL for the month
2. Filtering their trades by win rate/ROI/conviction

This approach ensures we're already focusing on traders with strong recent performance.

### Conviction Multiplier Issue

The conviction multiplier calculation requires `avgBetSizeUsd` from `trader_global_stats`, which is often missing. This means:
- Conviction-based filtering is currently ineffective
- Trades must pass via win rate or ROI instead
- Consider fixing `avgBetSizeUsd` population in the stats sync job if conviction filtering is desired

## Testing Recommendations

1. **Monitor feed after deployment**:
   - Check that more than 2 trades appear
   - Verify trade quality remains high
   - Ensure traders shown are still top performers

2. **Adjust thresholds if needed**:
   - If too many low-quality trades appear, slightly increase thresholds
   - If still too few trades, consider:
     - Win Rate: 0.50-0.52
     - ROI: 0.10-0.12
     - Conviction: 2.0x (if avgBetSizeUsd is fixed)

3. **Consider alternative approaches**:
   - Use 30-day P&L directly as a filter (e.g., only traders with >$X P&L)
   - Combine thresholds differently (e.g., require win rate OR ROI, not both)
   - Add recency filter (e.g., only show trades from last 7 days)

## Files Changed

- `app/feed/page.tsx`: Updated FIRE feed threshold constants (lines 226-230)

## Next Steps

1. ✅ Update thresholds
2. ⏳ Deploy and test
3. ⏳ Monitor feed performance
4. ⏳ Consider fixing avgBetSizeUsd population for conviction filtering
5. ⏳ Fine-tune thresholds based on real-world performance
