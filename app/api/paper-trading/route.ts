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
  // Default to 45 days ago for backtesting (markets should be resolved)
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 45);
  const startDate = searchParams.get('start') || defaultStartDate.toISOString().split('T')[0];
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
    
    // Fetch top traders from leaderboard stats
    console.log(`[paper-trading] Fetching top traders for backtesting...`);
    
    // First try with filters, fallback to just getting any traders
    let topTraders: { wallet_address: string }[] = [];
    
    const { data: filteredTraders, error: filteredError } = await supabase
      .from('trader_global_stats')
      .select('wallet_address')
      .gte('l_total_roi_pct', 5)   // At least 5% ROI (relaxed)
      .order('l_total_roi_pct', { ascending: false })
      .limit(30);
    
    if (filteredError) {
      console.error('[paper-trading] Error fetching filtered traders:', filteredError);
    }
    
    if (filteredTraders && filteredTraders.length > 0) {
      topTraders = filteredTraders;
    } else {
      // Fallback: get any traders from the stats table
      console.log('[paper-trading] No filtered traders, fetching any available...');
      const { data: anyTraders, error: anyError } = await supabase
        .from('trader_global_stats')
        .select('wallet_address')
        .limit(30);
      
      if (anyError) {
        console.error('[paper-trading] Error fetching any traders:', anyError);
        return NextResponse.json({ 
          error: 'Failed to fetch traders', 
          details: anyError.message 
        }, { status: 500 });
      }
      
      topTraders = anyTraders || [];
    }
    
    // If still no traders, use hardcoded list of known active traders
    if (topTraders.length === 0) {
      console.log('[paper-trading] No traders in stats table, using known wallets...');
      topTraders = [
        { wallet_address: '0xea8f98624311923b566af3a11b85b53b2be862a9' },
        { wallet_address: '0xf247584e41117bbbe4cc06e4d2c95741792a5216' },
        { wallet_address: '0x38b408789fdb584782a5d521e794c69b150527e4' },
        { wallet_address: '0x7e279561b5766f199a34f596da04d9c3783e178d' },
      ];
    }
    
    console.log(`[paper-trading] Using ${topTraders.length} traders for backtesting`);
    
    // Fetch recent trades from Polymarket API for each trader
    const allTrades: any[] = [];
    const fetchPromises = topTraders.map(async (trader) => {
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?limit=50&user=${trader.wallet_address}`,
          { 
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
          }
        );
        
        if (!response.ok) return [];
        
        const walletTrades = await response.json();
        return walletTrades.map((trade: any) => ({
          ...trade,
          wallet_address: trader.wallet_address,
          // Normalize timestamp
          timestamp: trade.timestamp || trade.matchTime || trade.created_at,
        }));
      } catch (error) {
        console.warn(`[paper-trading] Error fetching trades for ${trader.wallet_address}:`, error);
        return [];
      }
    });
    
    const tradeResults = await Promise.all(fetchPromises);
    tradeResults.forEach(trades => allTrades.push(...trades));
    
    // Helper to convert timestamp (could be Unix seconds or ISO string)
    const getTradeTimeMs = (t: any): number => {
      const ts = t.timestamp;
      // If it's a number less than year 3000 in seconds, it's Unix seconds
      if (typeof ts === 'number' && ts < 32503680000) {
        return ts * 1000; // Convert seconds to milliseconds
      }
      // Otherwise try to parse as date string or milliseconds
      return new Date(ts).getTime();
    };
    
    // Filter to BUY trades within the date range and sort by timestamp
    const trades = allTrades
      .filter(t => {
        const tradeTime = getTradeTimeMs(t);
        return t.side === 'BUY' && tradeTime >= start.getTime() && tradeTime <= end.getTime();
      })
      .sort((a, b) => getTradeTimeMs(a) - getTradeTimeMs(b));
    
    console.log(`[paper-trading] Found ${trades.length} BUY trades in date range (${allTrades.length} total fetched)`);
    
    if (trades.length === 0) {
      // If no trades in date range, use all recent BUY trades
      console.log('[paper-trading] No trades in date range, using all BUY trades...');
      
      const recentTrades = allTrades
        .filter(t => t.side === 'BUY')
        .sort((a, b) => getTradeTimeMs(a) - getTradeTimeMs(b));
      
      if (recentTrades.length === 0) {
        return NextResponse.json({ 
          error: 'No trade data available', 
          details: `Fetched ${allTrades.length} total trades but none were BUY trades in the date range. Try again later.`
        }, { status: 404 });
      }
      
      trades.push(...recentTrades);
      console.log(`[paper-trading] Using ${recentTrades.length} recent BUY trades instead`);
    }
    
    console.log(`[paper-trading] Loaded ${trades.length} trades for backtesting`);
    state.logs.push(`[BACKTEST] Loaded ${trades?.length || 0} historical trades`);
    
    // Debug: show date range of trades
    if (trades.length > 0) {
      const firstTradeTime = new Date(getTradeTimeMs(trades[0]));
      const lastTradeTime = new Date(getTradeTimeMs(trades[trades.length - 1]));
      state.logs.push(`[DEBUG] Trade date range: ${firstTradeTime.toISOString()} to ${lastTradeTime.toISOString()}`);
      state.logs.push(`[DEBUG] Sim date range: ${start.toISOString()} to ${end.toISOString()}`);
      state.logs.push(`[DEBUG] First trade: ${(trades[0].title || '').slice(0, 50)}`);
    }
    
    // Get market resolutions from Polymarket API
    const conditionIds = [...new Set((trades || []).map(t => t.conditionId || t.condition_id).filter(Boolean))];
    
    let marketResolutions = new Map<string, { winner: 'YES' | 'NO' | null; closed: boolean }>();
    
    console.log(`[paper-trading] Fetching resolution data for ${conditionIds.length} markets...`);
    
    // Fetch market data from Polymarket API in batches
    const batchSize = 20;
    for (let i = 0; i < Math.min(conditionIds.length, 100); i += batchSize) {
      const batchIds = conditionIds.slice(i, i + batchSize);
      
      const marketPromises = batchIds.map(async (conditionId) => {
        try {
          const response = await fetch(
            `https://clob.polymarket.com/markets/${conditionId}`,
            { 
              cache: 'no-store',
              headers: { 'Accept': 'application/json' }
            }
          );
          
          if (!response.ok) return null;
          
          const market = await response.json();
          
          // Determine winner from market data - STRICT OFFICIAL RESOLUTION ONLY
          let winner: 'YES' | 'NO' | null = null;
          let resolutionMethod: string | null = null;
          const closed = market.closed === true || market.active === false;
          
          // Method 1: Check if market has explicit winner field
          // Only trust if market.resolved is also true
          if (market.winner && market.resolved === true) {
            winner = market.winner.toUpperCase() as 'YES' | 'NO';
            resolutionMethod = 'explicit_winner';
          }
          
          // DISABLED Method 2: outcome_prices check
          // This was causing HINDSIGHT BIAS - outcome_prices reflects CURRENT prices,
          // not official resolution. A market trading at 99¢ is NOT the same as resolved.
          
          // Method 3: Check tokens array for winner field
          // Only trust if the market is officially resolved
          if (!winner && market.resolved === true && market.tokens && Array.isArray(market.tokens)) {
            const yesToken = market.tokens.find((t: any) => 
              t.outcome === 'Yes' || t.outcome === 'YES' || t.outcome?.toLowerCase() === 'yes'
            );
            const noToken = market.tokens.find((t: any) => 
              t.outcome === 'No' || t.outcome === 'NO' || t.outcome?.toLowerCase() === 'no'
            );
            
            if (yesToken?.winner === true) {
              winner = 'YES';
              resolutionMethod = 'token_winner';
            } else if (noToken?.winner === true) {
              winner = 'NO';
              resolutionMethod = 'token_winner';
            }
          }
          
          // Method 4: Check resolved_price (1.0 = YES won, 0.0 = NO won) 
          if (!winner && market.resolved === true) {
            if (market.resolved_price === 1 || market.resolved_price === '1') {
              winner = 'YES';
              resolutionMethod = 'resolved_price';
            } else if (market.resolved_price === 0 || market.resolved_price === '0') {
              winner = 'NO';
              resolutionMethod = 'resolved_price';
            }
          }
          
          // DISABLED: Simulated resolution based on current prices
          // This created hindsight bias - we were using CURRENT prices to determine 
          // winners for trades made at PAST prices, creating impossibly good results.
          // 
          // For accurate backtesting, we should only resolve markets that are:
          // 1. Officially closed (market.closed === true)
          // 2. Have explicit winner data (market.winner or token.winner)
          //
          // Without historical resolution data, backtest P&L will only reflect
          // trades in markets that have actually resolved.
          
          return { conditionId, winner, closed, rawData: market, resolutionMethod };
        } catch (error) {
          return null;
        }
      });
      
      const results = await Promise.all(marketPromises);
      let batchIdx = 0;
      results.filter(Boolean).forEach(r => {
        if (r) {
          marketResolutions.set(r.conditionId, { winner: r.winner, closed: r.closed });
          // Log markets that have resolution for debugging
          if (r.winner && batchIdx < 5) {
            const rawInfo = r.rawData ? {
              resolved: r.rawData.resolved,
              closed: r.rawData.closed,
              active: r.rawData.active,
              winner: r.rawData.winner,
              resolved_price: r.rawData.resolved_price,
            } : 'N/A';
            console.log(`[paper-trading] RESOLVED Market ${r.conditionId.slice(0,12)}...: winner=${r.winner}, method=${r.resolutionMethod}, raw=`, rawInfo);
          }
          batchIdx++;
        }
      });
    }
    
    const resolvedMarketsCount = Array.from(marketResolutions.values()).filter(m => m.winner !== null).length;
    const closedMarketsCount = Array.from(marketResolutions.values()).filter(m => m.closed).length;
    console.log(`[paper-trading] Loaded ${marketResolutions.size} markets, ${resolvedMarketsCount} with resolution, ${closedMarketsCount} closed`);
    state.logs.push(`[BACKTEST] Found ${resolvedMarketsCount} resolved markets out of ${marketResolutions.size} (${closedMarketsCount} officially closed)`);
    if (resolvedMarketsCount === 0) {
      state.logs.push(`[INFO] No officially resolved markets found. P&L will be $0 for open positions.`);
      state.logs.push(`[INFO] For meaningful backtests, use historical data with resolved markets or wait for current markets to close.`);
    }
    
    // Log resolved markets for debugging
    if (resolvedMarketsCount > 0) {
      const resolved = Array.from(marketResolutions.entries())
        .filter(([_, m]) => m.winner !== null)
        .slice(0, 5);
      resolved.forEach(([id, m]) => {
        state.logs.push(`[DEBUG] Resolved: ${id.slice(0, 20)}... Winner: ${m.winner} (closed=${m.closed})`);
      });
    } else {
      state.logs.push(`[WARNING] No resolved markets found - all trades are for markets still open.`);
      state.logs.push(`[WARNING] P&L will be $0 until markets officially resolve.`);
      // Log sample of market status
      const sample = Array.from(marketResolutions.entries()).slice(0, 3);
      sample.forEach(([id, m]) => {
        state.logs.push(`[DEBUG] Market: ${id.slice(0,12)}... closed=${m.closed} winner=${m.winner || 'pending'}`);
      });
    }
    
    // Process trades
    let processedCount = 0;
    let enteredCount = 0;
    let resolvedCount = 0;
    let polyScoreSuccessCount = 0;
    let polyScoreFallbackCount = 0;
    
    // Rate limit PolyScore API calls (max 10 per backtest to avoid overload)
    const MAX_POLYSCORE_CALLS = 10;
    
    for (const trade of (trades || [])) {
      processedCount++;
      
      // Convert to signal
      const signal = tradeToSignal(trade, null, null);
      
      // Try to get real PolyScore (with rate limiting)
      let scores: { valueScore: number; edge: number; polyscore: number; traderWinRate: number } | null = null;
      
      if (polyScoreSuccessCount < MAX_POLYSCORE_CALLS) {
        const realScores = await getRealPolyScore(trade, state.logs);
        if (realScores) {
          scores = realScores;
          polyScoreSuccessCount++;
        }
      }
      
      // Fallback to simulated scores if PolyScore unavailable
      if (!scores) {
        scores = simulateValueScore(trade);
        polyScoreFallbackCount++;
      }
      
      signal.valueScore = scores.valueScore;
      signal.aiEdge = scores.edge;
      signal.polyscore = scores.polyscore;
      signal.traderWinRate = scores.traderWinRate;
      
      // Log first 5 trades with full scoring details
      if (processedCount <= 5) {
        const scoreSource = polyScoreSuccessCount > polyScoreFallbackCount ? 'API' : 'SIM';
        state.logs.push(`[TRADE ${processedCount}] ${(trade.title || '').slice(0, 35)}...`);
        state.logs.push(`  Scores (${scoreSource}): Value=${signal.valueScore?.toFixed(1)} | Edge=${signal.aiEdge?.toFixed(1)}% | WinRate=${((signal.traderWinRate || 0) * 100).toFixed(0)}% | PolyScore=${signal.polyscore?.toFixed(1)}`);
        
        // Show which strategies would accept this trade
        const strategyChecks: string[] = [];
        
        // Strategy 1: Pure Value Score (>= 60)
        const s1Pass = (signal.valueScore || 0) >= 60;
        strategyChecks.push(`S1:${s1Pass ? '✓' : '✗'}(v>60)`);
        
        // Strategy 2: Weighted (>= 55) - simplified check
        const s2Pass = (signal.valueScore || 0) >= 55 && (signal.aiEdge || 0) >= 0;
        strategyChecks.push(`S2:${s2Pass ? '✓' : '✗'}(weighted)`);
        
        // Strategy 3: Value >= 70 AND WinRate >= 52%
        const s3ValueOk = (signal.valueScore || 0) >= 70;
        const s3WinRateOk = (signal.traderWinRate || 0) >= 0.52;
        const s3Pass = s3ValueOk && s3WinRateOk;
        strategyChecks.push(`S3:${s3Pass ? '✓' : '✗'}(v${s3ValueOk ? '✓' : '✗'},wr${s3WinRateOk ? '✓' : '✗'})`);
        
        // Strategy 4: Value >= 65 AND Edge >= 3% AND WinRate >= 55%
        const s4ValueOk = (signal.valueScore || 0) >= 65;
        const s4EdgeOk = (signal.aiEdge || 0) >= 3;
        const s4WinRateOk = (signal.traderWinRate || 0) >= 0.55;
        const s4Pass = s4ValueOk && s4EdgeOk && s4WinRateOk;
        strategyChecks.push(`S4:${s4Pass ? '✓' : '✗'}(v${s4ValueOk ? '✓' : '✗'},e${s4EdgeOk ? '✓' : '✗'},wr${s4WinRateOk ? '✓' : '✗'})`);
        
        state.logs.push(`  Strategy checks: ${strategyChecks.join(' | ')}`);
      }
      
      // Count open positions before (per strategy)
      const openBefore: Record<string, number> = {};
      for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
        openBefore[strategy] = portfolio.openPositions.length;
      }
      
      // Process signal
      state = processSignal(state, signal);
      
      // Count open positions after and track per-strategy entries
      let totalNewEntries = 0;
      for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
        const newEntries = portfolio.openPositions.length - (openBefore[strategy] || 0);
        if (newEntries > 0) {
          totalNewEntries += newEntries;
        }
      }
      
      if (totalNewEntries > 0) {
        enteredCount++;
      }
      
      // Check for resolution (handle both conditionId and condition_id field names)
      const tradeConditionId = trade.conditionId || trade.condition_id;
      const resolution = marketResolutions.get(tradeConditionId);
      
      // Log resolution check for first few
      if (processedCount <= 3) {
        state.logs.push(`[DEBUG] Trade ${processedCount}: conditionId=${tradeConditionId?.slice(0,12)}... hasResolution=${!!resolution} winner=${resolution?.winner || 'N/A'}`);
      }
      
      if (resolution?.winner) {
        // Resolve with some time delay
        const resolutionTime = signal.timestamp + (2 * 60 * 60 * 1000);
        
        // Log detailed position info for debugging
        const positionsToResolve: { strategy: string; pos: any }[] = [];
        for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
          const matchingPositions = portfolio.openPositions.filter(pos => pos.conditionId === tradeConditionId);
          matchingPositions.forEach(pos => positionsToResolve.push({ strategy, pos }));
        }
        
        if (positionsToResolve.length > 0 && resolvedCount < 10) {
          state.logs.push(`[RESOLVING] ${positionsToResolve.length} positions for ${tradeConditionId?.slice(0,12)}... Winner: ${resolution.winner}`);
          positionsToResolve.forEach(({ strategy, pos }) => {
            const outcome = pos.outcome;
            const willWin = outcome === resolution.winner;
            const pnlEstimate = willWin ? (pos.size * 1 - pos.investedUsd) : (-pos.investedUsd);
            state.logs.push(`  - ${strategy}: ${outcome} @ ${pos.entryPrice.toFixed(2)} | $${pos.investedUsd.toFixed(0)} | Will ${willWin ? 'WIN' : 'LOSE'} | Est P&L: $${pnlEstimate.toFixed(0)}`);
          });
        }
        
        state = resolveMarket(state, tradeConditionId, resolution.winner, resolutionTime);
        
        if (positionsToResolve.length > 0) {
          resolvedCount += positionsToResolve.length;
        }
      }
    }
    
    // Finalize
    state = advanceTime(state, end.getTime());
    
    console.log(`[paper-trading] Processed ${processedCount} trades, entered ${enteredCount}, resolved ${resolvedCount}`);
    console.log(`[paper-trading] PolyScore: ${polyScoreSuccessCount} real, ${polyScoreFallbackCount} simulated`);
    
    // Log scoring summary
    state.logs.push(`[SCORING] Used ${polyScoreSuccessCount} real PolyScore API calls, ${polyScoreFallbackCount} simulated scores`);
    if (polyScoreSuccessCount === 0) {
      state.logs.push(`[INFO] PolyScore API unavailable - using V10-aligned simulated scores`);
    }
    
    // Log per-strategy entry summary
    state.logs.push(`[ENTRIES] === Strategy Entry Summary ===`);
    for (const [strategy, portfolio] of Object.entries(state.portfolios)) {
      const config = STRATEGY_CONFIGS[strategy as StrategyType];
      const totalPositions = portfolio.openPositions.length + portfolio.closedPositions.length;
      state.logs.push(`[ENTRIES] ${config.name}: ${totalPositions} trades entered`);
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
      state.logs.push(`[SUMMARY] ${STRATEGY_CONFIGS[strategy as StrategyType].name}: ${pnlStr} ROI | Open: ${portfolio.openPositions.length} | Closed: ${portfolio.closedPositions.length} (${portfolio.winningTrades}W/${portfolio.losingTrades}L)`);
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
