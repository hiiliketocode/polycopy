/**
 * Alpha Agent - Memory System
 * 3-tier persistent memory with reflection loops
 * 
 * Inspired by FinMem (AAAI 2024) and A-MEM (2025):
 * - Short-term: Current session observations, expires after 24h
 * - Mid-term: Patterns and hypotheses, decays over weeks  
 * - Long-term: Proven lessons and strategy rules, persistent
 * 
 * The memory system enables the agent to:
 * 1. Remember what strategies it has tried and their outcomes
 * 2. Build up knowledge about what works over time
 * 3. Avoid repeating failed experiments
 * 4. Reference past insights when making new decisions
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMemory, MemoryTier, MemoryType } from './types';

// ============================================================================
// Memory CRUD Operations
// ============================================================================

/**
 * Create a new memory
 */
export async function createMemory(
  supabase: SupabaseClient,
  memory: {
    memory_tier: MemoryTier;
    memory_type: MemoryType;
    title: string;
    content: string;
    evidence?: Record<string, unknown>;
    confidence?: number;
    tags?: string[];
    related_memory_ids?: string[];
    source_run_id?: string;
    expires_at?: string;
  }
): Promise<AgentMemory> {
  const { data, error } = await supabase
    .from('alpha_agent_memory')
    .insert({
      memory_tier: memory.memory_tier,
      memory_type: memory.memory_type,
      title: memory.title,
      content: memory.content,
      evidence: memory.evidence || {},
      confidence: memory.confidence ?? 0.5,
      tags: memory.tags || [],
      related_memory_ids: memory.related_memory_ids || [],
      source_run_id: memory.source_run_id || null,
      expires_at: memory.expires_at || (memory.memory_tier === 'short_term'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create memory: ${error.message}`);
  return data;
}

/**
 * Batch create multiple memories
 */
export async function createMemories(
  supabase: SupabaseClient,
  memories: {
    memory_tier: MemoryTier;
    memory_type: MemoryType;
    title: string;
    content: string;
    evidence?: Record<string, unknown>;
    confidence?: number;
    tags?: string[];
    source_run_id?: string;
  }[]
): Promise<AgentMemory[]> {
  if (memories.length === 0) return [];

  const rows = memories.map(m => ({
    memory_tier: m.memory_tier,
    memory_type: m.memory_type,
    title: m.title,
    content: m.content,
    evidence: m.evidence || {},
    confidence: m.confidence ?? 0.5,
    tags: m.tags || [],
    related_memory_ids: [],
    source_run_id: m.source_run_id || null,
    expires_at: m.memory_tier === 'short_term'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null,
  }));

  const { data, error } = await supabase
    .from('alpha_agent_memory')
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to create memories: ${error.message}`);
  return data || [];
}

// ============================================================================
// Memory Retrieval - Context-aware
// ============================================================================

/**
 * Retrieve relevant memories for a given context
 * Uses a scoring system based on: recency, confidence, relevance (tags), tier priority
 */
export async function retrieveRelevantMemories(
  supabase: SupabaseClient,
  context: {
    tags?: string[];
    memory_types?: MemoryType[];
    tiers?: MemoryTier[];
    min_confidence?: number;
    limit?: number;
    exclude_expired?: boolean;
  }
): Promise<AgentMemory[]> {
  let query = supabase
    .from('alpha_agent_memory')
    .select('*');

  // Filter by tiers
  if (context.tiers && context.tiers.length > 0) {
    query = query.in('memory_tier', context.tiers);
  }

  // Filter by types
  if (context.memory_types && context.memory_types.length > 0) {
    query = query.in('memory_type', context.memory_types);
  }

  // Filter by confidence
  if (context.min_confidence) {
    query = query.gte('confidence', context.min_confidence);
  }

  // Exclude expired short-term memories
  if (context.exclude_expired !== false) {
    query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  }

  // Filter by tags using overlap
  if (context.tags && context.tags.length > 0) {
    query = query.overlaps('tags', context.tags);
  }

  // Order by confidence desc, then recency
  query = query
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(context.limit || 30);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to retrieve memories: ${error.message}`);

  // Increment times_referenced for retrieved memories
  const memoryIds = (data || []).map(m => m.memory_id);
  if (memoryIds.length > 0) {
    await supabase.rpc('increment_memory_references', { memory_ids: memoryIds }).catch(() => {
      // Non-critical, just log
      console.warn('Failed to increment memory references');
    });
  }

  return data || [];
}

/**
 * Get all long-term strategy rules and lessons (core knowledge base)
 */
export async function getStrategyKnowledge(
  supabase: SupabaseClient
): Promise<AgentMemory[]> {
  const { data, error } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .eq('memory_tier', 'long_term')
    .in('memory_type', ['strategy_rule', 'lesson', 'anti_pattern'])
    .gte('confidence', 0.5)
    .order('confidence', { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to get strategy knowledge: ${error.message}`);
  return data || [];
}

/**
 * Get recent observations (short-term context)
 */
export async function getRecentObservations(
  supabase: SupabaseClient,
  limit: number = 10
): Promise<AgentMemory[]> {
  const { data, error } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .eq('memory_tier', 'short_term')
    .eq('memory_type', 'observation')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get recent observations: ${error.message}`);
  return data || [];
}

/**
 * Get active hypotheses being tested
 */
export async function getActiveHypotheses(
  supabase: SupabaseClient
): Promise<AgentMemory[]> {
  const { data, error } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .in('memory_tier', ['mid_term', 'short_term'])
    .eq('memory_type', 'hypothesis')
    .eq('validated', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to get active hypotheses: ${error.message}`);
  return data || [];
}

// ============================================================================
// Memory Lifecycle Management
// ============================================================================

/**
 * Promote a memory to a higher tier (e.g., short_term -> mid_term -> long_term)
 * Used when a hypothesis is validated or an observation becomes a pattern
 */
export async function promoteMemory(
  supabase: SupabaseClient,
  memoryId: string,
  newTier: MemoryTier,
  newType?: MemoryType,
  additionalContent?: string,
  newConfidence?: number
): Promise<void> {
  const updates: Record<string, unknown> = {
    memory_tier: newTier,
    updated_at: new Date().toISOString(),
  };

  if (newType) updates.memory_type = newType;
  if (additionalContent) {
    // Append to existing content
    const { data: existing } = await supabase
      .from('alpha_agent_memory')
      .select('content')
      .eq('memory_id', memoryId)
      .single();
    if (existing) {
      updates.content = `${existing.content}\n\n--- Updated ---\n${additionalContent}`;
    }
  }
  if (newConfidence !== undefined) updates.confidence = newConfidence;

  // Remove expiry for promoted memories
  if (newTier === 'mid_term' || newTier === 'long_term') {
    updates.expires_at = null;
  }

  const { error } = await supabase
    .from('alpha_agent_memory')
    .update(updates)
    .eq('memory_id', memoryId);

  if (error) throw new Error(`Failed to promote memory: ${error.message}`);
}

/**
 * Validate or invalidate a memory based on outcomes
 */
export async function validateMemory(
  supabase: SupabaseClient,
  memoryId: string,
  validated: boolean,
  validationResult: string,
  confidenceAdjustment?: number
): Promise<void> {
  const updates: Record<string, unknown> = {
    validated,
    validation_result: validationResult,
    updated_at: new Date().toISOString(),
  };

  if (confidenceAdjustment !== undefined) {
    updates.confidence = Math.max(0, Math.min(1, confidenceAdjustment));
  }

  const { error } = await supabase
    .from('alpha_agent_memory')
    .update(updates)
    .eq('memory_id', memoryId);

  if (error) throw new Error(`Failed to validate memory: ${error.message}`);
}

/**
 * Decay old memories - reduce confidence of stale mid-term memories
 * Run periodically (e.g., daily)
 */
export async function decayMemories(
  supabase: SupabaseClient
): Promise<number> {
  // Decay mid-term memories older than 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleMemories } = await supabase
    .from('alpha_agent_memory')
    .select('memory_id, confidence, decay_factor')
    .eq('memory_tier', 'mid_term')
    .lt('updated_at', weekAgo)
    .gt('confidence', 0.1);

  if (!staleMemories || staleMemories.length === 0) return 0;

  let decayed = 0;
  for (const mem of staleMemories) {
    const newConfidence = Math.max(0.1, mem.confidence * 0.95); // 5% decay
    await supabase
      .from('alpha_agent_memory')
      .update({
        confidence: newConfidence,
        decay_factor: (mem.decay_factor || 1.0) * 0.95,
        updated_at: new Date().toISOString(),
      })
      .eq('memory_id', mem.memory_id);
    decayed++;
  }

  // Clean up expired short-term memories
  await supabase
    .from('alpha_agent_memory')
    .delete()
    .eq('memory_tier', 'short_term')
    .lt('expires_at', new Date().toISOString());

  return decayed;
}

// ============================================================================
// Memory Reflection - Self-assessment
// ============================================================================

/**
 * Build a reflection context from past decisions and their outcomes
 */
export async function buildReflectionContext(
  supabase: SupabaseClient,
  runId?: string
): Promise<{
  recent_decisions_with_outcomes: {
    decision_id: string;
    bot_id: string;
    decision_type: string;
    config_diff: Record<string, unknown>;
    reasoning: string;
    hypothesis: string | null;
    expected_outcome: string;
    outcome_evaluated: boolean;
    outcome_result: string | null;
    created_at: string;
  }[];
  past_reflections: AgentMemory[];
  validated_patterns: AgentMemory[];
  invalidated_hypotheses: AgentMemory[];
}> {
  // Get recent decisions with their outcomes
  const { data: decisions } = await supabase
    .from('alpha_agent_decisions')
    .select('decision_id, bot_id, decision_type, config_diff, reasoning, hypothesis, expected_outcome, outcome_evaluated, outcome_result, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  // Get past reflections
  const { data: reflections } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .eq('memory_type', 'reflection')
    .order('created_at', { ascending: false })
    .limit(5);

  // Get validated patterns (things we know work)
  const { data: validatedPatterns } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .eq('memory_type', 'pattern')
    .eq('validated', true)
    .order('confidence', { ascending: false })
    .limit(10);

  // Get invalidated hypotheses (things that didn't work)
  const { data: invalidated } = await supabase
    .from('alpha_agent_memory')
    .select('*')
    .eq('memory_type', 'hypothesis')
    .eq('validated', true)
    .eq('validation_result', 'invalidated')
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    recent_decisions_with_outcomes: decisions || [],
    past_reflections: reflections || [],
    validated_patterns: validatedPatterns || [],
    invalidated_hypotheses: invalidated || [],
  };
}

// ============================================================================
// Get previous run data for continuity
// ============================================================================

export async function getLastRun(
  supabase: SupabaseClient
): Promise<{
  run_id: string;
  analysis: string | null;
  decisions: unknown[];
  reflection: string | null;
  market_regime: string | null;
  started_at: string;
} | null> {
  const { data } = await supabase
    .from('alpha_agent_runs')
    .select('run_id, analysis, decisions, reflection, market_regime, started_at')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  return data || null;
}

/**
 * Get hypothesis status from the hypotheses table
 */
export async function getHypotheses(
  supabase: SupabaseClient,
  status?: string
): Promise<{
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
}[]> {
  let query = supabase
    .from('alpha_agent_hypotheses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get hypotheses: ${error.message}`);
  return data || [];
}
