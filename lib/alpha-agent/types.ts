/**
 * Alpha Agent Type Definitions
 * Core types for the autonomous AI trading strategy optimizer
 */

// ============================================================================
// Memory Types
// ============================================================================

export type MemoryTier = 'short_term' | 'mid_term' | 'long_term';

export type MemoryType =
  | 'observation'
  | 'pattern'
  | 'hypothesis'
  | 'lesson'
  | 'anti_pattern'
  | 'strategy_rule'
  | 'market_regime'
  | 'trader_insight'
  | 'reflection';

export interface AgentMemory {
  memory_id: string;
  memory_tier: MemoryTier;
  memory_type: MemoryType;
  title: string;
  content: string;
  evidence: Record<string, unknown>;
  confidence: number;
  tags: string[];
  related_memory_ids: string[];
  source_run_id: string | null;
  validated: boolean;
  validation_result: string | null;
  times_referenced: number;
  decay_factor: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Bot Types
// ============================================================================

export type BotRole = 'explorer' | 'optimizer' | 'conservative';

export interface AgentBot {
  bot_id: string;
  ft_wallet_id: string;
  bot_role: BotRole;
  description: string;
  current_hypothesis: string | null;
  last_config_change: string | null;
  total_config_changes: number;
}

// ============================================================================
// Performance Data Types
// ============================================================================

export interface BotPerformanceSnapshot {
  wallet_id: string;
  config_id: string;
  strategy_name: string;
  description: string;
  is_active: boolean;
  is_agent_managed: boolean;

  // Config
  model_threshold: number | null;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  allocation_method: string;
  kelly_fraction: number;
  bet_size: number;
  min_bet: number;
  max_bet: number;
  min_trader_resolved_count: number;
  min_conviction: number;
  detailed_description: string | null;

  // Performance
  starting_balance: number;
  current_balance: number;
  total_pnl: number;
  roi_pct: number;
  total_trades: number;
  open_trades: number;
  resolved_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;

  // Edge metrics
  avg_edge: number;
  avg_model_probability: number | null;
  avg_conviction: number;

  // Time metrics
  avg_time_to_resolution_hours: number | null;

  // Recent performance (last 48h)
  recent_trades: number;
  recent_wins: number;
  recent_pnl: number;
  recent_win_rate: number;
}

export interface TradeDetail {
  order_id: string;
  wallet_id: string;
  market_title: string;
  condition_id: string;
  trader_address: string;
  entry_price: number;
  size: number;
  edge_pct: number;
  model_probability: number | null;
  conviction: number;
  trader_win_rate: number;
  outcome: 'OPEN' | 'WON' | 'LOST';
  pnl: number | null;
  order_time: string;
  resolved_time: string | null;
  time_to_resolution_hours: number | null;
}

export interface StrategyComparison {
  // Which strategies outperform across various dimensions
  by_win_rate: { wallet_id: string; win_rate: number; trades: number }[];
  by_roi: { wallet_id: string; roi_pct: number; total_pnl: number }[];
  by_profit_factor: { wallet_id: string; profit_factor: number }[];
  by_edge: { wallet_id: string; avg_edge: number }[];

  // Price band analysis
  price_band_performance: {
    band: string;
    trades: number;
    win_rate: number;
    avg_pnl: number;
    avg_edge: number;
  }[];

  // Allocation method analysis
  allocation_performance: {
    method: string;
    wallets_using: number;
    avg_roi: number;
    avg_win_rate: number;
  }[];

  // Time analysis
  time_to_resolution: {
    bucket: string;
    trades: number;
    win_rate: number;
    avg_pnl: number;
  }[];

  // Trader analysis
  top_traders: {
    trader_address: string;
    total_trades_copied: number;
    win_rate: number;
    total_pnl: number;
  }[];

  // Market category analysis
  category_performance: {
    category: string;
    trades: number;
    win_rate: number;
    avg_pnl: number;
  }[];
}

// ============================================================================
// Agent Run Types
// ============================================================================

export type RunPhase = 'observe' | 'analyze' | 'reflect' | 'decide' | 'act' | 'log';

export interface AgentRun {
  run_id: string;
  run_type: 'scheduled' | 'manual' | 'reactive';
  status: 'running' | 'completed' | 'failed' | 'partial';
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  phases_completed: Record<RunPhase, boolean>;
  observation_summary: ObservationSummary;
  analysis: string | null;
  patterns_found: PatternFound[];
  decisions: DecisionRecord[];
  actions_taken: ActionRecord[];
  reflection: string | null;
  market_regime: string | null;
  total_bots_analyzed: number;
  winning_bots: number;
  losing_bots: number;
  llm_tokens_used: number;
  llm_model: string | null;
  error_message: string | null;
  error_phase: string | null;
}

export interface ObservationSummary {
  total_bots: number;
  active_bots: number;
  winning_bots: number;
  losing_bots: number;
  total_trades_all_bots: number;
  total_pnl_all_bots: number;
  avg_win_rate: number;
  best_bot: { wallet_id: string; roi_pct: number; win_rate: number } | null;
  worst_bot: { wallet_id: string; roi_pct: number; win_rate: number } | null;
  agent_bots_summary: {
    explorer: BotPerformanceSnapshot | null;
    optimizer: BotPerformanceSnapshot | null;
    conservative: BotPerformanceSnapshot | null;
  };
  market_regime_signals: {
    overall_win_rate: number;
    recent_trend: 'improving' | 'declining' | 'stable';
    volatility: 'low' | 'medium' | 'high';
  };
}

export interface PatternFound {
  pattern_type: string;
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
  actionable: boolean;
  suggested_action?: string;
}

export interface DecisionRecord {
  bot_id: string;
  decision_type: string;
  config_changes: Record<string, { from: unknown; to: unknown }>;
  reasoning: string;
  hypothesis: string | null;
  expected_outcome: string;
  confidence: number;
}

export interface ActionRecord {
  bot_id: string;
  action_type: string;
  changes_applied: Record<string, unknown>;
  success: boolean;
  error?: string;
}

// ============================================================================
// LLM Types
// ============================================================================

export interface AnalysisPromptContext {
  observation_summary: ObservationSummary;
  strategy_comparison: StrategyComparison;
  all_bot_snapshots: BotPerformanceSnapshot[];
  agent_bot_details: {
    explorer: { snapshot: BotPerformanceSnapshot | null; recent_trades: TradeDetail[]; current_hypothesis: string | null };
    optimizer: { snapshot: BotPerformanceSnapshot | null; recent_trades: TradeDetail[]; current_hypothesis: string | null };
    conservative: { snapshot: BotPerformanceSnapshot | null; recent_trades: TradeDetail[]; current_hypothesis: string | null };
  };
  relevant_memories: AgentMemory[];
  recent_decisions: DecisionRecord[];
  active_hypotheses: Hypothesis[];
}

export interface Hypothesis {
  hypothesis_id: string;
  title: string;
  description: string;
  status: string;
  assigned_bot_id: string | null;
  test_config: Record<string, unknown> | null;
  trades_observed: number;
  current_win_rate: number | null;
  current_pnl: number | null;
  created_at: string;
}

export interface LLMAnalysisResponse {
  market_regime: string;
  key_observations: string[];
  patterns_found: PatternFound[];
  strategy_recommendations: {
    bot_id: string;
    changes: Record<string, unknown>;
    reasoning: string;
    hypothesis: string;
    expected_outcome: string;
    confidence: number;
  }[];
  new_hypotheses: {
    title: string;
    description: string;
    test_config: Record<string, unknown>;
    success_criteria: string;
    assign_to: BotRole;
  }[];
  exit_strategy_updates: {
    bot_id: string;
    rule_type: string;
    parameters: Record<string, unknown>;
    reasoning: string;
  }[];
  memories_to_create: {
    tier: MemoryTier;
    type: MemoryType;
    title: string;
    content: string;
    confidence: number;
    tags: string[];
    structured_evidence?: {
      data_tables?: { table_name: string; description: string; columns: { name: string; type: string }[]; rows: Record<string, unknown>[] }[];
      forecasts?: { metric: string; current_value: number; predicted_value: number; target_date: string; confidence: number; reasoning: string }[];
      calculations?: { name: string; formula: string; inputs: Record<string, number>; result: number; context: string }[];
    };
  }[];
  meta_learning_insights: MetaLearningInsight[];
  reflection: string;
}

// ============================================================================
// Structured Memory Data (tables, calculations, forecasts)
// ============================================================================

export interface MemoryDataTable {
  table_name: string;
  description: string;
  columns: { name: string; type: 'string' | 'number' | 'boolean' | 'date' }[];
  rows: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
}

export interface MemoryForecast {
  metric: string;
  current_value: number;
  predicted_value: number;
  predicted_at: string;   // When the prediction was made
  target_date: string;    // When the prediction is for
  confidence: number;
  reasoning: string;
  actual_value?: number;  // Filled in when resolved
  accuracy?: number;      // Filled in when resolved
}

export interface MemoryCalculation {
  name: string;
  formula: string;
  inputs: Record<string, number>;
  result: number;
  context: string;
  computed_at: string;
}

export interface StructuredEvidence {
  data_tables?: MemoryDataTable[];
  forecasts?: MemoryForecast[];
  calculations?: MemoryCalculation[];
  metrics_snapshot?: Record<string, number>;
  comparison_data?: Record<string, unknown>;
  [key: string]: unknown;
}

// ============================================================================
// Multi-Model Architecture
// ============================================================================

export type ModelRole = 'analyst' | 'strategist' | 'reflector' | 'conversational';

export interface ModelConfig {
  provider: 'google' | 'anthropic' | 'openai';
  model: string;
  temperature: number;
  maxOutputTokens: number;
  description: string;
}

/**
 * Model selection rationale:
 * 
 * ANALYST (Gemini 2.5 Pro): 1M token context window for ingesting massive
 * performance datasets. Best price/performance for structured JSON output
 * with large input. Excellent at quantitative reasoning.
 * 
 * STRATEGIST (Gemini 2.5 Pro): Same model for strategy decisions because
 * it needs the full data context from the analyst phase. Strong at
 * multi-step reasoning with numerical data.
 * 
 * REFLECTOR (Gemini 2.0 Flash): Faster, cheaper model for reflection since
 * it operates on summarized data, not raw trades. Good enough for
 * self-assessment and memory consolidation.
 * 
 * CONVERSATIONAL (Gemini 2.5 Pro): For the admin chatbot. Needs deep
 * context understanding and natural language. Could swap to Claude
 * for better conversational quality if API key available.
 */
export const MODEL_CONFIGS: Record<ModelRole, ModelConfig> = {
  analyst: {
    provider: 'google',
    model: 'gemini-2.5-pro-preview-06-05',
    temperature: 0.3,         // Low temp for precise analysis
    maxOutputTokens: 8192,
    description: 'Deep quantitative analysis with large context window',
  },
  strategist: {
    provider: 'google',
    model: 'gemini-2.5-pro-preview-06-05',
    temperature: 0.7,         // Moderate creativity for strategy ideas
    maxOutputTokens: 8192,
    description: 'Strategy decisions and hypothesis generation',
  },
  reflector: {
    provider: 'google',
    model: 'gemini-2.0-flash',
    temperature: 0.5,
    maxOutputTokens: 4096,
    description: 'Self-reflection and memory consolidation',
  },
  conversational: {
    provider: 'google',
    model: 'gemini-2.5-pro-preview-06-05',
    temperature: 0.7,
    maxOutputTokens: 4096,
    description: 'Admin chatbot conversations',
  },
};

// ============================================================================
// Recursive Self-Improvement Types
// ============================================================================

export type CapabilityType =
  | 'analysis_technique'     // New way to analyze data
  | 'pattern_detector'       // New pattern to look for
  | 'allocation_formula'     // New sizing approach
  | 'exit_signal'            // New exit trigger
  | 'data_query'             // New data question to ask
  | 'meta_strategy'          // Strategy about strategies
  | 'evaluation_metric';     // New way to measure success

export interface LearnedCapability {
  capability_id: string;
  capability_type: CapabilityType;
  name: string;
  description: string;
  implementation: string;   // Pseudocode or prompt fragment
  discovered_in_run: string;
  times_used: number;
  effectiveness_score: number; // 0-1 based on outcomes
  is_active: boolean;
  created_at: string;
}

export interface MetaLearningInsight {
  insight_type: 'process_improvement' | 'blind_spot' | 'new_question' | 'tool_request';
  title: string;
  description: string;
  proposed_action: string;
  priority: 'low' | 'medium' | 'high';
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    tokens_used?: number;
    memories_referenced?: string[];
    data_tables_included?: string[];
  };
}

export interface ChatSession {
  session_id: string;
  bot_id: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Configuration Boundaries (safety constraints)
// ============================================================================

export const CONFIG_BOUNDARIES = {
  model_threshold: { min: 0.40, max: 0.75, step: 0.01 },
  price_min: { min: 0.01, max: 0.50, step: 0.01 },
  price_max: { min: 0.30, max: 0.99, step: 0.01 },
  min_edge: { min: 0.0, max: 0.20, step: 0.01 },
  bet_size: { min: 0.50, max: 5.00, step: 0.10 },
  min_bet: { min: 0.50, max: 2.00, step: 0.10 },
  max_bet: { min: 3.00, max: 15.00, step: 0.50 },
  kelly_fraction: { min: 0.10, max: 0.50, step: 0.05 },
  min_trader_resolved_count: { min: 10, max: 300, step: 10 },
  min_conviction: { min: 0.0, max: 3.0, step: 0.1 },
  bet_allocation_weight: { min: 0.5, max: 2.0, step: 0.1 },
} as const;

export const ALLOWED_ALLOCATION_METHODS = [
  'FIXED', 'KELLY', 'EDGE_SCALED', 'TIERED',
  'CONFIDENCE', 'CONVICTION', 'ML_SCALED', 'WHALE'
] as const;
