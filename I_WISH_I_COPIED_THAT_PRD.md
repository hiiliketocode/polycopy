# Product Requirements Document: "I Wish I Copied That" AI Tweet Generation System

**Version:** 1.0  
**Last Updated:** February 3, 2026  
**Status:** Production

---

## Executive Summary

The "I Wish I Copied That" system automatically identifies the most exciting winning trades from Polymarket, enriches them with contextual research, and generates engaging social media content. The system combines BigQuery data analysis, AI-powered research (via Google Gemini), and automated content distribution to showcase exceptional trading performance.

---

## 1. System Architecture Overview

### 1.1 High-Level Flow

```
BigQuery Data Sources
    ↓
i_wish_i_copied_that Table (Daily Refresh)
    ↓
n8n Workflow Orchestration
    ↓
AI Agent (Gemini) - Research & Tweet Generation
    ↓
Function Node - Data Formatting
    ↓
Google Sheets - Content Repository
```

### 1.2 Components

1. **BigQuery Data Warehouse** - Source of truth for trades, markets, and trader stats
2. **i_wish_i_copied_that Table** - Curated table of exciting trades (refreshed daily)
3. **n8n Workflow** - Orchestrates the entire pipeline
4. **Google Gemini AI Agent** - Performs research and generates tweets
5. **Google Sheets** - Stores generated tweets for review and distribution

---

## 2. Data Sources & BigQuery Table Structure

### 2.1 Source Tables

#### `polycopy_v1.markets`
**Purpose:** Market metadata and resolution data

**Key Columns:**
- `condition_id` (STRING) - Unique market identifier (join key)
- `status` (STRING) - Market status: 'closed', 'resolved', 'open'
- `winning_label` (STRING) - Winning outcome: 'Yes', 'No', etc.
- `winning_id` (STRING) - ID of winning outcome
- `end_time` / `completed_time` (TIMESTAMP) - Market closure time
- `title` (STRING) - Market question/title
- `description` (STRING) - Market description
- `market_type` (STRING) - Category: 'Politics', 'Sports', 'Crypto', etc.
- `market_subtype` (STRING) - Sub-category
- `bet_structure` (STRING) - 'Binary', 'Scalar', 'Categorical'
- `market_slug` (STRING) - URL-friendly identifier
- `event_slug` (STRING) - Parent event identifier
- `volume_total` (FLOAT) - Total trading volume
- `liquidity` (FLOAT) - Current liquidity
- `tags` (ARRAY<STRING>) - Market tags

**Filter Criteria:**
- `status IN ('closed', 'resolved')`
- `winning_label IS NOT NULL`
- Closed within last 7 days
- Must be fully resolved (not just closed)

#### `polycopy_v1.trades`
**Purpose:** Individual trade transactions

**Key Columns:**
- `id` (STRING) - Unique trade ID
- `condition_id` (STRING) - Market identifier (join key)
- `wallet_address` (STRING) - Trader wallet address
- `timestamp` (TIMESTAMP) - Trade execution time
- `side` (STRING) - 'BUY' or 'SELL'
- `price` (FLOAT) - Entry price (0.00 to 0.99)
- `shares_normalized` (FLOAT) - Number of shares purchased
- `token_label` (STRING) - 'YES', 'NO', etc.

**Filter Criteria:**
- `side = 'BUY'` (only winning BUY trades)
- `token_label` matches `winning_label` (winning trades only)
- `price > 0` and `shares_normalized > 0`

#### `polycopy_v1.trader_global_stats`
**Purpose:** Trader performance statistics

**Key Columns:**
- `wallet_address` (STRING) - Trader identifier
- `L_win_rate` (FLOAT) - Lifetime win rate (0.0 to 1.0)
- `L_total_pnl_usd` (FLOAT) - Lifetime profit/loss in USD
- `L_total_trade_count` (INTEGER) - Total number of trades

**Usage:** Provides context about trader consistency and skill level

### 2.2 Derived Table: `i_wish_i_copied_that`

#### Purpose
Identifies the **most exciting winning trades** from the last 7 days, ranked by an "excitement score" that combines ROI, trade size, timing, and market popularity.

#### Table Structure

**Core Trade Data:**
- `trade_id` (STRING) - Unique trade identifier
- `condition_id` (STRING) - Market identifier
- `wallet_address` (STRING) - Trader wallet
- `wallet_truncated` (STRING) - Display format: "0x31a5...8ed9"
- `timestamp` (TIMESTAMP) - Trade execution time
- `entry_price` (FLOAT) - Entry price (0.00-0.99)
- `shares` (FLOAT) - Shares purchased
- `invested_usd` (FLOAT) - Capital invested: `price * shares`
- `profit_usd` (FLOAT) - Profit realized: `(1.0 - price) * shares`
- `roi_pct` (FLOAT) - Return on investment: `((1.0 - price) / price) * 100`
- `mins_before_close` (INTEGER) - Minutes before market closed (NULL if >7 days)

**Market Context:**
- `market_title` (STRING) - Market question/title
- `market_type` (STRING) - Market category
- `market_subtype` (STRING) - Sub-category
- `bet_structure` (STRING) - Bet type
- `market_slug` (STRING) - Market URL slug
- `event_slug` (STRING) - Event URL slug
- `market_close_time` (TIMESTAMP) - When market closed
- `volume_total` (FLOAT) - Total market volume
- `liquidity` (FLOAT) - Market liquidity
- `tags` (ARRAY<STRING>) - Market tags

**Trade Outcomes:**
- `token_label` (STRING) - Token purchased: 'YES', 'NO'
- `winning_label` (STRING) - Winning outcome
- `excitement_score` (FLOAT) - Calculated excitement score (0-100+)
- `excitement_category` (STRING) - 'Whale Trade', 'Sniper', 'Clutch Play', 'High ROI'

**Trader Stats:**
- `lifetime_win_rate` (FLOAT) - Trader's lifetime win rate
- `lifetime_pnl_usd` (FLOAT) - Trader's lifetime P&L
- `lifetime_trade_count` (INTEGER) - Trader's total trades
- `trader_market_volume` (FLOAT) - Trader's total volume in this market

**Metadata:**
- `created_at` (TIMESTAMP) - When trade was added to table
- `last_processed_at` (TIMESTAMP) - When tweet was generated (NULL if not processed)

#### Calculation Logic

**Excitement Score Components:**

1. **ROI Score** (0-40 points)
   - Formula: `MIN(40, (roi_pct / 10))`
   - Caps at 40 points for 400%+ ROI

2. **Size Score** (0-25 points)
   - Formula: `MIN(25, (invested_usd / 4000))`
   - Caps at 25 points for $100k+ trades

3. **Profit Score** (0-20 points)
   - Formula: `MIN(20, (profit_usd / 5000))`
   - Caps at 20 points for $100k+ profit

4. **Clutch Score** (0-10 points)
   - Formula: `IF(mins_before_close <= 10, 10, IF(mins_before_close <= 60, 5, 0))`
   - Rewards last-minute plays

5. **Market Popularity Score** (0-5 points)
   - Formula: `MIN(5, (volume_total / 200000))`
   - Rewards trades in popular markets

**Total Excitement Score:** Sum of all components

**Excitement Categories:**
- **Whale Trade:** `invested_usd >= 100000` OR `profit_usd >= 100000`
- **Sniper:** `roi_pct >= 500` AND `entry_price < 0.20`
- **Clutch Play:** `mins_before_close <= 10` AND `invested_usd >= 1000`
- **High ROI:** `roi_pct >= 200` (fallback)

#### Filtering Criteria

**Minimum Requirements:**
- `roi_pct >= 450` (4.5x minimum ROI)
- `invested_usd >= 50.0` (minimum trade size)
- Market closed within last 7 days
- Trade executed before market closed
- Trader market volume: $100 - $1M (filters bots)

**Final Selection:**
- Top 200 trades by `excitement_score DESC`
- Ensures variety and quality

---

## 3. Daily Refresh & Incremental Updates

### 3.1 Current Implementation

The table uses `CREATE OR REPLACE TABLE`, which rebuilds the entire table daily. This is inefficient but ensures data freshness.

### 3.2 Recommended: Incremental Updates

**Strategy:** Only add trades that haven't been processed before.

**Implementation:**

1. **Add tracking column:**
   ```sql
   ALTER TABLE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
   ADD COLUMN IF NOT EXISTS last_processed_at TIMESTAMP;
   ```

2. **Incremental INSERT query** (see `create-i-wish-i-copied-that-incremental.sql`):
   - Only inserts trades where `trade_id` doesn't exist in table
   - Updates `last_processed_at` when tweet is generated
   - Maintains `created_at` for original insertion time

3. **Daily refresh script** (see `refresh-i-wish-i-copied-that-daily.sh`):
   - Runs incremental INSERT
   - Cleans up trades older than 7 days
   - Maintains table size

### 3.3 Scheduled Execution

**Option 1: BigQuery Scheduled Query**
- Create scheduled query in BigQuery Console
- Runs daily at 2 AM UTC
- Automatic execution

**Option 2: Cloud Scheduler + Cloud Function**
- More control and error handling
- Can trigger n8n webhook after completion

**Option 3: n8n Schedule Trigger**
- n8n workflow runs daily
- First step: Refresh BigQuery table
- Then: Process new trades

---

## 4. n8n Workflow Architecture

### 4.1 Workflow Steps

#### Step 1: Schedule Trigger
- **Type:** Schedule Trigger
- **Frequency:** Daily at 3 AM UTC (after BigQuery refresh)
- **Purpose:** Start workflow automatically

#### Step 2: Refresh BigQuery Table (Optional)
- **Type:** BigQuery Node
- **Operation:** Execute Query
- **Query:** Incremental INSERT (see SQL file)
- **Purpose:** Ensure table is up-to-date

#### Step 3: Fetch Trades from BigQuery
- **Type:** BigQuery Node
- **Operation:** Execute Query
- **Query:** 
  ```sql
  SELECT *
  FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
  WHERE last_processed_at IS NULL
  ORDER BY excitement_score DESC
  LIMIT 30
  ```
- **Purpose:** Get unprocessed trades

#### Step 4: Data Analyst Agent (Gemini)
- **Type:** AI Agent Node
- **Model:** Google Gemini (latest)
- **Tools Enabled:**
  - Web Search Tool (for research)
  - BigQuery SQL Tool (for trader stats lookup)
- **Prompt:** See `n8n-agent-prompt-single-consolidated.txt`
- **Purpose:** Research trades and generate tweets

**Agent Process:**
1. **Quick Review:** Scan all 30 trades
2. **Deep Research:** For each trade:
   - Look up trader on Polycopy
   - Research market context (news, Twitter discussions)
   - Analyze timing (clutch plays, market movements)
   - Identify why trade was smart
3. **Tweet Generation:** Create enriched tweets with:
   - Main tweet (hook + key stats)
   - Reply thread (Polycopy link + CTA)
   - Full tweet (combined)
   - Research context fields

#### Step 5: Clean JSON Output
- **Type:** Function Node
- **Code:** See `n8n-function-node-clean-json-output.js`
- **Purpose:** Remove markdown code blocks from agent output

#### Step 6: Format Final Output
- **Type:** Function Node
- **Code:** See `n8n-function-node-format-final-output-fixed.js`
- **Mode:** "Run Once for All Items"
- **Purpose:** 
  - Parse agent JSON output
  - Extract `all_trades` array
  - Format each trade for Google Sheets
  - Ensure one row per trade

#### Step 7: Update BigQuery (Mark as Processed)
- **Type:** BigQuery Node
- **Operation:** Execute Query
- **Query:** Update `last_processed_at` for processed trades
- **Purpose:** Track which trades have tweets

#### Step 8: Append to Google Sheets
- **Type:** Google Sheets Node
- **Operation:** Append to Sheet
- **Spreadsheet ID:** [Your Sheet ID]
- **Sheet Name:** "Tweets"
- **Options:**
  - **Insert Rows:** At the top (row 2, after header)
  - **Use First Row as Headers:** Yes
- **Purpose:** Store tweets for review and distribution

### 4.2 Data Flow

```
Schedule Trigger
    ↓
BigQuery: Fetch Unprocessed Trades (30)
    ↓
AI Agent: Research & Generate Tweets
    ↓
Function Node: Parse & Format JSON
    ↓
Function Node: Format for Sheets
    ↓
BigQuery: Mark Trades as Processed
    ↓
Google Sheets: Append New Rows (Top)
```

---

## 5. AI Agent Prompt Engineering

### 5.1 Current Prompt Structure

**File:** `n8n-agent-prompt-single-consolidated.txt`

**Key Sections:**

1. **Role Definition:** Social media content creator for Polycopy
2. **Process Steps:** Linear, non-iterative workflow
3. **Research Requirements:** Deep research per trade
4. **Tweet Formatting:** Specific structure and style
5. **Output Schema:** JSON format with all required fields

### 5.2 Prompt Improvements

#### A. Enhanced Research Instructions

**Current:** Basic research steps  
**Improved:**
```
RESEARCH DEPTH REQUIREMENTS:
- Minimum 3 web searches per trade
- Must find at least ONE external source (Twitter, news, Reddit)
- Trader research: Check Polycopy + search for wallet address on Twitter
- Market research: Find news/articles from trade timestamp ±2 hours
- Timing research: Check market movement charts if available
```

#### B. Better Tweet Hooks

**Current:** Generic hooks  
**Improved:**
```
HOOK TYPES (use one per tweet):
1. CONTRARIAN: "Everyone said X, but 0x... knew better"
2. TIMING: "With X minutes left, 0x... made the call"
3. CONVICTION: "$X on a X% bet? That's conviction"
4. INSIGHT: "0x... saw what others missed: [insight]"
5. STATS: "X% ROI on a $X bet? That's [adjective]"
```

#### C. Contextual Enrichment

**Add to prompt:**
```
CONTEXT FIELDS (required for each trade):
- research_context: What external sources revealed (2-3 sentences)
- trader_context: Trader's background and patterns (2-3 sentences)
- timing_context: What was happening in the market (2-3 sentences)
- why_smart: Why this trade was intelligent (2-3 sentences)
```

### 5.3 Output Quality Improvements

#### A. Tweet Length Optimization

**Current:** Variable length  
**Improved:**
- Main tweet: 200-250 characters (leaves room for engagement)
- Reply thread: 100-150 characters
- Full tweet: 300-350 characters total

#### B. Engagement Hooks

**Add to prompt:**
```
ENGAGEMENT ELEMENTS:
- Ask a question: "Would you have made this call?"
- Create FOMO: "I wish I'd seen this before it closed"
- Highlight rarity: "Only X% of traders would make this bet"
- Emphasize skill: "This is what separates pros from amateurs"
```

#### C. Visual Elements (Future)

**Add to prompt:**
```
VISUAL ELEMENTS TO DESCRIBE:
- Chart description: "ROI chart showing X% gain"
- Trader avatar: "Trader profile image"
- Market image: "Market thumbnail"
- Performance graph: "Trader's win rate over time"
```

---

## 6. Data Quality Improvements

### 6.1 BigQuery Table Enhancements

#### A. Add Market Sentiment Score

**Purpose:** Identify contrarian trades

**Implementation:**
```sql
-- Add to recent_markets CTE
sentiment_score AS (
  SELECT 
    condition_id,
    -- Calculate sentiment: price movement in last hour before trade
    AVG(CASE 
      WHEN t.timestamp >= TIMESTAMP_SUB(m.market_close_time, INTERVAL 1 HOUR)
      THEN t.price 
    END) as avg_price_last_hour
  FROM trades t
  JOIN markets m ON t.condition_id = m.condition_id
  GROUP BY condition_id
)
```

#### B. Add Trader Consistency Metrics

**Purpose:** Identify consistent winners vs. lucky outliers

**Implementation:**
```sql
-- Add to trades_with_stats CTE
trader_consistency AS (
  SELECT 
    wallet_address,
    COUNT(*) as total_wins,
    AVG(roi_pct) as avg_roi,
    STDDEV(roi_pct) as roi_stddev,
    -- Consistency score: lower stddev = more consistent
    CASE 
      WHEN STDDEV(roi_pct) < 50 THEN 'Consistent'
      WHEN STDDEV(roi_pct) < 200 THEN 'Variable'
      ELSE 'Volatile'
    END as consistency_category
  FROM i_wish_i_copied_that
  GROUP BY wallet_address
)
```

#### C. Add Market Volatility Score

**Purpose:** Identify trades in volatile markets (higher excitement)

**Implementation:**
```sql
-- Add to recent_markets CTE
market_volatility AS (
  SELECT 
    condition_id,
    -- Price range in last 24 hours before close
    MAX(price) - MIN(price) as price_range_24h,
    -- Volume spike in last hour
    SUM(CASE 
      WHEN timestamp >= TIMESTAMP_SUB(market_close_time, INTERVAL 1 HOUR)
      THEN invested_usd 
    END) / NULLIF(SUM(invested_usd), 0) as volume_spike_ratio
  FROM trades t
  JOIN markets m ON t.condition_id = m.condition_id
  WHERE t.timestamp >= TIMESTAMP_SUB(m.market_close_time, INTERVAL 24 HOUR)
  GROUP BY condition_id
)
```

### 6.2 Filtering Improvements

#### A. Exclude Known Bots

**Implementation:**
```sql
-- Add to human_trades CTE
WHERE wallet_address NOT IN (
  SELECT wallet_address 
  FROM `gen-lang-client-0299056258.polycopy_v1.bad_wallets`
)
```

#### B. Minimum Market Maturity

**Purpose:** Only include trades in markets that were open for at least 24 hours

**Implementation:**
```sql
-- Add to recent_markets CTE
WHERE TIMESTAMP_DIFF(
  COALESCE(end_time, completed_time),
  created_at,
  HOUR
) >= 24
```

#### C. Trader Reputation Filter

**Purpose:** Prioritize trades from reputable traders

**Implementation:**
```sql
-- Add to trades_with_stats CTE
WHERE lifetime_win_rate >= 0.5  -- 50%+ win rate
  AND lifetime_trade_count >= 10  -- At least 10 trades
  AND lifetime_pnl_usd > 0  -- Profitable trader
```

### 6.3 Excitement Score Refinements

#### A. Add Contrarian Bonus

**Purpose:** Reward trades that went against market consensus

**Implementation:**
```sql
contrarian_score AS (
  CASE 
    WHEN entry_price < 0.20 AND roi_pct > 500 THEN 15  -- Low-prob sniper
    WHEN entry_price < 0.30 AND roi_pct > 300 THEN 10  -- Contrarian play
    ELSE 0
  END
)
```

#### B. Add Consistency Bonus

**Purpose:** Reward consistent winners

**Implementation:**
```sql
consistency_bonus AS (
  CASE 
    WHEN lifetime_win_rate >= 0.70 THEN 5  -- 70%+ win rate
    WHEN lifetime_win_rate >= 0.60 THEN 3  -- 60%+ win rate
    ELSE 0
  END
)
```

#### C. Add Market Impact Score

**Purpose:** Reward trades in high-impact markets

**Implementation:**
```sql
market_impact_score AS (
  CASE 
    WHEN market_type IN ('Politics', 'Elections') THEN 5
    WHEN market_type IN ('Sports', 'Entertainment') THEN 3
    WHEN volume_total > 1000000 THEN 3
    ELSE 0
  END
)
```

---

## 7. Adding Graphics & Charts to Tweets

### 7.1 Current Limitations

Twitter/X doesn't support inline images in API tweets, but you can:
1. Attach images to tweets
2. Use image URLs in tweet text (not clickable)
3. Create image cards for replies

### 7.2 Implementation Strategy

#### A. Generate Charts Before Tweet Creation

**Tools:**
- **n8n Chart Tool** (built-in)
- **QuickChart API** (free, no auth)
- **Google Charts API** (free)
- **Custom Python script** (using matplotlib/plotly)

**Chart Types:**
1. **ROI Visualization:** Bar chart showing entry price vs. final price
2. **Timing Chart:** Timeline showing trade execution relative to market close
3. **Trader Performance:** Mini chart of trader's win rate over time
4. **Market Movement:** Price chart showing market volatility

#### B. n8n Workflow Enhancement

**Add Step After Agent:**

**Step 6.5: Generate Charts**
- **Type:** HTTP Request Node (for QuickChart) OR Function Node (for custom)
- **Input:** Trade data from formatted output
- **Output:** Chart image URLs

**QuickChart Example:**
```javascript
// In Function Node
const chartUrl = `https://quickchart.io/chart?c={
  type: 'bar',
  data: {
    labels: ['Entry', 'Final'],
    datasets: [{
      label: 'Price',
      data: [${trade.entry_price}, 1.0]
    }]
  }
}`;

return {
  json: {
    ...trade,
    chart_url: chartUrl
  }
};
```

#### C. Update Agent Prompt

**Add to prompt:**
```
CHART GENERATION:
For each trade, generate a chart description:
- Chart type: "ROI Bar Chart", "Timing Timeline", "Performance Graph"
- Data points: [specify data]
- Visual style: "Bold colors", "Minimalist", etc.

The chart will be generated automatically and attached to the tweet.
```

#### D. Twitter API Integration

**Option 1: Attach Image to Tweet**
- Use Twitter API v2 with media upload
- Upload chart image first
- Attach media_id to tweet

**Option 2: Image URL in Tweet**
- Include chart URL in tweet text
- Users can click to view
- Less elegant but simpler

**Option 3: Image Cards**
- Create image card with chart + text
- More engaging but requires design work

### 7.3 Recommended Chart Library

**QuickChart.io** (Recommended)
- Free, no authentication
- Simple URL-based API
- Supports bar, line, pie charts
- Customizable styling

**Example:**
```
https://quickchart.io/chart?c={
  "type": "bar",
  "data": {
    "labels": ["Entry", "Final"],
    "datasets": [{
      "label": "Price",
      "data": [0.0818, 1.0],
      "backgroundColor": ["#ff6384", "#36a2eb"]
    }]
  },
  "options": {
    "title": {
      "display": true,
      "text": "Trade ROI: 1122%"
    }
  }
}
```

---

## 8. Google Sheets Configuration

### 8.1 Sheet Structure

**Sheet Name:** "Tweets"

**Columns (in order):**
1. `tweet_main` - Main tweet text
2. `tweet_reply` - Reply thread text
3. `tweet_full` - Combined tweet
4. `tweet_ready_to_post` - Final formatted tweet
5. `trade_id` - Trade identifier
6. `wallet_address` - Full wallet address
7. `wallet_truncated` - Display format
8. `polycopy_url` - Trader profile URL
9. `market_title` - Market name
10. `market_type` - Market category
11. `market_subtype` - Sub-category
12. `bet_structure` - Bet type
13. `entry_price` - Entry price
14. `invested_usd` - Amount invested
15. `profit_usd` - Profit realized
16. `roi_pct` - ROI percentage
17. `timestamp` - Trade timestamp
18. `trade_timestamp_formatted` - Human-readable timestamp
19. `mins_before_close` - Minutes before close
20. `market_close_time` - Market close timestamp
21. `research_context` - Research findings
22. `trader_context` - Trader background
23. `timing_context` - Timing analysis
24. `why_smart` - Why trade was smart
25. `excitement_score` - Excitement score
26. `excitement_category` - Category
27. `lifetime_win_rate` - Trader win rate
28. `lifetime_pnl_usd` - Trader P&L
29. `lifetime_trade_count` - Trader trade count
30. `created_at` - When added to sheet

### 8.2 Newest-First Configuration

**Problem:** Default append adds rows at bottom, making newest tweets hard to find.

**Solution:** Insert rows at top (after header row).

**n8n Google Sheets Node Configuration:**

1. **Operation:** "Append or Update"
2. **Sheet Name:** "Tweets"
3. **Columns:** Map all columns from Function Node output
4. **Options:**
   - **Insert Rows:** "At the top" (row 2)
   - **Use First Row as Headers:** Yes
   - **Update:** No (only append)

**Alternative: Custom Function Node**

If n8n doesn't support "insert at top", use a Function Node to reverse the array:

```javascript
// Reverse array so newest is first
const reversedTrades = sheetRows.reverse();

// Then append normally - newest will be at top after reverse
return reversedTrades;
```

**Note:** This requires reading existing rows, reversing, and rewriting. Better to use "Insert Rows at Top" if available.

### 8.3 Data Retention

**Strategy:** Keep all tweets indefinitely (they're valuable content)

**If Sheet Gets Too Large:**
1. Archive old tweets to separate sheet
2. Keep last 1000 tweets in main sheet
3. Use Google Apps Script to auto-archive monthly

---

## 9. Monitoring & Quality Assurance

### 9.1 Key Metrics

**Data Quality:**
- Number of trades processed daily
- Average excitement score
- Distribution of categories (Whale, Sniper, Clutch)
- Trader diversity (unique wallets)

**Content Quality:**
- Tweet length distribution
- Engagement rate (if posted to Twitter)
- Research depth (number of sources per tweet)
- Context field completeness

**System Health:**
- BigQuery table refresh success rate
- n8n workflow execution time
- Agent iteration count (should be low)
- Error rate

### 9.2 Alerts

**Set up alerts for:**
1. BigQuery refresh failures
2. n8n workflow errors
3. Agent max iterations reached
4. Zero trades processed
5. Google Sheets write failures

### 9.3 Quality Checks

**Automated:**
- Validate tweet length (200-350 chars)
- Check for Polycopy URLs
- Verify all required fields present
- Check for duplicate trades

**Manual Review:**
- Sample tweets for quality
- Verify research accuracy
- Check tweet tone and style
- Ensure no sensitive information

---

## 10. Future Enhancements

### 10.1 Short-Term (Next Month)

1. **Incremental Updates:** Implement daily incremental refresh
2. **Chart Generation:** Add ROI charts to tweets
3. **Better Filtering:** Exclude bots, add reputation filters
4. **Tweet Scheduling:** Auto-post to Twitter/X
5. **A/B Testing:** Test different tweet formats

### 10.2 Medium-Term (Next Quarter)

1. **Multi-Language Support:** Generate tweets in multiple languages
2. **Video Generation:** Create short videos for top trades
3. **Trader Profiles:** Deep-dive tweets for top traders
4. **Market Analysis:** Weekly summary tweets
5. **Engagement Tracking:** Track likes, retweets, clicks

### 10.3 Long-Term (Next Year)

1. **Real-Time Processing:** Process trades as markets close
2. **Predictive Scoring:** Predict which trades will be exciting
3. **Community Features:** Let users vote on best trades
4. **API Access:** Public API for trade data
5. **Mobile App:** Native app for browsing trades

---

## 11. Technical Specifications

### 11.1 BigQuery Quotas

- **Daily Query Limit:** 1,000 queries/day (free tier)
- **Table Size:** ~10,000 rows max (with 7-day window)
- **Refresh Frequency:** Daily (can be increased if needed)

### 11.2 n8n Limits

- **Agent Max Iterations:** 10 (current), can increase to 20
- **Workflow Execution Time:** ~5-10 minutes for 30 trades
- **Web Search Tool:** Rate limits apply (check provider)

### 11.3 Google Sheets Limits

- **Rows:** 10 million rows max
- **Cells:** 10 million cells max
- **API Quota:** 100 requests/100 seconds/user
- **Write Frequency:** Can handle daily writes easily

---

## 12. Troubleshooting Guide

### 12.1 Common Issues

**Issue:** "No trades found"
- **Cause:** BigQuery table not refreshed
- **Fix:** Run refresh query manually

**Issue:** "Agent max iterations reached"
- **Cause:** Prompt too complex or tool calls failing
- **Fix:** Simplify prompt, reduce tool usage

**Issue:** "Tweets showing as one blob"
- **Cause:** Function Node mode incorrect
- **Fix:** Set to "Run Once for All Items"

**Issue:** "Google Sheets 503 error"
- **Cause:** Temporary API outage
- **Fix:** Enable retry, wait and retry

**Issue:** "Trades not marked as processed"
- **Cause:** BigQuery update query failing
- **Fix:** Check query syntax, verify permissions

### 12.2 Debug Checklist

- [ ] BigQuery table has data
- [ ] n8n workflow mode is correct
- [ ] Agent prompt is valid
- [ ] Function Node returns array
- [ ] Google Sheets credentials valid
- [ ] All required columns mapped
- [ ] No rate limit errors

---

## Appendix A: SQL Queries

See separate files:
- `create-i-wish-i-copied-that-refined.sql` - Main table creation
- `create-i-wish-i-copied-that-incremental.sql` - Incremental updates
- `n8n-bigquery-simple-30.sql` - Fetch unprocessed trades

## Appendix B: n8n Configuration Files

See separate files:
- `n8n-agent-prompt-single-consolidated.txt` - Agent prompt
- `n8n-function-node-format-final-output-fixed.js` - Formatting function
- `n8n-function-node-clean-json-output.js` - JSON cleaning function

## Appendix C: Setup Scripts

See separate files:
- `refresh-i-wish-i-copied-that-daily.sh` - Daily refresh script
- `setup-bigquery-scheduled-query.sh` - Scheduled query setup

---

**Document Status:** Living document - update as system evolves  
**Next Review:** March 1, 2026
