/**
 * Alpha Agent - Supabase Read-Only Query Tool
 * 
 * Gives the agent direct read access to Supabase tables for analyzing
 * live trading performance, positions, market data, and trader stats.
 * 
 * USE CASE SPLIT:
 * - Supabase: Live/recent data — open positions, recent trades, current bot
 *   performance, market prices, trader stats, FT/LT order outcomes
 * - BigQuery: Historical/bulk data — 84M+ trade history, ML training features,
 *   model predictions, historical trader statistics
 * 
 * SAFETY: Read-only queries via Supabase client .select() — no raw SQL,
 * no mutations possible through this interface.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Table Descriptions for the Agent's Context
// ============================================================================

export const SUPABASE_TABLE_DESCRIPTIONS = `## SUPABASE TABLES (Live Platform Data)

### Trading Performance
- **ft_orders**: All forward-testing virtual trades. Key columns: wallet_id, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, trader_address, outcome (OPEN/WON/LOST), pnl, market_title, condition_id, order_time, resolved_time, token_label, market_end_time
- **ft_wallets**: Strategy configurations for all FT bots (66+). Key columns: wallet_id, config_id, display_name, model_threshold, price_min, price_max, min_edge, use_model, allocation_method, kelly_fraction, bet_size, min_bet, max_bet, starting_balance, current_balance, is_active, min_trader_resolved_count, min_conviction, detailed_description
- **lt_orders**: Real-money live trading orders. Key columns: lt_order_id, strategy_id, signal_price, signal_size_usd, executed_price, executed_size_usd, slippage_bps, fill_rate, outcome, pnl, ft_pnl, performance_diff_pct, status (PENDING/FILLED/REJECTED), order_placed_at, resolved_at
- **lt_strategies**: Live trading strategy configs. Key columns: strategy_id, ft_wallet_id, is_active, is_paused, initial_capital, available_cash, locked_capital, cooldown_capital, daily_spent_usd, daily_loss_usd, peak_equity, current_drawdown_pct, circuit_breaker_active, stop_loss_pct, take_profit_pct

### Markets & Traders
- **markets**: Market metadata. Key columns: condition_id, market_slug, title, start_time, end_time, game_start_time, tags, volume_total, winning_side, status
- **traders**: Trader profiles. Key columns: wallet_address, display_name, pnl, volume, roi, rank, total_trades, win_rate
- **trader_global_stats**: Aggregated trader stats. Key columns: wallet_address, global_win_rate, global_roi_pct, total_lifetime_trades, avg_bet_size_usdc, recent_win_rate
- **trader_profile_stats**: Per-niche trader stats. Key columns: wallet_address, final_niche, bet_structure, price_bracket, win_rate, roi_pct, trade_count

### Audit & Analysis
- **ft_seen_trades**: Every trade evaluated (taken + skipped). Key columns: wallet_id, source_trade_id, outcome (TAKEN/SKIPPED), skip_reason, seen_at
- **user_portfolio_summary**: Portfolio stats per user. Key columns: user_id, total_pnl, realized_pnl, unrealized_pnl, roi, win_rate, total_trades, open_positions

### Alpha Agent Tables
- **alpha_agent_memory**: Agent's knowledge base (short/mid/long-term memories)
- **alpha_agent_runs**: History of agent execution cycles
- **alpha_agent_decisions**: Every strategy change with reasoning + outcomes
- **alpha_agent_hypotheses**: Testable hypotheses being tracked
- **alpha_agent_snapshots**: Performance snapshots over time
- **alpha_agent_exit_rules**: Exit/selling strategy rules`;

// ============================================================================
// Pre-built Analytical Queries
// ============================================================================

export interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  count?: number;
  error?: string;
}

/**
 * Get performance summary for all FT wallets (what the agent needs most)
 */
export async function queryAllWalletPerformance(supabase: SupabaseClient): Promise<QueryResult> {
  try {
    const { data: wallets, error } = await supabase
      .from('ft_wallets')
      .select('wallet_id, config_id, display_name, is_active, model_threshold, price_min, price_max, min_edge, use_model, allocation_method, kelly_fraction, bet_size, min_bet, max_bet, min_trader_resolved_count, starting_balance, current_balance, detailed_description')
      .eq('is_active', true);

    if (error) return { success: false, error: error.message };
    return { success: true, data: wallets || [], count: wallets?.length || 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get recent trades for a specific wallet with full details
 */
export async function queryWalletTrades(
  supabase: SupabaseClient,
  walletId: string,
  options: { limit?: number; outcomeFilter?: string } = {}
): Promise<QueryResult> {
  try {
    let query = supabase
      .from('ft_orders')
      .select('order_id, wallet_id, market_title, condition_id, trader_address, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, outcome, pnl, order_time, resolved_time, token_label, market_end_time')
      .eq('wallet_id', walletId)
      .order('order_time', { ascending: false })
      .limit(options.limit || 100);

    if (options.outcomeFilter) {
      query = query.eq('outcome', options.outcomeFilter);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [], count: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get win/loss breakdown by price band across all FT orders
 */
export async function queryPriceBandPerformance(supabase: SupabaseClient): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('entry_price, outcome, pnl, edge_pct, model_probability, conviction')
      .in('outcome', ['WON', 'LOST']);

    if (error) return { success: false, error: error.message };

    const bands = [
      { label: '0-20c', min: 0, max: 0.20 },
      { label: '20-40c', min: 0.20, max: 0.40 },
      { label: '40-60c', min: 0.40, max: 0.60 },
      { label: '60-80c', min: 0.60, max: 0.80 },
      { label: '80-100c', min: 0.80, max: 1.00 },
    ];

    const results = bands.map(band => {
      const trades = (data || []).filter(t => t.entry_price >= band.min && t.entry_price < band.max);
      const wins = trades.filter(t => t.outcome === 'WON');
      const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      const avgEdge = trades.length > 0 ? trades.reduce((s, t) => s + (t.edge_pct || 0), 0) / trades.length : 0;
      return {
        band: band.label,
        trades: trades.length,
        wins: wins.length,
        losses: trades.length - wins.length,
        win_rate: trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) + '%' : 'N/A',
        total_pnl: totalPnl.toFixed(2),
        avg_edge: (avgEdge * 100).toFixed(1) + '%',
      };
    });

    return { success: true, data: results, count: results.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get top performing traders (by PnL from FT orders)
 */
export async function queryTopTraders(
  supabase: SupabaseClient,
  limit: number = 20
): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('trader_address, outcome, pnl, trader_win_rate')
      .in('outcome', ['WON', 'LOST']);

    if (error) return { success: false, error: error.message };

    const traderMap = new Map<string, { trades: number; wins: number; pnl: number; avg_wr: number }>();
    for (const t of (data || [])) {
      const existing = traderMap.get(t.trader_address) || { trades: 0, wins: 0, pnl: 0, avg_wr: 0 };
      existing.trades++;
      if (t.outcome === 'WON') existing.wins++;
      existing.pnl += (t.pnl || 0);
      existing.avg_wr += (t.trader_win_rate || 0);
      traderMap.set(t.trader_address, existing);
    }

    const results = [...traderMap.entries()]
      .filter(([, s]) => s.trades >= 5)
      .map(([addr, s]) => ({
        trader: addr.substring(0, 8) + '...' + addr.substring(addr.length - 4),
        full_address: addr,
        trades: s.trades,
        wins: s.wins,
        win_rate: ((s.wins / s.trades) * 100).toFixed(1) + '%',
        total_pnl: s.pnl.toFixed(2),
        avg_trader_wr: ((s.avg_wr / s.trades) * 100).toFixed(1) + '%',
      }))
      .sort((a, b) => parseFloat(b.total_pnl) - parseFloat(a.total_pnl))
      .slice(0, limit);

    return { success: true, data: results, count: results.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get market category performance from resolved FT orders
 */
export async function queryMarketCategoryPerformance(supabase: SupabaseClient): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('market_title, outcome, pnl, entry_price')
      .in('outcome', ['WON', 'LOST']);

    if (error) return { success: false, error: error.message };

    const categories: Record<string, string[]> = {
      'NBA': ['nba'],
      'NFL': ['nfl'],
      'MLB': ['mlb'],
      'NHL': ['nhl'],
      'Soccer': ['soccer', 'premier league', 'la liga', 'champions league', 'mls'],
      'UFC/MMA': ['ufc', 'mma'],
      'Politics': ['trump', 'biden', 'congress', 'senate', 'election', 'president'],
      'Crypto': ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'crypto'],
      'Weather': ['temperature', 'weather'],
    };

    const results: Record<string, unknown>[] = [];
    for (const [cat, keywords] of Object.entries(categories)) {
      const trades = (data || []).filter(t =>
        keywords.some(kw => (t.market_title || '').toLowerCase().includes(kw))
      );
      if (trades.length === 0) continue;
      const wins = trades.filter(t => t.outcome === 'WON');
      const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      results.push({
        category: cat,
        trades: trades.length,
        wins: wins.length,
        win_rate: ((wins.length / trades.length) * 100).toFixed(1) + '%',
        total_pnl: totalPnl.toFixed(2),
        avg_entry_price: (trades.reduce((s, t) => s + (t.entry_price || 0), 0) / trades.length).toFixed(3),
      });
    }

    results.sort((a, b) => parseFloat(b.total_pnl as string) - parseFloat(a.total_pnl as string));
    return { success: true, data: results, count: results.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get time-to-resolution analysis
 */
export async function queryTimeToResolution(supabase: SupabaseClient): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('order_time, resolved_time, outcome, pnl, entry_price')
      .in('outcome', ['WON', 'LOST'])
      .not('resolved_time', 'is', null);

    if (error) return { success: false, error: error.message };

    const buckets = [
      { label: '< 2 hours', min: 0, max: 2 },
      { label: '2-6 hours', min: 2, max: 6 },
      { label: '6-24 hours', min: 6, max: 24 },
      { label: '1-3 days', min: 24, max: 72 },
      { label: '3-7 days', min: 72, max: 168 },
      { label: '7+ days', min: 168, max: 9999 },
    ];

    const results = buckets.map(bucket => {
      const trades = (data || []).filter(t => {
        const hours = (new Date(t.resolved_time).getTime() - new Date(t.order_time).getTime()) / (1000 * 60 * 60);
        return hours >= bucket.min && hours < bucket.max && hours > 0;
      });
      const wins = trades.filter(t => t.outcome === 'WON');
      const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0);
      return {
        time_bucket: bucket.label,
        trades: trades.length,
        wins: wins.length,
        win_rate: trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(1) + '%' : 'N/A',
        total_pnl: totalPnl.toFixed(2),
        avg_pnl: trades.length > 0 ? (totalPnl / trades.length).toFixed(2) : '0.00',
      };
    });

    return { success: true, data: results, count: results.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get skip reason analysis from ft_seen_trades
 */
export async function querySkipReasons(
  supabase: SupabaseClient,
  walletId?: string
): Promise<QueryResult> {
  try {
    let query = supabase
      .from('ft_seen_trades')
      .select('wallet_id, outcome, skip_reason')
      .eq('outcome', 'SKIPPED');

    if (walletId) {
      query = query.eq('wallet_id', walletId);
    }

    const { data, error } = await query.limit(10000);
    if (error) return { success: false, error: error.message };

    const reasonMap = new Map<string, number>();
    for (const t of (data || [])) {
      const reason = t.skip_reason || 'unknown';
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }

    const results = [...reasonMap.entries()]
      .map(([reason, count]) => ({ skip_reason: reason, count }))
      .sort((a, b) => b.count - a.count);

    return { success: true, data: results, count: results.length };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get LT execution quality metrics
 */
export async function queryLTExecutionQuality(supabase: SupabaseClient): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('lt_orders')
      .select('strategy_id, status, slippage_bps, fill_rate, execution_latency_ms, signal_price, executed_price, signal_size_usd, executed_size_usd, outcome, pnl, ft_pnl, performance_diff_pct');

    if (error) return { success: false, error: error.message };

    const filled = (data || []).filter(o => o.status === 'FILLED');
    const rejected = (data || []).filter(o => o.status === 'REJECTED');
    const slippages = filled.filter(o => o.slippage_bps != null).map(o => o.slippage_bps);
    const latencies = filled.filter(o => o.execution_latency_ms != null).map(o => o.execution_latency_ms);

    const medianSlippage = slippages.length > 0
      ? slippages.sort((a, b) => a - b)[Math.floor(slippages.length / 2)]
      : null;
    const avgLatency = latencies.length > 0
      ? latencies.reduce((s, l) => s + l, 0) / latencies.length
      : null;

    return {
      success: true,
      data: [{
        total_orders: (data || []).length,
        filled: filled.length,
        rejected: rejected.length,
        fill_rate: (data || []).length > 0 ? ((filled.length / (data || []).length) * 100).toFixed(1) + '%' : 'N/A',
        median_slippage_bps: medianSlippage,
        avg_latency_ms: avgLatency?.toFixed(0),
        total_pnl: filled.reduce((s, o) => s + (o.pnl || 0), 0).toFixed(2),
        ft_vs_lt_pnl_diff: filled.filter(o => o.performance_diff_pct != null).length > 0
          ? (filled.reduce((s, o) => s + (o.performance_diff_pct || 0), 0) / filled.filter(o => o.performance_diff_pct != null).length).toFixed(2) + '%'
          : 'N/A',
      }],
      count: 1,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Flexible query: get recent trades across all wallets matching criteria
 */
export async function queryTradesByCriteria(
  supabase: SupabaseClient,
  criteria: {
    minEdge?: number;
    maxEdge?: number;
    minModelProb?: number;
    minConviction?: number;
    minTraderWR?: number;
    outcome?: string;
    limit?: number;
  }
): Promise<QueryResult> {
  try {
    let query = supabase
      .from('ft_orders')
      .select('wallet_id, market_title, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, trader_address, outcome, pnl, order_time')
      .order('order_time', { ascending: false })
      .limit(criteria.limit || 200);

    if (criteria.minEdge != null) query = query.gte('edge_pct', criteria.minEdge);
    if (criteria.maxEdge != null) query = query.lte('edge_pct', criteria.maxEdge);
    if (criteria.minModelProb != null) query = query.gte('model_probability', criteria.minModelProb);
    if (criteria.minConviction != null) query = query.gte('conviction', criteria.minConviction);
    if (criteria.minTraderWR != null) query = query.gte('trader_win_rate', criteria.minTraderWR);
    if (criteria.outcome) query = query.eq('outcome', criteria.outcome);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [], count: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get trader global stats for specific wallets
 */
export async function queryTraderStats(
  supabase: SupabaseClient,
  walletAddresses: string[]
): Promise<QueryResult> {
  try {
    const { data, error } = await supabase
      .from('trader_global_stats')
      .select('wallet_address, global_win_rate, global_roi_pct, total_lifetime_trades, avg_bet_size_usdc, recent_win_rate')
      .in('wallet_address', walletAddresses.map(a => a.toLowerCase()));

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [], count: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
