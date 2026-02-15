import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAllBotSnapshots, buildStrategyComparison, buildObservationSummary } from '@/lib/alpha-agent';
import { createMemories } from '@/lib/alpha-agent/memory-system';
import { getTableDescriptions } from '@/lib/alpha-agent/bigquery-tool';
import { MODEL_CONFIGS } from '@/lib/alpha-agent/types';

export const maxDuration = 120;

/**
 * Bootstrap the Alpha Agent
 * 
 * This is the "hello world" kickoff that:
 * 1. Analyzes all existing bot performance data
 * 2. Identifies winning patterns across the fleet
 * 3. Designs initial strategies for the 3 agent bots
 * 4. Applies the strategies
 * 5. Creates initial memories from the analysis
 * 
 * Run this ONCE when first deploying the agent.
 */
export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json({ success: false, error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createAdminServiceClient();

  try {
    // 1. Pull all performance data
    const allSnapshots = await getAllBotSnapshots(supabase);
    const comparison = await buildStrategyComparison(supabase, allSnapshots);
    const observation = await buildObservationSummary(supabase, allSnapshots);

    // Format data for the bootstrap prompt
    const botsWithTrades = allSnapshots
      .filter(s => s.resolved_trades >= 5)
      .sort((a, b) => b.roi_pct - a.roi_pct);

    const topBots = botsWithTrades.slice(0, 15).map(b => ({
      id: b.wallet_id,
      trades: b.resolved_trades,
      wr: `${b.win_rate.toFixed(1)}%`,
      roi: `${b.roi_pct.toFixed(2)}%`,
      pnl: `$${b.total_pnl.toFixed(2)}`,
      pf: b.profit_factor === Infinity ? '∞' : b.profit_factor.toFixed(2),
      alloc: b.allocation_method,
      model_thresh: b.model_threshold,
      price: `${b.price_min}-${b.price_max}`,
      edge: b.min_edge,
      conviction: b.min_conviction,
      bet: b.bet_size,
    }));

    const bottomBots = botsWithTrades.slice(-10).map(b => ({
      id: b.wallet_id,
      trades: b.resolved_trades,
      wr: `${b.win_rate.toFixed(1)}%`,
      roi: `${b.roi_pct.toFixed(2)}%`,
      pnl: `$${b.total_pnl.toFixed(2)}`,
      alloc: b.allocation_method,
      model_thresh: b.model_threshold,
      price: `${b.price_min}-${b.price_max}`,
      edge: b.min_edge,
    }));

    // 2. Ask Gemini to design initial strategies
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_CONFIGS.strategist.model,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are ALPHA AGENT being initialized for the first time. You manage 3 bots on a Polymarket prediction market copy-trading system.

## EXISTING FLEET PERFORMANCE (${allSnapshots.length} bots total)
- Winning bots: ${observation.winning_bots}, Losing bots: ${observation.losing_bots}
- Average win rate: ${observation.avg_win_rate.toFixed(1)}%
- Best: ${observation.best_bot ? `${observation.best_bot.wallet_id} (${observation.best_bot.roi_pct.toFixed(2)}% ROI)` : 'N/A'}

## TOP PERFORMING BOTS (by ROI)
${JSON.stringify(topBots, null, 1)}

## WORST PERFORMING BOTS
${JSON.stringify(bottomBots, null, 1)}

## STRATEGY COMPARISON
Price bands: ${JSON.stringify(comparison.price_band_performance)}
Allocation methods: ${JSON.stringify(comparison.allocation_performance)}
Time to resolution: ${JSON.stringify(comparison.time_to_resolution)}
Top traders: ${JSON.stringify(comparison.top_traders.slice(0, 8))}
Categories: ${JSON.stringify(comparison.category_performance)}

## AVAILABLE BIGQUERY DATA
${getTableDescriptions()}

## YOUR TASK

Design initial strategies for your 3 bots based on what's working in the existing fleet:

1. **ALPHA_EXPLORER** (aggressive, tests hypotheses): Pick an underexplored angle suggested by the data. Something the existing bots aren't testing.

2. **ALPHA_OPTIMIZER** (refine winners): Take the best-performing patterns and optimize the parameters.

3. **ALPHA_CONSERVATIVE** (proven edge only): Only use the most proven, highest-confidence setups.

For each bot, specify these exact config fields:
- model_threshold (0.40-0.75)
- price_min (0.01-0.50), price_max (0.30-0.99)
- min_edge (0.0-0.20)
- use_model (boolean)
- allocation_method (FIXED|KELLY|EDGE_SCALED|TIERED|CONFIDENCE|CONVICTION|ML_SCALED|WHALE)
- kelly_fraction (0.10-0.50)
- bet_size (0.50-5.00)
- min_bet (0.50-2.00), max_bet (3.00-15.00)
- min_trader_resolved_count (10-300)
- min_conviction (0.0-3.0)

Also provide:
- A hypothesis for each bot
- Initial memories to create (observations about the existing fleet)
- Your first BigQuery queries you'd want to run (as SQL strings)

Respond with JSON:
{
  "strategies": [{
    "bot_id": "ALPHA_EXPLORER|ALPHA_OPTIMIZER|ALPHA_CONSERVATIVE",
    "config": { ... },
    "hypothesis": "string",
    "reasoning": "string"
  }],
  "initial_memories": [{
    "tier": "mid_term|long_term",
    "type": "observation|pattern|strategy_rule",
    "title": "string",
    "content": "string",
    "confidence": 0.0-1.0,
    "tags": ["string"]
  }],
  "bigquery_queries_wanted": [{
    "description": "What you want to learn",
    "sql": "SELECT ... FROM ..."
  }],
  "fleet_analysis": "string - your analysis of the existing bot fleet, what's working, what's not, and why",
  "opening_message": "string - introduce yourself and explain your initial strategy to the admin"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const tokensUsed = result.response.usageMetadata?.totalTokenCount || 0;

    let parsed: {
      strategies: { bot_id: string; config: Record<string, unknown>; hypothesis: string; reasoning: string }[];
      initial_memories: { tier: string; type: string; title: string; content: string; confidence: number; tags: string[] }[];
      bigquery_queries_wanted: { description: string; sql: string }[];
      fleet_analysis: string;
      opening_message: string;
    };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse bootstrap response');
      }
    }

    // 3. Apply strategies to FT wallets
    for (const strategy of (parsed.strategies || [])) {
      const config = strategy.config || {};
      const updates: Record<string, unknown> = {};

      // Only apply valid fields
      const allowedFields = [
        'model_threshold', 'price_min', 'price_max', 'min_edge',
        'use_model', 'allocation_method', 'kelly_fraction',
        'bet_size', 'min_bet', 'max_bet', 'min_trader_resolved_count',
        'min_conviction',
      ];

      for (const field of allowedFields) {
        if (config[field] !== undefined) {
          updates[field] = config[field];
        }
      }

      // Preserve agent_managed flag
      updates.detailed_description = JSON.stringify({
        agent_managed: true,
        bot_role: strategy.bot_id.replace('ALPHA_', '').toLowerCase(),
        hypothesis: strategy.hypothesis,
        bootstrap: true,
      });

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('ft_wallets')
          .update(updates)
          .eq('wallet_id', strategy.bot_id);
      }

      // Update bot info
      await supabase
        .from('alpha_agent_bots')
        .update({
          current_hypothesis: strategy.hypothesis,
          last_config_change: new Date().toISOString(),
          total_config_changes: 1,
          updated_at: new Date().toISOString(),
        })
        .eq('bot_id', strategy.bot_id);
    }

    // 4. Save initial memories
    if (parsed.initial_memories && parsed.initial_memories.length > 0) {
      await createMemories(supabase, parsed.initial_memories.map(m => ({
        memory_tier: m.tier as 'mid_term' | 'long_term',
        memory_type: m.type as 'observation' | 'pattern' | 'strategy_rule',
        title: m.title,
        content: m.content,
        confidence: m.confidence,
        tags: m.tags,
      })));
    }

    // 5. Save fleet analysis as a long-term memory
    await createMemories(supabase, [{
      memory_tier: 'long_term',
      memory_type: 'observation',
      title: 'Bootstrap Fleet Analysis',
      content: parsed.fleet_analysis || 'Initial fleet analysis completed.',
      confidence: 0.8,
      tags: ['bootstrap', 'fleet_analysis', 'initial'],
    }]);

    // 6. Create the bootstrap run record
    await supabase.from('alpha_agent_runs').insert({
      run_type: 'manual',
      status: 'completed',
      phases_completed: { bootstrap: true, observe: true, analyze: true, decide: true, act: true },
      observation_summary: observation,
      analysis: parsed.fleet_analysis,
      decisions: parsed.strategies,
      actions_taken: parsed.strategies.map(s => ({ bot_id: s.bot_id, action_type: 'bootstrap', changes_applied: s.config, success: true })),
      reflection: parsed.opening_message,
      market_regime: 'initial',
      total_bots_analyzed: allSnapshots.length,
      winning_bots: observation.winning_bots,
      losing_bots: observation.losing_bots,
      llm_tokens_used: tokensUsed,
      llm_model: MODEL_CONFIGS.strategist.model,
      completed_at: new Date().toISOString(),
      duration_ms: 0,
    });

    return NextResponse.json({
      success: true,
      strategies: parsed.strategies,
      fleet_analysis: parsed.fleet_analysis,
      opening_message: parsed.opening_message,
      bigquery_queries_wanted: parsed.bigquery_queries_wanted,
      memories_created: (parsed.initial_memories?.length || 0) + 1,
      tokens_used: tokensUsed,
    });
  } catch (err) {
    console.error('[Alpha Agent Bootstrap] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
