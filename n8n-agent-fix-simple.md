# Simple Fix: Reduce Agent Iterations

## The Real Problem
The agent is hitting 10 iterations because it's doing too much research per trade. Each trade shouldn't need 10 steps - it should be:
1. Read trade data (1 step)
2. Create tweet (1 step)
3. Format output (1 step)

## Simple Fixes (No Split Node Needed)

### Option 1: Simplify the Prompt (Easiest)

**Update Agent System Prompt:**
```
You are a social media content creator. Create a tweet about a winning trade.

Given trade data, create ONE tweet (240-260 chars) that:
- Highlights ROI/profit
- Mentions what made it exciting
- Includes: https://polycopy.app/trader/{wallet_address}

Output JSON:
{
  "tweet": "Your tweet here",
  "roi_pct": {value}
}

Do this in 2 steps max. No extensive research needed.
```

**Reduce Max Iterations:** 10 → 3

### Option 2: Remove Unnecessary Tools

The agent might be looping through tools unnecessarily. Remove:
- Chart Tool (not needed for tweets)
- Structured Output Parser (use simple JSON)

Keep only:
- BigQuery SQL Tool (only if you need additional data)

### Option 3: Pre-format Data

Add a Function Node BEFORE the Agent to format the data:

```javascript
// Format trade for agent
const trade = $input.item.json;

return {
  json: {
    // Pre-calculate what agent needs
    summary: `${trade.market_title} - ${trade.roi_pct.toFixed(1)}% ROI, $${trade.profit_usd.toFixed(2)} profit`,
    wallet: trade.wallet_address,
    polycopy_url: `https://polycopy.app/trader/${trade.wallet_address}`,
    category: trade.excitement_category,
    // Include full trade data
    ...trade
  }
};
```

Then agent just needs to create tweet from pre-formatted summary.

## Recommended: Do All Three

1. **Simplify prompt** (less research needed)
2. **Reduce iterations** (3 instead of 10)
3. **Remove tools** (only keep what's essential)

This should fix it without needing Split in Batches!
