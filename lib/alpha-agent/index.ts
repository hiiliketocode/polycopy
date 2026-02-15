/**
 * Alpha Agent - Autonomous AI Trading Strategy Optimizer
 * 
 * An AI agent that manages 3 prediction market bots, learns from all bot
 * performance data, and continuously optimizes strategies to find and
 * maintain trading edge.
 * 
 * Components:
 * - agent-core.ts    - Main orchestration loop (observe-analyze-reflect-decide-act)
 * - data-analyzer.ts - Performance data collection and analysis
 * - memory-system.ts - 3-tier persistent memory with reflection loops
 * - llm-engine.ts    - Gemini-powered reasoning and decision-making
 * - strategy-optimizer.ts - Strategy change application with safety bounds
 * - supabase-tool.ts - Read-only Supabase queries for live trading data
 * - bigquery-tool.ts - Read-only BigQuery queries for historical data
 * - types.ts         - Type definitions and config boundaries
 */

export { runAgentCycle, getAgentStatus } from './agent-core';
export { getAllBotSnapshots, getBotTrades, buildStrategyComparison, buildObservationSummary } from './data-analyzer';
export { createMemory, createMemories, retrieveRelevantMemories, getStrategyKnowledge, getHypotheses } from './memory-system';
export { runLLMAnalysis, chatWithAgent } from './llm-engine';
export { applyStrategyChanges, evaluatePastDecisions } from './strategy-optimizer';
export { executeAgentQuery, validateQuery, getTableDescriptions } from './bigquery-tool';
export {
  SUPABASE_TABLE_DESCRIPTIONS,
  queryAllWalletPerformance,
  queryWalletTrades,
  queryPriceBandPerformance,
  queryTopTraders,
  queryMarketCategoryPerformance,
  queryTimeToResolution,
  querySkipReasons,
  queryLTExecutionQuality,
  queryTradesByCriteria,
  queryTraderStats,
} from './supabase-tool';
export * from './types';
