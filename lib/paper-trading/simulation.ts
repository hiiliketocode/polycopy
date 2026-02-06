// Paper Trading Simulation Engine
// Runs backtests and live simulations for all strategies

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  StrategyType,
  SimulationConfig,
  SimulationResult,
  TradeSignal,
  PortfolioState,
  PaperTrade,
  BetStructure,
} from './types';
import {
  STRATEGY_CONFIGS,
  getStrategyConfig,
} from './strategies';
import {
  createPortfolio,
  attemptTrade,
  resolveTrade,
  processCooldowns,
  isSimulationActive,
  getPortfolioValue,
  getPerformanceMetrics,
} from './portfolio';

// Default simulation config
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  mode: 'backtest',
  sizingMode: 'controlled',  // Deprecated - all strategies use edge-based sizing
  durationDays: 4,
  initialCapital: 1000,
  slippagePct: 0.04,      // 4%
  cooldownHours: 3,
  controlledPositionUsd: 50,  // Deprecated - edge-based sizing now
  useHistoricalData: true,
  strategies: ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'],
};

// ============================================================================
// BACKTEST PERIODS
// Multiple 4-day windows for statistical validity
// Each window is at least 4 days apart
// ============================================================================

export interface BacktestPeriod {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  description?: string;
}

// Generate backtest periods from recent history
// Returns multiple non-overlapping 4-day windows
export function generateBacktestPeriods(
  numPeriods: number = 4,
  durationDays: number = 4,
  gapDays: number = 4,  // Minimum days between periods
  referenceDate: Date = new Date()
): BacktestPeriod[] {
  const periods: BacktestPeriod[] = [];
  
  // Start from most recent and work backwards
  // Leave 1 day buffer from "now" to ensure markets have resolved
  let currentEnd = new Date(referenceDate);
  currentEnd.setDate(currentEnd.getDate() - 1);  // 1 day buffer
  
  for (let i = 0; i < numPeriods; i++) {
    const endDate = new Date(currentEnd);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - durationDays);
    
    periods.push({
      id: `period-${i + 1}`,
      name: `Period ${i + 1}`,
      startDate,
      endDate,
      description: `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
    });
    
    // Move back for next period (duration + gap)
    currentEnd = new Date(startDate);
    currentEnd.setDate(currentEnd.getDate() - gapDays);
  }
  
  // Reverse so oldest is first (chronological order)
  return periods.reverse();
}

// Result from running multiple backtests
export interface MultiPeriodBacktestResult {
  periods: BacktestPeriod[];
  results: SimulationResult[];
  aggregatedRankings: Array<{
    strategy: StrategyType;
    avgRoi: number;
    avgWinRate: number;
    totalTrades: number;
    avgMaxDrawdown: number;
    consistency: number;  // How often this strategy was in top 2
    periodsWon: number;   // How many periods this strategy won
  }>;
  logs: string[];
}

export interface SimulationState {
  config: SimulationConfig;
  portfolios: Record<StrategyType, PortfolioState>;
  valueHistory: Record<StrategyType, Array<{ timestamp: number; portfolioValue: number }>>;
  startedAt: number;
  currentTime: number;
  logs: string[];
}

// Initialize simulation state
export function initializeSimulation(config: Partial<SimulationConfig> = {}): SimulationState {
  const fullConfig: SimulationConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };
  const startTime = fullConfig.startTimestamp || Date.now();
  
  // Initialize portfolios for each strategy
  const portfolios: Record<StrategyType, PortfolioState> = {} as any;
  const valueHistory: Record<StrategyType, Array<{ timestamp: number; portfolioValue: number }>> = {} as any;
  
  for (const strategy of fullConfig.strategies) {
    portfolios[strategy] = createPortfolio(
      strategy,
      fullConfig.initialCapital,
      fullConfig.durationDays,
      startTime
    );
    valueHistory[strategy] = [{ timestamp: startTime, portfolioValue: fullConfig.initialCapital }];
  }
  
  return {
    config: fullConfig,
    portfolios,
    valueHistory,
    startedAt: startTime,
    currentTime: startTime,
    logs: [`[${new Date(startTime).toISOString()}] Simulation initialized with $${fullConfig.initialCapital} per strategy`],
  };
}

// Process a trade signal for all strategies
// ALL strategies use the same EDGE-BASED position sizing
// The only difference is entry criteria
export function processSignal(
  state: SimulationState,
  signal: TradeSignal
): SimulationState {
  const updatedState = { ...state };
  const timestamp = signal.timestamp || updatedState.currentTime;
  
  for (const strategyType of updatedState.config.strategies) {
    const portfolio = updatedState.portfolios[strategyType];
    
    // Skip if simulation ended for this strategy
    if (!isSimulationActive(portfolio, timestamp)) {
      continue;
    }
    
    // Attempt to enter the trade (edge-based sizing for all)
    const { portfolio: newPortfolio, trade, reason } = attemptTrade(
      portfolio,
      signal,
      updatedState.config.slippagePct,
      timestamp
      // No controlled size - all strategies use edge-based sizing
    );
    
    updatedState.portfolios[strategyType] = newPortfolio;
    
    // Log the result
    const config = getStrategyConfig(strategyType);
    if (trade) {
      updatedState.logs.push(
        `[${new Date(timestamp).toISOString()}] [${config.name}] ENTERED: ${signal.marketTitle.slice(0, 40)}... ` +
        `| ${signal.outcome} @ $${trade.entryPrice.toFixed(3)} | Size: $${trade.investedUsd.toFixed(2)} | Edge: ${(signal.aiEdge ?? 0).toFixed(1)}%`
      );
      
      // Update value history
      updatedState.valueHistory[strategyType].push({
        timestamp,
        portfolioValue: getPortfolioValue(newPortfolio),
      });
    } else if (signal.valueScore && signal.valueScore > 40) {
      // Only log rejections for signals that were somewhat interesting
      updatedState.logs.push(
        `[${new Date(timestamp).toISOString()}] [${config.name}] SKIPPED: ${signal.marketTitle.slice(0, 30)}... | ${reason}`
      );
    }
  }
  
  updatedState.currentTime = timestamp;
  return updatedState;
}

// Resolve trades when markets settle
export function resolveMarket(
  state: SimulationState,
  conditionId: string,
  winningOutcome: 'YES' | 'NO',
  resolutionTime: number
): SimulationState {
  const updatedState = { ...state };
  
  for (const strategyType of updatedState.config.strategies) {
    const portfolio = updatedState.portfolios[strategyType];
    
    // Find any open positions in this market
    const positionsToResolve = portfolio.openPositions.filter(
      p => p.conditionId === conditionId
    );
    
    for (const position of positionsToResolve) {
      const { portfolio: newPortfolio, trade, pnl } = resolveTrade(
        updatedState.portfolios[strategyType],
        position.id,
        winningOutcome,
        resolutionTime,
        updatedState.config.cooldownHours
      );
      
      updatedState.portfolios[strategyType] = newPortfolio;
      
      if (trade) {
        const config = getStrategyConfig(strategyType);
        const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
        updatedState.logs.push(
          `[${new Date(resolutionTime).toISOString()}] [${config.name}] ${trade.status}: ${trade.marketTitle.slice(0, 40)}... ` +
          `| ${trade.outcome} (Winner: ${winningOutcome}) | P&L: ${pnlStr} (${trade.roiPercent?.toFixed(1)}%)`
        );
        
        // Update value history
        updatedState.valueHistory[strategyType].push({
          timestamp: resolutionTime,
          portfolioValue: getPortfolioValue(newPortfolio),
        });
      }
    }
  }
  
  updatedState.currentTime = resolutionTime;
  return updatedState;
}

// Advance time (for processing cooldowns)
export function advanceTime(state: SimulationState, newTime: number): SimulationState {
  const updatedState = { ...state };
  
  for (const strategyType of updatedState.config.strategies) {
    updatedState.portfolios[strategyType] = processCooldowns(
      updatedState.portfolios[strategyType],
      newTime
    );
  }
  
  updatedState.currentTime = newTime;
  return updatedState;
}

// Generate final results
export function generateResults(state: SimulationState): SimulationResult {
  const rankings = state.config.strategies.map(strategy => {
    const portfolio = state.portfolios[strategy];
    const metrics = getPerformanceMetrics(portfolio);
    
    return {
      strategy,
      finalValue: metrics.totalValue,
      totalPnL: metrics.totalPnL,
      roi: metrics.totalPnLPercent,
      winRate: metrics.winRate,
      totalTrades: metrics.totalTrades,
      maxDrawdown: metrics.maxDrawdown,
      sharpeRatio: metrics.sharpeRatio,
    };
  });
  
  // Sort by ROI (highest first)
  rankings.sort((a, b) => b.roi - a.roi);
  
  return {
    config: state.config,
    portfolios: state.portfolios,
    rankings,
    valueHistory: state.valueHistory,
    completedAt: state.currentTime,
    durationMs: state.currentTime - state.startedAt,
  };
}

// Convert raw trade data to TradeSignal
export function tradeToSignal(
  trade: any,
  polyScoreData?: any,
  traderStats?: any
): TradeSignal {
  // Determine bet structure from market data
  let betStructure: BetStructure = 'STANDARD';
  const title = (trade.title || trade.question || '').toLowerCase();
  if (title.includes('over') || title.includes('under') || title.includes('o/u') || title.includes('total')) {
    betStructure = 'OVER_UNDER';
  } else if (title.includes('spread') || title.includes('handicap') || / [+-]\d/.test(title)) {
    betStructure = 'SPREAD';
  } else if (title.includes('winner') || title.includes('champion') || title.includes('win the')) {
    betStructure = 'WINNER';
  }
  
  // Normalize outcome to YES/NO (map Up/Down to YES/NO)
  let rawOutcome = (trade.outcome || trade.option || 'YES').toUpperCase();
  let normalizedOutcome: 'YES' | 'NO' = 'YES';
  if (rawOutcome === 'YES' || rawOutcome === 'UP' || rawOutcome === 'TRUE') {
    normalizedOutcome = 'YES';
  } else if (rawOutcome === 'NO' || rawOutcome === 'DOWN' || rawOutcome === 'FALSE') {
    normalizedOutcome = 'NO';
  }
  
  return {
    conditionId: trade.conditionId || trade.condition_id,
    tokenId: trade.tokenId || trade.token_id,
    marketSlug: trade.marketSlug || trade.slug || trade.market_slug,
    marketTitle: trade.title || trade.question || trade.market || 'Unknown Market',
    outcome: normalizedOutcome,
    currentPrice: Number(trade.price) || 0.5,
    timestamp: typeof trade.timestamp === 'string' 
      ? parseInt(trade.timestamp) 
      : (trade.timestamp < 10000000000 ? trade.timestamp * 1000 : trade.timestamp),
    
    // Scoring data (from PolyScore API)
    valueScore: polyScoreData?.valueScore,
    polyscore: polyScoreData?.polyscore,
    aiEdge: polyScoreData?.valuation?.real_edge_pct,
    aiProbability: polyScoreData?.valuation?.ai_fair_value,
    
    // Trader stats
    traderWinRate: traderStats?.globalWinRate || traderStats?.winRate,
    traderRoi: traderStats?.globalRoiPct || traderStats?.roi,
    conviction: trade._fireConviction || traderStats?.conviction,
    
    // Market classification
    betStructure,
    niche: trade.category || trade.niche || polyScoreData?.analysis?.niche_name,
    
    // Reference to original
    originalTradeId: trade.id || trade.trade_id,
    walletAddress: trade.wallet || trade.user || trade._followedWallet,
    traderName: trade.traderName || trade.displayName,
  };
}

// Run a complete backtest using historical data from database
export async function runBacktest(
  supabase: SupabaseClient,
  config: Partial<SimulationConfig> = {}
): Promise<{ result: SimulationResult; logs: string[] }> {
  const fullConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config, useHistoricalData: true };
  
  // Calculate date range
  const endDate = fullConfig.historicalEndDate 
    ? new Date(fullConfig.historicalEndDate) 
    : new Date();
  const startDate = fullConfig.historicalStartDate 
    ? new Date(fullConfig.historicalStartDate)
    : new Date(endDate.getTime() - (fullConfig.durationDays * 24 * 60 * 60 * 1000));
  
  // Initialize simulation
  let state = initializeSimulation({
    ...fullConfig,
    startTimestamp: startDate.getTime(),
  });
  
  state.logs.push(`[BACKTEST] Running from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  // Fetch historical trades from top traders
  // Using top5_trades_with_markets view which has market metadata
  const { data: trades, error: tradesError } = await supabase
    .from('top5_trades_with_markets')
    .select('*')
    .gte('timestamp', startDate.toISOString())
    .lte('timestamp', endDate.toISOString())
    .eq('side', 'BUY')
    .order('timestamp', { ascending: true })
    .limit(1000);
  
  if (tradesError) {
    throw new Error(`Failed to fetch trades: ${tradesError.message}`);
  }
  
  state.logs.push(`[BACKTEST] Loaded ${trades?.length || 0} historical trades`);
  
  // Fetch market resolutions
  const conditionIds = [...new Set((trades || []).map(t => t.condition_id).filter(Boolean))];
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, market_winning_side, market_resolved_outcome, market_closed')
    .in('condition_id', conditionIds);
  
  const marketResolutions = new Map<string, { winner: 'YES' | 'NO' | null; closed: boolean }>();
  (markets || []).forEach(m => {
    let winner: 'YES' | 'NO' | null = null;
    if (m.market_winning_side === 'Yes' || m.market_resolved_outcome === 'Yes') winner = 'YES';
    else if (m.market_winning_side === 'No' || m.market_resolved_outcome === 'No') winner = 'NO';
    marketResolutions.set(m.condition_id, { winner, closed: m.market_closed });
  });
  
  state.logs.push(`[BACKTEST] Loaded ${marketResolutions.size} market resolutions`);
  
  // Process each trade chronologically
  for (const trade of (trades || [])) {
    // Convert to signal
    const signal = tradeToSignal(trade, null, null);
    
    // For backtest, we'll simulate value scores based on available data
    // In a real scenario, we'd have historical PolyScore data
    const simulatedValueScore = calculateSimulatedValueScore(trade);
    signal.valueScore = simulatedValueScore.valueScore;
    signal.aiEdge = simulatedValueScore.edge;
    signal.polyscore = simulatedValueScore.polyscore;
    
    // Process the signal
    state = processSignal(state, signal);
    
    // Check for resolution
    const resolution = marketResolutions.get(trade.condition_id);
    if (resolution?.winner && resolution.closed) {
      // Market resolved - check if any of our positions are in this market
      // Simulate resolution happening shortly after our entry (simplified)
      const resolutionTime = signal.timestamp + (2 * 60 * 60 * 1000); // 2 hours later
      state = resolveMarket(state, trade.condition_id, resolution.winner, resolutionTime);
    }
  }
  
  // End the simulation
  state = advanceTime(state, endDate.getTime());
  
  // Generate final results
  const result = generateResults(state);
  
  return { result, logs: state.logs };
}

// Simulate a value score for backtesting (when we don't have historical PolyScore data)
function calculateSimulatedValueScore(trade: any): { valueScore: number; edge: number; polyscore: number } {
  let valueScore = 50; // Base score
  let edge = 0;
  let polyscore = 50;
  
  // Price-based edge estimation
  const price = Number(trade.price) || 0.5;
  
  // Heavy favorites (>75%) often have less edge
  if (price > 0.75) {
    edge = -3;
    valueScore -= 10;
  } 
  // Slight favorites (55-75%) - moderate edge opportunity
  else if (price > 0.55) {
    edge = 2;
    valueScore += 5;
  }
  // Near even (45-55%) - good edge opportunity
  else if (price > 0.45) {
    edge = 5;
    valueScore += 10;
  }
  // Underdogs (25-45%) - high risk/reward
  else if (price > 0.25) {
    edge = 8;
    valueScore += 15;
  }
  // Heavy underdogs (<25%) - very high risk
  else {
    edge = 3;
    valueScore += 5;
  }
  
  // Adjust based on trade size (larger = more conviction)
  const tradeSize = Number(trade.shares_normalized) * price || 0;
  if (tradeSize > 1000) {
    valueScore += 15;
    polyscore += 15;
  } else if (tradeSize > 500) {
    valueScore += 10;
    polyscore += 10;
  } else if (tradeSize > 100) {
    valueScore += 5;
    polyscore += 5;
  }
  
  // Bet structure adjustment
  const title = (trade.title || trade.market_title || '').toLowerCase();
  const isOverUnder = title.includes('over') || title.includes('under') || title.includes('total');
  const isSpread = title.includes('spread') || title.includes('handicap');
  
  if (isOverUnder || isSpread) {
    // Props/Spreads have narrower edges typically
    edge *= 0.7;
    valueScore -= 5;
  }
  
  // Cap scores
  valueScore = Math.min(100, Math.max(0, valueScore));
  polyscore = Math.min(100, Math.max(0, polyscore));
  
  return { valueScore, edge, polyscore };
}

// ============================================================================
// MULTI-PERIOD BACKTESTING
// Run backtests across multiple time windows for statistical validity
// ============================================================================

export async function runMultiPeriodBacktest(
  supabase: SupabaseClient,
  config: Partial<SimulationConfig> = {},
  numPeriods: number = 4,
  gapDays: number = 4
): Promise<MultiPeriodBacktestResult> {
  const fullConfig = { ...DEFAULT_SIMULATION_CONFIG, ...config };
  const logs: string[] = [];
  
  // Generate the test periods
  const periods = generateBacktestPeriods(
    numPeriods,
    fullConfig.durationDays,
    gapDays
  );
  
  logs.push('═══════════════════════════════════════════════════════════════════════════════');
  logs.push('                     MULTI-PERIOD BACKTEST STARTING                            ');
  logs.push('═══════════════════════════════════════════════════════════════════════════════');
  logs.push(`Periods: ${numPeriods} x ${fullConfig.durationDays} days (${gapDays}-day gaps)`);
  logs.push(`Initial Capital: $${fullConfig.initialCapital} per strategy per period`);
  logs.push(`Strategies: ${fullConfig.strategies.join(', ')}`);
  logs.push('');
  
  periods.forEach((p, i) => {
    logs.push(`  ${i + 1}. ${p.description}`);
  });
  logs.push('');
  
  // Run backtest for each period
  const results: SimulationResult[] = [];
  
  for (const period of periods) {
    logs.push(`───────────────────────────────────────────────────────────────────────────────`);
    logs.push(`Starting backtest: ${period.name} (${period.description})`);
    logs.push(`───────────────────────────────────────────────────────────────────────────────`);
    
    try {
      const { result, logs: periodLogs } = await runBacktest(supabase, {
        ...fullConfig,
        historicalStartDate: period.startDate.toISOString(),
        historicalEndDate: period.endDate.toISOString(),
      });
      
      results.push(result);
      
      // Log summary for this period
      const winner = result.rankings[0];
      logs.push(`  Winner: ${STRATEGY_CONFIGS[winner.strategy].name} (ROI: ${winner.roi >= 0 ? '+' : ''}${winner.roi.toFixed(1)}%)`);
      result.rankings.forEach((r, i) => {
        logs.push(`    ${i + 1}. ${r.strategy}: ${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(1)}% | ${r.totalTrades} trades | ${r.winRate.toFixed(0)}% WR`);
      });
      logs.push('');
      
    } catch (err) {
      logs.push(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
      logs.push('');
    }
  }
  
  // Aggregate results across all periods
  const aggregatedRankings = aggregateMultiPeriodResults(results, fullConfig.strategies);
  
  // Log aggregated results
  logs.push('═══════════════════════════════════════════════════════════════════════════════');
  logs.push('                        AGGREGATED RESULTS                                     ');
  logs.push('═══════════════════════════════════════════════════════════════════════════════');
  logs.push('');
  
  aggregatedRankings.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const config = STRATEGY_CONFIGS[r.strategy];
    logs.push(`${medal} #${i + 1} ${config.name}`);
    logs.push(`   Avg ROI: ${r.avgRoi >= 0 ? '+' : ''}${r.avgRoi.toFixed(1)}% | Avg WR: ${r.avgWinRate.toFixed(0)}%`);
    logs.push(`   Total Trades: ${r.totalTrades} | Avg Max DD: ${r.avgMaxDrawdown.toFixed(1)}%`);
    logs.push(`   Periods Won: ${r.periodsWon}/${results.length} | Top-2 Consistency: ${(r.consistency * 100).toFixed(0)}%`);
    logs.push('');
  });
  
  return {
    periods,
    results,
    aggregatedRankings,
    logs,
  };
}

// Aggregate results from multiple periods
function aggregateMultiPeriodResults(
  results: SimulationResult[],
  strategies: StrategyType[]
): MultiPeriodBacktestResult['aggregatedRankings'] {
  const strategyStats = new Map<StrategyType, {
    totalRoi: number;
    totalWinRate: number;
    totalTrades: number;
    totalMaxDrawdown: number;
    top2Count: number;
    winCount: number;
    periods: number;
  }>();
  
  // Initialize
  for (const strategy of strategies) {
    strategyStats.set(strategy, {
      totalRoi: 0,
      totalWinRate: 0,
      totalTrades: 0,
      totalMaxDrawdown: 0,
      top2Count: 0,
      winCount: 0,
      periods: 0,
    });
  }
  
  // Aggregate across periods
  for (const result of results) {
    for (const ranking of result.rankings) {
      const stats = strategyStats.get(ranking.strategy);
      if (!stats) continue;
      
      stats.totalRoi += ranking.roi;
      stats.totalWinRate += ranking.winRate;
      stats.totalTrades += ranking.totalTrades;
      stats.totalMaxDrawdown += ranking.maxDrawdown;
      stats.periods++;
    }
    
    // Track wins and top-2 finishes
    if (result.rankings.length >= 1) {
      const winner = result.rankings[0];
      const winnerStats = strategyStats.get(winner.strategy);
      if (winnerStats) winnerStats.winCount++;
    }
    
    if (result.rankings.length >= 2) {
      const first = strategyStats.get(result.rankings[0].strategy);
      const second = strategyStats.get(result.rankings[1].strategy);
      if (first) first.top2Count++;
      if (second) second.top2Count++;
    }
  }
  
  // Calculate averages and build final ranking
  const aggregated: MultiPeriodBacktestResult['aggregatedRankings'] = [];
  
  for (const [strategy, stats] of strategyStats) {
    if (stats.periods === 0) continue;
    
    aggregated.push({
      strategy,
      avgRoi: stats.totalRoi / stats.periods,
      avgWinRate: stats.totalWinRate / stats.periods,
      totalTrades: stats.totalTrades,
      avgMaxDrawdown: stats.totalMaxDrawdown / stats.periods,
      consistency: stats.top2Count / results.length,
      periodsWon: stats.winCount,
    });
  }
  
  // Sort by average ROI
  aggregated.sort((a, b) => b.avgRoi - a.avgRoi);
  
  return aggregated;
}

// Format results for display
export function formatSimulationResults(result: SimulationResult): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '                     📊 PAPER TRADING SIMULATION RESULTS                        ',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    `Duration: ${(result.durationMs / (24 * 60 * 60 * 1000)).toFixed(1)} days`,
    `Initial Capital: $${result.config.initialCapital.toFixed(2)} per strategy`,
    `Slippage: ${(result.config.slippagePct * 100).toFixed(1)}%`,
    `Cooldown: ${result.config.cooldownHours} hours after resolution`,
    '',
    '───────────────────────────────────────────────────────────────────────────────',
    '                              FINAL RANKINGS                                    ',
    '───────────────────────────────────────────────────────────────────────────────',
    '',
  ];
  
  result.rankings.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const config = STRATEGY_CONFIGS[r.strategy];
    const roiStr = r.roi >= 0 ? `+${r.roi.toFixed(1)}%` : `${r.roi.toFixed(1)}%`;
    const pnlStr = r.totalPnL >= 0 ? `+$${r.totalPnL.toFixed(2)}` : `-$${Math.abs(r.totalPnL).toFixed(2)}`;
    
    lines.push(`${medal} #${i + 1} ${config.name}`);
    lines.push(`   Final Value: $${r.finalValue.toFixed(2)} | ROI: ${roiStr} | P&L: ${pnlStr}`);
    lines.push(`   Win Rate: ${r.winRate.toFixed(1)}% | Trades: ${r.totalTrades} | Max DD: ${r.maxDrawdown.toFixed(1)}%`);
    lines.push('');
  });
  
  lines.push('───────────────────────────────────────────────────────────────────────────────');
  lines.push('                           DETAILED BREAKDOWN                                  ');
  lines.push('───────────────────────────────────────────────────────────────────────────────');
  
  for (const strategy of result.config.strategies) {
    const portfolio = result.portfolios[strategy];
    const config = STRATEGY_CONFIGS[strategy];
    const metrics = getPerformanceMetrics(portfolio);
    
    lines.push('');
    lines.push(`📈 ${config.name}`);
    lines.push(`   ${config.description}`);
    lines.push('');
    lines.push(`   Capital Breakdown:`);
    lines.push(`   • Available Cash: $${portfolio.availableCash.toFixed(2)}`);
    lines.push(`   • Locked (Open): $${portfolio.lockedCapital.toFixed(2)}`);
    lines.push(`   • In Cooldown: $${portfolio.cooldownCapital.toFixed(2)}`);
    lines.push('');
    lines.push(`   Performance:`);
    lines.push(`   • Total P&L: ${metrics.totalPnL >= 0 ? '+' : ''}$${metrics.totalPnL.toFixed(2)} (${metrics.totalPnLPercent >= 0 ? '+' : ''}${metrics.totalPnLPercent.toFixed(1)}%)`);
    lines.push(`   • Win Rate: ${metrics.winRate.toFixed(1)}% (${metrics.winningTrades}W / ${metrics.losingTrades}L)`);
    lines.push(`   • Avg Win: +$${metrics.avgWin.toFixed(2)} | Avg Loss: -$${metrics.avgLoss.toFixed(2)}`);
    lines.push(`   • Profit Factor: ${metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}`);
    lines.push(`   • Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%`);
    
    // Show recent trades
    if (portfolio.closedPositions.length > 0) {
      lines.push('');
      lines.push('   Recent Trades:');
      const recentTrades = portfolio.closedPositions.slice(-5);
      for (const trade of recentTrades) {
        const pnlStr = (trade.pnlUsd ?? 0) >= 0 ? `+$${(trade.pnlUsd ?? 0).toFixed(2)}` : `-$${Math.abs(trade.pnlUsd ?? 0).toFixed(2)}`;
        const statusIcon = trade.status === 'WON' ? '✅' : trade.status === 'LOST' ? '❌' : '⏸️';
        lines.push(`   ${statusIcon} ${trade.marketTitle.slice(0, 35)}... | ${trade.outcome} | ${pnlStr}`);
      }
    }
    
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}
