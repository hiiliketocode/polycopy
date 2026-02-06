// Paper Trading Strategies
// Implements the 4 distinct trading strategies

import {
  StrategyType,
  StrategyConfig,
  TradeSignal,
  BetStructure,
  calculateWeightedScore,
  calculateKellyBet,
  calculateEdgeBasedSize,
} from './types';

// =============================================================================
// STRATEGY DESIGN PHILOSOPHY
// =============================================================================
// 
// 1. ALL strategies trade ALL bet types (spreads, totals, moneylines)
//    - Let the VALUE SCORE decide what's worth betting, not artificial filters
//    - If AI says a spread has +10% edge, we bet it
//
// 2. ALL strategies use IDENTICAL position sizing
//    - Sizing based on EDGE from the model (bet more when edge is higher)
//    - This isolates the ONLY variable: ENTRY CRITERIA
//    - We're testing which ENTRY STRATEGY picks the best trades
//
// 3. The 4 strategies differ ONLY in their entry criteria:
//    - Strategy 1: Pure Value Score threshold
//    - Strategy 2: Multi-factor weighted scoring
//    - Strategy 3: High threshold + requires trader quality
//    - Strategy 4: Strict criteria (edge + win rate + value)
//
// =============================================================================

export const STRATEGY_CONFIGS: Record<StrategyType, StrategyConfig> = {
  // Strategy 1: Pure Value Score
  // Simplest approach - just look at AI value score
  // Entry: Value Score >= 60
  PURE_VALUE_SCORE: {
    type: 'PURE_VALUE_SCORE',
    name: 'Pure Value Score',
    description: 'Simple threshold: enters when AI value score >= 60. No other filters.',
    
    // Entry criteria - simple value threshold
    minValueScore: 60,
    
    // NO bet structure filter - trades everything
    allowedBetStructures: undefined,
    
    // Position sizing: EDGE_BASED (same for all strategies)
    positionSizeType: 'EDGE_BASED',
    maxPositionUsd: 100,
    minPositionUsd: 10,
  },

  // Strategy 2: Weighted Multi-Factor
  // More sophisticated - combines multiple signals
  // Entry: Weighted composite score >= 55
  WEIGHTED_VALUE_SCORE: {
    type: 'WEIGHTED_VALUE_SCORE',
    name: 'Weighted Multi-Factor',
    description: 'Multi-factor scoring: value (30%) + polyscore (25%) + trader win rate (25%) + edge (20%). Entry when weighted >= 55.',
    
    // Entry criteria - weighted composite
    minWeightedScore: 55,
    
    // Weights for composite score
    weights: {
      valueScore: 0.30,       // 30% - AI value assessment
      polyscore: 0.25,        // 25% - Opportunity score
      traderWinRate: 0.25,    // 25% - Trader's historical win rate
      conviction: 0.00,       // 0% - Removed (we control sizing)
      aiEdge: 0.20,           // 20% - Price edge percentage
    },
    
    // NO bet structure filter - trades everything
    allowedBetStructures: undefined,
    
    // Position sizing: EDGE_BASED (same for all strategies)
    positionSizeType: 'EDGE_BASED',
    maxPositionUsd: 100,
    minPositionUsd: 10,
  },

  // Strategy 3: High Value + Quality Trader
  // Higher bar - needs strong value AND good trader
  // Entry: Value >= 70 AND trader win rate >= 52%
  SINGLES_ONLY_V1: {
    type: 'SINGLES_ONLY_V1',
    name: 'High Value + Quality',
    description: 'Stricter: value score >= 70 AND trader win rate >= 52%. Requires both signal quality AND trader quality.',
    
    // Entry criteria - dual requirement
    minValueScore: 70,
    minTraderWinRate: 0.52,
    
    // NO bet structure filter - trades everything
    allowedBetStructures: undefined,
    
    // Position sizing: EDGE_BASED (same for all strategies)
    positionSizeType: 'EDGE_BASED',
    maxPositionUsd: 100,
    minPositionUsd: 10,
  },

  // Strategy 4: Strict Edge Requirements
  // Most selective - needs positive edge AND high value AND good trader
  // Entry: Value >= 65 AND Edge >= 3% AND Win Rate >= 55%
  SINGLES_ONLY_V2: {
    type: 'SINGLES_ONLY_V2',
    name: 'Strict Edge Filter',
    description: 'Most selective: value >= 65 AND AI edge >= 3% AND trader win rate >= 55%. Triple filter for highest conviction.',
    
    // Entry criteria - triple requirement
    minValueScore: 65,
    minAiEdge: 3,             // Must have at least 3% positive edge
    minTraderWinRate: 0.55,   // Trader must have >55% win rate
    
    // NO bet structure filter - trades everything
    allowedBetStructures: undefined,
    
    // Position sizing: EDGE_BASED (same for all strategies)
    positionSizeType: 'EDGE_BASED',
    maxPositionUsd: 100,
    minPositionUsd: 10,
  },
};

// Strategy decision: Should we enter this trade?
export function shouldEnterTrade(
  signal: TradeSignal,
  config: StrategyConfig
): { shouldEnter: boolean; reason: string; score?: number } {
  // Check bet structure filter
  if (config.allowedBetStructures && signal.betStructure) {
    if (!config.allowedBetStructures.includes(signal.betStructure)) {
      return {
        shouldEnter: false,
        reason: `Bet structure ${signal.betStructure} not allowed (only ${config.allowedBetStructures.join(', ')})`,
      };
    }
  }

  // Check minimum value score
  if (config.minValueScore !== undefined) {
    const valueScore = signal.valueScore ?? 0;
    if (valueScore < config.minValueScore) {
      return {
        shouldEnter: false,
        reason: `Value score ${valueScore.toFixed(1)} below minimum ${config.minValueScore}`,
        score: valueScore,
      };
    }
  }

  // Check minimum polyscore
  if (config.minPolyscore !== undefined) {
    const polyscore = signal.polyscore ?? 0;
    if (polyscore < config.minPolyscore) {
      return {
        shouldEnter: false,
        reason: `Polyscore ${polyscore.toFixed(1)} below minimum ${config.minPolyscore}`,
        score: polyscore,
      };
    }
  }

  // Check minimum AI edge
  if (config.minAiEdge !== undefined) {
    const aiEdge = signal.aiEdge ?? -100;
    if (aiEdge < config.minAiEdge) {
      return {
        shouldEnter: false,
        reason: `AI edge ${aiEdge.toFixed(1)}% below minimum ${config.minAiEdge}%`,
        score: aiEdge,
      };
    }
  }

  // Check minimum trader win rate
  if (config.minTraderWinRate !== undefined) {
    const winRate = signal.traderWinRate ?? 0;
    if (winRate < config.minTraderWinRate) {
      return {
        shouldEnter: false,
        reason: `Trader win rate ${(winRate * 100).toFixed(1)}% below minimum ${(config.minTraderWinRate * 100).toFixed(1)}%`,
        score: winRate,
      };
    }
  }

  // Check minimum trader ROI
  if (config.minTraderRoi !== undefined) {
    const roi = signal.traderRoi ?? -1;
    if (roi < config.minTraderRoi) {
      return {
        shouldEnter: false,
        reason: `Trader ROI ${(roi * 100).toFixed(1)}% below minimum ${(config.minTraderRoi * 100).toFixed(1)}%`,
        score: roi,
      };
    }
  }

  // Check minimum conviction
  if (config.minConviction !== undefined) {
    const conviction = signal.conviction ?? 0;
    if (conviction < config.minConviction) {
      return {
        shouldEnter: false,
        reason: `Conviction ${conviction.toFixed(2)} below minimum ${config.minConviction}`,
        score: conviction,
      };
    }
  }

  // For weighted strategy, check weighted score
  if (config.type === 'WEIGHTED_VALUE_SCORE' && config.weights && config.minWeightedScore !== undefined) {
    const weightedScore = calculateWeightedScore(signal, config.weights);
    if (weightedScore < config.minWeightedScore) {
      return {
        shouldEnter: false,
        reason: `Weighted score ${weightedScore.toFixed(1)} below minimum ${config.minWeightedScore}`,
        score: weightedScore,
      };
    }
    return {
      shouldEnter: true,
      reason: `Weighted score ${weightedScore.toFixed(1)} meets threshold`,
      score: weightedScore,
    };
  }

  // All checks passed
  return {
    shouldEnter: true,
    reason: `All criteria met (value: ${signal.valueScore?.toFixed(1) ?? 'N/A'}, edge: ${signal.aiEdge?.toFixed(1) ?? 'N/A'}%)`,
    score: signal.valueScore,
  };
}

// Calculate position size based on edge
// ALL strategies use the same EDGE-BASED sizing formula
// This ensures the ONLY variable is entry criteria
export function calculatePositionSize(
  signal: TradeSignal,
  config: StrategyConfig,
  availableCash: number,
  _controlledSizeUsd?: number  // Deprecated - we always use edge-based now
): { sizeUsd: number; shares: number; reason: string } {
  // ALL strategies use EDGE-BASED sizing
  // This is the key insight: by using identical sizing, we isolate entry criteria
  
  const aiEdge = signal.aiEdge ?? 0;
  const minSize = config.minPositionUsd ?? 10;
  const maxSize = config.maxPositionUsd ?? 100;
  
  const { sizeUsd: calculatedSize, multiplier, reason: edgeReason } = calculateEdgeBasedSize(
    availableCash,
    aiEdge,
    minSize,
    maxSize
  );
  
  let sizeUsd = calculatedSize;
  let reason = edgeReason;
  
  // Don't bet if edge is negative
  if (aiEdge < 0) {
    return { 
      sizeUsd: 0, 
      shares: 0, 
      reason: `Negative edge (${aiEdge.toFixed(1)}%) - no bet` 
    };
  }
  
  // Don't exceed available cash
  if (sizeUsd > availableCash) {
    sizeUsd = availableCash;
    reason += ` (limited to available $${availableCash.toFixed(0)})`;
  }

  // Calculate shares (contracts)
  const shares = signal.currentPrice > 0 ? sizeUsd / signal.currentPrice : 0;

  return { sizeUsd, shares, reason };
}

// Calculate entry price with slippage
export function calculateEntryPrice(
  rawPrice: number,
  slippagePct: number,
  side: 'BUY' | 'SELL' = 'BUY'
): number {
  // For BUY, we pay more (price goes up with slippage)
  // For SELL, we receive less (price goes down with slippage)
  if (side === 'BUY') {
    return Math.min(0.99, rawPrice * (1 + slippagePct));
  } else {
    return Math.max(0.01, rawPrice * (1 - slippagePct));
  }
}

// Get strategy by type
export function getStrategyConfig(type: StrategyType): StrategyConfig {
  return STRATEGY_CONFIGS[type];
}

// Get all strategies
export function getAllStrategies(): StrategyConfig[] {
  return Object.values(STRATEGY_CONFIGS);
}

// Utility: Format strategy summary
export function formatStrategySummary(config: StrategyConfig): string {
  const lines = [
    `📊 ${config.name}`,
    `   ${config.description}`,
    '',
    '   Entry Criteria:',
  ];

  if (config.minValueScore !== undefined) {
    lines.push(`   • Value Score ≥ ${config.minValueScore}`);
  }
  if (config.minPolyscore !== undefined) {
    lines.push(`   • Polyscore ≥ ${config.minPolyscore}`);
  }
  if (config.minAiEdge !== undefined) {
    lines.push(`   • AI Edge ≥ ${config.minAiEdge}%`);
  }
  if (config.minTraderWinRate !== undefined) {
    lines.push(`   • Trader Win Rate ≥ ${(config.minTraderWinRate * 100).toFixed(0)}%`);
  }
  if (config.allowedBetStructures) {
    lines.push(`   • Bet Types: ${config.allowedBetStructures.join(', ')}`);
  }

  lines.push('');
  lines.push('   Position Sizing:');
  
  switch (config.positionSizeType) {
    case 'FIXED_USD':
      lines.push(`   • Fixed: $${config.fixedPositionUsd}`);
      break;
    case 'PERCENT_BANKROLL':
      lines.push(`   • ${((config.percentOfBankroll ?? 0.05) * 100).toFixed(0)}% of bankroll`);
      break;
    case 'KELLY':
      lines.push(`   • Kelly criterion (${((config.kellyFraction ?? 0.25) * 100).toFixed(0)}% fraction)`);
      break;
  }

  if (config.maxPositionUsd) {
    lines.push(`   • Max: $${config.maxPositionUsd}`);
  }

  return lines.join('\n');
}
