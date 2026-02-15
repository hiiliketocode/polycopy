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
import { executeChatAction } from '@/lib/alpha-agent/chat-actions';
import { buildNotesContext } from '@/lib/alpha-agent/notes';
import { DOME_API_DESCRIPTION } from '@/lib/alpha-agent/dome-tool';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODEL_CONFIGS } from '@/lib/alpha-agent/types';
import type { ChatMessage, BotPerformanceSnapshot } from '@/lib/alpha-agent/types';

export const maxDuration = 60;

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

  try {
    const botId = body.botId;
    const allSnapshots = await getAllBotSnapshots(supabase);

    // Build bot context
    let botPerformance: BotPerformanceSnapshot | null = null;
    let recentTrades: unknown[] = [];
    let currentHypothesis: string | undefined;

    if (botId) {
      botPerformance = allSnapshots.find(s => s.wallet_id === botId) || null;
      recentTrades = await getBotTrades(supabase, botId, 15).catch(() => []);
      const { data: botData } = await supabase.from('alpha_agent_bots').select('current_hypothesis').eq('bot_id', botId).single();
      currentHypothesis = botData?.current_hypothesis || undefined;
    } else {
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
    }

    // Get memories + notes
    const lastUserMessage = body.messages[body.messages.length - 1]?.content || '';
    const searchTags = extractSearchTags(lastUserMessage);
    const memories = await retrieveRelevantMemories(supabase, {
      tags: searchTags.length > 0 ? searchTags : undefined,
      limit: 10,
    });
    const notesContext = await buildNotesContext(supabase);
    const lastRun = await getLastRun(supabase);

    // Build context summary
    let contextSummary = lastRun?.analysis || lastRun?.reflection || '';
    if (!botId) {
      const agentBots = allSnapshots.filter(s => s.is_agent_managed);
      const allBotSummary = agentBots.map(b =>
        `${b.wallet_id}: ${b.resolved_trades} trades, ${b.win_rate.toFixed(1)}% WR, ${b.roi_pct.toFixed(2)}% ROI, $${b.total_pnl.toFixed(2)} PnL`
      ).join('\n');
      contextSummary = `ALL AGENT BOTS:\n${allBotSummary}\n\n${contextSummary}`;
    }

    // Enrich with Supabase data
    const lower = lastUserMessage.toLowerCase();
    const liveDataParts: string[] = [];
    if (lower.includes('price') || lower.includes('band') || lower.includes('underdog') || lower.includes('favorite')) {
      const r = await queryPriceBandPerformance(supabase);
      if (r.success) liveDataParts.push(`PRICE BAND PERFORMANCE:\n${JSON.stringify(r.data, null, 1)}`);
    }
    if (lower.includes('trader') || lower.includes('who') || lower.includes('best') || lower.includes('worst') || lower.includes('top')) {
      const r = await queryTopTraders(supabase, 10);
      if (r.success) liveDataParts.push(`TOP TRADERS:\n${JSON.stringify(r.data, null, 1)}`);
    }
    if (lower.includes('categor') || lower.includes('sport') || lower.includes('nba') || lower.includes('politic') || lower.includes('crypto') || lower.includes('market type')) {
      const r = await queryMarketCategoryPerformance(supabase);
      if (r.success) liveDataParts.push(`CATEGORY PERFORMANCE:\n${JSON.stringify(r.data, null, 1)}`);
    }
    if (lower.includes('time') || lower.includes('resolution') || lower.includes('how long') || lower.includes('capital effic')) {
      const r = await queryTimeToResolution(supabase);
      if (r.success) liveDataParts.push(`TIME TO RESOLUTION:\n${JSON.stringify(r.data, null, 1)}`);
    }
    if (lower.includes('skip') || lower.includes('reject') || lower.includes('filter') || lower.includes('why not')) {
      const r = await querySkipReasons(supabase, botId || undefined);
      if (r.success) liveDataParts.push(`SKIP REASONS:\n${JSON.stringify(r.data?.slice(0, 15), null, 1)}`);
    }
    if (lower.includes('live') || lower.includes('execution') || lower.includes('slippage') || lower.includes('fill')) {
      const r = await queryLTExecutionQuality(supabase);
      if (r.success) liveDataParts.push(`LT EXECUTION QUALITY:\n${JSON.stringify(r.data, null, 1)}`);
    }
    if (liveDataParts.length === 0) {
      const fleet = allSnapshots.filter(s => s.resolved_trades >= 5).sort((a, b) => b.roi_pct - a.roi_pct).slice(0, 10);
      liveDataParts.push(`TOP 10 BOTS BY ROI:\n${fleet.map(b => `${b.wallet_id}: ${b.win_rate.toFixed(1)}% WR, ${b.roi_pct.toFixed(2)}% ROI, $${b.total_pnl.toFixed(2)} PnL, ${b.resolved_trades} trades`).join('\n')}`);
    }

    const fullContext = [
      contextSummary,
      notesContext,
      liveDataParts.length > 0 ? `## LIVE SUPABASE DATA\n${liveDataParts.join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n');

    // ================================================================
    // TWO-PHASE: First get reply + action intent, then execute action
    // ================================================================
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const config = MODEL_CONFIGS.conversational;
    const model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        responseMimeType: 'application/json',
      },
    });

    const actionSystemPrompt = buildActionSystemPrompt(fullContext, botPerformance, recentTrades, memories, currentHypothesis);

    const chatHistory = body.messages.map(m => ({
      role: m.role === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: actionSystemPrompt }] },
        { role: 'model', parts: [{ text: '{"reply": "I\'m Alpha Agent, ready to discuss and take action on strategies. What would you like to do?", "action": {"action_type": "none", "parameters": {}, "reasoning": "", "confirmation_required": false}}' }] },
        ...chatHistory.slice(0, -1),
      ],
    });

    const lastMessage = body.messages[body.messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const responseText = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    // Parse response
    let reply: string;
    let actionResult: { success: boolean; message: string } | null = null;

    try {
      const parsed = JSON.parse(responseText);
      reply = parsed.reply || responseText;

      // Execute action if present and not "none"
      if (parsed.action && parsed.action.action_type && parsed.action.action_type !== 'none') {
        const action = {
          ...parsed.action,
          bot_id: parsed.action.bot_id || botId || undefined,
        };

        actionResult = await executeChatAction(supabase, action);

        // Append action result to reply
        if (actionResult.success) {
          reply += `\n\n**Action taken:** ${actionResult.message}`;
        } else {
          reply += `\n\n**Action failed:** ${actionResult.message}`;
        }
      }
    } catch {
      // If JSON parsing fails, treat entire response as plain text reply
      reply = responseText;
    }

    return NextResponse.json({
      success: true,
      reply,
      action_result: actionResult,
      tokens_used: tokensUsed,
    });
  } catch (err) {
    console.error('[Alpha Agent Chat] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// ================================================================
// System prompt with action capabilities
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

  return `You are ALPHA AGENT with the ability to TAKE ACTIONS when the admin asks you to.

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

3. **update_note** - Create or update a persistent note (included in every future context)
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

8. **set_protocol** - Change your own thinking/behavior protocols (stored as permanent high-priority memory)
   parameters: { title, content, tags: [] }

9. **none** - Just conversation, no action needed

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

If the admin is just asking a question, set action_type to "none". If they ask you to do something, include the appropriate action. Be conversational in your reply — explain what you're doing and why.

## NOTES
Notes are YOUR persistent workspace. Use them to:
- Track your current strategy playbook
- Keep a watchlist of traders/markets to monitor
- Record admin directives so you remember them
- Maintain analysis summaries you can reference later
Keep notes concise and up-to-date. Delete outdated notes.`;
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
  };
  for (const [keyword, associatedTags] of Object.entries(keywords)) {
    if (lower.includes(keyword)) tags.push(...associatedTags);
  }
  return [...new Set(tags)];
}
