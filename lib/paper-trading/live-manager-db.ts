// Persistent Live Paper Trading Manager
// Saves and loads simulation state from the database
// Designed to work with hourly cron jobs and webhook-triggered trade processing

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  SimulationConfig,
  SimulationResult,
  StrategyType,
  TradeSignal,
  PortfolioState,
  PaperTrade,
  HourlySnapshot,
} from './types';
import {
  initializeSimulation,
  processSignal,
  resolveMarket,
  advanceTime,
  generateResults,
  tradeToSignal,
  DEFAULT_SIMULATION_CONFIG,
} from './simulation';
import {
  getPerformanceMetrics,
  getPortfolioValue,
  processCooldowns,
} from './portfolio';
import { STRATEGY_CONFIGS } from './strategies';

// ============================================================================
// DATABASE PERSISTENCE LAYER
// Uses tables: paper_trading_simulations, paper_trading_portfolios,
//              paper_trading_positions, paper_trading_hourly_snapshots,
//              paper_trading_cooldown_queue
// ============================================================================

interface DbSimulation {
  id: string;
  mode: 'live' | 'backtest';
  initial_capital: number;
  duration_days: number;
  slippage_pct: number;
  cooldown_hours: number;
  strategies: string[];  // JSONB
  started_at: string;
  ends_at: string;
  status: 'active' | 'completed' | 'paused';
  created_at: string;
  updated_at: string;
}

interface DbPortfolio {
  id: string;
  simulation_id: string;
  strategy_type: string;
  available_cash: number;
  locked_capital: number;
  cooldown_capital: number;
  total_pnl: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  peak_capital: number;
  drawdown: number;
  updated_at: string;
}

interface DbPosition {
  id: string;
  portfolio_id: string;
  condition_id: string;
  token_id?: string;
  market_slug?: string;
  market_title: string;
  outcome: string;
  entry_price: number;
  raw_price: number;
  slippage_applied: number;
  size: number;
  invested_usd: number;
  entry_timestamp: string;
  exit_timestamp?: string;
  exit_price?: number;
  pnl_usd?: number;
  roi_percent?: number;
  status: string;
  value_score?: number;
  polyscore?: number;
  ai_edge?: number;
  bet_structure?: string;
  niche?: string;
  original_trade_id?: string;
  wallet_address?: string;
  cash_available_at?: string;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a new persistent live simulation
 */
export async function createPersistentSimulation(
  supabase: SupabaseClient,
  config: Partial<SimulationConfig> = {}
): Promise<{ simulationId: string; success: boolean; error?: string }> {
  const fullConfig: SimulationConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...config,
    mode: 'live',
  };

  const startTime = Date.now();
  const endTime = startTime + (fullConfig.durationDays * 24 * 60 * 60 * 1000);
  const simulationId = `live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // 1. Create simulation record
    const { error: simError } = await supabase
      .from('paper_trading_simulations')
      .insert({
        id: simulationId,
        mode: 'live',
        initial_capital: fullConfig.initialCapital,
        duration_days: fullConfig.durationDays,
        slippage_pct: fullConfig.slippagePct,
        cooldown_hours: fullConfig.cooldownHours,
        strategies: fullConfig.strategies,
        started_at: new Date(startTime).toISOString(),
        ends_at: new Date(endTime).toISOString(),
        status: 'active',
      });

    if (simError) throw simError;

    // 2. Create portfolio records for each strategy
    const portfolioInserts = fullConfig.strategies.map(strategy => ({
      simulation_id: simulationId,
      strategy_type: strategy,
      available_cash: fullConfig.initialCapital,
      locked_capital: 0,
      cooldown_capital: 0,
      total_pnl: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      peak_capital: fullConfig.initialCapital,
      drawdown: 0,
    }));

    const { error: portfolioError } = await supabase
      .from('paper_trading_portfolios')
      .insert(portfolioInserts);

    if (portfolioError) throw portfolioError;

    // 3. Create initial hourly snapshot for each strategy
    const portfolios = await supabase
      .from('paper_trading_portfolios')
      .select('id, strategy_type')
      .eq('simulation_id', simulationId);

    if (portfolios.data) {
      const snapshotInserts = portfolios.data.map(p => ({
        portfolio_id: p.id,
        hour: 0,
        timestamp: new Date(startTime).toISOString(),
        portfolio_value: fullConfig.initialCapital,
        available_cash: fullConfig.initialCapital,
        locked_capital: 0,
        cooldown_capital: 0,
        open_positions: 0,
        trades_this_hour: 0,
        resolutions_this_hour: 0,
        pnl_this_hour: 0,
        cumulative_pnl: 0,
      }));

      await supabase.from('paper_trading_hourly_snapshots').insert(snapshotInserts);
    }

    return { simulationId, success: true };
  } catch (error: any) {
    console.error('[live-manager-db] Error creating simulation:', error);
    return { simulationId: '', success: false, error: error.message };
  }
}

/**
 * Load a simulation state from database
 */
export async function loadSimulationState(
  supabase: SupabaseClient,
  simulationId: string
): Promise<{
  config: SimulationConfig;
  portfolios: Record<StrategyType, PortfolioState>;
  isActive: boolean;
} | null> {
  try {
    // Load simulation config
    const { data: sim, error: simError } = await supabase
      .from('paper_trading_simulations')
      .select('*')
      .eq('id', simulationId)
      .single();

    if (simError || !sim) return null;

    // Load portfolios
    const { data: portfoliosDb, error: portfolioError } = await supabase
      .from('paper_trading_portfolios')
      .select('*')
      .eq('simulation_id', simulationId);

    if (portfolioError || !portfoliosDb) return null;

    // Load positions for each portfolio
    const portfolios: Record<StrategyType, PortfolioState> = {} as any;

    for (const p of portfoliosDb) {
      // Load open positions
      const { data: positions } = await supabase
        .from('paper_trading_positions')
        .select('*')
        .eq('portfolio_id', p.id);

      const openPositions: PaperTrade[] = [];
      const closedPositions: PaperTrade[] = [];

      (positions || []).forEach(pos => {
        const trade: PaperTrade = {
          id: pos.id,
          strategyType: p.strategy_type as StrategyType,
          conditionId: pos.condition_id,
          tokenId: pos.token_id,
          marketSlug: pos.market_slug,
          marketTitle: pos.market_title,
          outcome: pos.outcome as 'YES' | 'NO',
          entryPrice: pos.entry_price,
          rawPrice: pos.raw_price,
          slippageApplied: pos.slippage_applied,
          size: pos.size,
          investedUsd: pos.invested_usd,
          entryTimestamp: new Date(pos.entry_timestamp).getTime(),
          exitTimestamp: pos.exit_timestamp ? new Date(pos.exit_timestamp).getTime() : undefined,
          exitPrice: pos.exit_price,
          pnlUsd: pos.pnl_usd,
          roiPercent: pos.roi_percent,
          status: pos.status as any,
          valueScore: pos.value_score,
          polyscore: pos.polyscore,
          aiEdge: pos.ai_edge,
          betStructure: pos.bet_structure as any,
          niche: pos.niche,
          originalTradeId: pos.original_trade_id,
          walletAddress: pos.wallet_address,
          cashAvailableAt: pos.cash_available_at ? new Date(pos.cash_available_at).getTime() : undefined,
        };

        if (pos.status === 'OPEN') {
          openPositions.push(trade);
        } else {
          closedPositions.push(trade);
        }
      });

      // Load cooldown queue
      const { data: cooldowns } = await supabase
        .from('paper_trading_cooldown_queue')
        .select('*')
        .eq('portfolio_id', p.id)
        .gte('available_at', new Date().toISOString());

      // Load hourly snapshots
      const { data: snapshots } = await supabase
        .from('paper_trading_hourly_snapshots')
        .select('*')
        .eq('portfolio_id', p.id)
        .order('hour', { ascending: true });

      portfolios[p.strategy_type as StrategyType] = {
        strategyType: p.strategy_type as StrategyType,
        initialCapital: sim.initial_capital,
        availableCash: p.available_cash,
        lockedCapital: p.locked_capital,
        cooldownCapital: p.cooldown_capital,
        openPositions,
        closedPositions,
        cooldownQueue: (cooldowns || []).map(c => ({
          amount: c.amount,
          availableAt: new Date(c.available_at).getTime(),
        })),
        totalPnL: p.total_pnl,
        totalTrades: p.total_trades,
        winningTrades: p.winning_trades,
        losingTrades: p.losing_trades,
        peakCapital: p.peak_capital,
        drawdown: p.drawdown,
        hourlySnapshots: (snapshots || []).map(s => ({
          hour: s.hour,
          timestamp: new Date(s.timestamp).getTime(),
          portfolioValue: s.portfolio_value,
          availableCash: s.available_cash,
          lockedCapital: s.locked_capital,
          cooldownCapital: s.cooldown_capital,
          openPositions: s.open_positions,
          tradesThisHour: s.trades_this_hour,
          resolutionsThisHour: s.resolutions_this_hour,
          pnlThisHour: s.pnl_this_hour,
          cumulativePnl: s.cumulative_pnl,
        })),
        tradesPerHour: {},
        maxConcurrentPositions: 20,
        maxPositionPerMarket: 1,
        startedAt: new Date(sim.started_at).getTime(),
        lastUpdatedAt: new Date(p.updated_at).getTime(),
        endsAt: new Date(sim.ends_at).getTime(),
      };
    }

    return {
      config: {
        mode: sim.mode,
        sizingMode: 'controlled',  // Deprecated - all use edge-based
        durationDays: sim.duration_days,
        initialCapital: sim.initial_capital,
        slippagePct: sim.slippage_pct,
        cooldownHours: sim.cooldown_hours,
        strategies: sim.strategies as StrategyType[],
      },
      portfolios,
      isActive: sim.status === 'active' && new Date(sim.ends_at).getTime() > Date.now(),
    };
  } catch (error) {
    console.error('[live-manager-db] Error loading simulation:', error);
    return null;
  }
}

/**
 * Save portfolio state to database after processing trades
 */
export async function savePortfolioState(
  supabase: SupabaseClient,
  simulationId: string,
  strategyType: StrategyType,
  portfolio: PortfolioState
): Promise<boolean> {
  try {
    // Get portfolio ID
    const { data: portfolioRecord } = await supabase
      .from('paper_trading_portfolios')
      .select('id')
      .eq('simulation_id', simulationId)
      .eq('strategy_type', strategyType)
      .single();

    if (!portfolioRecord) return false;

    // Update portfolio
    await supabase
      .from('paper_trading_portfolios')
      .update({
        available_cash: portfolio.availableCash,
        locked_capital: portfolio.lockedCapital,
        cooldown_capital: portfolio.cooldownCapital,
        total_pnl: portfolio.totalPnL,
        total_trades: portfolio.totalTrades,
        winning_trades: portfolio.winningTrades,
        losing_trades: portfolio.losingTrades,
        peak_capital: portfolio.peakCapital,
        drawdown: portfolio.drawdown,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolioRecord.id);

    // Sync positions - upsert all open and recently closed
    const recentlyClosed = portfolio.closedPositions.filter(
      p => p.exitTimestamp && p.exitTimestamp > Date.now() - (24 * 60 * 60 * 1000)
    );

    const positionsToSync = [...portfolio.openPositions, ...recentlyClosed];

    for (const pos of positionsToSync) {
      await supabase
        .from('paper_trading_positions')
        .upsert({
          id: pos.id,
          portfolio_id: portfolioRecord.id,
          condition_id: pos.conditionId,
          token_id: pos.tokenId,
          market_slug: pos.marketSlug,
          market_title: pos.marketTitle,
          outcome: pos.outcome,
          entry_price: pos.entryPrice,
          raw_price: pos.rawPrice,
          slippage_applied: pos.slippageApplied,
          size: pos.size,
          invested_usd: pos.investedUsd,
          entry_timestamp: new Date(pos.entryTimestamp).toISOString(),
          exit_timestamp: pos.exitTimestamp ? new Date(pos.exitTimestamp).toISOString() : null,
          exit_price: pos.exitPrice,
          pnl_usd: pos.pnlUsd,
          roi_percent: pos.roiPercent,
          status: pos.status,
          value_score: pos.valueScore,
          polyscore: pos.polyscore,
          ai_edge: pos.aiEdge,
          bet_structure: pos.betStructure,
          niche: pos.niche,
          original_trade_id: pos.originalTradeId,
          wallet_address: pos.walletAddress,
          cash_available_at: pos.cashAvailableAt ? new Date(pos.cashAvailableAt).toISOString() : null,
        }, { onConflict: 'id' });
    }

    // Update cooldown queue
    await supabase
      .from('paper_trading_cooldown_queue')
      .delete()
      .eq('portfolio_id', portfolioRecord.id);

    if (portfolio.cooldownQueue.length > 0) {
      await supabase
        .from('paper_trading_cooldown_queue')
        .insert(portfolio.cooldownQueue.map(c => ({
          portfolio_id: portfolioRecord.id,
          amount: c.amount,
          available_at: new Date(c.availableAt).toISOString(),
        })));
    }

    return true;
  } catch (error) {
    console.error('[live-manager-db] Error saving portfolio:', error);
    return false;
  }
}

/**
 * Record an hourly snapshot for a portfolio
 */
export async function recordHourlySnapshotDb(
  supabase: SupabaseClient,
  simulationId: string,
  strategyType: StrategyType,
  portfolio: PortfolioState,
  hour: number,
  tradesThisHour: number,
  resolutionsThisHour: number,
  pnlThisHour: number
): Promise<boolean> {
  try {
    const { data: portfolioRecord } = await supabase
      .from('paper_trading_portfolios')
      .select('id')
      .eq('simulation_id', simulationId)
      .eq('strategy_type', strategyType)
      .single();

    if (!portfolioRecord) return false;

    await supabase
      .from('paper_trading_hourly_snapshots')
      .upsert({
        portfolio_id: portfolioRecord.id,
        hour,
        timestamp: new Date().toISOString(),
        portfolio_value: getPortfolioValue(portfolio),
        available_cash: portfolio.availableCash,
        locked_capital: portfolio.lockedCapital,
        cooldown_capital: portfolio.cooldownCapital,
        open_positions: portfolio.openPositions.length,
        trades_this_hour: tradesThisHour,
        resolutions_this_hour: resolutionsThisHour,
        pnl_this_hour: pnlThisHour,
        cumulative_pnl: portfolio.totalPnL,
      }, { onConflict: 'portfolio_id,hour' });

    return true;
  } catch (error) {
    console.error('[live-manager-db] Error recording snapshot:', error);
    return false;
  }
}

// ============================================================================
// HIGH-LEVEL API FOR WEBHOOKS/CRON JOBS
// ============================================================================

/**
 * Process a trade signal for a persistent live simulation
 * Called by webhook when fire-feed detects a new trade
 */
export async function processLiveTradeDb(
  supabase: SupabaseClient,
  simulationId: string,
  trade: any,
  polyScoreData?: any,
  traderStats?: any
): Promise<{
  success: boolean;
  tradesEntered: number;
  details: Record<StrategyType, { entered: boolean; reason: string }>;
}> {
  // Load simulation state
  const state = await loadSimulationState(supabase, simulationId);
  if (!state || !state.isActive) {
    return {
      success: false,
      tradesEntered: 0,
      details: {} as any,
    };
  }

  // Convert to signal
  const signal = tradeToSignal(trade, polyScoreData, traderStats);

  // Process signal for each strategy
  const details: Record<string, { entered: boolean; reason: string }> = {};
  let tradesEntered = 0;

  for (const strategyType of state.config.strategies) {
    const portfolioBefore = state.portfolios[strategyType];
    const openCountBefore = portfolioBefore.openPositions.length;

    // Create simulation state for single strategy processing
    const miniState = initializeSimulation({
      ...state.config,
      strategies: [strategyType],
      startTimestamp: portfolioBefore.startedAt,
    });

    // Copy portfolio state
    miniState.portfolios[strategyType] = portfolioBefore;

    // Process signal
    const processed = processSignal(miniState, signal);
    const portfolioAfter = processed.portfolios[strategyType];

    const entered = portfolioAfter.openPositions.length > openCountBefore;
    if (entered) tradesEntered++;

    details[strategyType] = {
      entered,
      reason: entered ? 'Trade entered' : 'Criteria not met',
    };

    // Save updated portfolio to database
    await savePortfolioState(supabase, simulationId, strategyType, portfolioAfter);
  }

  return { success: true, tradesEntered, details: details as any };
}

/**
 * Resolve a market for a persistent live simulation
 * Called when a market settles
 */
export async function resolveLiveMarketDb(
  supabase: SupabaseClient,
  simulationId: string,
  conditionId: string,
  winningOutcome: 'YES' | 'NO'
): Promise<{ success: boolean; positionsResolved: number }> {
  const state = await loadSimulationState(supabase, simulationId);
  if (!state) {
    return { success: false, positionsResolved: 0 };
  }

  let totalResolved = 0;
  const now = Date.now();

  for (const strategyType of state.config.strategies) {
    const portfolio = state.portfolios[strategyType];

    // Find positions in this market
    const positions = portfolio.openPositions.filter(p => p.conditionId === conditionId);
    if (positions.length === 0) continue;

    // Create mini state and resolve
    const miniState = initializeSimulation({
      ...state.config,
      strategies: [strategyType],
      startTimestamp: portfolio.startedAt,
    });
    miniState.portfolios[strategyType] = portfolio;

    const resolved = resolveMarket(miniState, conditionId, winningOutcome, now);
    totalResolved += positions.length;

    // Save updated portfolio
    await savePortfolioState(supabase, simulationId, strategyType, resolved.portfolios[strategyType]);
  }

  return { success: true, positionsResolved: totalResolved };
}

/**
 * Hourly update job - process cooldowns and record snapshots
 * Call this from a cron job every hour
 */
export async function runHourlyUpdate(
  supabase: SupabaseClient,
  simulationId: string
): Promise<{
  success: boolean;
  hour: number;
  capitalReleased: number;
  snapshotsRecorded: number;
}> {
  const state = await loadSimulationState(supabase, simulationId);
  if (!state) {
    return { success: false, hour: 0, capitalReleased: 0, snapshotsRecorded: 0 };
  }

  const now = Date.now();
  const hour = Math.floor((now - state.portfolios[state.config.strategies[0]].startedAt) / (60 * 60 * 1000));
  let totalCapitalReleased = 0;
  let snapshotsRecorded = 0;

  for (const strategyType of state.config.strategies) {
    const portfolioBefore = state.portfolios[strategyType];
    const cooldownBefore = portfolioBefore.cooldownCapital;

    // Process cooldowns
    const portfolioAfter = processCooldowns(portfolioBefore, now);
    const capitalReleased = cooldownBefore - portfolioAfter.cooldownCapital;
    totalCapitalReleased += capitalReleased;

    // Save updated portfolio
    await savePortfolioState(supabase, simulationId, strategyType, portfolioAfter);

    // Record hourly snapshot
    const recorded = await recordHourlySnapshotDb(
      supabase,
      simulationId,
      strategyType,
      portfolioAfter,
      hour,
      0, // tradesThisHour - would need to track separately
      0, // resolutionsThisHour
      0  // pnlThisHour
    );

    if (recorded) snapshotsRecorded++;
  }

  return {
    success: true,
    hour,
    capitalReleased: totalCapitalReleased,
    snapshotsRecorded,
  };
}

/**
 * Get current status of a persistent live simulation
 */
export async function getSimulationStatus(
  supabase: SupabaseClient,
  simulationId: string
): Promise<{
  isActive: boolean;
  elapsedHours: number;
  remainingHours: number;
  portfolioValues: Record<StrategyType, number>;
  totalTrades: Record<StrategyType, number>;
  rankings: Array<{ strategy: StrategyType; value: number; roi: number }>;
} | null> {
  const state = await loadSimulationState(supabase, simulationId);
  if (!state) return null;

  const now = Date.now();
  const firstPortfolio = state.portfolios[state.config.strategies[0]];
  const elapsedMs = now - firstPortfolio.startedAt;
  const remainingMs = Math.max(0, firstPortfolio.endsAt - now);

  const portfolioValues: Record<string, number> = {};
  const totalTrades: Record<string, number> = {};
  const rankings: Array<{ strategy: StrategyType; value: number; roi: number }> = [];

  for (const strategy of state.config.strategies) {
    const portfolio = state.portfolios[strategy];
    const value = getPortfolioValue(portfolio);
    portfolioValues[strategy] = value;
    totalTrades[strategy] = portfolio.totalTrades;

    rankings.push({
      strategy,
      value,
      roi: ((value - state.config.initialCapital) / state.config.initialCapital) * 100,
    });
  }

  rankings.sort((a, b) => b.value - a.value);

  return {
    isActive: state.isActive && remainingMs > 0,
    elapsedHours: elapsedMs / (60 * 60 * 1000),
    remainingHours: remainingMs / (60 * 60 * 1000),
    portfolioValues: portfolioValues as any,
    totalTrades: totalTrades as any,
    rankings,
  };
}

/**
 * List all active simulations
 */
export async function listActiveSimulations(
  supabase: SupabaseClient
): Promise<Array<{
  id: string;
  startedAt: string;
  endsAt: string;
  strategies: string[];
  status: string;
}>> {
  const { data, error } = await supabase
    .from('paper_trading_simulations')
    .select('id, started_at, ends_at, strategies, status')
    .eq('status', 'active')
    .gt('ends_at', new Date().toISOString());

  if (error || !data) return [];

  return data.map(sim => ({
    id: sim.id,
    startedAt: sim.started_at,
    endsAt: sim.ends_at,
    strategies: sim.strategies,
    status: sim.status,
  }));
}

/**
 * End a simulation and mark as completed
 */
export async function endSimulation(
  supabase: SupabaseClient,
  simulationId: string
): Promise<SimulationResult | null> {
  const state = await loadSimulationState(supabase, simulationId);
  if (!state) return null;

  // Generate results
  const simState = initializeSimulation({
    ...state.config,
    startTimestamp: state.portfolios[state.config.strategies[0]].startedAt,
  });
  simState.portfolios = state.portfolios;

  const advancedState = advanceTime(simState, Date.now());
  const result = generateResults(advancedState);

  // Mark simulation as completed
  await supabase
    .from('paper_trading_simulations')
    .update({ status: 'completed' })
    .eq('id', simulationId);

  return result;
}
