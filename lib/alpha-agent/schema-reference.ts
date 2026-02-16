/**
 * Alpha Agent — Schema & Data Reference
 *
 * This is the agent's permanent reference context (like a custom GPT's knowledge base).
 * It is injected into every chat prompt so the agent always has accurate schema knowledge.
 *
 * Source of truth: docs/alpha-agent/SCHEMA_REFERENCE.md
 * Keep this in sync when the schema changes.
 */

export const SCHEMA_REFERENCE = `## REFERENCE: SCHEMA & DATA (always consult — this is your permanent knowledge)

Use exact column names. **ft_wallets has total_pnl, NOT pnl.**

### Data Sources
- **Supabase**: Live data — bots, orders, markets, traders. Use query_supabase.
- **BigQuery**: Historical 84M+ trades, ML features. Use query_bigquery.
- **Dome/Gamma**: Live Polymarket markets. Use search_markets (keyword) and get_market_price (condition_id).

### Supabase — Key Schemas

**ft_wallets** (strategy configs): wallet_id, config_id, display_name, model_threshold, price_min, price_max, min_edge, use_model, allocation_method, kelly_fraction, bet_size, min_bet, max_bet, **total_pnl** (NOT pnl), starting_balance, current_balance, is_active, min_trader_resolved_count, min_conviction, detailed_description
→ Top by PnL: order_by: "total_pnl", ascending: false

**ft_orders** (virtual trades): order_id, wallet_id, condition_id, market_title, trader_address, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, outcome (OPEN/WON/LOST), **pnl**, order_time, resolved_time, token_label

**lt_orders**: lt_order_id, strategy_id, signal_price, executed_price, outcome, pnl, ft_pnl, status
**lt_strategies**: strategy_id, ft_wallet_id, is_active, initial_capital, available_cash, peak_equity, current_drawdown_pct
**markets**: condition_id, market_slug, title, volume_total, winning_side
**traders**: wallet_address, display_name, pnl, volume, roi, win_rate
**trader_global_stats**: wallet_address, global_win_rate, global_roi_pct, total_lifetime_trades
**trader_profile_stats**: wallet_address, final_niche, bet_structure, win_rate, roi_pct
**alpha_agent_***: alpha_agent_memory, alpha_agent_runs, alpha_agent_snapshots, alpha_agent_hypotheses, alpha_agent_notes, alpha_agent_bots

### Dome & Gamma
- **search_markets**: { query: "NBA Finals", limit: 10 } — keyword search (Gamma)
- **get_market_price**: { condition_id: "0x..." } — live price (Dome)

### Common Mistakes
1. ft_wallets.pnl — does not exist. Use total_pnl.
2. order_by: "pnl" on ft_wallets — wrong. Use order_by: "total_pnl".
3. Dome/Gamma — use search_markets and get_market_price, not separate actions.
4. Per-wallet PnL — use ft_wallets.total_pnl or aggregate ft_orders.pnl by wallet_id.`;
