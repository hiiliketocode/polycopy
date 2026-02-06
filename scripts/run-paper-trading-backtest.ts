#!/usr/bin/env npx ts-node

/**
 * Paper Trading Backtest Script
 * 
 * Runs a backtest of the 4 trading strategies using historical data.
 * 
 * Usage:
 *   npx ts-node scripts/run-paper-trading-backtest.ts
 *   
 * Or with custom params:
 *   npx ts-node scripts/run-paper-trading-backtest.ts --days=7 --capital=2000
 * 
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

// Import paper trading modules
import {
  SimulationConfig,
  StrategyType,
  initializeSimulation,
  processSignal,
  resolveMarket,
  advanceTime,
  generateResults,
  tradeToSignal,
  formatSimulationResults,
  STRATEGY_CONFIGS,
  getPerformanceMetrics,
  BetStructure,
  TradeSignal,
} from '../lib/paper-trading';

// Parse command line arguments
function parseArgs(): { days: number; capital: number; slippage: number; cooldown: number; verbose: boolean } {
  const args = process.argv.slice(2);
  const config = {
    days: 4,
    capital: 1000,
    slippage: 0.04,
    cooldown: 3,
    verbose: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      config.days = parseInt(arg.split('=')[1]) || 4;
    } else if (arg.startsWith('--capital=')) {
      config.capital = parseInt(arg.split('=')[1]) || 1000;
    } else if (arg.startsWith('--slippage=')) {
      config.slippage = parseFloat(arg.split('=')[1]) || 0.04;
    } else if (arg.startsWith('--cooldown=')) {
      config.cooldown = parseInt(arg.split('=')[1]) || 3;
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    }
  }
  
  return config;
}

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

async function main() {
  const args = parseArgs();
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                      🎲 PAPER TRADING BACKTEST                                ');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Configuration:`);
  console.log(`  • Duration: ${args.days} days`);
  console.log(`  • Initial Capital: $${args.capital} per strategy`);
  console.log(`  • Slippage: ${(args.slippage * 100).toFixed(1)}%`);
  console.log(`  • Cooldown: ${args.cooldown} hours after resolution`);
  console.log('');
  
  // Verify environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('');
    console.error('Make sure these are set in .env.local or .env');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  // Calculate date range
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (args.days * 24 * 60 * 60 * 1000));
  
  console.log(`Date Range: ${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}`);
  console.log('');
  console.log('Loading historical trades...');
  
  // Initialize simulation
  const strategies: StrategyType[] = ['PURE_VALUE_SCORE', 'WEIGHTED_VALUE_SCORE', 'SINGLES_ONLY_V1', 'SINGLES_ONLY_V2'];
  
  let state = initializeSimulation({
    durationDays: args.days,
    initialCapital: args.capital,
    slippagePct: args.slippage,
    cooldownHours: args.cooldown,
    useHistoricalData: true,
    startTimestamp: startDate.getTime(),
    strategies,
  });
  
  // Fetch historical trades
  const { data: trades, error: tradesError } = await supabase
    .from('top5_trades_with_markets')
    .select('*')
    .gte('timestamp', startDate.toISOString())
    .lte('timestamp', endDate.toISOString())
    .eq('side', 'BUY')
    .order('timestamp', { ascending: true })
    .limit(2000);
  
  if (tradesError) {
    console.error('❌ Failed to fetch trades:', tradesError.message);
    process.exit(1);
  }
  
  console.log(`✅ Loaded ${trades?.length || 0} historical trades`);
  
  // Get market resolutions
  const conditionIds = [...new Set((trades || []).map(t => t.condition_id).filter(Boolean))];
  
  console.log(`Loading market resolutions for ${conditionIds.length} markets...`);
  
  let marketResolutions = new Map<string, { winner: 'YES' | 'NO' | null; closed: boolean }>();
  
  if (conditionIds.length > 0) {
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('condition_id, winning_side, resolved_outcome, closed')
      .in('condition_id', conditionIds.slice(0, 500));
    
    if (marketsError) {
      console.warn('⚠️ Warning: Could not fetch market resolutions:', marketsError.message);
    } else {
      (markets || []).forEach(m => {
        let winner: 'YES' | 'NO' | null = null;
        if (m.winning_side === 'Yes' || m.resolved_outcome === 'Yes') winner = 'YES';
        else if (m.winning_side === 'No' || m.resolved_outcome === 'No') winner = 'NO';
        marketResolutions.set(m.condition_id, { winner, closed: m.closed });
      });
      console.log(`✅ Loaded ${marketResolutions.size} market resolutions`);
    }
  }
  
  console.log('');
  console.log('Running simulation...');
  console.log('');
  
  // Process trades
  let processedCount = 0;
  let enteredCount = 0;
  let resolvedCount = 0;
  
  const progressInterval = Math.max(1, Math.floor((trades?.length || 1) / 10));
  
  for (const trade of (trades || [])) {
    processedCount++;
    
    // Progress update
    if (processedCount % progressInterval === 0) {
      const pct = ((processedCount / (trades?.length || 1)) * 100).toFixed(0);
      process.stdout.write(`\r  Processing: ${pct}% (${processedCount}/${trades?.length || 0} trades)`);
    }
    
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
  state = advanceTime(state, endDate.getTime());
  
  console.log('\r  Processing: 100% - Complete!                                  ');
  console.log('');
  console.log(`  Trades processed: ${processedCount}`);
  console.log(`  Positions entered: ${enteredCount}`);
  console.log(`  Positions resolved: ${resolvedCount}`);
  console.log('');
  
  // Generate and display results
  const result = generateResults(state);
  console.log(formatSimulationResults(result));
  
  // Print verbose logs if requested
  if (args.verbose) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('                              DETAILED LOGS                                    ');
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    for (const log of state.logs) {
      console.log(log);
    }
  }
  
  // Summary table
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('                              QUICK SUMMARY                                     ');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Strategy                     │ Final Value │   ROI    │ Win Rate │ Trades');
  console.log('─────────────────────────────┼─────────────┼──────────┼──────────┼────────');
  
  for (const r of result.rankings) {
    const name = STRATEGY_CONFIGS[r.strategy].name.padEnd(27);
    const value = ('$' + r.finalValue.toFixed(2)).padStart(11);
    const roi = ((r.roi >= 0 ? '+' : '') + r.roi.toFixed(1) + '%').padStart(8);
    const winRate = (r.winRate.toFixed(1) + '%').padStart(8);
    const trades = String(r.totalTrades).padStart(6);
    console.log(`${name} │ ${value} │ ${roi} │ ${winRate} │ ${trades}`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('');
  
  // Determine winner
  const winner = result.rankings[0];
  console.log(`🏆 WINNER: ${STRATEGY_CONFIGS[winner.strategy].name}`);
  console.log(`   Final: $${winner.finalValue.toFixed(2)} | ROI: ${winner.roi >= 0 ? '+' : ''}${winner.roi.toFixed(1)}% | Win Rate: ${winner.winRate.toFixed(1)}%`);
  console.log('');
}

main().catch(console.error);
