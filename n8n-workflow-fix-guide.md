# Fixing n8n Agent Max Iterations Error

## Problem
The Data Analyst Agent is hitting max iterations (10) because it's trying to process 30 trades at once and doing too many research steps.

## Solution: Process Trades One at a Time

### Option 1: Split into Loop (Recommended)

**Workflow Structure:**
```
BigQuery Node → Split in Batches → Loop → Agent (1 trade) → Collect Results
```

1. **After BigQuery Node**: Add "Split in Batches" node
   - Batch Size: 1
   - This processes one trade at a time

2. **Agent Node Configuration**:
   - Max Iterations: 5 (reduce from 10)
   - Use simplified prompt (see n8n-gemini-agent-prompt-simplified.txt)
   - Remove unnecessary tools (Chart Tool, Structured Output Parser if not needed)
   - Keep only: BigQuery SQL Tool (if needed for additional research)

3. **System Prompt** (use simplified version):
   ```
   You are a social media content creator. Create ONE engaging tweet about a winning trade.
   
   [Paste simplified prompt]
   ```

4. **User Message**:
   ```
   Create a tweet for this trade:
   {{ $json }}
   ```

### Option 2: Simplify Agent Task

**Remove Complex Tools:**
- Remove Chart Tool (not needed for tweets)
- Remove Structured Output Parser (use simple JSON output)
- Keep only BigQuery SQL Tool if you need additional data

**Reduce Max Iterations:**
- Set to 3-5 iterations max
- Agent should create tweet in 1-2 steps, not 10

**Simplified Prompt Structure:**
```
1. Analyze the trade data (1 step)
2. Create the tweet (1 step)
3. Format output (1 step)
```

### Option 3: Pre-process Data

**Add a Function Node before Agent:**
```javascript
// Format trade data for easier processing
const trade = $input.item.json;

return {
  json: {
    wallet: trade.wallet_address,
    market: trade.market_title,
    roi: `${trade.roi_pct.toFixed(1)}%`,
    profit: `$${trade.profit_usd.toFixed(2)}`,
    invested: `$${trade.invested_usd.toFixed(2)}`,
    category: trade.excitement_category,
    entry_price: trade.entry_price,
    mins_before_close: trade.mins_before_close,
    polycopy_url: `https://polycopy.app/trader/${trade.wallet_address}`
  }
};
```

This pre-formats the data so the agent doesn't need to do calculations.

## Quick Fix: Update Agent Configuration

1. **Reduce Max Iterations**: 10 → 5
2. **Use Simplified Prompt**: See `n8n-gemini-agent-prompt-simplified.txt`
3. **Remove Unnecessary Tools**: Keep only what's essential
4. **Process One Trade**: Use Split in Batches with size 1

## Recommended Workflow

```
1. BigQuery Node (gets 30 trades)
   ↓
2. Split in Batches (batch size: 1)
   ↓
3. Function Node (format trade data)
   ↓
4. Agent Node (max iterations: 5)
   - System Prompt: Simplified version
   - Tools: Only BigQuery SQL Tool (if needed)
   ↓
5. Collect Results
```

## Agent Node Settings

**System Prompt:**
```
You are a social media content creator. Create ONE engaging tweet about a winning trade.

INPUT: Trade data with wallet_address, market_title, entry_price, invested_usd, profit_usd, roi_pct, mins_before_close, excitement_category

TASK: Create a tweet (240-260 chars) that highlights ROI/profit and includes link to https://polycopy.app/trader/{wallet_address}

OUTPUT (JSON):
{
  "tweet": "Your tweet here",
  "roi_pct": {value},
  "profit_usd": {value}
}

Keep it simple. One trade = one tweet. No loops.
```

**Max Iterations:** 5
**Tools:** Only BigQuery SQL Tool (remove Chart Tool, Structured Output Parser)

This should fix the iteration limit issue!
