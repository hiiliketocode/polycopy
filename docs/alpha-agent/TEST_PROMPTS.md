# Alpha Agent Test Prompts

Use these to verify every capability is working.

## 1. DATA QUERIES (Supabase)

- "What are our top 5 strategies by PnL?"
  Should: query ft_wallets ordered by total_pnl, return real numbers

- "Show me the win rate breakdown by price band"
  Should: query ft_orders, group by entry_price ranges

- "Which traders are making us the most money?"
  Should: query ft_orders grouped by trader_address, rank by pnl

- "How many trades did we skip and why?"
  Should: query ft_seen_trades, group by skip_reason

- "Compare KELLY vs EDGE_SCALED vs CONFIDENCE allocation methods"
  Should: query ft_wallets grouped by allocation_method

- "What is our time-to-resolution distribution?"
  Should: query ft_orders with resolved_time, bucket by hours

- "Show me the Explorer's last 10 trades with full details"
  Should: query ft_orders where wallet_id = ALPHA_EXPLORER

## 2. MARKET INTELLIGENCE (Dome/Gamma)

- "What is Bitcoin trading at right now on Polymarket?"
  Should: use search_markets with "Bitcoin"

- "Find me NBA games happening tonight"
  Should: use search_markets with "NBA"

- "What are the highest volume markets right now?"
  Should: use search_markets, rank by volume

## 3. BIGQUERY (Historical)

- "How many total trades do we have? Give me a count by month."
  Should: run SQL on trades table with GROUP BY

- "How accurate is our ML model? Predicted probability vs actual outcome."
  Should: query trade_predictions_pnl_weighted, group by probability bucket

- "What market niches have the most mispricing?"
  Should: query enriched_trades_v13, analyze edge by final_niche

## 4. STRATEGY CHANGES

- "Change the Explorer's price band to 0.10-0.60"
  Should: execute update_config on ALPHA_EXPLORER

- "Switch the Optimizer to EDGE_SCALED allocation with bet size $2.50"
  Should: update allocation_method and bet_size

- "Pause the Explorer"
  Should: execute pause_bot

## 5. MEMORY & NOTES

- "Remember this: NBA underdogs below 25 cents have been profitable"
  Should: create mid_term memory

- "Create a note: Current focus is capital efficiency"
  Should: create note in directive category

- "What's in your notes?"
  Should: query alpha_agent_notes

## 6. HYPOTHESES & EXIT RULES

- "Test a hypothesis: only trade markets that resolve within 6 hours"
  Should: create hypothesis, suggest Explorer

- "Add a stop loss at 20% for the Conservative"
  Should: add exit rule

## 7. PROTOCOLS

- "New protocol: always check time-to-resolution before recommending trades"
  Should: create long_term memory with PROTOCOL prefix

## 8. BROAD INTELLIGENCE

- "Explain Kelly criterion and why we use fractional Kelly"
- "What is the biggest risk to our trading operation right now?"
- "If you had $1000 how would you set up the 3 bots?"

## 9. IMAGES

- Paste a screenshot, then: "What do you see in this chart?"

## 10. COMPLEX CHAINS

- "Find top 3 traders, look up what markets they trade, tell me if any have mispricing"
- "Run a full diagnostic on the Conservative bot"
