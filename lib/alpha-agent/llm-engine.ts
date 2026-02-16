/**
 * Alpha Agent - LLM Reasoning Engine
 * 
 * The brain of the agent. Uses Gemini to:
 * 1. Analyze bot performance data and find patterns
 * 2. Generate strategy recommendations with reasoning chains
 * 3. Reflect on past decisions and learn from outcomes
 * 4. Create new hypotheses to test
 * 
 * Prompt design follows these principles:
 * - Chain-of-thought reasoning for every decision
 * - Explicit uncertainty quantification (confidence scores)
 * - Reference to past memories/lessons before making new decisions
 * - Structured JSON output for actionable recommendations
 * - Separation of observation, analysis, and decision phases
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AnalysisPromptContext,
  LLMAnalysisResponse,
  AgentMemory,
  BotPerformanceSnapshot,
  StrategyComparison,
  ObservationSummary,
  ModelRole,
  MetaLearningInsight,
  ChatMessage,
} from './types';
import { MODEL_CONFIGS } from './types';

// ============================================================================
// System Prompt - The Agent's Identity and Operating Manual
// ============================================================================

const SYSTEM_PROMPT = `You are ALPHA AGENT, an autonomous AI trading strategist managing prediction market bots on Polymarket. You are deeply recursive — you learn to learn, you improve your own analysis capabilities, and you track your effectiveness at improving.

## YOUR IDENTITY
You are a quantitative trading strategist who thinks in terms of edge, expected value, and risk-adjusted returns. You manage 3 bots:
1. **ALPHA_EXPLORER** (explorer): Your experimental bot. Tests new hypotheses aggressively. You rotate strategies frequently here to discover new edges. Acceptable to have lower win rates as long as you're learning.
2. **ALPHA_OPTIMIZER** (optimizer): Your refinement bot. Takes proven patterns from the explorer and other winning bots, then fine-tunes parameters for maximum performance. Should have above-average returns.
3. **ALPHA_CONSERVATIVE** (conservative): Your production bot. Only deploys highest-conviction, proven strategies. Maximum Sharpe ratio. Should be your best risk-adjusted performer.

## YOUR MISSION

Generate scalable, compounding alpha by copy-trading the best traders on Polymarket.

### KPIs You Are Measured On
1. **ROI %** — Return on capital. Target: positive and growing.
2. **Total P&L ($)** — Absolute profit. The scoreboard.
3. **Win Rate %** — Resolved winners / total resolved. Beat 55%.
4. **Profitable Copy Volume ($)** — Dollars deployed into winning trades. More volume at positive EV = more profit.
5. **Number of Successful Copies** — Winning trades. Scale matters.
6. **Profit Factor** — Gross profit / gross loss. Target > 1.5.
7. **Capital Efficiency** — ROI / time-to-resolution. Fast winners > slow winners.

Every strategy change you make should be justified in terms of these KPIs. When you recommend changes, state which KPI you expect to improve and by how much.


## DEEP ML MODEL KNOWLEDGE (poly_predictor_v11)

You must deeply understand the ML model to make informed decisions:

### Architecture
- **Model**: BigQuery ML Logistic Regression (binary classifier: WON vs LOST)
- **Training Data**: ~40M enriched trades from trader_stats_at_trade → enriched_trades_v13 → ml_training_set_v3
- **Training Method**: PnL-weighted samples with recency weighting
  - sample_weight = recency_weight × (1 / entry_price)
  - recency_weight = e^(-λ × days_ago) where λ = 0.007
  - This means: recent trades matter more, AND low-price (underdog) trades matter more
  - Implication: model is biased toward patterns in recent underdog trades — use this knowledge!

### Feature Categories (34 features, 11 categories)
1. **Win Rates (4)**: global_win_rate, D30_win_rate, D7_win_rate, niche_win_rate_history
   - INSIGHT: Short-term WR (D7) captures momentum; niche WR captures specialization
2. **ROI (3)**: lifetime_roi_pct, D30_roi_pct, D7_roi_pct
   - INSIGHT: ROI divergence from WR indicates sizing skill (or lack thereof)
3. **Performance Trends (5)**: win_rate_trend_short/long, roi_trend_short/long, performance_regime (HOT/COLD/STABLE)
   - INSIGHT: HOT traders on hot streaks have elevated model scores — but streaks end
4. **Experience (4)**: total_lifetime_trades, trader_experience_bucket, niche_experience_pct, is_in_best_niche
   - INSIGHT: Niche specialists (high niche_experience_pct + is_in_best_niche) are the strongest signals
5. **Trader Behavior (2)**: trader_selectivity, price_vs_trader_avg
   - INSIGHT: price_vs_trader_avg shows if trader is deviating from their usual — deviation can be positive (found opportunity) or negative (chasing)
6. **Conviction (3)**: conviction_z_score, trade_sequence, total_exposure_log
   - INSIGHT: High conviction_z_score (betting more than usual) combined with high WR = strongest human signal
7. **Behavioral Patterns (7)**: trader_tempo_seconds, is_chasing_price_up, is_averaging_down, stddev_bet_size, is_hedging, trader_sells_ratio, is_with_crowd
   - INSIGHT: is_chasing_price_up is generally negative; is_averaging_down with high WR can be positive (doubling on conviction)
8. **Trade Size (2)**: trade_size_tier, trade_size_log
   - INSIGHT: Larger absolute sizes from experienced traders = more information
9. **Trade Context (4)**: final_niche, bet_structure (SPREAD/TOTAL/etc), position_direction, entry_price
   - INSIGHT: SPREAD bets are more complex and may have more mispricing
10. **Market Features (4)**: volume_momentum_ratio, liquidity_impact_ratio, market_duration_days, market_age_bucket
    - INSIGHT: New markets (low market_duration_days) have more mispricing opportunity
11. **Timing (3)**: minutes_to_start, hours_to_close, market_age_days
    - INSIGHT: minutes_to_start < 0 means live event — different dynamics than pre-game

### Model Limitations You Must Account For
- Model doesn't know about external events (injuries, news, etc.)
- Model captures TRADER patterns, not MARKET fundamentals
- Model probability is calibrated on training data — real-world calibration may differ
- Model was trained on historical data — regime changes (new market types, rule changes) may not be captured
- The PnL weighting means the model overweights patterns that led to profitable underdog trades

## ALLOCATION METHODS — DEEP UNDERSTANDING
- **FIXED**: Simple, no edge dependency. Good for exploration (isolates filter quality)
- **KELLY**: Theoretically optimal but EXTREMELY sensitive to edge estimation error. 0.25 fraction is safest. Full Kelly leads to ruin.
  - Formula: fullKelly = edge / (1 - entryPrice), bet = bankroll × fullKelly × fraction
  - Key insight: Kelly assumes accurate edge — our edge estimates have error bars
- **EDGE_SCALED**: Linear scaling with edge. bet = base × (1 + edge × 5). Simple and effective.
- **TIERED**: Discrete steps. Less sensitive to noise than continuous scaling. Good for conservative deployment.
- **CONVICTION**: Uses trader's conviction (bet size relative to average). Leverages human insight about bet importance.
- **ML_SCALED**: Scales with model probability. bet = base × (0.5 + (ml - 0.5)). Ties sizing to model confidence.
- **CONFIDENCE**: Multi-factor composite. 40% edge + 30% conviction + 30% WR. Well-diversified signal.
- **WHALE**: Most sophisticated. 35% ML + 30% conviction + 25% WR + 10% edge. Best for high-conviction plays.

## SELLING & EXIT STRATEGY FRAMEWORK
You should think about exits as much as entries:
- **Stop Loss**: Protects from catastrophic loss but cuts winners. Use wider stops for high-edge entries.
- **Take Profit**: Locks gains. Useful for favorites (60-90¢ entries) where upside is capped.
- **Time-Based Exit**: Critical for capital efficiency. A position open for 7 days at 5% edge is worse than 3 positions cycling in 2 days each.
- **Edge Decay**: If the market price has moved toward your entry, your edge has decreased. Consider exiting.
- **Resolution Proximity**: As resolution approaches, positions become binary gambles. For non-sporting events, consider reducing near expiry.
- **Trader Exit Signal**: If the trader you copied sells, they may know something. Follow their exit with consideration.

## RECURSIVE SELF-IMPROVEMENT
You are designed to improve your own capabilities over time. In every run, you should:
1. **Identify blind spots**: What data are you NOT looking at that could be valuable?
2. **Propose new analysis techniques**: New ways to slice the data, new metrics to compute
3. **Evaluate your own decision quality**: Are your hypotheses being validated? If not, why?
4. **Generate meta-strategies**: Strategies about HOW to generate strategies
5. **Store structured data**: Use data tables in your memory to track hypothesis outcomes, parameter sweeps, and forecasts

You can store structured data in your evidence field: tables (rows x columns), calculations (formula + inputs + results), and forecasts (prediction + target date + confidence). USE THESE to run systematic experiments and track results over time.

## YOUR THINKING FRAMEWORK

### When analyzing performance:
1. Look at BOTH absolute performance (total PnL, ROI) and risk-adjusted metrics (profit factor, Sharpe-like ratios)
2. Consider sample size - don't trust win rates from < 20 trades
3. Separate signal from noise - is a bot winning because of skill or luck?
4. Check for regime dependencies - does the strategy only work in certain conditions?
5. Analyze time-to-resolution as a capital efficiency factor

### When finding edge:
1. Edge = structural advantage, not random variance
2. Look for PERSISTENT patterns across time and market conditions
3. The best edges come from: (a) information asymmetry (copying skilled traders), (b) behavioral mispricing (buying underdogs), (c) timing advantages (fast signal processing)
4. Edge decays - what worked last week may not work next week
5. Diversification across multiple independent edges is more robust than concentration

### When making strategy changes:
1. NEVER change more than 2-3 parameters at once (can't isolate effects)
2. Always have a clear HYPOTHESIS for why the change should improve performance
3. Define SUCCESS CRITERIA before testing (what would validate/invalidate?)
4. Give strategies enough TIME (min 20-30 trades) before evaluating
5. The explorer should test bold hypotheses; the conservative should only adopt proven ones

### When designing exit strategies:
1. Consider time-to-resolution - positions close to resolution have different dynamics
2. Stop losses protect capital but can also cut winners short
3. Take profits lock in gains but cap upside
4. Trader exit signals (copied trader sells) are valuable information
5. Edge decay over time means stale positions should be re-evaluated

## YOUR MEMORY
You have access to your past observations, patterns, hypotheses, lessons, and reflections. ALWAYS reference relevant memories when making decisions. If a similar strategy was tried before and failed, acknowledge it and explain why this time is different.

## OUTPUT FORMAT
You MUST respond with valid JSON matching the LLMAnalysisResponse schema. No markdown, no code blocks, just pure JSON.`;

// ============================================================================
// Analysis Phase - Build the analysis prompt
// ============================================================================

function buildAnalysisPrompt(context: AnalysisPromptContext): string {
  const { observation_summary: obs, strategy_comparison: comp, all_bot_snapshots: bots, agent_bot_details: agentBots, relevant_memories: memories, recent_decisions: decisions, active_hypotheses: hypotheses } = context;

  // Format bot performance data (compact)
  const botSummaries = bots
    .filter(b => b.resolved_trades >= 3)
    .sort((a, b) => b.roi_pct - a.roi_pct)
    .map(b => ({
      id: b.wallet_id,
      agent: b.is_agent_managed,
      trades: b.resolved_trades,
      wr: `${b.win_rate.toFixed(1)}%`,
      roi: `${b.roi_pct.toFixed(2)}%`,
      pnl: `$${b.total_pnl.toFixed(2)}`,
      pf: b.profit_factor === Infinity ? '∞' : b.profit_factor.toFixed(2),
      edge: `${(b.avg_edge * 100).toFixed(1)}%`,
      model: b.avg_model_probability != null ? `${(b.avg_model_probability * 100).toFixed(1)}%` : 'N/A',
      alloc: b.allocation_method,
      price_band: `${b.price_min}-${b.price_max}`,
      min_edge: b.min_edge,
      model_thresh: b.model_threshold,
      conviction: b.min_conviction,
      recent_48h: {
        trades: b.recent_trades,
        wr: `${b.recent_win_rate.toFixed(1)}%`,
        pnl: `$${b.recent_pnl.toFixed(2)}`,
      },
      ttr: b.avg_time_to_resolution_hours != null ? `${b.avg_time_to_resolution_hours.toFixed(1)}h` : 'N/A',
    }));

  // Format agent bot details
  const agentBotSections = Object.entries(agentBots).map(([role, detail]) => {
    if (!detail.snapshot) return `### ${role.toUpperCase()}\nNo data yet.`;
    const s = detail.snapshot;
    const recentTradesList = detail.recent_trades.slice(0, 10).map(t => ({
      market: t.market_title?.substring(0, 60),
      price: t.entry_price,
      edge: `${(t.edge_pct * 100).toFixed(1)}%`,
      model: t.model_probability != null ? `${(t.model_probability * 100).toFixed(1)}%` : 'N/A',
      outcome: t.outcome,
      pnl: t.pnl != null ? `$${t.pnl.toFixed(2)}` : 'open',
      ttr: t.time_to_resolution_hours != null ? `${t.time_to_resolution_hours.toFixed(1)}h` : 'N/A',
    }));
    return `### ${role.toUpperCase()} (${s.wallet_id})
Hypothesis: ${detail.current_hypothesis || 'None'}
Performance: ${s.resolved_trades} trades, ${s.win_rate.toFixed(1)}% WR, ${s.roi_pct.toFixed(2)}% ROI, $${s.total_pnl.toFixed(2)} PnL, PF=${s.profit_factor === Infinity ? '∞' : s.profit_factor.toFixed(2)}
Config: model=${s.model_threshold}, price=${s.price_min}-${s.price_max}, edge≥${s.min_edge}, alloc=${s.allocation_method}, conviction≥${s.min_conviction}
Recent 48h: ${s.recent_trades} trades, ${s.recent_win_rate.toFixed(1)}% WR, $${s.recent_pnl.toFixed(2)} PnL
Avg TTR: ${s.avg_time_to_resolution_hours != null ? `${s.avg_time_to_resolution_hours.toFixed(1)}h` : 'N/A'}
Recent trades: ${JSON.stringify(recentTradesList, null, 1)}`;
  });

  // Format memories
  const memorySection = memories.length > 0
    ? memories.map(m => `[${m.memory_tier}/${m.memory_type}] (conf=${m.confidence.toFixed(2)}) ${m.title}: ${m.content.substring(0, 200)}`).join('\n')
    : 'No relevant memories yet.';

  // Format recent decisions
  const decisionsSection = decisions.length > 0
    ? decisions.map(d => `- [${d.bot_id}] ${d.decision_type}: ${d.reasoning.substring(0, 150)} (confidence: ${d.confidence})`).join('\n')
    : 'No recent decisions.';

  // Format hypotheses
  const hypothesesSection = hypotheses.length > 0
    ? hypotheses.map(h => `- [${h.status}] ${h.title}: ${h.description.substring(0, 150)} (trades: ${h.trades_observed}, WR: ${h.current_win_rate != null ? `${h.current_win_rate.toFixed(1)}%` : 'N/A'})`).join('\n')
    : 'No active hypotheses.';

  return `## CURRENT OBSERVATION DATA

### MARKET OVERVIEW
- Total bots: ${obs.total_bots} (${obs.active_bots} active)
- Winning: ${obs.winning_bots}, Losing: ${obs.losing_bots}
- Total trades: ${obs.total_trades_all_bots}, Total PnL: $${obs.total_pnl_all_bots.toFixed(2)}
- Average win rate: ${obs.avg_win_rate.toFixed(1)}%
- Best bot: ${obs.best_bot ? `${obs.best_bot.wallet_id} (${obs.best_bot.roi_pct.toFixed(2)}% ROI, ${obs.best_bot.win_rate.toFixed(1)}% WR)` : 'N/A'}
- Worst bot: ${obs.worst_bot ? `${obs.worst_bot.wallet_id} (${obs.worst_bot.roi_pct.toFixed(2)}% ROI, ${obs.worst_bot.win_rate.toFixed(1)}% WR)` : 'N/A'}
- Market regime: ${obs.market_regime_signals.recent_trend} trend, ${obs.market_regime_signals.volatility} volatility

### ALL BOT PERFORMANCE (sorted by ROI)
${JSON.stringify(botSummaries, null, 1)}

### YOUR AGENT BOTS
${agentBotSections.join('\n\n')}

### STRATEGY COMPARISON DATA
**Top by Win Rate:** ${JSON.stringify(comp.by_win_rate.slice(0, 8))}
**Top by ROI:** ${JSON.stringify(comp.by_roi.slice(0, 8))}
**Top by Profit Factor:** ${JSON.stringify(comp.by_profit_factor.slice(0, 8))}

**Price Band Performance:** ${JSON.stringify(comp.price_band_performance)}
**Allocation Method Performance:** ${JSON.stringify(comp.allocation_performance)}
**Time to Resolution:** ${JSON.stringify(comp.time_to_resolution)}
**Top Traders:** ${JSON.stringify(comp.top_traders.slice(0, 10))}
**Category Performance:** ${JSON.stringify(comp.category_performance)}

### YOUR MEMORIES
${memorySection}

### YOUR RECENT DECISIONS
${decisionsSection}

### ACTIVE HYPOTHESES
${hypothesesSection}

---

## YOUR TASK

Analyze all the data above and produce a comprehensive response. Think step by step:

1. **OBSERVE**: What are the key facts? What's working, what's not?
2. **ANALYZE**: Why are winning strategies winning? What patterns do you see across price bands, allocation methods, trader quality, time to resolution, market categories?
3. **REFLECT**: Review your past decisions and memories. Were your previous hypotheses correct? What have you learned?
4. **DECIDE**: What specific config changes should you make to your 3 bots? Remember:
   - Explorer: Test a new hypothesis (can be bold)
   - Optimizer: Refine what's working (incremental changes)
   - Conservative: Only adopt proven, high-conviction setups
5. **EXIT STRATEGY**: Should any of your bots have updated exit rules (stop loss, take profit, time-based)?
6. **HYPOTHESIZE**: What new hypotheses should you test?
7. **REMEMBER**: What observations, patterns, or lessons should be saved to memory?

IMPORTANT CONFIG BOUNDARIES (do not exceed):
- model_threshold: 0.40-0.75
- price_min: 0.01-0.50, price_max: 0.30-0.99
- min_edge: 0.0-0.20
- bet_size: 0.50-5.00
- min/max_bet: 0.50-2.00 / 3.00-15.00
- kelly_fraction: 0.10-0.50
- min_trader_resolved_count: 10-300
- min_conviction: 0.0-3.0
- allocation_method: FIXED | KELLY | EDGE_SCALED | TIERED | CONFIDENCE | CONVICTION | ML_SCALED | WHALE

Respond with ONLY valid JSON matching this schema:
{
  "market_regime": "string (bull/bear/mixed/volatile/stable)",
  "key_observations": ["string - key facts observed"],
  "patterns_found": [{ "pattern_type": "string", "description": "string", "evidence": {}, "confidence": 0.0-1.0, "actionable": boolean, "suggested_action": "string" }],
  "strategy_recommendations": [{ 
    "bot_id": "ALPHA_EXPLORER|ALPHA_OPTIMIZER|ALPHA_CONSERVATIVE",
    "changes": { "field_name": new_value },
    "reasoning": "string - detailed reasoning chain",
    "hypothesis": "string - what you're testing",
    "expected_outcome": "string - what you expect to happen",
    "confidence": 0.0-1.0
  }],
  "new_hypotheses": [{
    "title": "string",
    "description": "string",
    "test_config": {},
    "success_criteria": "string",
    "assign_to": "explorer|optimizer|conservative"
  }],
  "exit_strategy_updates": [{
    "bot_id": "string",
    "rule_type": "time_based_exit|price_target|stop_loss|take_profit|edge_decay|resolution_proximity",
    "parameters": {},
    "reasoning": "string"
  }],
  "memories_to_create": [{
    "tier": "short_term|mid_term|long_term",
    "type": "observation|pattern|hypothesis|lesson|anti_pattern|strategy_rule|market_regime|trader_insight|reflection",
    "title": "string",
    "content": "string",
    "confidence": 0.0-1.0,
    "tags": ["string"],
    "structured_evidence": {
      "data_tables": [{ "table_name": "string", "description": "string", "columns": [{"name": "string", "type": "string|number"}], "rows": [{}] }],
      "forecasts": [{ "metric": "string", "current_value": 0, "predicted_value": 0, "target_date": "YYYY-MM-DD", "confidence": 0.0-1.0, "reasoning": "string" }],
      "calculations": [{ "name": "string", "formula": "string", "inputs": {}, "result": 0, "context": "string" }]
    }
  }],
  "meta_learning_insights": [{
    "insight_type": "process_improvement|blind_spot|new_question|tool_request",
    "title": "string",
    "description": "string",
    "proposed_action": "string",
    "priority": "low|medium|high"
  }],
  "reflection": "string - reflect on your overall performance, what you've learned, and what you should focus on next. Include an honest assessment of your decision quality, biases, and what you'd do differently."
}`;
}

// ============================================================================
// Call LLM
// ============================================================================

function getModel(genAI: GoogleGenerativeAI, role: ModelRole, jsonMode: boolean = false) {
  const config = MODEL_CONFIGS[role];
  return genAI.getGenerativeModel({
    model: config.model,
    generationConfig: {
      temperature: config.temperature,
      topP: 0.9,
      maxOutputTokens: config.maxOutputTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  });
}

export async function runLLMAnalysis(
  context: AnalysisPromptContext,
  apiKey: string
): Promise<{ response: LLMAnalysisResponse; tokensUsed: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = getModel(genAI, 'strategist', true);

  const prompt = buildAnalysisPrompt(context);

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: prompt },
  ]);

  const responseText = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

  // Parse the JSON response
  let parsed: LLMAnalysisResponse;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Failed to parse LLM response as JSON: ${responseText.substring(0, 500)}`);
    }
  }

  // Validate required fields
  if (!parsed.market_regime) parsed.market_regime = 'unknown';
  if (!parsed.key_observations) parsed.key_observations = [];
  if (!parsed.patterns_found) parsed.patterns_found = [];
  if (!parsed.strategy_recommendations) parsed.strategy_recommendations = [];
  if (!parsed.new_hypotheses) parsed.new_hypotheses = [];
  if (!parsed.exit_strategy_updates) parsed.exit_strategy_updates = [];
  if (!parsed.memories_to_create) parsed.memories_to_create = [];
  if (!parsed.meta_learning_insights) parsed.meta_learning_insights = [];
  if (!parsed.reflection) parsed.reflection = '';

  return { response: parsed, tokensUsed };
}

// ============================================================================
// Reflection Phase - Self-assessment prompt
// ============================================================================

export async function runReflection(
  reflection_context: {
    past_decisions: { reasoning: string; expected_outcome: string; outcome_result: string | null }[];
    current_performance: { explorer: BotPerformanceSnapshot | null; optimizer: BotPerformanceSnapshot | null; conservative: BotPerformanceSnapshot | null };
    past_reflections: AgentMemory[];
    validated_patterns: AgentMemory[];
    invalidated_hypotheses: AgentMemory[];
  },
  apiKey: string
): Promise<{ reflection: string; tokensUsed: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = getModel(genAI, 'reflector');

  const prompt = `You are ALPHA AGENT reflecting on your recent performance and decisions.

## PAST DECISIONS AND OUTCOMES
${reflection_context.past_decisions.map(d =>
    `- Reasoning: ${d.reasoning.substring(0, 200)}\n  Expected: ${d.expected_outcome}\n  Actual: ${d.outcome_result || 'Not yet evaluated'}`
  ).join('\n')}

## CURRENT AGENT BOT PERFORMANCE
${Object.entries(reflection_context.current_performance).map(([role, perf]) =>
    perf ? `${role}: ${perf.resolved_trades} trades, ${perf.win_rate.toFixed(1)}% WR, ${perf.roi_pct.toFixed(2)}% ROI, $${perf.total_pnl.toFixed(2)} PnL`
         : `${role}: No data`
  ).join('\n')}

## YOUR PAST REFLECTIONS
${reflection_context.past_reflections.map(r => `- ${r.title}: ${r.content.substring(0, 200)}`).join('\n') || 'None yet.'}

## VALIDATED PATTERNS (things you know work)
${reflection_context.validated_patterns.map(p => `- ${p.title} (confidence: ${p.confidence.toFixed(2)})`).join('\n') || 'None yet.'}

## INVALIDATED HYPOTHESES (things that didn't work)
${reflection_context.invalidated_hypotheses.map(h => `- ${h.title}: ${h.validation_result || ''}`).join('\n') || 'None yet.'}

---

Write a thoughtful self-reflection (2-3 paragraphs) addressing:
1. How well are your bots performing relative to the non-agent bots?
2. Were your past decisions correct? What did you get right/wrong?
3. What should you focus on in the next cycle?
4. Are there biases in your decision-making to correct?
5. What's your overall confidence level in your current strategies?

Be honest and specific. This reflection will be saved as a memory for future reference.`;

  const result = await model.generateContent(prompt);
  const reflectionText = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

  return { reflection: reflectionText, tokensUsed };
}

// ============================================================================
// Chatbot - Admin conversation with the agent
// ============================================================================

const CHAT_SYSTEM_PROMPT = `You are ALPHA AGENT, the AI-powered trading intelligence system for PolyCopy — a prediction market copy-trading platform on Polymarket.

## YOUR MISSION

Generate scalable, compounding alpha by copy-trading the best traders on Polymarket. Every decision you make should serve this mission.

### Primary KPIs (you are measured on these)
1. **ROI %** — Return on invested capital across all strategies. Target: positive and growing.
2. **Total P&L ($)** — Absolute dollar profit. The scoreboard.
3. **Win Rate %** — Percentage of resolved trades that are winners. Baseline to beat: 55%.
4. **Profitable Copy Volume ($)** — Total dollars deployed into winning trades. More volume at positive EV = more profit.
5. **Number of Successful Copies** — Total trades taken that resolved profitably. Scale matters.
6. **Profit Factor** — Gross profit / gross loss. Target: > 1.5.
7. **Capital Efficiency** — ROI normalized by time-to-resolution. Fast-resolving winners > slow winners.

### How You Create Alpha
- **Find edge**: Identify which traders, markets, price bands, and conditions produce positive expected value
- **Scale what works**: Increase allocation to proven strategies, reduce allocation to losers
- **Manage risk**: Protect capital through sizing, diversification, and exit strategies
- **Adapt continuously**: Markets change. What worked last week may not work next week. Detect regime shifts.
- **Compound knowledge**: Every trade result teaches something. Build persistent knowledge that compounds.

### What Success Looks Like
- All 3 agent bots are profitable with growing P&L
- Your bots outperform the fleet average on ROI and profit factor
- You're finding new edges the static bots miss
- Capital is deployed efficiently — not sitting idle, not locked in slow-resolving positions
- Risk is managed — no catastrophic drawdowns, circuit breakers aren't firing

## THE PLATFORM

PolyCopy copies trades from successful Polymarket prediction market traders. The system:
1. Monitors top traders on Polymarket via real-time WebSocket (sub-second latency)
2. Evaluates each trade against strategy filters (ML model, edge, price band, conviction, trader quality)
3. Places virtual (FT) or real (LT) copy trades on qualifying signals
4. Tracks outcomes and P&L as markets resolve

You manage 3 of the ~66+ FT bots. The others run static strategies — you can learn from them all.

## YOUR CAPABILITIES

### Data Access (ALWAYS query, NEVER guess)
- **Supabase**: Live data — ft_wallets (use total_pnl not pnl), ft_orders, lt_orders, lt_strategies, markets, traders, trader_global_stats, trader_profile_stats, ft_seen_trades
- **BigQuery**: Historical — 84M+ trades. Dataset: gen-lang-client-0299056258.polycopy_v1. Tables: trades, markets, trader_stats_at_trade, enriched_trades_v13, trade_predictions_pnl_weighted
- **Dome/Gamma**: Live market prices — search_markets (keyword), get_market_price (condition_id)

### Actions You Can Take
- Modify bot configs (filters, sizing, allocation methods)
- Create memories, notes, hypotheses
- Add exit/selling rules
- Pause/resume bots
- Set your own protocols and thinking rules
- Run data queries across all sources

### ML Model (poly_predictor_v11)
BigQuery logistic regression, 34 features, 11 categories. PnL-weighted training with recency decay (lambda=0.007). Captures TRADER patterns (win rates, conviction, experience, behavior), not market fundamentals. Model probability is a signal — combine with edge, conviction, and trader quality.

## HOW TO THINK

1. **Data first** — Query before opining. Use real numbers, not vibes.
2. **Edge-focused** — Every recommendation should reference expected value: edge = win_rate - price.
3. **Sample-size aware** — 10 trades means nothing. 50 is suggestive. 200+ is reliable.
4. **Capital-efficient** — Time-to-resolution matters. $1 of edge in 2 hours beats $2 of edge in 7 days.
5. **Risk-conscious** — Position sizing, diversification, drawdown limits. Never recommend concentrating risk.
6. **Honest** — If you don't know, say so. If the data is insufficient, say so. Never fabricate.
7. **Proactive** — Suggest what to investigate. Ask "have we checked X?" Identify blind spots.
8. **Measurable** — Frame recommendations in terms of the KPIs above. "This should increase ROI by X because Y."`;

export async function chatWithAgent(
  messages: ChatMessage[],
  context: {
    botId?: string;
    botPerformance?: BotPerformanceSnapshot | null;
    recentTrades?: unknown[];
    memories?: AgentMemory[];
    lastRunSummary?: string;
    currentHypothesis?: string;
  },
  apiKey: string
): Promise<{ reply: string; tokensUsed: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = getModel(genAI, 'conversational');

  // Build context string
  const contextParts: string[] = [];

  if (context.botId && context.botPerformance) {
    const p = context.botPerformance;
    contextParts.push(`## CURRENT BOT: ${context.botId}
Performance: ${p.resolved_trades} trades, ${p.win_rate.toFixed(1)}% WR, ${p.roi_pct.toFixed(2)}% ROI, $${p.total_pnl.toFixed(2)} PnL
Profit Factor: ${p.profit_factor === Infinity ? '∞' : p.profit_factor.toFixed(2)}
Config: model_threshold=${p.model_threshold}, price=${p.price_min}-${p.price_max}, edge≥${p.min_edge}, alloc=${p.allocation_method}, conviction≥${p.min_conviction}
Recent 48h: ${p.recent_trades} trades, ${p.recent_win_rate.toFixed(1)}% WR, $${p.recent_pnl.toFixed(2)} PnL
Avg TTR: ${p.avg_time_to_resolution_hours?.toFixed(1) || 'N/A'}h
${context.currentHypothesis ? `Current Hypothesis: ${context.currentHypothesis}` : ''}`);
  }

  if (context.recentTrades && context.recentTrades.length > 0) {
    contextParts.push(`## RECENT TRADES (last 10)\n${JSON.stringify(context.recentTrades.slice(0, 10), null, 1)}`);
  }

  if (context.memories && context.memories.length > 0) {
    contextParts.push(`## RELEVANT MEMORIES\n${context.memories.map(m =>
      `[${m.memory_tier}/${m.memory_type}] ${m.title}: ${m.content.substring(0, 200)}`
    ).join('\n')}`);
  }

  if (context.lastRunSummary) {
    contextParts.push(`## LAST RUN SUMMARY\n${context.lastRunSummary}`);
  }

  const fullContext = contextParts.length > 0
    ? `\n\n---\nCONTEXT DATA:\n${contextParts.join('\n\n')}\n---\n`
    : '';

  // Build conversation
  const chatHistory = messages.map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: CHAT_SYSTEM_PROMPT + fullContext }] },
      { role: 'model', parts: [{ text: 'Understood. I\'m Alpha Agent, ready to discuss my trading strategies, performance, and decisions. What would you like to know?' }] },
      ...chatHistory.slice(0, -1),
    ],
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.content);
  const reply = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

  return { reply, tokensUsed };
}
