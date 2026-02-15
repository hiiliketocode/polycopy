/**
 * Alpha Agent - Data Analyzer
 * Pulls and analyzes performance data across all bots
 * This is the "observation" component of the agent loop
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BotPerformanceSnapshot,
  TradeDetail,
  StrategyComparison,
  ObservationSummary,
} from './types';

// ============================================================================
// 1. Pull ALL bot performance data
// ============================================================================

export async function getAllBotSnapshots(
  supabase: SupabaseClient
): Promise<BotPerformanceSnapshot[]> {
  // Get all wallets with their trade data
  const { data: wallets, error: walletsErr } = await supabase
    .from('ft_wallets')
    .select('*')
    .eq('is_active', true);

  if (walletsErr) throw new Error(`Failed to fetch wallets: ${walletsErr.message}`);
  if (!wallets || wallets.length === 0) return [];

  const snapshots: BotPerformanceSnapshot[] = [];

  for (const wallet of wallets) {
    // Get trade stats for this wallet
    const { data: trades, error: tradesErr } = await supabase
      .from('ft_orders')
      .select('outcome, pnl, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, order_time, resolved_time')
      .eq('wallet_id', wallet.wallet_id);

    if (tradesErr) {
      console.warn(`Failed to fetch trades for ${wallet.wallet_id}: ${tradesErr.message}`);
      continue;
    }

    const allTrades = trades || [];
    const resolvedTrades = allTrades.filter(t => t.outcome === 'WON' || t.outcome === 'LOST');
    const winningTrades = resolvedTrades.filter(t => t.outcome === 'WON');
    const losingTrades = resolvedTrades.filter(t => t.outcome === 'LOST');
    const openTrades = allTrades.filter(t => t.outcome === 'OPEN');

    const totalPnl = resolvedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalVolume = allTrades.reduce((sum, t) => sum + (t.size || 0), 0);
    const winRate = resolvedTrades.length > 0
      ? (winningTrades.length / resolvedTrades.length) * 100
      : 0;
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
      : 0;
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
      : 0;
    const grossProfit = winningTrades.reduce((sum, t) => sum + Math.max(0, t.pnl || 0), 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + Math.min(0, t.pnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const avgEdge = allTrades.length > 0
      ? allTrades.reduce((sum, t) => sum + (t.edge_pct || 0), 0) / allTrades.length
      : 0;
    const mlTrades = allTrades.filter(t => t.model_probability != null);
    const avgModelProb = mlTrades.length > 0
      ? mlTrades.reduce((sum, t) => sum + (t.model_probability || 0), 0) / mlTrades.length
      : null;
    const avgConviction = allTrades.length > 0
      ? allTrades.reduce((sum, t) => sum + (t.conviction || 0), 0) / allTrades.length
      : 0;

    // Time to resolution
    const resolvedWithTimes = resolvedTrades.filter(t => t.order_time && t.resolved_time);
    const avgTimeToResolution = resolvedWithTimes.length > 0
      ? resolvedWithTimes.reduce((sum, t) => {
          const orderTime = new Date(t.order_time).getTime();
          const resolvedTime = new Date(t.resolved_time).getTime();
          return sum + (resolvedTime - orderTime) / (1000 * 60 * 60); // hours
        }, 0) / resolvedWithTimes.length
      : null;

    // Recent performance (last 48h)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentTrades = allTrades.filter(t => t.order_time && t.order_time >= cutoff48h);
    const recentResolved = recentTrades.filter(t => t.outcome === 'WON' || t.outcome === 'LOST');
    const recentWins = recentTrades.filter(t => t.outcome === 'WON');
    const recentPnl = recentResolved.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Check if agent-managed
    let isAgentManaged = false;
    try {
      const desc = wallet.detailed_description ? JSON.parse(wallet.detailed_description) : {};
      isAgentManaged = desc.agent_managed === true;
    } catch { /* ignore */ }

    const roiPct = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0;

    snapshots.push({
      wallet_id: wallet.wallet_id,
      config_id: wallet.config_id,
      strategy_name: wallet.strategy_name || wallet.config_id,
      description: wallet.description || '',
      is_active: wallet.is_active,
      is_agent_managed: isAgentManaged,

      model_threshold: wallet.model_threshold,
      price_min: wallet.price_min,
      price_max: wallet.price_max,
      min_edge: wallet.min_edge,
      use_model: wallet.use_model,
      allocation_method: wallet.allocation_method || 'FIXED',
      kelly_fraction: wallet.kelly_fraction || 0.25,
      bet_size: wallet.bet_size,
      min_bet: wallet.min_bet || 0.50,
      max_bet: wallet.max_bet || 10.00,
      min_trader_resolved_count: wallet.min_trader_resolved_count || 30,
      min_conviction: wallet.min_conviction || 0,
      detailed_description: wallet.detailed_description,

      starting_balance: wallet.starting_balance,
      current_balance: wallet.current_balance,
      total_pnl: totalPnl,
      roi_pct: roiPct,
      total_trades: allTrades.length,
      open_trades: openTrades.length,
      resolved_trades: resolvedTrades.length,
      winning_trades: winningTrades.length,
      losing_trades: losingTrades.length,
      win_rate: winRate,
      avg_win: avgWin,
      avg_loss: avgLoss,
      profit_factor: profitFactor,

      avg_edge: avgEdge,
      avg_model_probability: avgModelProb,
      avg_conviction: avgConviction,
      avg_time_to_resolution_hours: avgTimeToResolution,

      recent_trades: recentTrades.length,
      recent_wins: recentWins.length,
      recent_pnl: recentPnl,
      recent_win_rate: recentResolved.length > 0
        ? (recentWins.length / recentResolved.length) * 100
        : 0,
    });
  }

  return snapshots;
}

// ============================================================================
// 2. Get detailed trades for a specific bot
// ============================================================================

export async function getBotTrades(
  supabase: SupabaseClient,
  walletId: string,
  limit: number = 100
): Promise<TradeDetail[]> {
  const { data, error } = await supabase
    .from('ft_orders')
    .select('order_id, wallet_id, market_title, condition_id, trader_address, entry_price, size, edge_pct, model_probability, conviction, trader_win_rate, outcome, pnl, order_time, resolved_time')
    .eq('wallet_id', walletId)
    .order('order_time', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch trades for ${walletId}: ${error.message}`);

  return (data || []).map(t => ({
    ...t,
    time_to_resolution_hours: t.order_time && t.resolved_time
      ? (new Date(t.resolved_time).getTime() - new Date(t.order_time).getTime()) / (1000 * 60 * 60)
      : null,
  }));
}

// ============================================================================
// 3. Build strategy comparison analysis
// ============================================================================

export async function buildStrategyComparison(
  supabase: SupabaseClient,
  snapshots: BotPerformanceSnapshot[]
): Promise<StrategyComparison> {
  const activeWithTrades = snapshots.filter(s => s.resolved_trades >= 5);

  // By win rate (min 10 trades)
  const byWinRate = activeWithTrades
    .filter(s => s.resolved_trades >= 10)
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, 15)
    .map(s => ({ wallet_id: s.wallet_id, win_rate: s.win_rate, trades: s.resolved_trades }));

  // By ROI
  const byRoi = activeWithTrades
    .sort((a, b) => b.roi_pct - a.roi_pct)
    .slice(0, 15)
    .map(s => ({ wallet_id: s.wallet_id, roi_pct: s.roi_pct, total_pnl: s.total_pnl }));

  // By profit factor
  const byProfitFactor = activeWithTrades
    .filter(s => s.profit_factor !== Infinity && s.profit_factor > 0)
    .sort((a, b) => b.profit_factor - a.profit_factor)
    .slice(0, 15)
    .map(s => ({ wallet_id: s.wallet_id, profit_factor: s.profit_factor }));

  // By edge
  const byEdge = activeWithTrades
    .sort((a, b) => b.avg_edge - a.avg_edge)
    .slice(0, 15)
    .map(s => ({ wallet_id: s.wallet_id, avg_edge: s.avg_edge }));

  // Price band analysis
  const priceBands = [
    { band: '0-20c (Deep Underdog)', min: 0, max: 0.20 },
    { band: '20-40c (Underdog)', min: 0.20, max: 0.40 },
    { band: '40-60c (Coin Flip)', min: 0.40, max: 0.60 },
    { band: '60-80c (Favorite)', min: 0.60, max: 0.80 },
    { band: '80-100c (Heavy Favorite)', min: 0.80, max: 1.00 },
  ];

  const { data: allTrades } = await supabase
    .from('ft_orders')
    .select('entry_price, outcome, pnl, edge_pct')
    .in('outcome', ['WON', 'LOST']);

  const allResolvedTrades = allTrades || [];

  const priceBandPerformance = priceBands.map(band => {
    const bandTrades = allResolvedTrades.filter(t =>
      t.entry_price >= band.min && t.entry_price < band.max
    );
    const wins = bandTrades.filter(t => t.outcome === 'WON');
    return {
      band: band.band,
      trades: bandTrades.length,
      win_rate: bandTrades.length > 0 ? (wins.length / bandTrades.length) * 100 : 0,
      avg_pnl: bandTrades.length > 0
        ? bandTrades.reduce((s, t) => s + (t.pnl || 0), 0) / bandTrades.length
        : 0,
      avg_edge: bandTrades.length > 0
        ? bandTrades.reduce((s, t) => s + (t.edge_pct || 0), 0) / bandTrades.length
        : 0,
    };
  });

  // Allocation method analysis
  const allocationMethods = [...new Set(snapshots.map(s => s.allocation_method))];
  const allocationPerformance = allocationMethods.map(method => {
    const methodBots = activeWithTrades.filter(s => s.allocation_method === method);
    return {
      method,
      wallets_using: methodBots.length,
      avg_roi: methodBots.length > 0
        ? methodBots.reduce((s, b) => s + b.roi_pct, 0) / methodBots.length
        : 0,
      avg_win_rate: methodBots.length > 0
        ? methodBots.reduce((s, b) => s + b.win_rate, 0) / methodBots.length
        : 0,
    };
  }).sort((a, b) => b.avg_roi - a.avg_roi);

  // Time to resolution analysis
  const { data: resolvedTrades } = await supabase
    .from('ft_orders')
    .select('order_time, resolved_time, outcome, pnl')
    .in('outcome', ['WON', 'LOST'])
    .not('resolved_time', 'is', null);

  const tradesWithTime = (resolvedTrades || [])
    .map(t => {
      const hours = (new Date(t.resolved_time).getTime() - new Date(t.order_time).getTime()) / (1000 * 60 * 60);
      return { ...t, hours };
    })
    .filter(t => t.hours > 0 && t.hours < 720); // Filter out unreasonable values

  const timeBuckets = [
    { bucket: '< 2 hours', min: 0, max: 2 },
    { bucket: '2-6 hours', min: 2, max: 6 },
    { bucket: '6-24 hours', min: 6, max: 24 },
    { bucket: '1-3 days', min: 24, max: 72 },
    { bucket: '3-7 days', min: 72, max: 168 },
    { bucket: '7+ days', min: 168, max: 720 },
  ];

  const timeToResolution = timeBuckets.map(bucket => {
    const bucketTrades = tradesWithTime.filter(t => t.hours >= bucket.min && t.hours < bucket.max);
    const wins = bucketTrades.filter(t => t.outcome === 'WON');
    return {
      bucket: bucket.bucket,
      trades: bucketTrades.length,
      win_rate: bucketTrades.length > 0 ? (wins.length / bucketTrades.length) * 100 : 0,
      avg_pnl: bucketTrades.length > 0
        ? bucketTrades.reduce((s, t) => s + (t.pnl || 0), 0) / bucketTrades.length
        : 0,
    };
  });

  // Top traders analysis
  const { data: traderData } = await supabase
    .from('ft_orders')
    .select('trader_address, outcome, pnl')
    .in('outcome', ['WON', 'LOST']);

  const traderMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const t of (traderData || [])) {
    const existing = traderMap.get(t.trader_address) || { trades: 0, wins: 0, pnl: 0 };
    existing.trades++;
    if (t.outcome === 'WON') existing.wins++;
    existing.pnl += (t.pnl || 0);
    traderMap.set(t.trader_address, existing);
  }

  const topTraders = [...traderMap.entries()]
    .filter(([, stats]) => stats.trades >= 5)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 20)
    .map(([addr, stats]) => ({
      trader_address: addr,
      total_trades_copied: stats.trades,
      win_rate: (stats.wins / stats.trades) * 100,
      total_pnl: stats.pnl,
    }));

  // Market category analysis (from market titles)
  const { data: catTrades } = await supabase
    .from('ft_orders')
    .select('market_title, outcome, pnl')
    .in('outcome', ['WON', 'LOST']);

  const categories = ['NBA', 'NFL', 'MLB', 'NHL', 'Soccer', 'Trump', 'Bitcoin', 'Ethereum', 'Election', 'Congress'];
  const categoryPerformance = categories.map(cat => {
    const catMatches = (catTrades || []).filter(t =>
      (t.market_title || '').toLowerCase().includes(cat.toLowerCase())
    );
    const wins = catMatches.filter(t => t.outcome === 'WON');
    return {
      category: cat,
      trades: catMatches.length,
      win_rate: catMatches.length > 0 ? (wins.length / catMatches.length) * 100 : 0,
      avg_pnl: catMatches.length > 0
        ? catMatches.reduce((s, t) => s + (t.pnl || 0), 0) / catMatches.length
        : 0,
    };
  }).filter(c => c.trades > 0).sort((a, b) => b.avg_pnl - a.avg_pnl);

  return {
    by_win_rate: byWinRate,
    by_roi: byRoi,
    by_profit_factor: byProfitFactor,
    by_edge: byEdge,
    price_band_performance: priceBandPerformance,
    allocation_performance: allocationPerformance,
    time_to_resolution: timeToResolution,
    top_traders: topTraders,
    category_performance: categoryPerformance,
  };
}

// ============================================================================
// 4. Build observation summary
// ============================================================================

export async function buildObservationSummary(
  supabase: SupabaseClient,
  snapshots: BotPerformanceSnapshot[]
): Promise<ObservationSummary> {
  const activeBots = snapshots.filter(s => s.is_active);
  const botsWithTrades = activeBots.filter(s => s.resolved_trades > 0);
  const winningBots = botsWithTrades.filter(s => s.total_pnl > 0);
  const losingBots = botsWithTrades.filter(s => s.total_pnl <= 0);

  const totalTradesAll = activeBots.reduce((s, b) => s + b.total_trades, 0);
  const totalPnlAll = activeBots.reduce((s, b) => s + b.total_pnl, 0);
  const avgWinRate = botsWithTrades.length > 0
    ? botsWithTrades.reduce((s, b) => s + b.win_rate, 0) / botsWithTrades.length
    : 0;

  // Best and worst bots (by ROI, min 10 trades)
  const qualifiedBots = botsWithTrades.filter(b => b.resolved_trades >= 10);
  const bestBot = qualifiedBots.length > 0
    ? qualifiedBots.sort((a, b) => b.roi_pct - a.roi_pct)[0]
    : null;
  const worstBot = qualifiedBots.length > 0
    ? qualifiedBots.sort((a, b) => a.roi_pct - b.roi_pct)[0]
    : null;

  // Agent bots
  const agentBots = snapshots.filter(s => s.is_agent_managed);
  const explorer = agentBots.find(b => b.wallet_id === 'ALPHA_EXPLORER') || null;
  const optimizer = agentBots.find(b => b.wallet_id === 'ALPHA_OPTIMIZER') || null;
  const conservative = agentBots.find(b => b.wallet_id === 'ALPHA_CONSERVATIVE') || null;

  // Market regime signals
  const recentWinRates = botsWithTrades
    .filter(b => b.recent_trades >= 3)
    .map(b => b.recent_win_rate);
  const overallRecentWR = recentWinRates.length > 0
    ? recentWinRates.reduce((s, w) => s + w, 0) / recentWinRates.length
    : avgWinRate;

  let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
  if (overallRecentWR > avgWinRate + 5) recentTrend = 'improving';
  else if (overallRecentWR < avgWinRate - 5) recentTrend = 'declining';

  // Volatility from PnL variance
  const pnlValues = botsWithTrades.map(b => b.recent_pnl);
  const pnlMean = pnlValues.length > 0 ? pnlValues.reduce((s, p) => s + p, 0) / pnlValues.length : 0;
  const pnlVariance = pnlValues.length > 0
    ? pnlValues.reduce((s, p) => s + Math.pow(p - pnlMean, 2), 0) / pnlValues.length
    : 0;
  const pnlStdDev = Math.sqrt(pnlVariance);
  let volatility: 'low' | 'medium' | 'high' = 'medium';
  if (pnlStdDev < 1) volatility = 'low';
  else if (pnlStdDev > 5) volatility = 'high';

  return {
    total_bots: snapshots.length,
    active_bots: activeBots.length,
    winning_bots: winningBots.length,
    losing_bots: losingBots.length,
    total_trades_all_bots: totalTradesAll,
    total_pnl_all_bots: totalPnlAll,
    avg_win_rate: avgWinRate,
    best_bot: bestBot ? { wallet_id: bestBot.wallet_id, roi_pct: bestBot.roi_pct, win_rate: bestBot.win_rate } : null,
    worst_bot: worstBot ? { wallet_id: worstBot.wallet_id, roi_pct: worstBot.roi_pct, win_rate: worstBot.win_rate } : null,
    agent_bots_summary: {
      explorer,
      optimizer,
      conservative,
    },
    market_regime_signals: {
      overall_win_rate: avgWinRate,
      recent_trend: recentTrend,
      volatility,
    },
  };
}
