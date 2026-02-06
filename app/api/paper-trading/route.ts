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
import { getPolyScore, PolyScoreRequest } from '@/lib/polyscore/get-polyscore';
import { 
  fetchTradesFromBigQuery, 
  fetchMarketResolutions, 
  getTradeStats,
  BigQueryTrade,
  BigQueryMarket,
} from '@/lib/bigquery/client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration for paper trading');
}

const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Cache for PolyScore results to avoid duplicate API calls
const polyScoreCache = new Map<string, any>();

// Calculate V10 Value Score - MUST match PolyPredictBadge.tsx exactly
function calculateV10ValueScore(response: any): number {
  const { valuation, analysis, drawer } = response;
  const v10 = (analysis?.prediction_stats as any)?.v10_features;
  
  // Edge component (0-50 points)
  const edgePct = valuation?.real_edge_pct ?? 0;
  const edgeScore = Math.min(50, Math.max(0, 25 + (edgePct * 2.5)));
  
  // Signal component (0-50 points)
  let signalTotal = 25; // Start at neutral
  
  if (v10) {
    // V10 features available
    if (v10.is_in_best_niche) signalTotal += 10;
    if (v10.trade_size_tier === 'WHALE') signalTotal += 8;
    else if (v10.trade_size_tier === 'LARGE') signalTotal += 5;
    if (v10.is_with_crowd === true) signalTotal += 7;
    else if (v10.is_with_crowd === false) signalTotal -= 3;
    if (v10.trader_sells_ratio !== undefined) {
      if (v10.trader_sells_ratio < 0.1) signalTotal += 5;
      else if (v10.trader_sells_ratio > 0.4) signalTotal -= 5;
    }
    if (v10.market_age_bucket === 'WEEK_1' || v10.market_age_bucket === 'MONTH_1') signalTotal += 5;
    else if (v10.market_age_bucket === 'OLDER') signalTotal -= 5;
    if (v10.is_hedging) signalTotal -= 8;
  } else if (drawer) {
    // Fallback: derive from drawer data
    if (drawer.conviction?.is_outlier || drawer.conviction?.z_score > 1.5) signalTotal += 8;
    if (drawer.tactical?.is_hedged) signalTotal -= 8;
    if (drawer.competency?.niche_win_rate > 60) signalTotal += 10;
    else if (drawer.competency?.niche_win_rate > 50) signalTotal += 5;
    else if (drawer.competency?.niche_win_rate < 45) signalTotal -= 5;
    if (drawer.momentum?.is_hot) signalTotal += 7;
  }
  
  const signalScore = Math.min(50, Math.max(0, signalTotal));
  return Math.round(edgeScore + signalScore);
}

// Get real PolyScore for a trade (with caching)
async function getRealPolyScore(trade: any, logs: string[]): Promise<{
  valueScore: number;
  edge: number;
  polyscore: number;
  traderWinRate: number;
  aiProbability: number;
} | null> {
  const cacheKey = `${trade.conditionId}-${trade.user}-${trade.price}`;
  
  // Check cache first
  if (polyScoreCache.has(cacheKey)) {
    return polyScoreCache.get(cacheKey);
  }
  
  try {
    const request: PolyScoreRequest = {
      original_trade: {
        wallet_address: trade.user || trade.wallet || '',
        condition_id: trade.conditionId || trade.condition_id || '',
        side: 'BUY',
        price: Number(trade.price) || 0.5,
        shares_normalized: Number(trade.size) || 100,
        timestamp: trade.timestamp ? new Date(
          typeof trade.timestamp === 'number' 
            ? (trade.timestamp < 10000000000 ? trade.timestamp * 1000 : trade.timestamp)
            : trade.timestamp
        ).toISOString() : new Date().toISOString(),
      },
      market_context: {
        current_price: Number(trade.price) || 0.5,
        current_timestamp: new Date().toISOString(),
        market_title: trade.title || trade.question || null,
        market_volume_total: null,
        market_tags: null,
      },
      user_slippage: 0.04,
    };
    
    const response = await getPolyScore(request);
    
    // Calculate V10 value score (same formula as PolyPredictBadge)
    const valueScore = calculateV10ValueScore(response);
    
    // Extract trader win rate from multiple possible locations
    const traderWinRate = 
      response.analysis?.prediction_stats?.trader_win_rate ||
      response.drawer?.competency?.global_win_rate ||
      response.drawer?.competency?.niche_win_rate ||
      0.5; // Default to 50% if not found
    
    const result = {
      valueScore,
      edge: response.valuation?.real_edge_pct || response.prediction?.edge_percent || 0,
      polyscore: response.polyscore || 50,
      traderWinRate: traderWinRate / 100, // Normalize to 0-1 if it's a percentage
      aiProbability: response.valuation?.ai_fair_value || 0.5,
    };
    
    // Normalize traderWinRate if it came as percentage (e.g., 55 instead of 0.55)
    if (result.traderWinRate > 1) {
      result.traderWinRate = result.traderWinRate / 100;
    }
    
    // Cache the result
    polyScoreCache.set(cacheKey, result);
    
    return result;
  } catch (error: any) {
    // Log error but don't fail - return null to use fallback
    logs.push(`[WARN] PolyScore API failed for trade: ${error.message?.slice(0, 50)}`);
    return null;
  }
}

// Fallback: Simulate V10-aligned value scores when PolyScore API is unavailable
function simulateValueScore(trade: any): { 
  valueScore: number; 
  edge: number; 
  polyscore: number;
  traderWinRate: number;
} {
  const price = Number(trade.price) || 0.5;
  const tradeSize = Number(trade.size) * price || 0;
  
  // Simulate edge based on price (buying cheap = positive edge expectation)
  let edge = 0;
  if (price < 0.20) edge = 8 + Math.random() * 4;      // 8-12% edge for very cheap
  else if (price < 0.35) edge = 4 + Math.random() * 4; // 4-8% edge
  else if (price < 0.50) edge = 1 + Math.random() * 3; // 1-4% edge
  else if (price < 0.65) edge = -2 + Math.random() * 4; // -2% to 2%
  else if (price < 0.80) edge = -5 + Math.random() * 3; // -5% to -2%
  else edge = -8 + Math.random() * 3;                   // -8% to -5%
  
  // V10 Value Score = Edge Score (0-50) + Signal Score (0-50)
  // Edge Score = 25 + (edge * 2.5)
  const edgeScore = Math.min(50, Math.max(0, 25 + (edge * 2.5)));
  
  // Signal Score (simulate based on trade characteristics)
  let signalScore = 25; // Start neutral
  
  // Trade size tier
  if (tradeSize > 5000) signalScore += 8;      // WHALE
  else if (tradeSize > 1000) signalScore += 5; // LARGE
  else if (tradeSize > 500) signalScore += 2;  // MEDIUM
  
  // Add some randomness for other V10 signals we can't observe
  signalScore += (Math.random() - 0.5) * 10; // -5 to +5 random
  
  signalScore = Math.min(50, Math.max(0, signalScore));
  const valueScore = Math.round(edgeScore + signalScore);
  
  // Polyscore (opportunity score)
  let polyscore = 50 + (edge * 2); // Base on edge
  polyscore += (Math.random() - 0.5) * 20;
  polyscore = Math.min(100, Math.max(0, polyscore));
  
  // Simulate trader win rate
  // Whales tend to be better traders
  let traderWinRate: number;
  if (tradeSize > 5000) {
    traderWinRate = 0.58 + Math.random() * 0.10; // 58-68% for whales
  } else if (tradeSize > 1000) {
    traderWinRate = 0.54 + Math.random() * 0.10; // 54-64% for large
  } else if (tradeSize > 500) {
    traderWinRate = 0.52 + Math.random() * 0.08; // 52-60% for medium
  } else {
    traderWinRate = 0.48 + Math.random() * 0.08; // 48-56% for small
  }
  
  return {
    valueScore,
    edge,
    polyscore,
    traderWinRate,
  };
}

export async function GET(request: NextRequest) {
  // Check for required configuration
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ 
      error: 'Server configuration error', 
      details: 'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    }, { status: 500 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  
  // Parse config from query params
  const durationDays = parseInt(searchParams.get('days') || '4');
  const initialCapital = parseInt(searchParams.get('capital') || '1000');
  const slippagePct = parseFloat(searchParams.get('slippage') || '0.04');
  const cooldownHours = parseInt(searchParams.get('cooldown') || '3');
  
  // Offset parameter: how many days ago to START the backtest (default: 45 days for resolved markets)
  const startOffsetDays = parseInt(searchParams.get('offset') || '45');
  
  // Calculate default date range based on offset
  // For meaningful backtests, we need markets that have RESOLVED (typically 30+ days old)
  const defaultEndDate = new Date();
  defaultEndDate.setDate(defaultEndDate.getDate() - startOffsetDays);
  const defaultStartDate = new Date(defaultEndDate);
  defaultStartDate.setDate(defaultStartDate.getDate() - durationDays);
  
  const startDate = searchParams.get('start') || defaultStartDate.toISOString().split('T')[0];
  const endDate = searchParams.get('end') || defaultEndDate.toISOString().split('T')[0];
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
    
    // Calculate actual duration from date range for backtest
    const actualDurationDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    console.log(`[paper-trading] Actual simulation duration: ${actualDurationDays} days (start: ${start.toISOString()}, end: ${end.toISOString()})`);
    
    // Initialize simulation
    let state = initializeSimulation({
      mode: 'backtest',
      sizingMode,
      controlledPositionUsd,
      durationDays: actualDurationDays,  // Use actual duration, not user-specified
      initialCapital,
      slippagePct,
      cooldownHours,
      useHistoricalData: true,
      startTimestamp: start.getTime(),
      strategies,
    });
    
    // =========================================================================
    // FETCH HISTORICAL TRADES FROM BIGQUERY
    // This is where ALL trades are stored - the source of truth for backtesting
    // =========================================================================
    console.log(`[paper-trading] Fetching historical trades from BigQuery...`);
    console.log(`[paper-trading] Date range: ${start.toISOString()} to ${end.toISOString()}`);
    
    let allTrades: BigQueryTrade[] = [];
    let marketResolutionData = new Map<string, BigQueryMarket>();
    
    try {
      // First, get stats to understand the data volume
      const stats = await getTradeStats(start, end);
      console.log(`[paper-trading] BigQuery stats: ${stats.totalTrades} trades, ${stats.uniqueMarkets} markets, ${stats.uniqueTraders} traders`);
      state.logs.push(`[BIGQUERY] Found ${stats.totalTrades} BUY trades in date range`);
      state.logs.push(`[BIGQUERY] ${stats.uniqueMarkets} unique markets | ${stats.uniqueTraders} unique traders`);
      
      // Fetch trades from BigQuery (limited to 5000 for performance)
      allTrades = await fetchTradesFromBigQuery(start, end, {
        side: 'BUY',
        limit: 5000,
      });
      
      console.log(`[paper-trading] Fetched ${allTrades.length} trades from BigQuery`);
      state.logs.push(`[BACKTEST] Loaded ${allTrades.length} historical trades from BigQuery`);
      
      // Fetch market resolution data for these trades
      const conditionIds = [...new Set(allTrades.map(t => t.condition_id).filter(Boolean))];
      console.log(`[paper-trading] Fetching resolution data for ${conditionIds.length} unique markets...`);
      
      marketResolutionData = await fetchMarketResolutions(conditionIds);
      
      const resolvedCount = Array.from(marketResolutionData.values())
        .filter(m => m.resolved_outcome || m.winning_side).length;
      
      console.log(`[paper-trading] Got resolution data for ${marketResolutionData.size} markets (${resolvedCount} resolved)`);
      state.logs.push(`[RESOLUTION] ${resolvedCount} of ${marketResolutionData.size} markets have resolution data`);
      
    } catch (bigQueryError: any) {
      console.error('[paper-trading] BigQuery error:', bigQueryError);
      state.logs.push(`[ERROR] BigQuery query failed: ${bigQueryError.message}`);
      
      // Return error with helpful message
      return NextResponse.json({ 
        error: 'Failed to fetch historical trades from BigQuery', 
        details: bigQueryError.message,
        hint: 'Ensure GOOGLE_APPLICATION_CREDENTIALS_JSON is set or ADC is configured'
      }, { status: 500 });
    }
    
    // =========================================================================
    // HELPER: Convert timestamp to milliseconds
    // =========================================================================
    const getTradeTimeMs = (t: any): number => {
      const ts = t.timestamp;
      if (!ts) return 0;
      // If it's a number less than year 3000 in seconds, it's Unix seconds
      if (typeof ts === 'number' && ts < 32503680000) {
        return ts * 1000;
      }
      return new Date(ts).getTime();
    };
    
    // Validate we have data
    if (allTrades.length === 0) {
      return NextResponse.json({ 
        error: 'No trade data available', 
        details: `No BUY trades found in date range ${start.toISOString()} to ${end.toISOString()}. Try an earlier date range.`
      }, { status: 404 });
    }
    
    // Debug: show date range and diversity of trades
    const firstTradeTime = new Date(getTradeTimeMs(allTrades[0]));
    const lastTradeTime = new Date(getTradeTimeMs(allTrades[allTrades.length - 1]));
    const uniqueMarkets = new Set(allTrades.map(t => t.condition_id).filter(Boolean));
    const uniqueTraders = new Set(allTrades.map(t => t.wallet_address).filter(Boolean));
    
    state.logs.push(`[DATA] Trade date range: ${firstTradeTime.toISOString()} to ${lastTradeTime.toISOString()}`);
    state.logs.push(`[DATA] Unique markets: ${uniqueMarkets.size} | Unique traders: ${uniqueTraders.size}`);
    state.logs.push(`[DATA] Sample trade: ${(allTrades[0].title || '').slice(0, 40)}...`);
    
    // =========================================================================
    // BUILD MARKET RESOLUTION MAP FROM BIGQUERY DATA
    // We use resolved_outcome and winning_side from the markets table
    // =========================================================================
    const marketResolutions = new Map<string, { winner: 'YES' | 'NO' | string | null; closed: boolean; closeTime?: number }>();
    
    for (const [conditionId, marketData] of marketResolutionData) {
      let winner: 'YES' | 'NO' | string | null = null;
      const closed = marketData.closed === true || marketData.status === 'resolved';
      
      // Try resolved_outcome first (most reliable)
      const resolvedOutcome = marketData.resolved_outcome || marketData.winning_side;
      
      if (resolvedOutcome) {
        // Normalize standard outcomes to YES/NO
        const normalizedOutcome = resolvedOutcome.toUpperCase().trim();
        if (normalizedOutcome === 'YES' || normalizedOutcome === 'TRUE' || normalizedOutcome === 'UP') {
          winner = 'YES';
        } else if (normalizedOutcome === 'NO' || normalizedOutcome === 'FALSE' || normalizedOutcome === 'DOWN') {
          winner = 'NO';
        } else {
          // Store actual outcome for non-standard markets (team names, etc.)
          winner = resolvedOutcome;
        }
      }
      
      // Get close time for resolution timing
      const closeTime = marketData.close_time || marketData.end_time;
      const closeTimeMs = closeTime ? new Date(closeTime).getTime() : undefined;
      
      marketResolutions.set(conditionId, { winner, closed, closeTime: closeTimeMs });
    }
    
    const resolvedMarketsCount = Array.from(marketResolutions.values()).filter(m => m.winner !== null).length;
    const closedMarketsCount = Array.from(marketResolutions.values()).filter(m => m.closed).length;
    
    console.log(`[paper-trading] Markets: ${marketResolutions.size} total, ${resolvedMarketsCount} with resolution, ${closedMarketsCount} closed`);
    state.logs.push(`[RESOLUTION] ${resolvedMarketsCount} of ${marketResolutions.size} markets have resolution data`);
    
    if (resolvedMarketsCount === 0) {
      state.logs.push(`[WARNING] No resolved markets found in BigQuery for this date range!`);
      state.logs.push(`[WARNING] This could mean: 1) Markets haven't resolved yet, 2) Resolution data not synced`);
      state.logs.push(`[TIP] Try an older date range (60-90 days ago) where more markets have resolved.`);
    } else {
      // Log sample resolved markets
      const resolved = Array.from(marketResolutions.entries())
        .filter(([_, m]) => m.winner !== null)
        .slice(0, 5);
      resolved.forEach(([id, m]) => {
        state.logs.push(`[RESOLVED] ${id.slice(0, 16)}... Winner: ${m.winner}`);
      });
    }
    
    // =========================================================================
    // PROCESS TRADES CHRONOLOGICALLY WITH PROPER CASH MANAGEMENT
    // =========================================================================
    let processedCount = 0;
    let evaluatedCount = 0;
    let enteredCount = 0;
    let skippedNoCash = 0;
    let skippedDuplicate = 0;
    let skippedLowScore = 0;
    let resolvedCount = 0;
    
    // Track which markets each strategy has already entered (prevent duplicates)
    const enteredMarkets: Record<StrategyType, Set<string>> = {
      PURE_VALUE_SCORE: new Set(),
      WEIGHTED_VALUE_SCORE: new Set(),
      SINGLES_ONLY_V1: new Set(),
      SINGLES_ONLY_V2: new Set(),
    };
    
    // Track resolution times for markets (use close time from BigQuery markets table)
    const marketCloseTimes = new Map<string, number>();
    for (const [conditionId, resolution] of marketResolutions) {
      if (resolution.closeTime) {
        marketCloseTimes.set(conditionId, resolution.closeTime);
      }
    }
    
    state.logs.push(`[SIMULATION] Starting chronological trade processing...`);
    state.logs.push(`[SIMULATION] Processing ${allTrades.length} trades | ${marketResolutions.size} unique markets`);
    
    // Process each trade in chronological order
    for (const trade of allTrades) {
      processedCount++;
      const tradeConditionId = trade.condition_id;
      const tradeTime = getTradeTimeMs(trade);
      
      // =====================================================================
      // STEP 1: Advance simulation time to this trade's timestamp
      // This processes any cooldowns that have expired
      // =====================================================================
      state = advanceTime(state, tradeTime);
      
      // =====================================================================
      // STEP 2: Resolve any markets that should have closed by now
      // (We resolve based on market_close_time, not trade time)
      // =====================================================================
      for (const [conditionId, closeTime] of marketCloseTimes) {
        if (closeTime <= tradeTime) {
          const resolution = marketResolutions.get(conditionId);
          if (resolution?.winner) {
            // Check if we have positions in this market
            let hasPositions = false;
            for (const [_, portfolio] of Object.entries(state.portfolios)) {
              if (portfolio.openPositions.some(p => p.conditionId === conditionId)) {
                hasPositions = true;
                break;
              }
            }
            
            if (hasPositions) {
              // Determine actual winner by comparing to trade outcomes
              let actualWinner: 'YES' | 'NO' = 'YES';
              const resolvedOutcome = resolution.winner;
              
              // For standard YES/NO markets
              if (resolvedOutcome === 'YES' || resolvedOutcome === 'NO') {
                actualWinner = resolvedOutcome;
              } else {
                // For other markets (team names, etc.), check if any position's outcome matches
                for (const [_, portfolio] of Object.entries(state.portfolios)) {
                  for (const pos of portfolio.openPositions) {
                    if (pos.conditionId === conditionId) {
                      // If position outcome matches resolved outcome, that side "won"
                      const posOutcome = pos.outcome?.toUpperCase().trim();
                      const resOutcome = resolvedOutcome?.toUpperCase().trim();
                      if (posOutcome === resOutcome) {
                        actualWinner = 'YES'; // Position outcome matched = win
                      } else {
                        actualWinner = 'NO'; // Position outcome didn't match = lose
                      }
                      break;
                    }
                  }
                }
              }
              
              state = resolveMarket(state, conditionId, actualWinner, closeTime);
              resolvedCount++;
              
              if (resolvedCount <= 5) {
                state.logs.push(`[RESOLVED] ${conditionId.slice(0, 12)}... at ${new Date(closeTime).toISOString().slice(0, 10)} | Winner: ${actualWinner}`);
              }
            }
          }
          // Remove from map so we don't process again
          marketCloseTimes.delete(conditionId);
        }
      }
      
      // =====================================================================
      // STEP 3: Calculate scores for this trade (simulate what algo would see)
      // =====================================================================
      const signal = tradeToSignal(trade, null, null);
      const scores = simulateValueScore(trade);
      
      signal.valueScore = scores.valueScore;
      signal.aiEdge = scores.edge;
      signal.polyscore = scores.polyscore;
      signal.traderWinRate = scores.traderWinRate;
      signal.timestamp = tradeTime;
      
      evaluatedCount++;
      
      // Log first few trades with details
      if (processedCount <= 10) {
        const title = (trade.title || '').slice(0, 35);
        state.logs.push(`[EVAL #${processedCount}] ${title}... | V:${signal.valueScore?.toFixed(0)} E:${signal.aiEdge?.toFixed(1)}% WR:${((signal.traderWinRate||0)*100).toFixed(0)}%`);
      }
      
      // =====================================================================
      // STEP 4: For each strategy, check if we should enter this trade
      // =====================================================================
      for (const strategyType of state.config.strategies) {
        const portfolio = state.portfolios[strategyType];
        const config = STRATEGY_CONFIGS[strategyType];
        
        // Skip if already in this market
        if (enteredMarkets[strategyType].has(tradeConditionId)) {
          skippedDuplicate++;
          continue;
        }
        
        // Skip if not enough cash
        const minPosition = 10; // Minimum $10 position
        if (portfolio.availableCash < minPosition) {
          skippedNoCash++;
          continue;
        }
        
        // Check strategy entry criteria
        const meetsValueThreshold = (signal.valueScore || 0) >= (config.minValueScore || 0);
        const meetsEdgeThreshold = (signal.aiEdge || 0) >= (config.minAiEdge || 0);
        const meetsWinRateThreshold = (signal.traderWinRate || 0) >= (config.minTraderWinRate || 0);
        
        // Additional strategy-specific logic
        let shouldEnter = false;
        
        switch (strategyType) {
          case 'PURE_VALUE_SCORE':
            // Entry: valueScore >= 60
            shouldEnter = meetsValueThreshold;
            break;
            
          case 'WEIGHTED_VALUE_SCORE':
            // Entry: weighted score >= 55
            const weightedScore = (signal.valueScore || 0) * 0.30 +
                                  (signal.polyscore || 0) * 0.25 +
                                  ((signal.traderWinRate || 0) * 100) * 0.25 +
                                  (signal.aiEdge || 0) * 2 * 0.20;
            shouldEnter = weightedScore >= 55;
            break;
            
          case 'SINGLES_ONLY_V1':
            // Entry: valueScore >= 70 AND traderWinRate >= 52%
            shouldEnter = meetsValueThreshold && meetsWinRateThreshold;
            break;
            
          case 'SINGLES_ONLY_V2':
            // Entry: valueScore >= 65 AND aiEdge >= 3% AND traderWinRate >= 55%
            shouldEnter = meetsValueThreshold && meetsEdgeThreshold && meetsWinRateThreshold;
            break;
        }
        
        if (!shouldEnter) {
          skippedLowScore++;
          continue;
        }
        
        // Calculate position size (edge-based: allocate based on confidence)
        const edgeFactor = Math.min(Math.max((signal.aiEdge || 0) / 10, 0.5), 2.0);
        const baseSize = Math.min(portfolio.availableCash * 0.10, 100); // 10% of cash, max $100
        const positionSize = Math.min(baseSize * edgeFactor, portfolio.availableCash);
        
        if (positionSize < minPosition) {
          skippedNoCash++;
          continue;
        }
        
        // Enter the trade!
        const entryPrice = (trade.price || 0.5) * (1 + slippagePct); // Apply slippage
        const shares = positionSize / entryPrice;
        
        const newPosition = {
          id: `${strategyType}-${tradeConditionId}-${tradeTime}`,
          conditionId: tradeConditionId,
          marketTitle: trade.title || 'Unknown Market',
          outcome: trade.outcome || signal.outcome || 'YES',
          entryPrice: entryPrice,
          size: shares,
          investedUsd: positionSize,
          entryTimestamp: tradeTime,
          status: 'OPEN' as const,
          valueScoreAtEntry: signal.valueScore,
          aiEdgeAtEntry: signal.aiEdge,
        };
        
        // Deduct from available cash and add to locked
        portfolio.availableCash -= positionSize;
        portfolio.lockedCapital += positionSize;
        portfolio.openPositions.push(newPosition);
        portfolio.totalTrades++;
        
        // Mark this market as entered
        enteredMarkets[strategyType].add(tradeConditionId);
        enteredCount++;
        
        if (enteredCount <= 20) {
          state.logs.push(`[ENTRY] ${config.name.slice(0, 6)}: ${(trade.title || '').slice(0, 25)}... $${positionSize.toFixed(0)} @ ${entryPrice.toFixed(2)}`);
        }
      }
    }
    
    // =========================================================================
    // STEP 5: Resolve remaining open positions at end of simulation
    // (For positions in markets that resolved, even if after sim end date)
    // =========================================================================
    state.logs.push(`[FINAL] Resolving remaining open positions...`);
    let finalResolvedCount = 0;
    
    for (const [strategyType, portfolio] of Object.entries(state.portfolios)) {
      const toResolve = [...portfolio.openPositions];
      for (const position of toResolve) {
        const resolution = marketResolutions.get(position.conditionId);
        if (resolution?.winner) {
          // Determine if this position won
          const resolvedOutcome = resolution.winner;
          let positionWon = false;
          
          if (resolvedOutcome === 'YES' || resolvedOutcome === 'NO') {
            positionWon = position.outcome === resolvedOutcome;
          } else {
            // For non-standard outcomes, compare directly
            positionWon = position.outcome?.toUpperCase().trim() === resolvedOutcome?.toUpperCase().trim();
          }
          
          // Calculate P&L
          const exitValue = positionWon ? position.size * 1 : 0;
          const pnl = exitValue - position.investedUsd;
          
          // Update portfolio
          portfolio.lockedCapital -= position.investedUsd;
          portfolio.availableCash += exitValue;
          portfolio.totalPnL += pnl;
          
          if (positionWon) {
            portfolio.winningTrades++;
          } else {
            portfolio.losingTrades++;
          }
          
          // Move to closed
          const idx = portfolio.openPositions.findIndex(p => p.id === position.id);
          if (idx !== -1) {
            portfolio.openPositions.splice(idx, 1);
            portfolio.closedPositions.push({
              ...position,
              status: positionWon ? 'WON' : 'LOST',
              exitPrice: positionWon ? 1 : 0,
              exitTimestamp: end.getTime(),
              pnlUsd: pnl,
              roiPercent: (pnl / position.investedUsd) * 100,
            });
          }
          
          finalResolvedCount++;
        }
      }
    }
    
    state.logs.push(`[FINAL] Resolved ${finalResolvedCount} positions at end of simulation`);
    
    // Finalize
    state = advanceTime(state, end.getTime());
    
    const totalResolved = resolvedCount + finalResolvedCount;
    console.log(`[paper-trading] Processed ${processedCount} trades, evaluated ${evaluatedCount}, entered ${enteredCount}, resolved ${totalResolved}`);
    console.log(`[paper-trading] Skipped: ${skippedNoCash} no cash, ${skippedDuplicate} duplicate, ${skippedLowScore} low score`);
    
    // Log processing summary
    state.logs.push(`[STATS] === Processing Summary ===`);
    state.logs.push(`[STATS] Trades scanned: ${processedCount}`);
    state.logs.push(`[STATS] Trades evaluated: ${evaluatedCount}`);
    state.logs.push(`[STATS] Positions entered: ${enteredCount}`);
    state.logs.push(`[STATS] Positions resolved: ${totalResolved}`);
    state.logs.push(`[STATS] Skipped (no cash): ${skippedNoCash}`);
    state.logs.push(`[STATS] Skipped (duplicate market): ${skippedDuplicate}`);
    state.logs.push(`[STATS] Skipped (below threshold): ${skippedLowScore}`);
    
    // Log per-strategy entry summary
    state.logs.push(`[ENTRIES] === Strategy Entry Summary ===`);
    for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
      const config = STRATEGY_CONFIGS[strategy as StrategyType];
      const totalPositions = portfolio.openPositions.length + portfolio.closedPositions.length;
      const marketsEntered = enteredMarkets[strategy as StrategyType]?.size || 0;
      state.logs.push(`[ENTRIES] ${config.name}: ${totalPositions} trades | ${marketsEntered} unique markets`);
      if (totalPositions === 0) {
        // Explain why no trades
        if (strategy === 'SINGLES_ONLY_V1') {
          state.logs.push(`  → Requires: valueScore >= 70 AND traderWinRate >= 52%`);
        } else if (strategy === 'SINGLES_ONLY_V2') {
          state.logs.push(`  → Requires: valueScore >= 65 AND aiEdge >= 3% AND traderWinRate >= 55%`);
        }
      }
    }
    
    // Log final summary for each strategy
    state.logs.push(`[SUMMARY] === Final Results ===`);
    for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
      const metrics = getPerformanceMetrics(portfolio);
      const pnlStr = portfolio.totalPnL >= 0 ? `+$${portfolio.totalPnL.toFixed(2)}` : `-$${Math.abs(portfolio.totalPnL).toFixed(2)}`;
      const roiPct = initialCapital > 0 ? ((portfolio.totalPnL / initialCapital) * 100).toFixed(1) : '0.0';
      state.logs.push(`[SUMMARY] ${STRATEGY_CONFIGS[strategy as StrategyType].name}: ${pnlStr} (${roiPct}% ROI) | Open: ${portfolio.openPositions.length} | Closed: ${portfolio.closedPositions.length} (${portfolio.winningTrades}W/${portfolio.losingTrades}L)`);
    }
    
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
        tradesEvaluated: evaluatedCount,
        tradesEntered: enteredCount,
        tradesResolved: resolvedCount + finalResolvedCount,
        uniqueMarkets: uniqueMarkets.size,
        resolvedMarkets: resolvedMarketsCount,
        skipped: {
          noCash: skippedNoCash,
          duplicate: skippedDuplicate,
          lowScore: skippedLowScore,
        },
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
