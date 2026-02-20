# ML Score Backtest Report

This backtest measures **pure signal value**: each unique trade counted once, metrics = win rate and **unit ROI** (as if you risked 1 unit per trade). It does **not** use FT copy PnL or bot strategies or sizing.

## Where to see the results

1. **Run and save to a file** (recommended):
   ```bash
   npx tsx scripts/ml-score-backtest.ts --top30 --out docs/ml-backtest-top30-report.txt
   ```
   Then open **`docs/ml-backtest-top30-report.txt`** in your editor or any text viewer.

2. **Run and view in terminal**:
   ```bash
   npx tsx scripts/ml-score-backtest.ts --top30
   ```
   The full report prints in the terminal. Scroll up to see the comparison and explanation.

The run takes about 6–8 minutes (it fetches all resolved FT orders with ML scores).

## Why can "top" traders show worse or negative copy results?

The report now includes a short section explaining this. In short:

- **"Top 30"** = traders ranked by *their* last-30-day PnL. We measure *our* forward-test copy PnL.
- We **don’t copy every trade** they make — only trades that pass our filters (ML threshold, price band, edge, conviction, etc.). So the subset we copy can perform differently (e.g. we copy more marginal trades and miss some of their biggest wins).
- Our PnL uses **our** virtual bet sizes (per FT wallet), not theirs.
- The ranking is a **current** snapshot; backtest trades span the full date range, so some were placed when a trader wasn’t in the top 30.

So "best traders by PnL" does not guarantee "best copy portfolio" when we filter and size the way we do.
