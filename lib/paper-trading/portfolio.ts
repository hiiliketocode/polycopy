// Paper Trading Portfolio Manager
// Manages capital, positions, cooldowns, and P&L tracking

import {
  StrategyType,
  PaperTrade,
  PortfolioState,
  TradeSignal,
  TradeStatus,
  HourlySnapshot,
} from './types';

// Generate a unique ID without external dependencies
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${randomPart}`;
}

// Calculate which hour we're in relative to simulation start
function getHourNumber(timestamp: number, startTime: number): number {
  return Math.floor((timestamp - startTime) / MS_PER_HOUR);
}
import {
  getStrategyConfig,
  shouldEnterTrade,
  calculatePositionSize,
  calculateEntryPrice,
} from './strategies';

// Constants
const COOLDOWN_HOURS = 3;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Initialize a new portfolio for a strategy
export function createPortfolio(
  strategyType: StrategyType,
  initialCapital: number,
  durationDays: number = 4,
  startTimestamp: number = Date.now()
): PortfolioState {
  // Create initial hourly snapshot
  const initialSnapshot = {
    hour: 0,
    timestamp: startTimestamp,
    portfolioValue: initialCapital,
    availableCash: initialCapital,
    lockedCapital: 0,
    cooldownCapital: 0,
    openPositions: 0,
    tradesThisHour: 0,
    resolutionsThisHour: 0,
    pnlThisHour: 0,
    cumulativePnl: 0,
  };
  
  return {
    strategyType,
    initialCapital,
    availableCash: initialCapital,
    lockedCapital: 0,
    cooldownCapital: 0,
    
    openPositions: [],
    closedPositions: [],
    cooldownQueue: [],
    
    totalPnL: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    peakCapital: initialCapital,
    drawdown: 0,
    
    // Hourly tracking
    hourlySnapshots: [initialSnapshot],
    tradesPerHour: {},
    
    // Risk management limits
    maxConcurrentPositions: 20,   // Never have more than 20 open positions
    maxPositionPerMarket: 1,      // Only 1 position per market at a time
    
    startedAt: startTimestamp,
    lastUpdatedAt: startTimestamp,
    endsAt: startTimestamp + (durationDays * MS_PER_DAY),
  };
}

// Check if simulation should continue
export function isSimulationActive(portfolio: PortfolioState, currentTime: number = Date.now()): boolean {
  // Stop if past end time
  if (currentTime >= portfolio.endsAt) {
    return false;
  }
  
  // Stop if no money left (all available, locked, and cooldown)
  const totalCapital = portfolio.availableCash + portfolio.lockedCapital + portfolio.cooldownCapital;
  if (totalCapital <= 0) {
    return false;
  }
  
  return true;
}

// Process cooldown queue - release capital that has completed cooldown
export function processCooldowns(portfolio: PortfolioState, currentTime: number = Date.now()): PortfolioState {
  const updatedPortfolio = { ...portfolio };
  const stillCooling: typeof portfolio.cooldownQueue = [];
  
  for (const item of updatedPortfolio.cooldownQueue) {
    if (currentTime >= item.availableAt) {
      // Cooldown complete - move to available cash
      updatedPortfolio.availableCash += item.amount;
      updatedPortfolio.cooldownCapital -= item.amount;
    } else {
      stillCooling.push(item);
    }
  }
  
  updatedPortfolio.cooldownQueue = stillCooling;
  updatedPortfolio.lastUpdatedAt = currentTime;
  
  return updatedPortfolio;
}

// Attempt to enter a trade based on a signal
// ALL strategies now use the same EDGE-BASED position sizing
// Entry criteria differ between strategies, but sizing is uniform
export function attemptTrade(
  portfolio: PortfolioState,
  signal: TradeSignal,
  slippagePct: number,
  currentTime: number = Date.now()
): { portfolio: PortfolioState; trade: PaperTrade | null; reason: string } {
  // First process any pending cooldowns
  let updatedPortfolio = processCooldowns(portfolio, currentTime);
  
  // Check if simulation is still active
  if (!isSimulationActive(updatedPortfolio, currentTime)) {
    return {
      portfolio: updatedPortfolio,
      trade: null,
      reason: 'Simulation ended (time limit or no capital)',
    };
  }
  
  // Get strategy config
  const config = getStrategyConfig(updatedPortfolio.strategyType);
  
  // Check if signal meets entry criteria
  const entryDecision = shouldEnterTrade(signal, config);
  if (!entryDecision.shouldEnter) {
    return {
      portfolio: updatedPortfolio,
      trade: null,
      reason: entryDecision.reason,
    };
  }
  
  // Check if we have enough capital
  if (updatedPortfolio.availableCash < (config.minPositionUsd ?? 10)) {
    return {
      portfolio: updatedPortfolio,
      trade: null,
      reason: `Insufficient capital: $${updatedPortfolio.availableCash.toFixed(2)} available, need at least $${config.minPositionUsd ?? 10}`,
    };
  }
  
  // Check if we already have a position in this market
  const existingPosition = updatedPortfolio.openPositions.find(
    p => p.conditionId === signal.conditionId && p.outcome === signal.outcome
  );
  if (existingPosition) {
    return {
      portfolio: updatedPortfolio,
      trade: null,
      reason: `Already have open position in this market (${signal.outcome})`,
    };
  }
  
  // Calculate position size (edge-based sizing for all strategies)
  const { sizeUsd, shares, reason: sizingReason } = calculatePositionSize(
    signal,
    config,
    updatedPortfolio.availableCash
  );
  
  // Skip if position too small
  if (sizeUsd < (config.minPositionUsd ?? 10)) {
    return {
      portfolio: updatedPortfolio,
      trade: null,
      reason: `Position size too small: $${sizeUsd.toFixed(2)} < $${config.minPositionUsd ?? 10}`,
    };
  }
  
  // Calculate entry price with slippage
  const entryPrice = calculateEntryPrice(signal.currentPrice, slippagePct, 'BUY');
  
  // Recalculate actual shares based on slipped price
  const actualShares = sizeUsd / entryPrice;
  
  // Create the trade
  const trade: PaperTrade = {
    id: generateId(),
    strategyType: updatedPortfolio.strategyType,
    
    conditionId: signal.conditionId,
    tokenId: signal.tokenId,
    marketSlug: signal.marketSlug,
    marketTitle: signal.marketTitle,
    outcome: signal.outcome,
    
    entryPrice,
    rawPrice: signal.currentPrice,
    slippageApplied: slippagePct,
    size: actualShares,
    investedUsd: sizeUsd,
    entryTimestamp: currentTime,
    
    valueScore: signal.valueScore,
    polyscore: signal.polyscore,
    aiEdge: signal.aiEdge,
    traderWinRate: signal.traderWinRate,
    traderRoi: signal.traderRoi,
    conviction: signal.conviction,
    betStructure: signal.betStructure,
    niche: signal.niche,
    
    status: 'OPEN',
    
    originalTradeId: signal.originalTradeId,
    walletAddress: signal.walletAddress,
  };
  
  // Update portfolio
  updatedPortfolio.availableCash -= sizeUsd;
  updatedPortfolio.lockedCapital += sizeUsd;
  updatedPortfolio.openPositions.push(trade);
  updatedPortfolio.totalTrades++;
  updatedPortfolio.lastUpdatedAt = currentTime;
  
  return {
    portfolio: updatedPortfolio,
    trade,
    reason: `ENTERED: ${sizingReason} | Entry: ${entryDecision.reason}`,
  };
}

// Resolve a trade (market has concluded)
export function resolveTrade(
  portfolio: PortfolioState,
  tradeId: string,
  winningOutcome: 'YES' | 'NO',
  currentTime: number = Date.now(),
  cooldownHours: number = COOLDOWN_HOURS
): { portfolio: PortfolioState; trade: PaperTrade | null; pnl: number } {
  let updatedPortfolio = processCooldowns(portfolio, currentTime);
  
  // Find the trade
  const tradeIndex = updatedPortfolio.openPositions.findIndex(t => t.id === tradeId);
  if (tradeIndex === -1) {
    return { portfolio: updatedPortfolio, trade: null, pnl: 0 };
  }
  
  const trade = { ...updatedPortfolio.openPositions[tradeIndex] };
  
  // Determine if trade won or lost
  const won = trade.outcome === winningOutcome;
  trade.status = won ? 'WON' : 'LOST';
  trade.exitPrice = won ? 1 : 0;
  trade.exitTimestamp = currentTime;
  
  // Calculate P&L
  // If won: we get $1 per share, paid entryPrice per share
  // If lost: we get $0 per share, paid entryPrice per share
  const exitValue = won ? trade.size * 1 : 0;
  trade.pnlUsd = exitValue - trade.investedUsd;
  trade.roiPercent = (trade.pnlUsd / trade.investedUsd) * 100;
  
  // Calculate when capital becomes available (cooldown)
  const cooldownAvailableAt = currentTime + (cooldownHours * MS_PER_HOUR);
  trade.cashAvailableAt = cooldownAvailableAt;
  
  // Update portfolio
  updatedPortfolio.openPositions.splice(tradeIndex, 1);
  updatedPortfolio.closedPositions.push(trade);
  
  // Move capital from locked to cooldown
  updatedPortfolio.lockedCapital -= trade.investedUsd;
  
  // Add exit value to cooldown (this is what we get back)
  if (exitValue > 0) {
    updatedPortfolio.cooldownCapital += exitValue;
    updatedPortfolio.cooldownQueue.push({
      amount: exitValue,
      availableAt: cooldownAvailableAt,
    });
  }
  
  // Update P&L tracking
  updatedPortfolio.totalPnL += trade.pnlUsd;
  if (won) {
    updatedPortfolio.winningTrades++;
  } else {
    updatedPortfolio.losingTrades++;
  }
  
  // Update peak and drawdown
  const currentValue = getPortfolioValue(updatedPortfolio);
  if (currentValue > updatedPortfolio.peakCapital) {
    updatedPortfolio.peakCapital = currentValue;
  }
  updatedPortfolio.drawdown = Math.max(
    updatedPortfolio.drawdown,
    (updatedPortfolio.peakCapital - currentValue) / updatedPortfolio.peakCapital
  );
  
  updatedPortfolio.lastUpdatedAt = currentTime;
  
  return {
    portfolio: updatedPortfolio,
    trade,
    pnl: trade.pnlUsd,
  };
}

// Mark a trade as cancelled/push (refunded)
export function cancelTrade(
  portfolio: PortfolioState,
  tradeId: string,
  currentTime: number = Date.now()
): PortfolioState {
  let updatedPortfolio = processCooldowns(portfolio, currentTime);
  
  const tradeIndex = updatedPortfolio.openPositions.findIndex(t => t.id === tradeId);
  if (tradeIndex === -1) {
    return updatedPortfolio;
  }
  
  const trade = { ...updatedPortfolio.openPositions[tradeIndex] };
  trade.status = 'CANCELLED';
  trade.exitTimestamp = currentTime;
  trade.pnlUsd = 0;
  trade.roiPercent = 0;
  
  // Remove from open and add to closed
  updatedPortfolio.openPositions.splice(tradeIndex, 1);
  updatedPortfolio.closedPositions.push(trade);
  
  // Refund capital immediately (no cooldown for cancelled)
  updatedPortfolio.lockedCapital -= trade.investedUsd;
  updatedPortfolio.availableCash += trade.investedUsd;
  
  updatedPortfolio.lastUpdatedAt = currentTime;
  
  return updatedPortfolio;
}

// Get current portfolio value
export function getPortfolioValue(portfolio: PortfolioState): number {
  return portfolio.availableCash + portfolio.lockedCapital + portfolio.cooldownCapital;
}

// Record an hourly snapshot
export function recordHourlySnapshot(
  portfolio: PortfolioState,
  currentTime: number,
  tradesThisHour: number = 0,
  resolutionsThisHour: number = 0,
  pnlThisHour: number = 0
): PortfolioState {
  const hour = getHourNumber(currentTime, portfolio.startedAt);
  const portfolioValue = getPortfolioValue(portfolio);
  
  const snapshot: HourlySnapshot = {
    hour,
    timestamp: currentTime,
    portfolioValue,
    availableCash: portfolio.availableCash,
    lockedCapital: portfolio.lockedCapital,
    cooldownCapital: portfolio.cooldownCapital,
    openPositions: portfolio.openPositions.length,
    tradesThisHour,
    resolutionsThisHour,
    pnlThisHour,
    cumulativePnl: portfolio.totalPnL,
  };
  
  // Only add if this hour doesn't exist yet
  const existingIdx = portfolio.hourlySnapshots.findIndex(s => s.hour === hour);
  if (existingIdx >= 0) {
    // Update existing snapshot
    portfolio.hourlySnapshots[existingIdx] = snapshot;
  } else {
    portfolio.hourlySnapshots.push(snapshot);
  }
  
  // Track trades per hour
  portfolio.tradesPerHour[hour] = (portfolio.tradesPerHour[hour] || 0) + tradesThisHour;
  
  return portfolio;
}

// Get portfolio performance metrics
export function getPerformanceMetrics(portfolio: PortfolioState): {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
} {
  const totalValue = getPortfolioValue(portfolio);
  const totalPnLPercent = ((totalValue - portfolio.initialCapital) / portfolio.initialCapital) * 100;
  const winRate = portfolio.totalTrades > 0 
    ? (portfolio.winningTrades / portfolio.totalTrades) * 100 
    : 0;
  
  // Calculate avg win/loss
  const wins = portfolio.closedPositions.filter(t => t.status === 'WON');
  const losses = portfolio.closedPositions.filter(t => t.status === 'LOST');
  
  const avgWin = wins.length > 0 
    ? wins.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0) / wins.length 
    : 0;
  const avgLoss = losses.length > 0 
    ? Math.abs(losses.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0) / losses.length)
    : 0;
  
  // Profit factor
  const grossProfit = wins.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  // Simple Sharpe ratio approximation (daily returns std dev would be more accurate)
  const returns = portfolio.closedPositions
    .filter(t => t.status !== 'CANCELLED')
    .map(t => t.roiPercent ?? 0);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 
    ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;
  
  return {
    totalValue,
    totalPnL: portfolio.totalPnL,
    totalPnLPercent,
    winRate,
    totalTrades: portfolio.totalTrades,
    winningTrades: portfolio.winningTrades,
    losingTrades: portfolio.losingTrades,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown: portfolio.drawdown * 100,
    sharpeRatio,
  };
}

// Format portfolio summary for display
export function formatPortfolioSummary(portfolio: PortfolioState): string {
  const config = getStrategyConfig(portfolio.strategyType);
  const metrics = getPerformanceMetrics(portfolio);
  
  const daysElapsed = (Date.now() - portfolio.startedAt) / MS_PER_DAY;
  const daysRemaining = Math.max(0, (portfolio.endsAt - Date.now()) / MS_PER_DAY);
  
  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║  📊 ${config.name.padEnd(68)}║
╠══════════════════════════════════════════════════════════════════════════════╣
║  💰 Portfolio Value: $${metrics.totalValue.toFixed(2).padEnd(15)} P&L: ${(metrics.totalPnL >= 0 ? '+' : '')}$${metrics.totalPnL.toFixed(2).padEnd(15)} (${(metrics.totalPnLPercent >= 0 ? '+' : '')}${metrics.totalPnLPercent.toFixed(1)}%)
║  
║  📈 Win Rate: ${metrics.winRate.toFixed(1)}%               Trades: ${metrics.totalTrades} (${metrics.winningTrades}W/${metrics.losingTrades}L)
║  💵 Avg Win: +$${metrics.avgWin.toFixed(2).padEnd(10)}       Avg Loss: -$${metrics.avgLoss.toFixed(2)}
║  📉 Max Drawdown: ${metrics.maxDrawdown.toFixed(1)}%        Profit Factor: ${metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)}
║  
║  💳 Available: $${portfolio.availableCash.toFixed(2)}  |  Locked: $${portfolio.lockedCapital.toFixed(2)}  |  Cooldown: $${portfolio.cooldownCapital.toFixed(2)}
║  ⏱️  Day ${daysElapsed.toFixed(1)} of 4 (${daysRemaining.toFixed(1)} days remaining)
║  🔓 Open Positions: ${portfolio.openPositions.length}
╚══════════════════════════════════════════════════════════════════════════════╝
`.trim();
}
