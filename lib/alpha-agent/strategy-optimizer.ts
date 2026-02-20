/**
 * Alpha Agent - Strategy Optimizer
 * 
 * Applies strategy changes to the agent's FT wallets.
 * Implements safety boundaries, change validation, and audit logging.
 * 
 * Key principles:
 * 1. Never exceed CONFIG_BOUNDARIES (hard safety limits)
 * 2. Log every change with before/after state
 * 3. Only change parameters the LLM explicitly recommends
 * 4. Track hypotheses associated with each change
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LLMAnalysisResponse, BotPerformanceSnapshot, ActionRecord } from './types';
import { CONFIG_BOUNDARIES, ALLOWED_ALLOCATION_METHODS } from './types';

// ============================================================================
// Configurable fields that the agent is allowed to modify
// ============================================================================

const MODIFIABLE_FIELDS = new Set([
  'model_threshold',
  'price_min',
  'price_max',
  'min_edge',
  'use_model',
  'allocation_method',
  'kelly_fraction',
  'bet_size',
  'bet_allocation_weight',
  'min_bet',
  'max_bet',
  'min_trader_resolved_count',
  'min_conviction',
  'is_active',
  'detailed_description',
  'market_categories',
  'dead_market_guard',
  'dead_market_floor',
  'dead_market_max_drift_pct',
]);

// ============================================================================
// Validate and clamp a config change
// ============================================================================

function validateConfigValue(field: string, value: unknown): { valid: boolean; clamped: unknown; reason?: string } {
  const boundary = CONFIG_BOUNDARIES[field as keyof typeof CONFIG_BOUNDARIES];

  if (field === 'allocation_method') {
    if (typeof value !== 'string' || !ALLOWED_ALLOCATION_METHODS.includes(value as typeof ALLOWED_ALLOCATION_METHODS[number])) {
      return { valid: false, clamped: value, reason: `Invalid allocation method: ${value}` };
    }
    return { valid: true, clamped: value };
  }

  if (field === 'use_model' || field === 'is_active' || field === 'dead_market_guard') {
    return { valid: true, clamped: Boolean(value) };
  }

  if (field === 'detailed_description') {
    if (typeof value !== 'string') {
      return { valid: false, clamped: value, reason: 'detailed_description must be a string' };
    }
    // Ensure agent_managed flag is preserved
    try {
      const parsed = JSON.parse(value);
      parsed.agent_managed = true;
      return { valid: true, clamped: JSON.stringify(parsed) };
    } catch {
      return { valid: true, clamped: JSON.stringify({ agent_managed: true, raw: value }) };
    }
  }

  if (field === 'market_categories') {
    if (!Array.isArray(value)) {
      return { valid: false, clamped: value, reason: 'market_categories must be an array' };
    }
    return { valid: true, clamped: value };
  }

  if (boundary) {
    const numVal = Number(value);
    if (!Number.isFinite(numVal)) {
      return { valid: false, clamped: value, reason: `${field} must be a number` };
    }
    const clamped = Math.max(boundary.min, Math.min(boundary.max, numVal));
    // Round to step precision
    const rounded = Math.round(clamped / boundary.step) * boundary.step;
    const finalValue = Math.round(rounded * 1000) / 1000; // Avoid floating point issues
    if (finalValue !== numVal) {
      return { valid: true, clamped: finalValue, reason: `Clamped from ${numVal} to ${finalValue}` };
    }
    return { valid: true, clamped: finalValue };
  }

  // Unknown field - allow but warn
  return { valid: true, clamped: value, reason: `Unknown field: ${field}` };
}

// ============================================================================
// Apply strategy changes to a bot
// ============================================================================

// Minimum days between config changes per bot. Prevents strategy whiplash.
const MIN_DAYS_BETWEEN_CHANGES = 7;
// Maximum number of parameters that can change in a single decision.
const MAX_PARAMS_PER_CHANGE = 3;

export async function applyStrategyChanges(
  supabase: SupabaseClient,
  runId: string,
  recommendations: LLMAnalysisResponse['strategy_recommendations'],
  currentSnapshots: Map<string, BotPerformanceSnapshot>
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];

  for (const rec of recommendations) {
    const botId = rec.bot_id;
    const snapshot = currentSnapshots.get(botId);

    if (!snapshot) {
      actions.push({
        bot_id: botId,
        action_type: 'skip',
        changes_applied: {},
        success: false,
        error: `Bot ${botId} not found in current snapshots`,
      });
      continue;
    }

    // ── Change cooldown: skip if last change was too recent ──
    const { data: lastChange } = await supabase
      .from('alpha_agent_decisions')
      .select('created_at')
      .eq('bot_id', botId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (lastChange && lastChange.length > 0) {
      const daysSinceLastChange = (Date.now() - new Date(lastChange[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastChange < MIN_DAYS_BETWEEN_CHANGES) {
        actions.push({
          bot_id: botId,
          action_type: 'skip',
          changes_applied: {},
          success: true,
          error: `Change cooldown: ${daysSinceLastChange.toFixed(1)}d since last change (min ${MIN_DAYS_BETWEEN_CHANGES}d). Wait ${(MIN_DAYS_BETWEEN_CHANGES - daysSinceLastChange).toFixed(1)} more days.`,
        });
        continue;
      }
    }

    // ── Limit number of parameter changes per decision ──
    const changeEntries = Object.entries(rec.changes || {});
    if (changeEntries.length > MAX_PARAMS_PER_CHANGE) {
      // Only keep the first MAX_PARAMS_PER_CHANGE changes
      const trimmed = Object.fromEntries(changeEntries.slice(0, MAX_PARAMS_PER_CHANGE));
      rec.changes = trimmed;
    }

    // Build the config diff
    const configBefore: Record<string, unknown> = {};
    const configAfter: Record<string, unknown> = {};
    const configDiff: Record<string, { from: unknown; to: unknown }> = {};
    const validChanges: Record<string, unknown> = {};
    const warnings: string[] = [];

    for (const [field, newValue] of Object.entries(rec.changes || {})) {
      if (!MODIFIABLE_FIELDS.has(field)) {
        warnings.push(`Field '${field}' is not modifiable, skipping`);
        continue;
      }

      const currentValue = (snapshot as unknown as Record<string, unknown>)[field];
      const validation = validateConfigValue(field, newValue);

      if (!validation.valid) {
        warnings.push(`Invalid value for '${field}': ${validation.reason}`);
        continue;
      }

      // Only apply if value actually changed
      if (validation.clamped !== currentValue) {
        configBefore[field] = currentValue;
        configAfter[field] = validation.clamped;
        configDiff[field] = { from: currentValue, to: validation.clamped };
        validChanges[field] = validation.clamped;
      }

      if (validation.reason && validation.valid) {
        warnings.push(validation.reason);
      }
    }

    if (Object.keys(validChanges).length === 0) {
      actions.push({
        bot_id: botId,
        action_type: 'no_change',
        changes_applied: {},
        success: true,
        error: warnings.length > 0 ? warnings.join('; ') : undefined,
      });
      continue;
    }

    // Ensure detailed_description preserves agent_managed flag
    if (validChanges.detailed_description) {
      try {
        const parsed = JSON.parse(validChanges.detailed_description as string);
        parsed.agent_managed = true;
        validChanges.detailed_description = JSON.stringify(parsed);
      } catch {
        // Keep as is
      }
    }

    // Apply changes to ft_wallets table
    try {
      const { error: updateError } = await supabase
        .from('ft_wallets')
        .update(validChanges)
        .eq('wallet_id', botId);

      if (updateError) throw updateError;

      // Log the decision
      await supabase.from('alpha_agent_decisions').insert({
        run_id: runId,
        bot_id: botId,
        decision_type: 'modify_filters',
        config_before: configBefore,
        config_after: configAfter,
        config_diff: configDiff,
        reasoning: rec.reasoning,
        hypothesis: rec.hypothesis || null,
        expected_outcome: rec.expected_outcome,
        confidence: rec.confidence,
        evidence_summary: warnings.length > 0 ? `Warnings: ${warnings.join('; ')}` : null,
      });

      // Update agent bot metadata
      await supabase
        .from('alpha_agent_bots')
        .update({
          current_hypothesis: rec.hypothesis || null,
          last_config_change: new Date().toISOString(),
          total_config_changes: snapshot.is_agent_managed
            ? (await supabase
                .from('alpha_agent_bots')
                .select('total_config_changes')
                .eq('bot_id', botId)
                .single()
                .then(r => (r.data?.total_config_changes || 0) + 1))
            : 1,
          updated_at: new Date().toISOString(),
        })
        .eq('bot_id', botId);

      actions.push({
        bot_id: botId,
        action_type: 'config_update',
        changes_applied: validChanges,
        success: true,
      });
    } catch (err) {
      actions.push({
        bot_id: botId,
        action_type: 'config_update',
        changes_applied: validChanges,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return actions;
}

// ============================================================================
// Apply exit strategy rules
// ============================================================================

export async function applyExitRules(
  supabase: SupabaseClient,
  runId: string,
  exitUpdates: LLMAnalysisResponse['exit_strategy_updates']
): Promise<ActionRecord[]> {
  const actions: ActionRecord[] = [];

  for (const update of exitUpdates) {
    try {
      // Check if a similar rule already exists
      const { data: existingRules } = await supabase
        .from('alpha_agent_exit_rules')
        .select('rule_id')
        .eq('bot_id', update.bot_id)
        .eq('rule_type', update.rule_type)
        .eq('is_active', true);

      if (existingRules && existingRules.length > 0) {
        // Deactivate old rule
        await supabase
          .from('alpha_agent_exit_rules')
          .update({ is_active: false })
          .in('rule_id', existingRules.map(r => r.rule_id));
      }

      // Create new rule
      await supabase.from('alpha_agent_exit_rules').insert({
        bot_id: update.bot_id,
        rule_type: update.rule_type,
        parameters: update.parameters,
        reasoning: update.reasoning,
        created_by_run_id: runId,
      });

      actions.push({
        bot_id: update.bot_id,
        action_type: `exit_rule_${update.rule_type}`,
        changes_applied: update.parameters,
        success: true,
      });
    } catch (err) {
      actions.push({
        bot_id: update.bot_id,
        action_type: `exit_rule_${update.rule_type}`,
        changes_applied: update.parameters,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return actions;
}

// ============================================================================
// Save new hypotheses
// ============================================================================

export async function saveHypotheses(
  supabase: SupabaseClient,
  runId: string,
  hypotheses: LLMAnalysisResponse['new_hypotheses']
): Promise<void> {
  for (const hyp of hypotheses) {
    const botIdMap: Record<string, string> = {
      explorer: 'ALPHA_EXPLORER',
      optimizer: 'ALPHA_OPTIMIZER',
      conservative: 'ALPHA_CONSERVATIVE',
    };

    await supabase.from('alpha_agent_hypotheses').insert({
      title: hyp.title,
      description: hyp.description,
      status: 'proposed',
      assigned_bot_id: botIdMap[hyp.assign_to] || null,
      assigned_run_id: runId,
      test_config: hyp.test_config || {},
      success_criteria: hyp.success_criteria,
    });
  }
}

// ============================================================================
// Take performance snapshots
// ============================================================================

export async function takeSnapshots(
  supabase: SupabaseClient,
  runId: string,
  snapshots: BotPerformanceSnapshot[]
): Promise<void> {
  const agentBots = snapshots.filter(s => s.is_agent_managed);

  for (const bot of agentBots) {
    await supabase.from('alpha_agent_snapshots').insert({
      bot_id: bot.wallet_id,
      run_id: runId,
      total_pnl: bot.total_pnl,
      realized_pnl: bot.total_pnl, // FT tracks realized only
      unrealized_pnl: 0,
      current_balance: bot.current_balance,
      total_trades: bot.total_trades,
      open_trades: bot.open_trades,
      resolved_trades: bot.resolved_trades,
      winning_trades: bot.winning_trades,
      losing_trades: bot.losing_trades,
      win_rate: bot.win_rate,
      avg_win: bot.avg_win,
      avg_loss: bot.avg_loss,
      profit_factor: bot.profit_factor === Infinity ? 999 : bot.profit_factor,
      roi_pct: bot.roi_pct,
      avg_edge: bot.avg_edge,
      avg_model_probability: bot.avg_model_probability,
      avg_conviction: bot.avg_conviction,
      avg_time_to_resolution_hours: bot.avg_time_to_resolution_hours,
      config_snapshot: {
        model_threshold: bot.model_threshold,
        price_min: bot.price_min,
        price_max: bot.price_max,
        min_edge: bot.min_edge,
        use_model: bot.use_model,
        allocation_method: bot.allocation_method,
        kelly_fraction: bot.kelly_fraction,
        bet_size: bot.bet_size,
        min_bet: bot.min_bet,
        max_bet: bot.max_bet,
        min_trader_resolved_count: bot.min_trader_resolved_count,
        min_conviction: bot.min_conviction,
      },
    });
  }
}

// ============================================================================
// Evaluate past decision outcomes
// ============================================================================

export async function evaluatePastDecisions(
  supabase: SupabaseClient,
  currentSnapshots: Map<string, BotPerformanceSnapshot>
): Promise<number> {
  // Get unevaluated decisions that are at least 24h old
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: decisions } = await supabase
    .from('alpha_agent_decisions')
    .select('*')
    .eq('outcome_evaluated', false)
    .lt('created_at', cutoff);

  if (!decisions || decisions.length === 0) return 0;

  let evaluated = 0;

  for (const decision of decisions) {
    const currentPerf = currentSnapshots.get(decision.bot_id);
    if (!currentPerf) continue;

    // Get the snapshot closest to when the decision was made
    const { data: beforeSnapshot } = await supabase
      .from('alpha_agent_snapshots')
      .select('*')
      .eq('bot_id', decision.bot_id)
      .lt('snapshot_at', decision.created_at)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single();

    let outcomeResult: 'improved' | 'degraded' | 'neutral' = 'neutral';
    const outcomeDetails: Record<string, unknown> = {};

    if (beforeSnapshot) {
      const wrBefore = beforeSnapshot.win_rate || 0;
      const wrAfter = currentPerf.win_rate;
      const roiBefore = beforeSnapshot.roi_pct || 0;
      const roiAfter = currentPerf.roi_pct;
      const pfBefore = beforeSnapshot.profit_factor || 0;
      const pfAfter = currentPerf.profit_factor;

      outcomeDetails.win_rate = { before: wrBefore, after: wrAfter, change: wrAfter - wrBefore };
      outcomeDetails.roi_pct = { before: roiBefore, after: roiAfter, change: roiAfter - roiBefore };
      outcomeDetails.profit_factor = { before: pfBefore, after: pfAfter, change: pfAfter - pfBefore };

      // Score the change
      const wrImproved = wrAfter > wrBefore + 2;
      const roiImproved = roiAfter > roiBefore + 1;
      const wrDegraded = wrAfter < wrBefore - 5;
      const roiDegraded = roiAfter < roiBefore - 3;

      if (wrImproved || roiImproved) outcomeResult = 'improved';
      else if (wrDegraded || roiDegraded) outcomeResult = 'degraded';
      else outcomeResult = 'neutral';
    }

    await supabase
      .from('alpha_agent_decisions')
      .update({
        outcome_evaluated: true,
        outcome_result: outcomeResult,
        outcome_details: outcomeDetails,
        outcome_evaluated_at: new Date().toISOString(),
      })
      .eq('decision_id', decision.decision_id);

    evaluated++;
  }

  return evaluated;
}
