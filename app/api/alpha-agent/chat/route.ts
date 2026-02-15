import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { chatWithAgent } from '@/lib/alpha-agent';
import { getAllBotSnapshots, getBotTrades } from '@/lib/alpha-agent';
import { retrieveRelevantMemories, getLastRun } from '@/lib/alpha-agent/memory-system';
import type { ChatMessage, BotPerformanceSnapshot } from '@/lib/alpha-agent/types';

export const maxDuration = 60;

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      { success: false, error: 'GEMINI_API_KEY not configured' },
      { status: 500 }
    );
  }

  let body: { messages: ChatMessage[]; botId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    );
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { success: false, error: 'messages array is required' },
      { status: 400 }
    );
  }

  const supabase = createAdminServiceClient();

  try {
    const botId = body.botId;
    const allSnapshots = await getAllBotSnapshots(supabase);

    // If no specific bot, provide context for ALL 3 agent bots
    let botPerformance: BotPerformanceSnapshot | null = null;
    let recentTrades: unknown[] = [];
    let currentHypothesis: string | undefined;

    if (botId) {
      botPerformance = allSnapshots.find(s => s.wallet_id === botId) || null;
      recentTrades = await getBotTrades(supabase, botId, 15).catch(() => []);
      const { data: botData } = await supabase.from('alpha_agent_bots').select('current_hypothesis').eq('bot_id', botId).single();
      currentHypothesis = botData?.current_hypothesis || undefined;
    } else {
      // Build combined context for all 3 bots
      const agentBots = allSnapshots.filter(s => s.is_agent_managed);
      const combinedTrades: unknown[] = [];
      const hypotheses: string[] = [];

      for (const bot of agentBots) {
        const trades = await getBotTrades(supabase, bot.wallet_id, 5).catch(() => []);
        combinedTrades.push(...trades);
        const { data: bd } = await supabase.from('alpha_agent_bots').select('current_hypothesis, bot_role').eq('bot_id', bot.wallet_id).single();
        if (bd?.current_hypothesis) hypotheses.push(`${bd.bot_role}: ${bd.current_hypothesis}`);
      }

      // Use the best-performing agent bot as the "primary" for the chat context
      botPerformance = agentBots.sort((a, b) => b.total_pnl - a.total_pnl)[0] || null;
      recentTrades = combinedTrades;
      currentHypothesis = hypotheses.join(' | ');
    }

    // Get relevant memories
    const lastUserMessage = body.messages[body.messages.length - 1]?.content || '';
    const searchTags = extractSearchTags(lastUserMessage);
    const memories = await retrieveRelevantMemories(supabase, {
      tags: searchTags.length > 0 ? searchTags : undefined,
      limit: 10,
    });

    const lastRun = await getLastRun(supabase);

    // Build a richer context when no specific bot (command center mode)
    let lastRunSummary = lastRun?.analysis || lastRun?.reflection || undefined;
    if (!botId) {
      const agentBots = allSnapshots.filter(s => s.is_agent_managed);
      const allBotSummary = agentBots.map(b =>
        `${b.wallet_id}: ${b.resolved_trades} trades, ${b.win_rate.toFixed(1)}% WR, ${b.roi_pct.toFixed(2)}% ROI, $${b.total_pnl.toFixed(2)} PnL`
      ).join('\n');
      lastRunSummary = `ALL AGENT BOTS:\n${allBotSummary}\n\n${lastRunSummary || ''}`;
    }

    const { reply, tokensUsed } = await chatWithAgent(
      body.messages,
      {
        botId: botId || 'ALL_BOTS',
        botPerformance,
        recentTrades,
        memories,
        lastRunSummary,
        currentHypothesis,
      },
      geminiApiKey
    );

    return NextResponse.json({
      success: true,
      reply,
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

/**
 * Extract potential search tags from user message for memory retrieval
 */
function extractSearchTags(message: string): string[] {
  const tags: string[] = [];
  const lower = message.toLowerCase();

  const keywords: Record<string, string[]> = {
    'win rate': ['win_rate', 'performance'],
    'edge': ['edge', 'signal_decay'],
    'kelly': ['kelly', 'sizing'],
    'allocation': ['sizing', 'allocation'],
    'model': ['ml_model', 'probability'],
    'underdog': ['underdogs', 'price_band'],
    'favorite': ['price_band', 'favorites'],
    'exit': ['exit_strategy', 'selling'],
    'stop': ['exit_strategy', 'risk_management'],
    'risk': ['risk_management', 'drawdown'],
    'time': ['time_to_resolution', 'timing'],
    'resolution': ['time_to_resolution', 'capital_efficiency'],
    'trader': ['trader_insight'],
    'pattern': ['pattern', 'meta_learning'],
    'hypothesis': ['hypothesis'],
    'explorer': ['explorer'],
    'optimizer': ['optimizer'],
    'conservative': ['conservative'],
    'regime': ['regime_change', 'market_regime'],
    'sports': ['market_type', 'sports'],
    'politics': ['market_type', 'politics'],
    'crypto': ['market_type', 'crypto'],
    'conviction': ['conviction'],
    'diversif': ['diversification', 'variance'],
  };

  for (const [keyword, associatedTags] of Object.entries(keywords)) {
    if (lower.includes(keyword)) {
      tags.push(...associatedTags);
    }
  }

  // Deduplicate
  return [...new Set(tags)];
}
