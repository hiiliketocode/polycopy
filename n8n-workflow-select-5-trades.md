# n8n Workflow: Select 5 Trades & Create Tweets

## Workflow Structure

```
BigQuery Node (30 trades)
  ↓
Agent Node (Select 5, Research, Create Tweets)
  ↓
Function Node (Format for Google Sheets)
  ↓
Google Sheets Node (Write all trades with tweets)
```

## Step 1: BigQuery Node

**Query:**
```sql
SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
ORDER BY excitement_score DESC
LIMIT 30;
```

**Output:** Array of 30 trade objects

## Step 2: Agent Node Configuration

### System Prompt:
```
You are a social media content curator. Review all trades provided and select the 5 most tweet-worthy ones, then create engaging tweets for them.

TASK:
1. Review all trades (up to 30)
2. Select 5 most interesting/exciting trades (prioritize variety + excitement_score)
3. Research those 5 trades (market context, trader stats, news)
4. Create tweets (240-260 chars) with Polycopy links
5. Generate Polycopy URLs: https://polycopy.app/trader/{wallet_address}

OUTPUT JSON:
{
  "selected_trades": [
    {
      "trade_id": "...",
      "wallet_address": "...",
      "market_title": "...",
      "roi_pct": 1122.3,
      "profit_usd": 80971.77,
      "invested_usd": 7215.0,
      "excitement_category": "Clutch Play",
      "polycopy_url": "https://polycopy.app/trader/0x...",
      "tweet": "Your tweet here",
      "selected": true
    }
  ],
  "all_trades": [
    // All 30 trades, selected ones have tweet data, others have null
  ]
}

Keep it focused. Select 5 best, research them, create tweets.
```

### Agent Settings:
- **Max Iterations:** 15 (5 trades × 3 steps each)
- **Tools:** 
  - BigQuery SQL Tool (for additional research if needed)
  - Web Search Tool (for market context)

### User Message:
```
Review these trades and select the 5 most tweet-worthy ones:

{{ $json }}

Then research those 5 and create engaging tweets with Polycopy links.
```

## Step 3: Function Node (Format for Google Sheets)

Add a Function Node to format the output for Google Sheets:

```javascript
// Format agent output for Google Sheets
const agentOutput = $input.item.json;

// Extract all trades
const allTrades = agentOutput.all_trades || [];
const selectedTrades = agentOutput.selected_trades || [];

// Create a map of selected trades by trade_id for quick lookup
const selectedMap = {};
selectedTrades.forEach(trade => {
  selectedMap[trade.trade_id] = trade;
});

// Format for Google Sheets - one row per trade
const sheetRows = allTrades.map(trade => {
  const selected = selectedMap[trade.trade_id];
  
  return {
    // Tweet columns (only filled for selected trades)
    tweet: selected?.tweet || '',
    tweet_selected: selected ? 'Yes' : 'No',
    
    // Trade data
    trade_id: trade.trade_id,
    wallet_address: trade.wallet_address,
    polycopy_url: trade.polycopy_url || `https://polycopy.app/trader/${trade.wallet_address}`,
    market_title: trade.market_title,
    market_type: trade.market_type,
    market_subtype: trade.market_subtype,
    bet_structure: trade.bet_structure,
    
    // Trade metrics
    entry_price: trade.entry_price,
    invested_usd: trade.invested_usd,
    profit_usd: trade.profit_usd,
    roi_pct: trade.roi_pct,
    shares: trade.shares,
    
    // Timing
    timestamp: trade.timestamp,
    mins_before_close: trade.mins_before_close,
    market_close_time: trade.market_close_time,
    
    // Excitement
    excitement_score: trade.excitement_score,
    excitement_category: trade.excitement_category,
    
    // Trader stats
    lifetime_win_rate: trade.lifetime_win_rate,
    lifetime_pnl_usd: trade.lifetime_pnl_usd,
    trader_market_volume: trade.trader_market_volume,
    
    // Market info
    winning_label: trade.winning_label,
    market_slug: trade.market_slug,
    event_slug: trade.event_slug
  };
});

return sheetRows.map(row => ({ json: row }));
```

## Step 4: Google Sheets Node

**Operation:** Append or Update
**Sheet:** Your sheet name
**Columns:** 
- tweet, tweet_selected, trade_id, wallet_address, polycopy_url, market_title, market_type, market_subtype, bet_structure, entry_price, invested_usd, profit_usd, roi_pct, shares, timestamp, mins_before_close, market_close_time, excitement_score, excitement_category, lifetime_win_rate, lifetime_pnl_usd, trader_market_volume, winning_label, market_slug, event_slug

## Expected Google Sheets Output

| tweet | tweet_selected | trade_id | wallet_address | polycopy_url | market_title | roi_pct | profit_usd | ... |
|-------|----------------|----------|----------------|--------------|--------------|---------|------------|-----|
| 🚨 Someone bet $7,215... | Yes | 0xf5ca... | 0x31a56e9e... | https://polycopy.app/trader/0x31a56e9e... | Maduro out by Jan 31 | 1122.3 | 80971.77 | ... |
| | No | 0xabc... | 0x01542a21... | https://polycopy.app/trader/0x01542a21... | Bitcoin dip | 2225.6 | 28696.60 | ... |
| Someone just turned... | Yes | 0xdef... | 0x01542a21... | https://polycopy.app/trader/0x01542a21... | Bitcoin above $82k | 2400.0 | 5780.16 | ... |

All 30 trades will be listed, but only the 5 selected ones will have tweets in the first column.
