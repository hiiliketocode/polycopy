import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  SimulationConfig,
  StrategyType,
  SizingMode,
  DEFAULT_SIMULATION_CONFIG,
  initializeSimulation,
  processSignal,
  resolveMarket,
  advanceTime,
  generateResults,
  tradeToSignal,
  formatSimulationResults,
  STRATEGY_CONFIGS,
  getPerformanceMetrics,
  generateBacktestPeriods,
  runMultiPeriodBacktest,
} from '@/lib/paper-trading';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration for paper trading');
}

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Simulate value scores for backtesting
function simulateValueScore(trade: any): { valueScore: number; edge: number; polyscore: number } {
  let valueScore = 50;
  let edge = 0;
  let polyscore = 50;
  
  const price = Number(trade.price) || 0.5;
  
  // Price-based edge estimation
  if (price > 0.75) {
    edge = -3;
    valueScore -= 10;
  } else if (price > 0.55) {
    edge = 2;
    valueScore += 5;
  } else if (price > 0.45) {
    edge = 5;
    valueScore += 10;
  } else if (price > 0.25) {
    edge = 8;
    valueScore += 15;
  } else {
    edge = 3;
    valueScore += 5;
  }
  
  // Trade size = conviction
  const tradeSize = Number(trade.shares_normalized) * price || 0;
  if (tradeSize > 1000) {
    valueScore += 15;
    polyscore += 15;
  } else if (tradeSize > 500) {
    valueScore += 10;
    polyscore += 10;
  } else if (tradeSize > 100) {
    valueScore += 5;
    polyscore += 5;
  }
  
  // Bet structure adjustment
  const title = (trade.title || trade.market_title || '').toLowerCase();
  const isOverUnder = title.includes('over') || title.includes('under') || title.includes('total');
  const isSpread = title.includes('spread') || title.includes('handicap');
  
  if (isOverUnder || isSpread) {
    edge *= 0.7;
    valueScore -= 5;
  }
  
  // Add some randomness to simulate real-world variation
  valueScore += (Math.random() - 0.5) * 20;
  polyscore += (Math.random() - 0.5) * 15;
  
  return {
    valueScore: Math.min(100, Math.max(0, valueScore)),
    edge,
    polyscore: Math.min(100, Math.max(0, polyscore)),
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Parse config from query params
  const durationDays = parseInt(searchParams.get('days') || '4');
  const initialCapital = parseInt(searchParams.get('capital') || '1000');
  const slippagePct = parseFloat(searchParams.get('slippage') || '0.04');
  const cooldownHours = parseInt(searchParams.get('cooldown') || '3');
  const startDate = searchParams.get('start') || undefined;
  const endDate = searchParams.get('end') || undefined;
  const format = searchParams.get('format') || 'json'; // 'json' or 'text'
  
  // Multi-period backtesting
  const multiPeriod = searchParams.get('multiperiod') === 'true';
  const numPeriods = parseInt(searchParams.get('periods') || '4');
  const gapDays = parseInt(searchParams.get('gap') || '4');
  
  // NOTE: All strategies now use EDGE-BASED position sizing
  // The 'sizing' and 'betSize' params are kept for backward compatibility but are ignored
  // This ensures fair comparison - only entry criteria differ between strategies
  const sizingMode = (searchParams.get('sizing') || 'controlled') as SizingMode;
  const controlledPositionUsd = parseInt(searchParams.get('betSize') || '50');
  
  // Strategies to run (comma-separated or 'all')
  const strategiesParam = searchParams.get('strategies') || 'all';
  let strategies: StrategyType[];
  if (strategiesParam === 'all') {
    strategies = ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'];
  } else {
    strategies = strategiesParam.split(',').filter(s => 
      ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'].includes(s)
    ) as StrategyType[];
  }
  
  if (strategies.length === 0) {
    return NextResponse.json({ error: 'No valid strategies specified' }, { status: 400 });
  }
  
  // =========================================================================
  // MULTI-PERIOD BACKTESTING
  // Runs backtests across multiple non-overlapping time windows
  // =========================================================================
  if (multiPeriod) {
    try {
      console.log(`[paper-trading] Running multi-period backtest: ${numPeriods} periods x ${durationDays} days (${gapDays}-day gaps)`);
      
      const result = await runMultiPeriodBacktest(supabase, {
        durationDays,
        initialCapital,
        slippagePct,
        cooldownHours,
        strategies,
      }, numPeriods, gapDays);
      
      if (format === 'text') {
        return new NextResponse(result.logs.join('\n'), {
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      
      return NextResponse.json({
        success: true,
        mode: 'multiperiod_backtest',
        config: {
          durationDays,
          numPeriods,
          gapDays,
          initialCapital,
          slippagePct,
          cooldownHours,
          strategies,
          note: 'All strategies use edge-based position sizing for fair comparison',
        },
        periods: result.periods.map(p => ({
          id: p.id,
          name: p.name,
          startDate: p.startDate.toISOString(),
          endDate: p.endDate.toISOString(),
          description: p.description,
        })),
        aggregatedRankings: result.aggregatedRankings.map((r, i) => ({
          rank: i + 1,
          strategy: r.strategy,
          strategyName: STRATEGY_CONFIGS[r.strategy].name,
          avgRoi: Math.round(r.avgRoi * 100) / 100,
          avgWinRate: Math.round(r.avgWinRate * 100) / 100,
          totalTrades: r.totalTrades,
          avgMaxDrawdown: Math.round(r.avgMaxDrawdown * 100) / 100,
          consistency: Math.round(r.consistency * 100) / 100,
          periodsWon: r.periodsWon,
        })),
        periodResults: result.results.map((res, i) => ({
          period: result.periods[i]?.name,
          rankings: res.rankings.map((r, j) => ({
            rank: j + 1,
            strategy: r.strategy,
            roi: Math.round(r.roi * 100) / 100,
            winRate: Math.round(r.winRate * 100) / 100,
            totalTrades: r.totalTrades,
          })),
        })),
        logs: result.logs.slice(-100),
      });
    } catch (error: any) {
      console.error('[paper-trading] Multi-period backtest error:', error);
      return NextResponse.json({
        error: 'Multi-period backtest failed',
        details: error.message,
      }, { status: 500 });
    }
  }

  try {
    // Calculate date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate 
      ? new Date(startDate)
      : new Date(end.getTime() - (durationDays * 24 * 60 * 60 * 1000));
    
    console.log(`[paper-trading] Running backtest from ${start.toISOString()} to ${end.toISOString()}`);
    console.log(`[paper-trading] Config: $${initialCapital} capital, ${slippagePct * 100}% slippage, ${cooldownHours}h cooldown`);
    console.log(`[paper-trading] Sizing mode: ${sizingMode} (${sizingMode === 'controlled' ? `$${controlledPositionUsd} per trade` : 'strategy-specific'})`);
    console.log(`[paper-trading] Strategies: ${strategies.join(', ')}`);
    
    // Initialize simulation
    let state = initializeSimulation({
      mode: 'backtest',
      sizingMode,
      controlledPositionUsd,
      durationDays,
      initialCapital,
      slippagePct,
      cooldownHours,
      useHistoricalData: true,
      startTimestamp: start.getTime(),
      strategies,
    });
    
    // Fetch historical trades from the trades table (broader than just top5)
    // This includes all trades from tracked wallets
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select(`
        *,
        markets!left (
          condition_id,
          winning_side,
          resolved_outcome,
          closed,
          title,
          tags,
          category
        )
      `)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .eq('side', 'BUY')
      .order('timestamp', { ascending: true })
      .limit(3000);
    
    if (tradesError) {
      console.error('[paper-trading] Error fetching trades:', tradesError);
      
      // Fallback to top5 table if trades table fails
      console.log('[paper-trading] Falling back to top5_trades_with_markets...');
      const { data: fallbackTrades, error: fallbackError } = await supabase
        .from('top5_trades_with_markets')
        .select('*')
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .eq('side', 'BUY')
        .order('timestamp', { ascending: true })
        .limit(2000);
      
      if (fallbackError) {
        return NextResponse.json({ 
          error: 'Failed to fetch trades', 
          details: fallbackError.message 
        }, { status: 500 });
      }
      
      // Use fallback trades
      (trades as any) = fallbackTrades;
    }
    
    console.log(`[paper-trading] Loaded ${trades?.length || 0} historical trades`);
    state.logs.push(`[BACKTEST] Loaded ${trades?.length || 0} historical trades`);
    
    // Get market resolutions
    const conditionIds = [...new Set((trades || []).map(t => t.condition_id).filter(Boolean))];
    
    let marketResolutions = new Map<string, { winner: 'YES' | 'NO' | null; closed: boolean }>();
    
    if (conditionIds.length > 0) {
      const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, winning_side, resolved_outcome, closed')
        .in('condition_id', conditionIds.slice(0, 500)); // Limit to avoid query size issues
      
      (markets || []).forEach(m => {
        let winner: 'YES' | 'NO' | null = null;
        if (m.winning_side === 'Yes' || m.resolved_outcome === 'Yes') winner = 'YES';
        else if (m.winning_side === 'No' || m.resolved_outcome === 'No') winner = 'NO';
        marketResolutions.set(m.condition_id, { winner, closed: m.closed });
      });
      
      console.log(`[paper-trading] Loaded ${marketResolutions.size} market resolutions`);
    }
    
    // Process trades
    let processedCount = 0;
    let enteredCount = 0;
    let resolvedCount = 0;
    
    for (const trade of (trades || [])) {
      processedCount++;
      
      // Convert to signal
      const signal = tradeToSignal(trade, null, null);
      
      // Simulate value scores
      const simScores = simulateValueScore(trade);
      signal.valueScore = simScores.valueScore;
      signal.aiEdge = simScores.edge;
      signal.polyscore = simScores.polyscore;
      
      // Count open positions before
      const openBefore = Object.values(state.portfolios).reduce(
        (sum, p) => sum + p.openPositions.length, 0
      );
      
      // Process signal
      state = processSignal(state, signal);
      
      // Count open positions after
      const openAfter = Object.values(state.portfolios).reduce(
        (sum, p) => sum + p.openPositions.length, 0
      );
      
      if (openAfter > openBefore) {
        enteredCount++;
      }
      
      // Check for resolution
      const resolution = marketResolutions.get(trade.condition_id);
      if (resolution?.winner && resolution.closed) {
        // Resolve with some time delay
        const resolutionTime = signal.timestamp + (2 * 60 * 60 * 1000);
        
        const openBeforeResolve = Object.values(state.portfolios).reduce(
          (sum, p) => sum + p.openPositions.filter(pos => pos.conditionId === trade.condition_id).length, 0
        );
        
        state = resolveMarket(state, trade.condition_id, resolution.winner, resolutionTime);
        
        if (openBeforeResolve > 0) {
          resolvedCount += openBeforeResolve;
        }
      }
    }
    
    // Finalize
    state = advanceTime(state, end.getTime());
    
    console.log(`[paper-trading] Processed ${processedCount} trades, entered ${enteredCount}, resolved ${resolvedCount}`);
    
    // Generate results
    const result = generateResults(state);
    
    // Return based on format
    if (format === 'text') {
      return new NextResponse(formatSimulationResults(result), {
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    
    // Build detailed response
    const response = {
      success: true,
      config: {
        mode: 'backtest',
        sizingMode,
        controlledPositionUsd: sizingMode === 'controlled' ? controlledPositionUsd : null,
        durationDays,
        initialCapital,
        slippagePct,
        cooldownHours,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        strategies,
      },
      summary: {
        tradesProcessed: processedCount,
        tradesEntered: enteredCount,
        tradesResolved: resolvedCount,
        marketsWithResolution: marketResolutions.size,
      },
      rankings: result.rankings.map((r, i) => ({
        rank: i + 1,
        strategy: r.strategy,
        strategyName: STRATEGY_CONFIGS[r.strategy].name,
        finalValue: Math.round(r.finalValue * 100) / 100,
        totalPnL: Math.round(r.totalPnL * 100) / 100,
        roi: Math.round(r.roi * 100) / 100,
        winRate: Math.round(r.winRate * 100) / 100,
        totalTrades: r.totalTrades,
        maxDrawdown: Math.round(r.maxDrawdown * 100) / 100,
      })),
      portfolios: Object.entries(result.portfolios).reduce((acc, [strategy, portfolio]) => {
        const metrics = getPerformanceMetrics(portfolio);
        acc[strategy] = {
          strategyName: STRATEGY_CONFIGS[strategy as StrategyType].name,
          description: STRATEGY_CONFIGS[strategy as StrategyType].description,
          capital: {
            initial: initialCapital,
            available: Math.round(portfolio.availableCash * 100) / 100,
            locked: Math.round(portfolio.lockedCapital * 100) / 100,
            cooldown: Math.round(portfolio.cooldownCapital * 100) / 100,
            total: Math.round(metrics.totalValue * 100) / 100,
          },
          performance: {
            totalPnL: Math.round(metrics.totalPnL * 100) / 100,
            roi: Math.round(metrics.totalPnLPercent * 100) / 100,
            winRate: Math.round(metrics.winRate * 100) / 100,
            totalTrades: metrics.totalTrades,
            winningTrades: metrics.winningTrades,
            losingTrades: metrics.losingTrades,
            avgWin: Math.round(metrics.avgWin * 100) / 100,
            avgLoss: Math.round(metrics.avgLoss * 100) / 100,
            profitFactor: metrics.profitFactor === Infinity ? 'Infinity' : Math.round(metrics.profitFactor * 100) / 100,
            maxDrawdown: Math.round(metrics.maxDrawdown * 100) / 100,
          },
          openPositions: portfolio.openPositions.length,
          closedPositions: portfolio.closedPositions.length,
          // Return last 20 trades for display (most recent first)
          recentTrades: portfolio.closedPositions.slice(-20).reverse().map(t => ({
            id: t.id,
            market: t.marketTitle.slice(0, 50),
            marketSlug: t.marketSlug,
            conditionId: t.conditionId,
            outcome: t.outcome,
            status: t.status,
            entryPrice: Math.round(t.entryPrice * 1000) / 1000,
            rawPrice: Math.round(t.rawPrice * 1000) / 1000,
            invested: Math.round(t.investedUsd * 100) / 100,
            pnl: Math.round((t.pnlUsd || 0) * 100) / 100,
            roi: Math.round((t.roiPercent || 0) * 100) / 100,
            valueScore: t.valueScore,
            aiEdge: t.aiEdge,
            betStructure: t.betStructure,
            niche: t.niche,
            entryTime: new Date(t.entryTimestamp).toISOString(),
            exitTime: t.exitTimestamp ? new Date(t.exitTimestamp).toISOString() : null,
            walletAddress: t.walletAddress,
          })),
          // All open positions
          currentPositions: portfolio.openPositions.map(t => ({
            id: t.id,
            market: t.marketTitle.slice(0, 50),
            marketSlug: t.marketSlug,
            conditionId: t.conditionId,
            outcome: t.outcome,
            status: t.status,
            entryPrice: Math.round(t.entryPrice * 1000) / 1000,
            invested: Math.round(t.investedUsd * 100) / 100,
            valueScore: t.valueScore,
            aiEdge: t.aiEdge,
            betStructure: t.betStructure,
            entryTime: new Date(t.entryTimestamp).toISOString(),
            walletAddress: t.walletAddress,
          })),
          // Hourly activity tracking
          hourlyActivity: Object.entries(portfolio.tradesPerHour || {}).map(([hour, count]) => ({
            hour: parseInt(hour),
            trades: count,
          })),
        };
        return acc;
      }, {} as Record<string, any>),
      logs: state.logs.slice(-50), // Last 50 log entries
    };
    
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('[paper-trading] Error:', error);
    return NextResponse.json({
      error: 'Simulation failed',
      details: error.message,
    }, { status: 500 });
  }
}

// POST endpoint to run custom simulation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Support custom config
    const config: Partial<SimulationConfig> = {
      durationDays: body.durationDays || 4,
      initialCapital: body.initialCapital || 1000,
      slippagePct: body.slippagePct || 0.04,
      cooldownHours: body.cooldownHours || 3,
      strategies: body.strategies || ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'],
    };
    
    // Redirect to GET with params
    const params = new URLSearchParams({
      days: String(config.durationDays),
      capital: String(config.initialCapital),
      slippage: String(config.slippagePct),
      cooldown: String(config.cooldownHours),
      strategies: config.strategies?.join(',') || 'all',
    });
    
    if (body.startDate) params.set('start', body.startDate);
    if (body.endDate) params.set('end', body.endDate);
    
    // Build URL and fetch
    const baseUrl = request.nextUrl.origin;
    const response = await fetch(`${baseUrl}/api/paper-trading?${params.toString()}`);
    const data = await response.json();
    
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('[paper-trading] POST error:', error);
    return NextResponse.json({
      error: 'Invalid request',
      details: error.message,
    }, { status: 400 });
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for backtest
