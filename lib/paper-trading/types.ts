// Paper Trading Framework Types
// Simulates auto-trading strategies with virtual capital

export type StrategyType = 
  | 'PURE_VALUE_SCORE'      // Strategy 1: Trade based solely on Value Score
  | 'WEIGHTED_VALUE_SCORE'  // Strategy 2: Weighted combination of factors
  | 'SINGLES_ONLY_V1'       // Strategy 3: Only single-outcome markets (conservative)
  | 'SINGLES_ONLY_V2';      // Strategy 4: Singles with Kelly sizing (aggressive)

// Hourly performance snapshot
export interface HourlySnapshot {
  hour: number;              // Hour number (0-95 for 4 days)
  timestamp: number;
  portfolioValue: number;
  availableCash: number;
  lockedCapital: number;
  cooldownCapital: number;
  openPositions: number;
  tradesThisHour: number;
  resolutionsThisHour: number;
  pnlThisHour: number;
  cumulativePnl: number;
}

export type TradeStatus = 'OPEN' | 'WON' | 'LOST' | 'PUSH' | 'CANCELLED';

export type BetStructure = 'STANDARD' | 'SPREAD' | 'OVER_UNDER' | 'WINNER';

export interface PaperTrade {
  id: string;
  strategyType: StrategyType;
  
  // Trade details
  conditionId: string;
  tokenId: string;
  marketSlug: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  
  // Entry details
  entryPrice: number;         // Price including slippage
  rawPrice: number;           // Original market price
  slippageApplied: number;    // Slippage percentage (e.g., 0.04)
  size: number;               // Number of shares/contracts
  investedUsd: number;        // Total USD invested
  entryTimestamp: number;     // When trade was entered
  
  // Market context at entry
  valueScore?: number;
  polyscore?: number;
  aiEdge?: number;
  traderWinRate?: number;
  traderRoi?: number;
  conviction?: number;
  betStructure?: BetStructure;
  niche?: string;
  
  // Resolution
  status: TradeStatus;
  exitPrice?: number;         // Final resolution price (1 for win, 0 for loss)
  exitTimestamp?: number;     // When trade resolved
  pnlUsd?: number;            // Profit/Loss in USD
  roiPercent?: number;        // Return on investment percentage
  
  // Cooldown tracking
  cashAvailableAt?: number;   // When capital becomes available again (3hr after resolution)
  
  // Debug/tracking
  originalTradeId?: string;   // Reference to the original trade that triggered this
  walletAddress?: string;     // Trader whose trade we copied
}

export interface StrategyConfig {
  type: StrategyType;
  name: string;
  description: string;
  
  // Entry criteria
  minValueScore?: number;     // Minimum value score to enter
  minPolyscore?: number;      // Minimum polyscore to enter
  minAiEdge?: number;         // Minimum AI edge percentage
  minTraderWinRate?: number;  // Minimum trader win rate
  minTraderRoi?: number;      // Minimum trader ROI
  minConviction?: number;     // Minimum conviction score
  
  // Bet structure filters (undefined = trade all types)
  allowedBetStructures?: BetStructure[];
  
  // Position sizing - ALL strategies use EDGE_BASED for fair comparison
  positionSizeType: 'FIXED_USD' | 'PERCENT_BANKROLL' | 'KELLY' | 'EDGE_BASED';
  fixedPositionUsd?: number;  // For FIXED_USD
  percentOfBankroll?: number; // For PERCENT_BANKROLL (e.g., 0.05 = 5%)
  kellyFraction?: number;     // For KELLY (e.g., 0.25 = quarter Kelly)
  maxPositionUsd?: number;    // Maximum position size
  minPositionUsd?: number;    // Minimum position size
  
  // Weighting (for WEIGHTED_VALUE_SCORE)
  weights?: {
    valueScore: number;       // Weight for value score (0-1)
    polyscore: number;        // Weight for polyscore (0-1)
    traderWinRate: number;    // Weight for trader win rate (0-1)
    conviction: number;       // Weight for conviction (0-1)
    aiEdge: number;           // Weight for AI edge (0-1)
  };
  minWeightedScore?: number;  // Minimum weighted score to enter
}

// =============================================================================
// EDGE-BASED POSITION SIZING
// =============================================================================
// All strategies use the same sizing formula to isolate entry criteria:
//
// Base bet = 5% of available bankroll
// Multiplier based on edge:
//   - Edge 0-2%:   0.5x (half size - low conviction)
//   - Edge 2-5%:   1.0x (normal size)
//   - Edge 5-10%:  1.5x (increased size)
//   - Edge 10%+:   2.0x (max size)
//
// Final bet = Base × Multiplier, clamped to min/max
// =============================================================================

export function calculateEdgeBasedSize(
  availableCash: number,
  aiEdge: number,  // Edge percentage (e.g., 5 means 5%)
  minSize: number = 10,
  maxSize: number = 100
): { sizeUsd: number; multiplier: number; reason: string } {
  const basePct = 0.05;  // 5% of bankroll as base
  const baseBet = availableCash * basePct;
  
  // Determine multiplier based on edge
  let multiplier: number;
  let edgeCategory: string;
  
  if (aiEdge < 0) {
    // Negative edge - shouldn't happen but safety
    multiplier = 0;
    edgeCategory = 'negative (skip)';
  } else if (aiEdge < 2) {
    multiplier = 0.5;
    edgeCategory = 'low (0-2%)';
  } else if (aiEdge < 5) {
    multiplier = 1.0;
    edgeCategory = 'medium (2-5%)';
  } else if (aiEdge < 10) {
    multiplier = 1.5;
    edgeCategory = 'high (5-10%)';
  } else {
    multiplier = 2.0;
    edgeCategory = 'very high (10%+)';
  }
  
  let sizeUsd = baseBet * multiplier;
  
  // Clamp to min/max
  sizeUsd = Math.max(minSize, Math.min(maxSize, sizeUsd));
  
  // Don't exceed available cash
  sizeUsd = Math.min(sizeUsd, availableCash);
  
  const reason = `Edge-based: ${edgeCategory} → ${multiplier}x multiplier → $${sizeUsd.toFixed(0)}`;
  
  return { sizeUsd, multiplier, reason };
}

export interface PortfolioState {
  strategyType: StrategyType;
  initialCapital: number;
  availableCash: number;
  lockedCapital: number;      // Capital in open positions
  cooldownCapital: number;    // Capital waiting for cooldown
  
  // Position tracking
  openPositions: PaperTrade[];
  closedPositions: PaperTrade[];
  
  // Cooldown queue
  cooldownQueue: Array<{
    amount: number;
    availableAt: number;
  }>;
  
  // Performance metrics
  totalPnL: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  peakCapital: number;
  drawdown: number;
  
  // Hourly tracking
  hourlySnapshots: HourlySnapshot[];
  tradesPerHour: Record<number, number>;  // hour -> trade count
  
  // Risk management
  maxConcurrentPositions: number;  // Max open positions at once
  maxPositionPerMarket: number;    // Max positions in same market
  
  // Timestamps
  startedAt: number;
  lastUpdatedAt: number;
  endsAt: number;             // 4 days from start
}

export type SimulationMode = 'backtest' | 'live';
export type SizingMode = 'controlled' | 'full';

export interface SimulationConfig {
  // Mode
  mode: SimulationMode;       // 'backtest' or 'live'
  sizingMode: SizingMode;     // 'controlled' (all same) or 'full' (strategy-specific)
  
  // Duration
  durationDays: number;       // Default: 4
  startTimestamp?: number;    // When to start (default: now)
  
  // Capital
  initialCapital: number;     // Default: $1,000
  
  // Slippage
  slippagePct: number;        // Default: 0.04 (4%)
  
  // Cooldown
  cooldownHours: number;      // Default: 3 hours after resolution
  
  // Controlled sizing (when sizingMode = 'controlled')
  controlledPositionUsd: number;  // Default: $50 - same for all strategies
  
  // Data source
  useHistoricalData: boolean; // True for backtest, false for live
  historicalStartDate?: string; // For backtesting
  historicalEndDate?: string;   // For backtesting
  
  // Strategies to run
  strategies: StrategyType[];
}

export interface SimulationResult {
  config: SimulationConfig;
  portfolios: Record<StrategyType, PortfolioState>;
  
  // Summary stats
  rankings: Array<{
    strategy: StrategyType;
    finalValue: number;
    totalPnL: number;
    roi: number;
    winRate: number;
    totalTrades: number;
    maxDrawdown: number;
    sharpeRatio?: number;
  }>;
  
  // Timeline
  valueHistory: Record<StrategyType, Array<{
    timestamp: number;
    portfolioValue: number;
  }>>;
  
  completedAt: number;
  durationMs: number;
}

export interface TradeSignal {
  // Trade opportunity details
  conditionId: string;
  tokenId: string;
  marketSlug: string;
  marketTitle: string;
  outcome: 'YES' | 'NO';
  currentPrice: number;
  timestamp: number;
  
  // Scoring data
  valueScore?: number;
  polyscore?: number;
  aiEdge?: number;
  aiProbability?: number;
  traderWinRate?: number;
  traderRoi?: number;
  conviction?: number;
  betStructure?: BetStructure;
  niche?: string;
  
  // Original trade reference
  originalTradeId?: string;
  walletAddress?: string;
  traderName?: string;
}

// Kelly criterion helper
export function calculateKellyBet(
  probability: number,  // Estimated win probability (0-1)
  odds: number,         // Decimal odds (e.g., price 0.4 = odds 2.5)
  fraction: number = 0.25 // Kelly fraction (default quarter Kelly)
): number {
  // Kelly formula: f* = (bp - q) / b
  // where b = decimal odds - 1, p = win probability, q = 1 - p
  const b = odds - 1;
  const p = probability;
  const q = 1 - p;
  
  const kellyFraction = (b * p - q) / b;
  
  // Apply Kelly fraction and ensure non-negative
  return Math.max(0, kellyFraction * fraction);
}

// Calculate weighted score for WEIGHTED_VALUE_SCORE strategy
export function calculateWeightedScore(
  signal: TradeSignal,
  weights: NonNullable<StrategyConfig['weights']>
): number {
  const normalize = (value: number | undefined, min: number, max: number): number => {
    if (value === undefined) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  };
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  // Value Score (0-100) -> normalized 0-1
  if (signal.valueScore !== undefined && weights.valueScore > 0) {
    weightedSum += normalize(signal.valueScore, 0, 100) * weights.valueScore;
    totalWeight += weights.valueScore;
  }
  
  // Polyscore (0-100) -> normalized 0-1
  if (signal.polyscore !== undefined && weights.polyscore > 0) {
    weightedSum += normalize(signal.polyscore, 0, 100) * weights.polyscore;
    totalWeight += weights.polyscore;
  }
  
  // Trader Win Rate (0-1)
  if (signal.traderWinRate !== undefined && weights.traderWinRate > 0) {
    weightedSum += normalize(signal.traderWinRate, 0.4, 0.8) * weights.traderWinRate;
    totalWeight += weights.traderWinRate;
  }
  
  // Conviction (0-5) -> normalized 0-1
  if (signal.conviction !== undefined && weights.conviction > 0) {
    weightedSum += normalize(signal.conviction, 0, 5) * weights.conviction;
    totalWeight += weights.conviction;
  }
  
  // AI Edge (-20% to +30%) -> normalized 0-1
  if (signal.aiEdge !== undefined && weights.aiEdge > 0) {
    weightedSum += normalize(signal.aiEdge, -10, 20) * weights.aiEdge;
    totalWeight += weights.aiEdge;
  }
  
  return totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
}
