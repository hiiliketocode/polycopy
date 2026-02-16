import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { getAllBotSnapshots, getBotTrades } from '@/lib/alpha-agent';
import { retrieveRelevantMemories, getLastRun } from '@/lib/alpha-agent/memory-system';
import {
  queryPriceBandPerformance,
  queryTopTraders,
  queryMarketCategoryPerformance,
  queryTimeToResolution,
  querySkipReasons,
  queryLTExecutionQuality,
} from '@/lib/alpha-agent/supabase-tool';
import { executeChatAction, type ActionResult } from '@/lib/alpha-agent/chat-actions';
import { SCHEMA_REFERENCE } from '@/lib/alpha-agent/schema-reference';
import { buildNotesContext } from '@/lib/alpha-agent/notes';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODEL_CONFIGS } from '@/lib/alpha-agent/types';
import type { ChatMessage, BotPerformanceSnapshot } from '@/lib/alpha-agent/types';

export const maxDuration = 60;

interface ThinkingStep {
  agent: 'data' | 'memory' | 'supabase' | 'strategist' | 'executor';
  label: string;
  detail?: string;
  timestamp: string;
  duration_ms?: number;
}

function step(agent: ThinkingStep['agent'], label: string, detail?: string): ThinkingStep {
  return { agent, label, detail, timestamp: new Date().toISOString() };
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  let body: { messages: ChatMessage[]; botId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ success: false, error: 'messages array is required' }, { status: 400 });
  }

  const supabase = createAdminServiceClient();
  const steps: ThinkingStep[] = [];
  const t0 = Date.now();
  const lastUserMessage = body.messages[body.messages.length - 1]?.content || '';
  const lower = lastUserMessage.toLowerCase();


  // Classify message intent to avoid loading unnecessary data
  const needsData = /\b(top|best|worst|performance|pnl|roi|win rate|trades|bot|strateg|wallet|trader|allocation|edge|conviction|price band|categor|time to resolution|skip|reject|slippage|fill|execution|drawdown|capital|balance)\b/i.test(lastUserMessage);
  const needsMarketLookup = /0x[a-fA-F0-9]{40,}/.test(lastUserMessage) || /\b(search|find|look up)\b.*\b(market|markets)\b/i.test(lower) || /\b(price|odds)\b.*\b(market|polymarket)\b/i.test(lower);
  const isLightMode = !needsData && !needsMarketLookup && lastUserMessage.length < 500;


  try {
    // ================================================================
    // DATA AGENT: Pull bot performance (skip in light mode)
    // ================================================================
    let allSnapshots: Awaited<ReturnType<typeof getAllBotSnapshots>> = [];
    if (!isLightMode) {
      steps.push(step('data', 'Loading bot performance data from Supabase'));
      allSnapshots = await getAllBotSnapshots(supabase);
    }
    if (!isLightMode) {
      steps.push(step('data', `Loaded ${allSnapshots.length} bots`, `${allSnapshots.filter(s => s.is_agent_managed).length} are agent-managed`));
    }

    const botId = body.botId;
    let botPerformance: BotPerformanceSnapshot | null = null;
    let recentTrades: unknown[] = [];
    let currentHypothesis: string | undefined;

    if (!isLightMode) {
      if (botId) {
        steps.push(step('data', `Fetching trades for ${botId}`));
        botPerformance = allSnapshots.find(s => s.wallet_id === botId) || null;
        recentTrades = await getBotTrades(supabase, botId, 15).catch(() => []);
        const { data: botData } = await supabase.from('alpha_agent_bots').select('current_hypothesis').eq('bot_id', botId).single();
        currentHypothesis = botData?.current_hypothesis || undefined;
        steps.push(step('data', `Got ${(recentTrades as unknown[]).length} recent trades`, botPerformance ? `${botPerformance.win_rate.toFixed(1)}% WR, $${botPerformance.total_pnl.toFixed(2)} PnL` : 'No data'));
      } else {
        steps.push(step('data', 'Building context for all 3 agent bots'));
        const agentBots = allSnapshots.filter(s => s.is_agent_managed);
        const combinedTrades: unknown[] = [];
        const hypotheses: string[] = [];
        for (const bot of agentBots) {
          const trades = await getBotTrades(supabase, bot.wallet_id, 5).catch(() => []);
          combinedTrades.push(...trades);
          const { data: bd } = await supabase.from('alpha_agent_bots').select('current_hypothesis, bot_role').eq('bot_id', bot.wallet_id).single();
          if (bd?.current_hypothesis) hypotheses.push(`${bd.bot_role}: ${bd.current_hypothesis}`);
        }
        botPerformance = agentBots.sort((a, b) => b.total_pnl - a.total_pnl)[0] || null;
        recentTrades = combinedTrades;
        currentHypothesis = hypotheses.join(' | ');
        steps.push(step('data', `Loaded ${agentBots.length} agent bots with ${combinedTrades.length} recent trades`));
      }
    } else {
      steps.push(step('data', 'Light mode: no data keywords detected, skipping fleet loading'));
    }

    // ================================================================
    // MEMORY AGENT: Retrieve relevant knowledge (skip in light mode)
    // ================================================================
    let notesContext: string | null = null;
    let lastRun: Awaited<ReturnType<typeof getLastRun>> = null;
    let memories: Awaited<ReturnType<typeof retrieveRelevantMemories>> = [];
    if (!isLightMode) {
      steps.push(step('memory', 'Searching memory for relevant knowledge'));
      const searchTags = extractSearchTags(lastUserMessage);
      memories = await retrieveRelevantMemories(supabase, {
        tags: searchTags.length > 0 ? searchTags : undefined,
        limit: 10,
      });
      steps.push(step('memory', `Found ${memories.length} relevant memories`, searchTags.length > 0 ? `Tags: ${searchTags.join(', ')}` : 'Broad search'));
      steps.push(step('memory', 'Loading persistent notes'));
      notesContext = await buildNotesContext(supabase);
      steps.push(step('memory', notesContext ? 'Notes loaded into context' : 'No notes yet'));
      lastRun = await getLastRun(supabase);
      if (lastRun) {
        steps.push(step('memory', 'Retrieved last run context', `Regime: ${lastRun.market_regime || 'unknown'}`));
      }
    }

    // Build context summary
    let contextSummary = lastRun?.analysis || lastRun?.reflection || '';
    if (!isLightMode && !botId) {
      const agentBots = allSnapshots.filter(s => s.is_agent_managed);
      const allBotSummary = agentBots.map(b =>
        `${b.wallet_id}: ${b.resolved_trades} trades, ${b.win_rate.toFixed(1)}% WR, ${b.roi_pct.toFixed(2)}% ROI, $${b.total_pnl.toFixed(2)} PnL`
      ).join('\n');
      contextSummary = `ALL AGENT BOTS:\n${allBotSummary}\n\n${contextSummary}`;
    }
    if (isLightMode && !contextSummary) {
      contextSummary = 'Light mode: answering from knowledge. Use actions if data is needed.';
    }

    // ================================================================
    // SUPABASE AGENT: Pull live data based on question (skip in light mode)
    // ================================================================
    const lower = lastUserMessage.toLowerCase();
    const liveDataParts: string[] = [];

    if (!isLightMode && (lower.includes('price') || lower.includes('band') || lower.includes('underdog') || lower.includes('favorite'))) {
      steps.push(step('supabase', 'Querying price band performance'));
      const r = await queryPriceBandPerformance(supabase);
      if (r.success) { liveDataParts.push(`PRICE BAND PERFORMANCE:\n${JSON.stringify(r.data, null, 1)}`); steps.push(step('supabase', `Got ${r.count} price bands`)); }
    }
    if (!isLightMode && (lower.includes('trader') || lower.includes('who') || lower.includes('best') || lower.includes('worst') || lower.includes('top'))) {
      steps.push(step('supabase', 'Querying top traders by P&L'));
      const r = await queryTopTraders(supabase, 10);
      if (r.success) { liveDataParts.push(`TOP TRADERS:\n${JSON.stringify(r.data, null, 1)}`); steps.push(step('supabase', `Got ${r.count} traders`)); }
    }
    if (!isLightMode && (lower.includes('categor') || lower.includes('sport') || lower.includes('nba') || lower.includes('politic') || lower.includes('crypto') || lower.includes('market type'))) {
      steps.push(step('supabase', 'Querying market category performance'));
      const r = await queryMarketCategoryPerformance(supabase);
      if (r.success) { liveDataParts.push(`CATEGORY PERFORMANCE:\n${JSON.stringify(r.data, null, 1)}`); steps.push(step('supabase', `Got ${r.count} categories`)); }
    }
    if (!isLightMode && (lower.includes('time') || lower.includes('resolution') || lower.includes('how long') || lower.includes('capital effic'))) {
      steps.push(step('supabase', 'Querying time-to-resolution analysis'));
      const r = await queryTimeToResolution(supabase);
      if (r.success) { liveDataParts.push(`TIME TO RESOLUTION:\n${JSON.stringify(r.data, null, 1)}`); steps.push(step('supabase', `Got ${r.count} time buckets`)); }
    }
    if (!isLightMode && (lower.includes('skip') || lower.includes('reject') || lower.includes('filter') || lower.includes('why not'))) {
      steps.push(step('supabase', 'Querying skip reasons from ft_seen_trades'));
      const r = await querySkipReasons(supabase, botId || undefined);
      if (r.success) { liveDataParts.push(`SKIP REASONS:\n${JSON.stringify(r.data?.slice(0, 15), null, 1)}`); steps.push(step('supabase', `Got ${r.count} skip reasons`)); }
    }
    if (!isLightMode && (lower.includes('live') || lower.includes('execution') || lower.includes('slippage') || lower.includes('fill'))) {
      steps.push(step('supabase', 'Querying LT execution quality metrics'));
      const r = await queryLTExecutionQuality(supabase);
      if (r.success) { liveDataParts.push(`LT EXECUTION QUALITY:\n${JSON.stringify(r.data, null, 1)}`); steps.push(step('supabase', 'Got execution quality metrics')); }
    }
    if (liveDataParts.length === 0 && !isLightMode) {
      steps.push(step('supabase', 'Loading fleet overview (top 10 by ROI)'));
      const fleet = allSnapshots.filter(s => s.resolved_trades >= 5).sort((a, b) => b.roi_pct - a.roi_pct).slice(0, 10);
      liveDataParts.push(`TOP 10 BOTS BY ROI:\n${fleet.map(b => `${b.wallet_id}: ${b.win_rate.toFixed(1)}% WR, ${b.roi_pct.toFixed(2)}% ROI, $${b.total_pnl.toFixed(2)} PnL, ${b.resolved_trades} trades`).join('\n')}`);
    }

    const fullContext = [
      contextSummary,
      notesContext,
      liveDataParts.length > 0 ? `## LIVE SUPABASE DATA\n${liveDataParts.join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n');

    // ================================================================
    // STRATEGIST AGENT: LLM reasoning
    // ================================================================
    steps.push(step('strategist', `Thinking with ${MODEL_CONFIGS.conversational.model}`, `Temperature: ${MODEL_CONFIGS.conversational.temperature}, context: ${Math.round(fullContext.length / 1000)}k chars`));

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const config = MODEL_CONFIGS.conversational;
    const model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: { temperature: config.temperature, maxOutputTokens: config.maxOutputTokens, responseMimeType: 'application/json' },
    });

    const actionSystemPrompt = buildActionSystemPrompt(fullContext, botPerformance, recentTrades, memories, currentHypothesis);

    const chatHistory = body.messages.map(m => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [{ text: m.content }];
      if (m.attachments && Array.isArray(m.attachments)) {
        for (const att of m.attachments) {
          if (att.mimeType && att.data) {
            parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
          }
        }
      }
      return { role: m.role === 'user' ? 'user' as const : 'model' as const, parts };
    });

    const hasAttachments = body.messages.some(m => m.attachments && m.attachments.length > 0);
    if (hasAttachments) {
      steps.push(step('strategist', 'Processing image/file attachments with vision'));
    }

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: actionSystemPrompt }] },
        { role: 'model', parts: [{ text: '{"reply": "I\'m Alpha Agent, ready to discuss and take action on strategies. What would you like to do?", "action": {"action_type": "none", "parameters": {}, "reasoning": "", "confirmation_required": false}}' }] },
        ...chatHistory.slice(0, -1),
      ],
    });

    const lastMessage = body.messages[body.messages.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastParts: any[] = [{ text: lastMessage.content }];
    if (lastMessage.attachments && Array.isArray(lastMessage.attachments)) {
      for (const att of lastMessage.attachments) {
        if (att.mimeType && att.data) {
          lastParts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
        }
      }
    }

    const llmStart = Date.now();
    const result = await chat.sendMessage(lastParts);
    const responseText = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;
    const llmDuration = Date.now() - llmStart;

    steps.push(step('strategist', `Response generated in ${(llmDuration / 1000).toFixed(1)}s`, `${tokensUsed} tokens used`));

    // ================================================================
    // EXECUTOR AGENT: Parse response and execute actions
    // ================================================================
    let reply: string;
    let actionResult: ActionResult | null = null;

    try {
      const parsed = JSON.parse(responseText);
      reply = parsed.reply || responseText;

      if (parsed.action && parsed.action.action_type && parsed.action.action_type !== 'none') {
        const actionType = parsed.action.action_type;
        const actionBot = parsed.action.bot_id || botId || 'unknown';
        const actionParams = parsed.action.parameters || {};
        const paramSummary = actionType === 'query_supabase'
          ? `table=${actionParams.table}, select=${actionParams.select || '*'}, filters=${JSON.stringify(actionParams.filters || {})}, order=${actionParams.order_by || 'none'}`
          : actionType === 'query_bigquery'
          ? `SQL: ${(actionParams.sql || '').substring(0, 120)}...`
          : actionType === 'search_markets'
          ? `query="${actionParams.query}"`
          : actionType === 'update_config'
          ? `changes=${JSON.stringify(actionParams.changes || {})}`
          : `${JSON.stringify(actionParams).substring(0, 100)}`;
        steps.push(step('executor', `Executing: ${actionType}`, paramSummary));

        const action = { ...parsed.action, bot_id: parsed.action.bot_id || botId || undefined };
        actionResult = await executeChatAction(supabase, action);

        if (actionResult.success) {
          steps.push(step('executor', `Action succeeded: ${actionResult.message}`));

          // For data queries: do a follow-up LLM call to interpret the results
          const dataActions = ['query_bigquery', 'query_supabase', 'search_markets', 'get_market_price'];
          if (dataActions.includes(actionType) && actionResult.data) {
            steps.push(step('strategist', 'Interpreting query results...'));
            const interpretStart = Date.now();
            const dataStr = JSON.stringify(actionResult.data, null, 1).substring(0, 8000);
            const followUp = await chat.sendMessage(
              `Here are the results of the ${actionType} you requested:\n\n${dataStr}\n\nNow analyze these results and respond to the admin's original question. Include specific numbers and insights from the data. Respond with JSON: {"reply": "your analysis of the data", "action": {"action_type": "none", "parameters": {}, "reasoning": "", "confirmation_required": false}}`
            );
            const followUpText = followUp.response.text();
            const followUpTokens = followUp.response.usageMetadata?.totalTokenCount || 0;
            steps.push(step('strategist', `Interpreted in ${((Date.now() - interpretStart) / 1000).toFixed(1)}s`, `${followUpTokens} tokens`));

            try {
              const followUpParsed = JSON.parse(followUpText);
              reply = followUpParsed.reply || followUpText;
            } catch {
              reply = followUpText;
            }
            reply += `\n\n*Data source: ${actionResult.message}*`;
          } else {
            reply += `\n\n**Action taken:** ${actionResult.message}`;
          }
        } else {
          steps.push(step('executor', `Action failed: ${actionResult.message}`));
          reply += `\n\n**Action failed:** ${actionResult.message}`;
        }
      } else {
        steps.push(step('executor', 'No action needed (conversation only)'));
      }
    } catch {
      reply = responseText;
      steps.push(step('executor', 'Response parsed as plain text (no structured action)'));
    }

    const totalDuration = Date.now() - t0;
    steps.push(step('data', `Total: ${(totalDuration / 1000).toFixed(1)}s`, `${steps.length} steps completed`));

    return NextResponse.json({
      success: true,
      reply,
      action_result: actionResult,
      thinking_steps: steps,
      tokens_used: tokensUsed,
      duration_ms: totalDuration,
    });
  } catch (err) {
    console.error('[Alpha Agent Chat] Error:', err);
    steps.push(step('executor', `Error: ${err instanceof Error ? err.message : 'Unknown'}`));
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error', thinking_steps: steps },
      { status: 500 }
    );
  }
}

// ================================================================
// System prompt
// ================================================================

function buildActionSystemPrompt(
  contextSummary: string,
  botPerformance: BotPerformanceSnapshot | null,
  recentTrades: unknown[],
  memories: unknown[],
  currentHypothesis: string | undefined,
): string {
  const botCtx = botPerformance
    ? `Current bot: ${botPerformance.wallet_id}, ${botPerformance.resolved_trades} trades, ${botPerformance.win_rate.toFixed(1)}% WR, ${botPerformance.roi_pct.toFixed(2)}% ROI, $${botPerformance.total_pnl.toFixed(2)} PnL, alloc=${botPerformance.allocation_method}, model_thresh=${botPerformance.model_threshold}, price=${botPerformance.price_min}-${botPerformance.price_max}, edge>=${botPerformance.min_edge}`
    : '';
  const hypCtx = currentHypothesis ? `Hypotheses: ${currentHypothesis}` : '';
  const tradesCtx = Array.isArray(recentTrades) && recentTrades.length > 0
    ? `Recent trades: ${JSON.stringify(recentTrades.slice(0, 5))}`
    : '';

  return `You are ALPHA AGENT — a general AI assistant for trading, bots, and Polymarket. You can have open-ended conversations and take actions when asked.

Be conversational and flexible. Adapt your response to the question — don't always run the same analysis. For simple questions (e.g. "search for X markets", "what's the price of Y"), use the appropriate action directly. For deeper analysis, use query_supabase or query_bigquery.

${SCHEMA_REFERENCE}

## YOUR CONTEXT
${botCtx}
${hypCtx}
${tradesCtx}

${contextSummary}

## ACTIONS YOU CAN TAKE

When the admin asks you to change something, do something, or you determine an action is needed, include an action object in your response. Available actions:

1. **update_config** - Change bot strategy parameters
   bot_id: "ALPHA_EXPLORER" | "ALPHA_OPTIMIZER" | "ALPHA_CONSERVATIVE"
   parameters.changes: { field: value } (fields: model_threshold, price_min, price_max, min_edge, use_model, allocation_method, kelly_fraction, bet_size, min_bet, max_bet, min_trader_resolved_count, min_conviction)

2. **create_memory** - Save knowledge to memory
   parameters: { tier: "short_term"|"mid_term"|"long_term", type: "observation"|"pattern"|"lesson"|"strategy_rule"|"anti_pattern", title, content, confidence: 0-1, tags: [] }

3. **update_note** - Create or update a persistent note
   parameters: { note_id?: "uuid" (omit to create new), title, content, category: "protocol"|"playbook"|"watchlist"|"analysis"|"directive"|"general", priority: 1-10, pinned: boolean }

4. **delete_note** - Remove a note
   parameters: { note_id: "uuid" }

5. **create_hypothesis** - Create a testable hypothesis
   bot_id: which bot to assign it to
   parameters: { title, description, test_config: {}, success_criteria }

6. **add_exit_rule** - Add a selling/exit strategy
   bot_id: which bot
   parameters: { rule_type: "stop_loss"|"take_profit"|"time_based_exit"|"edge_decay"|"resolution_proximity"|"trader_exit"|"regime_change", rule_parameters: {} }

7. **pause_bot** / **resume_bot** - Pause or resume a bot
   bot_id: which bot

8. **set_protocol** - Change your own thinking/behavior protocols
   parameters: { title, content, tags: [] }

9. **query_bigquery** - Run a read-only SQL query on BigQuery (84M+ trades, ML features, predictions)
   parameters: { sql: "SELECT ... FROM \`gen-lang-client-0299056258.polycopy_v1.TABLE\` ..." }
   Available tables: trades (84M), markets, trader_stats_at_trade (46M), enriched_trades_v13 (40M), trade_predictions_pnl_weighted
   Results will be returned to you for analysis. Max 500 rows, read-only only.

10. **query_supabase** - Query the live Supabase database
    parameters: { table, select (optional), filters: {}, order_by, ascending, limit: 50 }
    Tables: ft_orders, ft_wallets, lt_orders, lt_strategies, markets, traders, trader_global_stats, trader_profile_stats, ft_seen_trades, alpha_agent_bots, alpha_agent_memory, alpha_agent_runs, alpha_agent_snapshots, alpha_agent_hypotheses, alpha_agent_notes
    CRITICAL SCHEMA: ft_wallets has total_pnl (NOT pnl). For "top by PnL" use order_by: "total_pnl", ascending: false. ft_orders has pnl per trade.

11. **search_markets** - Search Polymarket markets by keyword (Dome/Gamma API)
    parameters: { query: "NBA Finals", limit: 10 }
    Use for: "find markets about X", "search for Y", "what markets exist on Z". Returns titles, prices, volumes.

12. **get_market_price** - Get live price for a market (Dome API)
    parameters: { condition_id: "0x..." }
    Use for: "what's the price of market X", "current odds for condition_id Y". Returns outcome prices, volume, metadata.

13. **none** - Just conversation, no action needed

DOME & GAMMA: These are Polymarket's live market APIs. You access them via search_markets (keyword search) and get_market_price (by condition_id). When the admin asks about a specific market, price, or wants to search markets — use these actions.

IMPORTANT: When you need data, USE these query actions proactively. Don't say "I would need to query..." — actually query it. Results are fed back for analysis.

## RESPONSE FORMAT
You MUST respond with valid JSON:
{
  "reply": "your conversational response to the admin",
  "action": {
    "action_type": "none|update_config|create_memory|update_note|delete_note|create_hypothesis|add_exit_rule|pause_bot|resume_bot|set_protocol",
    "bot_id": "ALPHA_EXPLORER|ALPHA_OPTIMIZER|ALPHA_CONSERVATIVE" (optional),
    "parameters": {},
    "reasoning": "why this action",
    "confirmation_required": false
  }
}

If the admin is just asking a question, set action_type to "none". If they ask you to do something, include the appropriate action.`;
}

function extractSearchTags(message: string): string[] {
  const tags: string[] = [];
  const lower = message.toLowerCase();
  const keywords: Record<string, string[]> = {
    'win rate': ['win_rate', 'performance'], 'edge': ['edge', 'signal_decay'],
    'kelly': ['kelly', 'sizing'], 'allocation': ['sizing', 'allocation'],
    'model': ['ml_model', 'probability'], 'underdog': ['underdogs', 'price_band'],
    'favorite': ['price_band', 'favorites'], 'exit': ['exit_strategy', 'selling'],
    'stop': ['exit_strategy', 'risk_management'], 'risk': ['risk_management', 'drawdown'],
    'time': ['time_to_resolution', 'timing'], 'resolution': ['time_to_resolution', 'capital_efficiency'],
    'trader': ['trader_insight'], 'pattern': ['pattern', 'meta_learning'],
    'hypothesis': ['hypothesis'], 'explorer': ['explorer'], 'optimizer': ['optimizer'],
    'conservative': ['conservative'], 'regime': ['regime_change', 'market_regime'],
    'sports': ['market_type', 'sports'], 'politics': ['market_type', 'politics'],
    'crypto': ['market_type', 'crypto'], 'conviction': ['conviction'],
    'diversif': ['diversification', 'variance'],
    'dome': ['market_type'], 'gamma': ['market_type'], 'market': ['market_type'],
    'search': ['market_type'], 'price': ['market_type'],
  };
  for (const [keyword, associatedTags] of Object.entries(keywords)) {
    if (lower.includes(keyword)) tags.push(...associatedTags);
  }
  return [...new Set(tags)];
}
