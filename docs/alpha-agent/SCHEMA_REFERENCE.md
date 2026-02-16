# Alpha Agent — Schema & Data Reference

This doc is the agent's **permanent reference context** (like a custom GPT's knowledge base). It is injected into every chat prompt and stored in long-term memory, so the agent always has accurate schema knowledge.

**Use exact column names** — e.g. `ft_wallets` has `total_pnl`, NOT `pnl`.

---

## Data Sources Overview

| Source | Use For | Notes |
|--------|---------|-------|
| **Supabase** | Live platform data — bots, orders, markets, traders | Current state, recent trades |
| **BigQuery** | Historical bulk data — 84M+ trades, ML features | Pattern analysis, backtests |
| **Dome / Gamma** | Live Polymarket market data | Prices, search, volumes via `search_markets` and `get_market_price` |

---

## Supabase Tables — Exact Schemas

### ft_wallets (strategy configs, ~66+ bots)

**CRITICAL: Use `total_pnl` — there is NO `pnl` column.**

| Column | Type | Notes |
|--------|------|-------|
| wallet_id | TEXT | PK, e.g. ALPHA_EXPLORER |
| config_id | TEXT | |
| display_name | TEXT | |
| model_threshold | DECIMAL | ML probability threshold (0.50–0.90) |
| price_min, price_max | DECIMAL | Entry price band (0–1) |
| min_edge | DECIMAL | Min edge (win_rate − price) |
| use_model | BOOLEAN | Use ML filter |
| allocation_method | TEXT | FIXED, KELLY, EDGE_SCALED, TIERED, CONFIDENCE, WHALE |
| kelly_fraction | DECIMAL | 0.25 = quarter Kelly |
| bet_size, min_bet, max_bet | DECIMAL | Sizing |
| min_trader_resolved_count | INT | Min trades from trader |
| min_conviction | DECIMAL | Conviction multiplier |
| **total_pnl** | DECIMAL | Cumulative PnL (use this for "top by PnL") |
| starting_balance, current_balance | DECIMAL | |
| is_active | BOOLEAN | |
| total_trades, open_positions | INT | |
| detailed_description | JSONB | May contain agent_managed |

**Example:** Top 5 wallets by PnL → `query_supabase` with `table: "ft_wallets"`, `select: "wallet_id, display_name, total_pnl, roi_pct"`, `order_by: "total_pnl"`, `ascending: false`, `limit: 5`

---

### ft_orders (virtual trades)

| Column | Type | Notes |
|--------|------|-------|
| order_id | UUID | PK |
| wallet_id | TEXT | FK to ft_wallets |
| condition_id | TEXT | Polymarket market |
| market_title | TEXT | |
| trader_address | TEXT | Copied trader |
| entry_price | DECIMAL | 0–1 |
| size | DECIMAL | Bet size USD |
| edge_pct | DECIMAL | trader_win_rate − entry_price |
| model_probability | DECIMAL | ML score |
| conviction | DECIMAL | Trade size vs trader avg |
| trader_win_rate | DECIMAL | |
| outcome | TEXT | OPEN, WON, LOST |
| **pnl** | DECIMAL | Profit/loss (only when resolved) |
| order_time, resolved_time | TIMESTAMPTZ | |
| token_label | TEXT | YES or NO |

**PnL lives here per trade.** For wallet-level PnL, aggregate from ft_orders or use ft_wallets.total_pnl.

---

### lt_orders (real-money live trades)

| Column | Type |
|--------|------|
| lt_order_id | UUID |
| strategy_id | TEXT |
| signal_price, signal_size_usd | DECIMAL |
| executed_price, executed_size_usd | DECIMAL |
| slippage_bps | INT |
| outcome | TEXT |
| **pnl** | DECIMAL |
| ft_pnl | DECIMAL |
| status | TEXT |

---

### lt_strategies (live strategy configs)

| Column | Type |
|--------|------|
| strategy_id | TEXT |
| ft_wallet_id | TEXT |
| is_active | BOOLEAN |
| initial_capital, available_cash | DECIMAL |
| peak_equity, current_drawdown_pct | DECIMAL |

---

### markets (Polymarket metadata)

| Column | Type |
|--------|------|
| condition_id | TEXT |
| market_slug, title | TEXT |
| start_time, end_time | TIMESTAMPTZ |
| volume_total | NUMERIC |
| winning_side | TEXT |

---

### traders, trader_global_stats, trader_profile_stats

- **traders**: wallet_address, display_name, **pnl**, volume, roi, win_rate
- **trader_global_stats**: wallet_address, global_win_rate, global_roi_pct, total_lifetime_trades
- **trader_profile_stats**: wallet_address, final_niche, bet_structure, win_rate, roi_pct

---

### alpha_agent_* (agent tables)

- **alpha_agent_snapshots**: total_pnl, realized_pnl, win_rate, roi_pct, profit_factor
- **alpha_agent_memory**: memory_tier, memory_type, title, content, tags
- **alpha_agent_notes**: note_id, title, content, category
- **alpha_agent_hypotheses**: title, status, assigned_bot_id

---

## Dome & Gamma — Live Market Data

**Dome** and **Gamma** are Polymarket’s APIs for live market data. The agent accesses them via:

1. **search_markets** — Search by keyword (uses Gamma API)
   - `parameters: { query: "NBA Finals", limit: 10 }`
   - Returns market titles, prices, volumes

2. **get_market_price** — Get price + metadata for a market (uses Dome API)
   - `parameters: { condition_id: "0x..." }`
   - Returns current outcome prices, volume, market details

**When to use:** "What’s the price of X?", "Search for markets about Y", "Find live markets on Z".

---

## BigQuery Tables

- **trades** (84M): Raw Polymarket trades
- **markets**: Market metadata
- **trader_stats_at_trade** (46M): Point-in-time trader stats
- **enriched_trades_v13** (40M): 34 ML features
- **trade_predictions_pnl_weighted**: Model predictions

Use `query_bigquery` with SQL. Dataset: `gen-lang-client-0299056258.polycopy_v1`

---

## Common Mistakes to Avoid

1. **ft_wallets.pnl** — Does not exist. Use **total_pnl**.
2. **order_by: "pnl"** on ft_wallets — Wrong. Use **order_by: "total_pnl"**.
3. **Dome / Gamma** — Not separate actions. Use **search_markets** and **get_market_price**.
4. **Aggregating PnL** — For per-wallet PnL from orders, query ft_orders and sum pnl by wallet_id, or use ft_wallets.total_pnl.
