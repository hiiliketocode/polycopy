// Live Paper Trading Manager
// Processes real-time trades from fire-feed and tracks 4 strategies simultaneously

import {
  SimulationConfig,
  SimulationResult,
  StrategyType,
  TradeSignal,
  PortfolioState,
  SizingMode,
} from './types';
import {
  initializeSimulation,
  processSignal,
  resolveMarket,
  advanceTime,
  generateResults,
  tradeToSignal,
  DEFAULT_SIMULATION_CONFIG,
  SimulationState,
} from './simulation';
import { getPerformanceMetrics, getPortfolioValue } from './portfolio';
import { STRATEGY_CONFIGS } from './strategies';

// Live simulation state stored in memory
// In production, this should be persisted to database
interface LiveSimulationStore {
  [simulationId: string]: {
    state: SimulationState;
    createdAt: number;
    lastActivity: number;
    isActive: boolean;
  };
}

const liveSimulations: LiveSimulationStore = {};

// Create a new live paper trading simulation
export function createLiveSimulation(
  config: Partial<SimulationConfig> = {}
): { simulationId: string; state: SimulationState } {
  const simulationId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const fullConfig: SimulationConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    mode: 'live',
    startTimestamp: Date.now(),
  };
  
  const state = initializeSimulation(fullConfig);
  
  liveSimulations[simulationId] = {
    state,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    isActive: true,
  };
  
  state.logs.push(`[LIVE] Simulation ${simulationId} started`);
  state.logs.push(`[LIVE] Sizing mode: ${fullConfig.sizingMode} (${fullConfig.sizingMode === 'controlled' ? `$${fullConfig.controlledPositionUsd} fixed` : 'strategy-specific'})`);
  
  return { simulationId, state };
}

// Get an existing live simulation
export function getLiveSimulation(simulationId: string): SimulationState | null {
  const sim = liveSimulations[simulationId];
  if (!sim) return null;
  
  // Process any pending cooldowns
  sim.state = advanceTime(sim.state, Date.now());
  
  return sim.state;
}

// Process a new trade signal in a live simulation
export function processLiveTrade(
  simulationId: string,
  trade: any,  // Raw trade from fire-feed
  polyScoreData?: any,  // Optional PolyScore response
  traderStats?: any  // Optional trader stats
): { 
  success: boolean; 
  tradesEntered: number;
  details: Record<StrategyType, { entered: boolean; reason: string }>;
} {
  const sim = liveSimulations[simulationId];
  if (!sim || !sim.isActive) {
    return { 
      success: false, 
      tradesEntered: 0, 
      details: {} as any 
    };
  }
  
  // Convert to signal
  const signal = tradeToSignal(trade, polyScoreData, traderStats);
  
  // If we have polyScore data, use it
  if (polyScoreData) {
    // Use actual PolyScore values
    signal.valueScore = polyScoreData.valueScore ?? polyScoreData.prediction?.score_0_100;
    signal.polyscore = polyScoreData.polyscore;
    signal.aiEdge = polyScoreData.valuation?.real_edge_pct;
    signal.aiProbability = polyScoreData.valuation?.ai_fair_value;
  }
  
  // Track which strategies entered
  const details: Record<string, { entered: boolean; reason: string }> = {};
  const openCountsBefore: Record<string, number> = {};
  
  for (const strategy of sim.state.config.strategies) {
    openCountsBefore[strategy] = sim.state.portfolios[strategy].openPositions.length;
  }
  
  // Process the signal
  sim.state = processSignal(sim.state, signal);
  sim.lastActivity = Date.now();
  
  // Check which strategies entered
  let tradesEntered = 0;
  for (const strategy of sim.state.config.strategies) {
    const newCount = sim.state.portfolios[strategy].openPositions.length;
    const entered = newCount > openCountsBefore[strategy];
    if (entered) tradesEntered++;
    
    // Find the reason from logs (last entry for this strategy)
    const strategyLogs = sim.state.logs.filter(l => l.includes(STRATEGY_CONFIGS[strategy].name));
    const lastLog = strategyLogs[strategyLogs.length - 1] || '';
    const reason = entered 
      ? 'Trade entered' 
      : lastLog.includes('SKIPPED') 
        ? lastLog.split('|').pop()?.trim() || 'Criteria not met'
        : 'Criteria not met';
    
    details[strategy] = { entered, reason };
  }
  
  return { success: true, tradesEntered, details: details as any };
}

// Resolve a market in a live simulation
export function resolveLiveMarket(
  simulationId: string,
  conditionId: string,
  winningOutcome: 'YES' | 'NO'
): { success: boolean; positionsResolved: number } {
  const sim = liveSimulations[simulationId];
  if (!sim || !sim.isActive) {
    return { success: false, positionsResolved: 0 };
  }
  
  // Count positions before
  let positionsBefore = 0;
  for (const strategy of sim.state.config.strategies) {
    positionsBefore += sim.state.portfolios[strategy].openPositions.filter(
      p => p.conditionId === conditionId
    ).length;
  }
  
  sim.state = resolveMarket(sim.state, conditionId, winningOutcome, Date.now());
  sim.lastActivity = Date.now();
  
  // Count positions after
  let positionsAfter = 0;
  for (const strategy of sim.state.config.strategies) {
    positionsAfter += sim.state.portfolios[strategy].openPositions.filter(
      p => p.conditionId === conditionId
    ).length;
  }
  
  return { 
    success: true, 
    positionsResolved: positionsBefore - positionsAfter 
  };
}

// Get current status of a live simulation
export function getLiveSimulationStatus(simulationId: string): {
  isActive: boolean;
  elapsedHours: number;
  remainingHours: number;
  portfolioValues: Record<StrategyType, number>;
  totalTrades: Record<StrategyType, number>;
  rankings: Array<{ strategy: StrategyType; value: number; roi: number }>;
} | null {
  const sim = liveSimulations[simulationId];
  if (!sim) return null;
  
  const now = Date.now();
  const elapsedMs = now - sim.state.startedAt;
  const remainingMs = Math.max(0, sim.state.portfolios[sim.state.config.strategies[0]].endsAt - now);
  
  const portfolioValues: Record<string, number> = {};
  const totalTrades: Record<string, number> = {};
  const rankings: Array<{ strategy: StrategyType; value: number; roi: number }> = [];
  
  for (const strategy of sim.state.config.strategies) {
    const portfolio = sim.state.portfolios[strategy];
    const value = getPortfolioValue(portfolio);
    portfolioValues[strategy] = value;
    totalTrades[strategy] = portfolio.totalTrades;
    
    rankings.push({
      strategy,
      value,
      roi: ((value - sim.state.config.initialCapital) / sim.state.config.initialCapital) * 100,
    });
  }
  
  // Sort by value
  rankings.sort((a, b) => b.value - a.value);
  
  return {
    isActive: sim.isActive && remainingMs > 0,
    elapsedHours: elapsedMs / (60 * 60 * 1000),
    remainingHours: remainingMs / (60 * 60 * 1000),
    portfolioValues: portfolioValues as any,
    totalTrades: totalTrades as any,
    rankings,
  };
}

// End a live simulation and get final results
export function endLiveSimulation(simulationId: string): SimulationResult | null {
  const sim = liveSimulations[simulationId];
  if (!sim) return null;
  
  sim.isActive = false;
  sim.state = advanceTime(sim.state, Date.now());
  
  return generateResults(sim.state);
}

// Get all active simulations (for admin/monitoring)
export function getActiveSimulations(): Array<{
  simulationId: string;
  createdAt: number;
  sizingMode: SizingMode;
  elapsedHours: number;
  strategies: StrategyType[];
}> {
  const now = Date.now();
  return Object.entries(liveSimulations)
    .filter(([_, sim]) => sim.isActive)
    .map(([id, sim]) => ({
      simulationId: id,
      createdAt: sim.createdAt,
      sizingMode: sim.state.config.sizingMode,
      elapsedHours: (now - sim.state.startedAt) / (60 * 60 * 1000),
      strategies: sim.state.config.strategies,
    }));
}

// Clean up old simulations (call periodically)
export function cleanupOldSimulations(maxAgeHours: number = 24 * 7): number {
  const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000);
  let cleaned = 0;
  
  for (const [id, sim] of Object.entries(liveSimulations)) {
    if (sim.lastActivity < cutoff) {
      delete liveSimulations[id];
      cleaned++;
    }
  }
  
  return cleaned;
}
