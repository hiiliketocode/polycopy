/**
 * Alpha Agent - Chat Actions
 * 
 * Allows the agent to take actions via chat commands from admins:
 * - Modify bot configs (entry filters, sizing, allocation)
 * - Create/update memories and notes
 * - Manage hypotheses
 * - Add exit rules
 * - Update its own thinking protocols (via high-priority memories)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFIG_BOUNDARIES, ALLOWED_ALLOCATION_METHODS } from './types';
import { executeAgentQuery } from './bigquery-tool';
import { domeGetMarkets, domeSearchMarkets, domeGetPrice } from './dome-tool';

export interface ChatAction {
  action_type:
    | 'update_config'       // Change bot strategy config
    | 'create_memory'       // Add a new memory
    | 'update_note'         // Create/update a persistent note
    | 'delete_note'         // Delete a note
    | 'create_hypothesis'   // Create a new hypothesis to test
    | 'add_exit_rule'       // Add an exit strategy rule
    | 'pause_bot'           // Pause a bot
    | 'resume_bot'          // Resume a bot
    | 'set_protocol'        // Update thinking protocol (stored as high-priority memory)
    | 'query_bigquery'      // Run a read-only BigQuery SQL query
    | 'query_supabase'      // Run a read-only Supabase query on a table
    | 'search_markets'      // Search Polymarket markets by keyword
    | 'get_market_price'    // Get live price for a market by condition_id
    | 'none';               // No action needed (just conversation)
  bot_id?: string;
  parameters: Record<string, unknown>;
  reasoning: string;
  confirmation_required: boolean;
}

export interface ActionResult {
  success: boolean;
  action_type: string;
  message: string;
  changes_applied?: Record<string, unknown>;
  data?: unknown; // Query results for data actions
  error?: string;
}

/**
 * Execute a chat action
 */
export async function executeChatAction(
  supabase: SupabaseClient,
  action: ChatAction
): Promise<ActionResult> {
  switch (action.action_type) {
    case 'update_config':
      return await executeConfigUpdate(supabase, action);
    case 'create_memory':
      return await executeCreateMemory(supabase, action);
    case 'update_note':
      return await executeUpdateNote(supabase, action);
    case 'delete_note':
      return await executeDeleteNote(supabase, action);
    case 'create_hypothesis':
      return await executeCreateHypothesis(supabase, action);
    case 'add_exit_rule':
      return await executeAddExitRule(supabase, action);
    case 'pause_bot':
      return await executePauseBot(supabase, action);
    case 'resume_bot':
      return await executeResumeBot(supabase, action);
    case 'set_protocol':
      return await executeSetProtocol(supabase, action);
    case 'query_bigquery':
      return await executeBigQueryQuery(action);
    case 'query_supabase':
      return await executeSupabaseQuery(supabase, action);
    case 'search_markets':
      return await executeSearchMarkets(action);
    case 'get_market_price':
      return await executeGetMarketPrice(action);
    case 'none':
      return { success: true, action_type: 'none', message: 'No action needed.' };
    default:
      return { success: false, action_type: action.action_type, message: `Unknown action: ${action.action_type}` };
  }
}

// ---- BigQuery Query ----
async function executeBigQueryQuery(action: ChatAction): Promise<ActionResult> {
  const sql = action.parameters.sql as string;
  if (!sql) return { success: false, action_type: 'query_bigquery', message: 'No SQL query provided' };

  const result = await executeAgentQuery(sql);
  if (!result.success) {
    return { success: false, action_type: 'query_bigquery', message: `BigQuery error: ${result.error}`, error: result.error };
  }

  const preview = (result.rows || []).slice(0, 20);
  return {
    success: true,
    action_type: 'query_bigquery',
    message: `BigQuery returned ${result.row_count} rows (${result.columns?.join(', ')}). ${result.bytes_processed ? `Scanned ${(result.bytes_processed / 1024 / 1024).toFixed(1)}MB.` : ''}`,
    data: { rows: preview, row_count: result.row_count, columns: result.columns },
  };
}

// ---- Supabase Query ----
async function executeSupabaseQuery(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const table = action.parameters.table as string;
  if (!table) return { success: false, action_type: 'query_supabase', message: 'No table specified' };

  const ALLOWED_TABLES = ['ft_orders', 'ft_wallets', 'lt_orders', 'lt_strategies', 'markets', 'traders', 'trader_global_stats', 'trader_profile_stats', 'ft_seen_trades', 'alpha_agent_memory', 'alpha_agent_runs', 'alpha_agent_decisions', 'alpha_agent_hypotheses', 'alpha_agent_notes', 'alpha_agent_snapshots'];
  if (!ALLOWED_TABLES.includes(table)) {
    return { success: false, action_type: 'query_supabase', message: `Table '${table}' not allowed. Available: ${ALLOWED_TABLES.join(', ')}` };
  }

  try {
    const select = (action.parameters.select as string) || '*';
    const limit = Math.min(Number(action.parameters.limit) || 50, 200);
    const filters = (action.parameters.filters || {}) as Record<string, unknown>;
    const orderBy = action.parameters.order_by as string | undefined;
    const ascending = action.parameters.ascending as boolean | undefined;

    let query = supabase.from(table).select(select).limit(limit);

    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === 'string' && value.startsWith('>=')) {
        query = query.gte(key, value.slice(2));
      } else if (typeof value === 'string' && value.startsWith('<=')) {
        query = query.lte(key, value.slice(2));
      } else if (typeof value === 'string' && value.startsWith('!=')) {
        query = query.neq(key, value.slice(2));
      } else if (Array.isArray(value)) {
        query = query.in(key, value);
      } else {
        query = query.eq(key, value);
      }
    }

    if (orderBy) {
      query = query.order(orderBy, { ascending: ascending ?? false });
    }

    const { data, error } = await query;
    if (error) return { success: false, action_type: 'query_supabase', message: `Supabase error: ${error.message}` };

    return {
      success: true,
      action_type: 'query_supabase',
      message: `Supabase: ${(data || []).length} rows from ${table}`,
      data: { rows: (data || []).slice(0, 50), row_count: (data || []).length, table },
    };
  } catch (err) {
    return { success: false, action_type: 'query_supabase', message: err instanceof Error ? err.message : String(err) };
  }
}

// ---- Search Markets (Dome/Gamma) ----
async function executeSearchMarkets(action: ChatAction): Promise<ActionResult> {
  const query = action.parameters.query as string;
  if (!query) return { success: false, action_type: 'search_markets', message: 'No search query provided' };

  const limit = Math.min(Number(action.parameters.limit) || 10, 20);
  const result = await domeSearchMarkets(query, limit);
  if (!result.success) {
    return { success: false, action_type: 'search_markets', message: `Market search failed: ${result.error}` };
  }

  return {
    success: true,
    action_type: 'search_markets',
    message: `Found ${(result.markets || []).length} markets matching "${query}"`,
    data: { markets: result.markets },
  };
}

// ---- Get Market Price (Dome/Gamma) ----
async function executeGetMarketPrice(action: ChatAction): Promise<ActionResult> {
  const conditionId = action.parameters.condition_id as string;
  if (!conditionId) return { success: false, action_type: 'get_market_price', message: 'No condition_id provided' };

  // Get price
  const priceResult = await domeGetPrice(conditionId);
  // Also get metadata
  const metaResult = await domeGetMarkets([conditionId]);

  const priceData = priceResult.success ? priceResult.price : null;
  const market = metaResult.success && metaResult.markets && metaResult.markets.length > 0 ? metaResult.markets[0] : null;

  if (!priceData && !market) {
    return { success: false, action_type: 'get_market_price', message: `Market ${conditionId} not found` };
  }

  return {
    success: true,
    action_type: 'get_market_price',
    message: `Market: ${market?.title || conditionId}. Prices: ${priceData?.outcomes.map((o, i) => `${o}=${(priceData.prices[i] * 100).toFixed(1)}c`).join(', ') || 'N/A'}. Volume: $${priceData?.volume?.toLocaleString() || 'N/A'}`,
    data: { price: priceData, market },
  };
}

// ---- Config Update ----
async function executeConfigUpdate(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const botId = action.bot_id;
  if (!botId) return { success: false, action_type: 'update_config', message: 'No bot_id specified' };

  const changes = action.parameters.changes as Record<string, unknown> | undefined;
  if (!changes || Object.keys(changes).length === 0) {
    return { success: false, action_type: 'update_config', message: 'No changes specified' };
  }

  // Validate and clamp values
  const validChanges: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [field, value] of Object.entries(changes)) {
    if (field === 'allocation_method') {
      if (typeof value === 'string' && ALLOWED_ALLOCATION_METHODS.includes(value as typeof ALLOWED_ALLOCATION_METHODS[number])) {
        validChanges[field] = value;
      } else {
        warnings.push(`Invalid allocation method: ${value}`);
      }
      continue;
    }
    if (field === 'use_model' || field === 'is_active' || field === 'dead_market_guard') {
      validChanges[field] = Boolean(value);
      continue;
    }
    if (field === 'detailed_description') {
      // Preserve agent_managed flag
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (typeof parsed === 'object' && parsed !== null) {
          (parsed as Record<string, unknown>).agent_managed = true;
          validChanges[field] = JSON.stringify(parsed);
        }
      } catch {
        validChanges[field] = JSON.stringify({ agent_managed: true, raw: value });
      }
      continue;
    }
    const boundary = CONFIG_BOUNDARIES[field as keyof typeof CONFIG_BOUNDARIES];
    if (boundary) {
      const num = Number(value);
      if (Number.isFinite(num)) {
        const clamped = Math.max(boundary.min, Math.min(boundary.max, num));
        validChanges[field] = Math.round(clamped / boundary.step) * boundary.step;
        if (clamped !== num) warnings.push(`${field} clamped: ${num} -> ${clamped}`);
      } else {
        warnings.push(`${field}: invalid number ${value}`);
      }
    } else {
      validChanges[field] = value;
    }
  }

  if (Object.keys(validChanges).length === 0) {
    return { success: false, action_type: 'update_config', message: `No valid changes. Warnings: ${warnings.join('; ')}` };
  }

  const { error } = await supabase.from('ft_wallets').update(validChanges).eq('wallet_id', botId);
  if (error) return { success: false, action_type: 'update_config', message: error.message, error: error.message };

  // Update bot metadata
  await supabase.from('alpha_agent_bots').update({
    last_config_change: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('bot_id', botId);

  return {
    success: true,
    action_type: 'update_config',
    message: `Updated ${botId}: ${Object.entries(validChanges).map(([k, v]) => `${k}=${v}`).join(', ')}${warnings.length ? ` (warnings: ${warnings.join('; ')})` : ''}`,
    changes_applied: validChanges,
  };
}

// ---- Create Memory ----
async function executeCreateMemory(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const p = action.parameters;
  const { error } = await supabase.from('alpha_agent_memory').insert({
    memory_tier: p.tier || 'long_term',
    memory_type: p.type || 'strategy_rule',
    title: p.title || 'Chat-created memory',
    content: p.content || action.reasoning,
    confidence: p.confidence || 0.8,
    tags: Array.isArray(p.tags) ? p.tags : ['chat_created'],
  });
  if (error) return { success: false, action_type: 'create_memory', message: error.message };
  return { success: true, action_type: 'create_memory', message: `Memory created: "${p.title}"` };
}

// ---- Notes CRUD ----
async function executeUpdateNote(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const p = action.parameters;
  const noteId = p.note_id as string | undefined;
  const title = (p.title as string) || 'Untitled Note';
  const content = (p.content as string) || '';

  if (noteId) {
    // Update existing note
    const { error } = await supabase.from('alpha_agent_notes').update({
      title,
      content,
      updated_at: new Date().toISOString(),
    }).eq('note_id', noteId);
    if (error) return { success: false, action_type: 'update_note', message: error.message };
    return { success: true, action_type: 'update_note', message: `Note updated: "${title}"` };
  } else {
    // Create new note
    const { error } = await supabase.from('alpha_agent_notes').insert({
      title,
      content,
      category: (p.category as string) || 'general',
      priority: (p.priority as number) || 5,
      pinned: (p.pinned as boolean) || false,
    });
    if (error) return { success: false, action_type: 'update_note', message: error.message };
    return { success: true, action_type: 'update_note', message: `Note created: "${title}"` };
  }
}

async function executeDeleteNote(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const noteId = action.parameters.note_id as string;
  if (!noteId) return { success: false, action_type: 'delete_note', message: 'No note_id specified' };

  const { error } = await supabase.from('alpha_agent_notes').delete().eq('note_id', noteId);
  if (error) return { success: false, action_type: 'delete_note', message: error.message };
  return { success: true, action_type: 'delete_note', message: `Note deleted: ${noteId}` };
}

// ---- Create Hypothesis ----
async function executeCreateHypothesis(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const p = action.parameters;
  const { error } = await supabase.from('alpha_agent_hypotheses').insert({
    title: p.title || 'Chat-created hypothesis',
    description: p.description || action.reasoning,
    status: 'proposed',
    assigned_bot_id: action.bot_id || null,
    test_config: p.test_config || null,
    success_criteria: p.success_criteria || null,
  });
  if (error) return { success: false, action_type: 'create_hypothesis', message: error.message };
  return { success: true, action_type: 'create_hypothesis', message: `Hypothesis created: "${p.title}"` };
}

// ---- Add Exit Rule ----
async function executeAddExitRule(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const botId = action.bot_id;
  if (!botId) return { success: false, action_type: 'add_exit_rule', message: 'No bot_id specified' };

  const p = action.parameters;
  const { error } = await supabase.from('alpha_agent_exit_rules').insert({
    bot_id: botId,
    rule_type: p.rule_type || 'stop_loss',
    parameters: p.rule_parameters || {},
    reasoning: action.reasoning,
  });
  if (error) return { success: false, action_type: 'add_exit_rule', message: error.message };
  return { success: true, action_type: 'add_exit_rule', message: `Exit rule added to ${botId}: ${p.rule_type}` };
}

// ---- Pause/Resume ----
async function executePauseBot(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const botId = action.bot_id;
  if (!botId) return { success: false, action_type: 'pause_bot', message: 'No bot_id specified' };

  const { error } = await supabase.from('ft_wallets').update({ is_active: false }).eq('wallet_id', botId);
  if (error) return { success: false, action_type: 'pause_bot', message: error.message };
  return { success: true, action_type: 'pause_bot', message: `${botId} paused.` };
}

async function executeResumeBot(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const botId = action.bot_id;
  if (!botId) return { success: false, action_type: 'resume_bot', message: 'No bot_id specified' };

  const { error } = await supabase.from('ft_wallets').update({ is_active: true }).eq('wallet_id', botId);
  if (error) return { success: false, action_type: 'resume_bot', message: error.message };
  return { success: true, action_type: 'resume_bot', message: `${botId} resumed.` };
}

// ---- Set Protocol (thinking changes) ----
async function executeSetProtocol(supabase: SupabaseClient, action: ChatAction): Promise<ActionResult> {
  const p = action.parameters;
  const { error } = await supabase.from('alpha_agent_memory').insert({
    memory_tier: 'long_term',
    memory_type: 'strategy_rule',
    title: `[PROTOCOL] ${p.title || 'Admin directive'}`,
    content: (p.content as string) || action.reasoning,
    confidence: 1.0, // Max confidence — admin directive
    tags: ['protocol', 'admin_directive', ...(Array.isArray(p.tags) ? p.tags : [])],
  });
  if (error) return { success: false, action_type: 'set_protocol', message: error.message };
  return { success: true, action_type: 'set_protocol', message: `Protocol set: "${p.title || 'Admin directive'}"` };
}
