/**
 * Alpha Agent - Core Orchestrator
 * 
 * The main loop that coordinates the observe-analyze-reflect-decide-act cycle.
 * 
 * AGENT LOOP (runs every 30 minutes via cron):
 * ┌─────────────────────────────────────────────────────────────┐
 * │  1. OBSERVE  - Pull all bot data, build performance maps   │
 * │  2. REMEMBER - Retrieve relevant memories & past decisions │
 * │  3. ANALYZE  - LLM analyzes data with memory context       │
 * │  4. DECIDE   - LLM recommends strategy changes             │
 * │  5. ACT      - Apply changes to agent's FT wallets         │
 * │  6. REFLECT  - LLM reflects on decisions, saves to memory  │
 * │  7. LOG      - Save run details, snapshots, hypotheses     │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * Safety features:
 * - All config changes are bounded (CONFIG_BOUNDARIES)
 * - Every change is logged with before/after state
 * - Past decision outcomes are evaluated for learning
 * - Memory decay prevents stale knowledge from dominating
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentRun,
  BotPerformanceSnapshot,
  AnalysisPromptContext,
  ObservationSummary,
  DecisionRecord,
  ActionRecord,
  PatternFound,
} from './types';

import {
  getAllBotSnapshots,
  getBotTrades,
  buildStrategyComparison,
  buildObservationSummary,
} from './data-analyzer';

import {
  retrieveRelevantMemories,
  getStrategyKnowledge,
  createMemories,
  buildReflectionContext,
  getLastRun,
  getHypotheses,
  decayMemories,
} from './memory-system';

import { runLLMAnalysis, runReflection } from './llm-engine';

import {
  applyStrategyChanges,
  applyExitRules,
  saveHypotheses,
  takeSnapshots,
  evaluatePastDecisions,
} from './strategy-optimizer';

// ============================================================================
// Main Agent Loop
// ============================================================================

export async function runAgentCycle(
  supabase: SupabaseClient,
  options: {
    runType?: 'scheduled' | 'manual' | 'reactive';
    geminiApiKey: string;
    dryRun?: boolean; // If true, analyze but don't apply changes
  }
): Promise<{
  run_id: string;
  status: 'completed' | 'failed' | 'partial';
  summary: string;
  decisions_made: number;
  actions_taken: number;
  memories_created: number;
  tokens_used: number;
  duration_ms: number;
}> {
  const startTime = Date.now();
  const runType = options.runType || 'scheduled';

  // Create the run record
  const { data: runData, error: runErr } = await supabase
    .from('alpha_agent_runs')
    .insert({
      run_type: runType,
      status: 'running',
      phases_completed: {},
    })
    .select()
    .single();

  if (runErr || !runData) {
    throw new Error(`Failed to create agent run: ${runErr?.message}`);
  }

  const runId = runData.run_id;
  let totalTokens = 0;

  const updateRun = async (updates: Partial<AgentRun>) => {
    await supabase
      .from('alpha_agent_runs')
      .update({ ...updates, llm_tokens_used: totalTokens })
      .eq('run_id', runId);
  };

  try {
    // ================================================================
    // PHASE 1: OBSERVE - Pull all performance data
    // ================================================================
    console.log(`[Alpha Agent] Phase 1: OBSERVE (run=${runId})`);

    const allSnapshots = await getAllBotSnapshots(supabase);
    const strategyComparison = await buildStrategyComparison(supabase, allSnapshots);
    const observationSummary = await buildObservationSummary(supabase, allSnapshots);

    // Build snapshot map for agent bots
    const snapshotMap = new Map<string, BotPerformanceSnapshot>();
    for (const snap of allSnapshots) {
      snapshotMap.set(snap.wallet_id, snap);
    }

    await updateRun({
      phases_completed: { observe: true },
      observation_summary: observationSummary as unknown as ObservationSummary,
      total_bots_analyzed: allSnapshots.length,
      winning_bots: observationSummary.winning_bots,
      losing_bots: observationSummary.losing_bots,
    });

    // ================================================================
    // PHASE 2: REMEMBER - Retrieve relevant memories
    // ================================================================
    console.log(`[Alpha Agent] Phase 2: REMEMBER (run=${runId})`);

    // Get all relevant memories
    const strategyKnowledge = await getStrategyKnowledge(supabase);
    const contextMemories = await retrieveRelevantMemories(supabase, {
      tiers: ['short_term', 'mid_term', 'long_term'],
      min_confidence: 0.3,
      limit: 30,
      exclude_expired: true,
    });

    // Deduplicate memories
    const memoryIds = new Set<string>();
    const allMemories = [...strategyKnowledge, ...contextMemories].filter(m => {
      if (memoryIds.has(m.memory_id)) return false;
      memoryIds.add(m.memory_id);
      return true;
    });

    // Get recent decisions
    const { data: recentDecisions } = await supabase
      .from('alpha_agent_decisions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get active hypotheses
    const activeHypotheses = await getHypotheses(supabase, 'testing');
    const proposedHypotheses = await getHypotheses(supabase, 'proposed');
    const allHypotheses = [...activeHypotheses, ...proposedHypotheses];

    // Get agent bot details
    const agentBotIds = ['ALPHA_EXPLORER', 'ALPHA_OPTIMIZER', 'ALPHA_CONSERVATIVE'];
    const agentBotDetails: AnalysisPromptContext['agent_bot_details'] = {
      explorer: {
        snapshot: snapshotMap.get('ALPHA_EXPLORER') || null,
        recent_trades: await getBotTrades(supabase, 'ALPHA_EXPLORER', 20).catch(() => []),
        current_hypothesis: null,
      },
      optimizer: {
        snapshot: snapshotMap.get('ALPHA_OPTIMIZER') || null,
        recent_trades: await getBotTrades(supabase, 'ALPHA_OPTIMIZER', 20).catch(() => []),
        current_hypothesis: null,
      },
      conservative: {
        snapshot: snapshotMap.get('ALPHA_CONSERVATIVE') || null,
        recent_trades: await getBotTrades(supabase, 'ALPHA_CONSERVATIVE', 20).catch(() => []),
        current_hypothesis: null,
      },
    };

    // Load current hypotheses for each bot
    for (const botId of agentBotIds) {
      const { data: botData } = await supabase
        .from('alpha_agent_bots')
        .select('current_hypothesis')
        .eq('bot_id', botId)
        .single();

      const role = botId.replace('ALPHA_', '').toLowerCase() as 'explorer' | 'optimizer' | 'conservative';
      if (botData && agentBotDetails[role]) {
        agentBotDetails[role].current_hypothesis = botData.current_hypothesis;
      }
    }

    // Evaluate past decisions
    const decisionsEvaluated = await evaluatePastDecisions(supabase, snapshotMap);
    console.log(`[Alpha Agent] Evaluated ${decisionsEvaluated} past decisions`);

    // Decay old memories
    const decayed = await decayMemories(supabase);
    console.log(`[Alpha Agent] Decayed ${decayed} stale memories`);

    await updateRun({
      phases_completed: { observe: true, remember: true } as unknown as Record<string, boolean>,
    });

    // ================================================================
    // PHASE 3: ANALYZE + DECIDE - LLM analysis
    // ================================================================
    console.log(`[Alpha Agent] Phase 3: ANALYZE + DECIDE (run=${runId})`);

    const analysisContext: AnalysisPromptContext = {
      observation_summary: observationSummary,
      strategy_comparison: strategyComparison,
      all_bot_snapshots: allSnapshots,
      agent_bot_details: agentBotDetails,
      relevant_memories: allMemories,
      recent_decisions: (recentDecisions || []).map(d => ({
        bot_id: d.bot_id,
        decision_type: d.decision_type,
        config_changes: d.config_diff || {},
        reasoning: d.reasoning,
        hypothesis: d.hypothesis,
        expected_outcome: d.expected_outcome,
        confidence: d.confidence,
      })),
      active_hypotheses: allHypotheses,
    };

    const { response: llmResponse, tokensUsed: analysisTokens } = await runLLMAnalysis(
      analysisContext,
      options.geminiApiKey
    );
    totalTokens += analysisTokens;

    console.log(`[Alpha Agent] LLM returned ${llmResponse.strategy_recommendations.length} recommendations, ${llmResponse.patterns_found.length} patterns`);

    await updateRun({
      phases_completed: { observe: true, remember: true, analyze: true, decide: true } as unknown as Record<string, boolean>,
      analysis: JSON.stringify(llmResponse.key_observations),
      patterns_found: llmResponse.patterns_found as unknown as PatternFound[],
      decisions: llmResponse.strategy_recommendations as unknown as DecisionRecord[],
      decisions_reasoning: llmResponse.strategy_recommendations.map(r => `[${r.bot_id}] ${r.reasoning}`).join('\n\n'),
      market_regime: llmResponse.market_regime,
      llm_model: 'gemini-2.0-flash',
    });

    // ================================================================
    // PHASE 4: ACT - Apply strategy changes
    // ================================================================
    console.log(`[Alpha Agent] Phase 4: ACT (run=${runId}, dryRun=${options.dryRun})`);

    let allActions: ActionRecord[] = [];

    if (!options.dryRun) {
      // Apply strategy config changes
      const strategyActions = await applyStrategyChanges(
        supabase,
        runId,
        llmResponse.strategy_recommendations,
        snapshotMap
      );
      allActions = [...allActions, ...strategyActions];

      // Apply exit rules
      const exitActions = await applyExitRules(
        supabase,
        runId,
        llmResponse.exit_strategy_updates
      );
      allActions = [...allActions, ...exitActions];

      // Save new hypotheses
      await saveHypotheses(supabase, runId, llmResponse.new_hypotheses);

      // Take performance snapshots
      await takeSnapshots(supabase, runId, allSnapshots);

      console.log(`[Alpha Agent] Applied ${allActions.filter(a => a.success).length} changes`);
    } else {
      console.log(`[Alpha Agent] DRY RUN - skipping changes`);
      allActions = llmResponse.strategy_recommendations.map(r => ({
        bot_id: r.bot_id,
        action_type: 'dry_run',
        changes_applied: r.changes,
        success: true,
      }));
    }

    await updateRun({
      phases_completed: { observe: true, remember: true, analyze: true, decide: true, act: true } as unknown as Record<string, boolean>,
      actions_taken: allActions as unknown as ActionRecord[],
    });

    // ================================================================
    // PHASE 5: REFLECT + LOG - Create memories and reflect
    // ================================================================
    console.log(`[Alpha Agent] Phase 5: REFLECT + LOG (run=${runId})`);

    // Save memories from LLM response (with structured evidence)
    const memoriesToCreate = llmResponse.memories_to_create.map(m => ({
      memory_tier: m.tier,
      memory_type: m.type,
      title: m.title,
      content: m.content,
      confidence: m.confidence,
      tags: m.tags,
      source_run_id: runId,
      evidence: m.structured_evidence || {},
    }));

    const createdMemories = await createMemories(supabase, memoriesToCreate);

    // Save meta-learning insights as memories
    if (llmResponse.meta_learning_insights && llmResponse.meta_learning_insights.length > 0) {
      const metaMemories = llmResponse.meta_learning_insights.map(insight => ({
        memory_tier: 'mid_term' as const,
        memory_type: 'pattern' as const,
        title: `[META] ${insight.title}`,
        content: `${insight.description}\n\nProposed action: ${insight.proposed_action}\nPriority: ${insight.priority}\nType: ${insight.insight_type}`,
        confidence: insight.priority === 'high' ? 0.8 : insight.priority === 'medium' ? 0.6 : 0.4,
        tags: ['meta_learning', insight.insight_type, insight.priority],
        source_run_id: runId,
      }));
      await createMemories(supabase, metaMemories);
    }

    // Run reflection
    const reflectionContext = await buildReflectionContext(supabase, runId);
    const { reflection: reflectionText, tokensUsed: reflectionTokens } = await runReflection(
      {
        past_decisions: reflectionContext.recent_decisions_with_outcomes.map(d => ({
          reasoning: d.reasoning,
          expected_outcome: d.expected_outcome,
          outcome_result: d.outcome_result,
        })),
        current_performance: {
          explorer: snapshotMap.get('ALPHA_EXPLORER') || null,
          optimizer: snapshotMap.get('ALPHA_OPTIMIZER') || null,
          conservative: snapshotMap.get('ALPHA_CONSERVATIVE') || null,
        },
        past_reflections: reflectionContext.past_reflections,
        validated_patterns: reflectionContext.validated_patterns,
        invalidated_hypotheses: reflectionContext.invalidated_hypotheses,
      },
      options.geminiApiKey
    );
    totalTokens += reflectionTokens;

    // Save reflection as a memory
    await createMemories(supabase, [{
      memory_tier: 'mid_term',
      memory_type: 'reflection',
      title: `Reflection - Run ${runId.substring(0, 8)}`,
      content: reflectionText,
      confidence: 0.7,
      tags: ['reflection', 'self_assessment'],
      source_run_id: runId,
    }]);

    const duration = Date.now() - startTime;

    // Final run update
    await updateRun({
      status: 'completed',
      phases_completed: { observe: true, remember: true, analyze: true, decide: true, act: true, reflect: true, log: true } as unknown as Record<string, boolean>,
      reflection: reflectionText,
      completed_at: new Date().toISOString(),
      duration_ms: duration,
    });

    const successfulActions = allActions.filter(a => a.success && a.action_type !== 'no_change' && a.action_type !== 'dry_run');

    const summary = [
      `Alpha Agent run completed in ${(duration / 1000).toFixed(1)}s.`,
      `Analyzed ${allSnapshots.length} bots (${observationSummary.winning_bots} winning, ${observationSummary.losing_bots} losing).`,
      `Market regime: ${llmResponse.market_regime}.`,
      `Found ${llmResponse.patterns_found.length} patterns.`,
      `Made ${successfulActions.length} strategy changes.`,
      `Created ${createdMemories.length + 1} memories.`,
      `Generated ${llmResponse.new_hypotheses.length} new hypotheses.`,
      options.dryRun ? '[DRY RUN - no changes applied]' : '',
    ].filter(Boolean).join(' ');

    console.log(`[Alpha Agent] ${summary}`);

    return {
      run_id: runId,
      status: 'completed',
      summary,
      decisions_made: llmResponse.strategy_recommendations.length,
      actions_taken: successfulActions.length,
      memories_created: createdMemories.length + 1,
      tokens_used: totalTokens,
      duration_ms: duration,
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    await updateRun({
      status: 'failed',
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
      duration_ms: duration,
    });

    console.error(`[Alpha Agent] Run failed: ${errorMsg}`);

    return {
      run_id: runId,
      status: 'failed',
      summary: `Agent run failed: ${errorMsg}`,
      decisions_made: 0,
      actions_taken: 0,
      memories_created: 0,
      tokens_used: totalTokens,
      duration_ms: duration,
    };
  }
}

// ============================================================================
// Utility: Get agent status
// ============================================================================

export async function getAgentStatus(
  supabase: SupabaseClient
): Promise<{
  last_run: {
    run_id: string;
    status: string;
    started_at: string;
    market_regime: string | null;
    reflection: string | null;
    decisions_count: number;
    duration_ms: number | null;
  } | null;
  bots: {
    bot_id: string;
    role: string;
    hypothesis: string | null;
    config_changes: number;
    last_change: string | null;
  }[];
  total_runs: number;
  total_memories: number;
  total_hypotheses: number;
}> {
  // Last run
  const lastRun = await getLastRun(supabase);

  // Bots
  const { data: bots } = await supabase
    .from('alpha_agent_bots')
    .select('*');

  // Counts
  const { count: totalRuns } = await supabase
    .from('alpha_agent_runs')
    .select('*', { count: 'exact', head: true });

  const { count: totalMemories } = await supabase
    .from('alpha_agent_memory')
    .select('*', { count: 'exact', head: true });

  const { count: totalHypotheses } = await supabase
    .from('alpha_agent_hypotheses')
    .select('*', { count: 'exact', head: true });

  return {
    last_run: lastRun ? {
      run_id: lastRun.run_id,
      status: 'completed',
      started_at: lastRun.started_at,
      market_regime: lastRun.market_regime,
      reflection: lastRun.reflection,
      decisions_count: Array.isArray(lastRun.decisions) ? lastRun.decisions.length : 0,
      duration_ms: null,
    } : null,
    bots: (bots || []).map(b => ({
      bot_id: b.bot_id,
      role: b.bot_role,
      hypothesis: b.current_hypothesis,
      config_changes: b.total_config_changes,
      last_change: b.last_config_change,
    })),
    total_runs: totalRuns || 0,
    total_memories: totalMemories || 0,
    total_hypotheses: totalHypotheses || 0,
  };
}
