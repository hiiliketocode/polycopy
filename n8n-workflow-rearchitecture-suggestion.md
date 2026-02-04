# n8n Workflow Re-architecture Suggestion

## Current Problem
The agent is hitting max iterations (10) because it's trying to do too much in one node:
- Reviewing 30 trades
- Selecting 5
- Researching those 5
- Creating tweets
- Formatting output

## Option 1: Simplified Single Agent (Recommended)

Keep one agent but use the consolidated prompt that enforces linear processing.

**Workflow:**
```
Schedule Trigger
  ↓
Workflow Configuration (30 trades)
  ↓
Data Analyst Agent (with consolidated prompt)
  - Max Iterations: 15
  - Tools: Remove Chart Tool, Structured Output Parser
  - Keep: BigQuery SQL Tool (only if needed for additional data)
  ↓
Format Final Output
  ↓
Google Sheets
```

**Agent Settings:**
- System Prompt: Use `n8n-agent-prompt-single-consolidated.txt`
- Max Iterations: 15 (8 steps needed, 15 gives buffer)
- Remove unnecessary tools

## Option 2: Multi-Node Architecture (More Reliable)

Break the task into separate nodes to avoid iteration limits:

**Workflow:**
```
Schedule Trigger
  ↓
Workflow Configuration
  ↓
BigQuery Node (get 30 trades)
  ↓
Function Node: Select Top 5
  ↓
Loop Over 5 Selected Trades
  ├─→ Agent Node: Create Tweet (1 trade at a time)
  └─→ Collect Results
  ↓
Function Node: Merge All Trades
  ↓
Google Sheets
```

### Function Node: Select Top 5

```javascript
// Select 5 best trades based on excitement_score and variety
const trades = $input.all();

// Sort by excitement_score
const sorted = trades
  .map(item => item.json)
  .sort((a, b) => b.excitement_score - a.excitement_score);

// Select 5 with variety
const selected = [];
const seenTypes = new Set();
const seenCategories = new Set();

for (const trade of sorted) {
  if (selected.length >= 5) break;
  
  const type = trade.market_type || 'Other';
  const category = trade.excitement_category || 'Other';
  
  // Prioritize variety
  if (!seenTypes.has(type) || !seenCategories.has(category) || selected.length < 3) {
    selected.push({ ...trade, selected: true });
    seenTypes.add(type);
    seenCategories.add(category);
  }
}

// Mark remaining as not selected
const allTrades = sorted.map(trade => ({
  ...trade,
  selected: selected.some(s => s.trade_id === trade.trade_id)
}));

return {
  json: {
    selected_trades: selected,
    all_trades: allTrades
  }
};
```

### Agent Node: Create Tweet (Simplified)

**System Prompt:**
```
You are a social media content creator. Create ONE tweet for ONE trade.

INPUT: Single trade with all data

TASK: Create tweet (240-260 chars) following style guide:
- Direct, punchy, data-first
- Lead with ROI or profit
- End with engagement hook
- Link in reply thread

TEMPLATE (choose based on excitement_category):
- Clutch Play → Timing Play template
- Whale Trade → Conviction Bet template
- Sniper → Sniper template
- Default → Missed Play template

OUTPUT JSON:
{
  "trade_id": "...",
  "tweet": "Main tweet here",
  "tweet_reply": "↓ https://polycopy.app/trader/{wallet_address}"
}

Do this in 2 steps max. No loops.
```

**Settings:**
- Max Iterations: 3
- Process one trade at a time

### Function Node: Merge All Trades

```javascript
// Merge selected tweets back into all trades
const selectedTweets = $input.all().map(item => item.json);
const allTrades = $('Function Node: Select Top 5').all().map(item => item.json.all_trades)[0];

const tweetMap = {};
selectedTweets.forEach(tweet => {
  tweetMap[tweet.trade_id] = {
    tweet: tweet.tweet,
    tweet_reply: tweet.tweet_reply
  };
});

return allTrades.map(trade => ({
  json: {
    ...trade,
    tweet: tweetMap[trade.trade_id]?.tweet || null,
    tweet_reply: tweetMap[trade.trade_id]?.tweet_reply || null
  }
}));
```

## Option 3: Hybrid Approach (Best Balance)

Use Function Node for selection, Agent for tweets:

```
BigQuery (30 trades)
  ↓
Function: Select 5 (no iterations needed)
  ↓
Split in Batches (size: 1)
  ↓
Agent: Create Tweet (max 3 iterations per trade)
  ↓
Collect Results
  ↓
Function: Merge with All Trades
  ↓
Google Sheets
```

## Recommendation

**Start with Option 1** (consolidated prompt) - it's simplest and should work if the prompt is clear enough.

**If that still hits iterations, use Option 3** (hybrid) - it's more reliable and easier to debug.

**Avoid Option 2** unless you need maximum control - it's more complex but most reliable.

## Key Changes to Current Workflow

1. **Remove Chart Tool** - Not needed for tweets
2. **Remove Structured Output Parser** - Use simple JSON output
3. **Reduce Max Iterations** - 15 max (or 3 per trade if using loop)
4. **Use consolidated prompt** - Enforces linear processing
5. **Pre-select trades** - Use Function Node instead of agent selecting

The consolidated prompt should solve the iteration issue by making the process linear and explicit.
