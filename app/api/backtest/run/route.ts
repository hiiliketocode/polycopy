import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';

const PROJECT_ID = 'gen-lang-client-0299056258';
const DATASET = 'polycopy_v1';

interface BacktestConfig {
  strategy_type: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  slippage_pct: number;
  fill_rate_pct: number; // Percentage of trades that actually execute (0-1)
  min_win_rate: number;
  min_resolved_trades: number;
  min_edge_pct: number;
  max_trades_per_day: number;
  description: string;
  // Trade selection & sizing
  selection_method: 'CHRONOLOGICAL' | 'RANDOM' | 'THRESHOLD';
  sizing_method: 'FIXED' | 'KELLY' | 'PROPORTIONAL' | 'CONVICTION' | 'MODEL';
  daily_budget_pct: number;
  // Trader basket selection
  trader_selection: 'ALL' | 'TOP_BY_WINRATE' | 'TOP_BY_PROFIT' | 'TOP_BY_VOLUME' | 'SPECIFIC_WALLETS';
  trader_count: number;
  trader_min_trades: number;
  specific_wallets: string[];
  // Trade filters
  price_min?: number;
  price_max?: number;
  confidence_levels?: ('LOW' | 'MEDIUM' | 'HIGH')[];
  // Trade size filter
  trade_size_min?: number;
  trade_size_max?: number;
  // Conviction filter
  use_conviction?: boolean;
  min_conviction_z?: number;
  // Market filters
  market_types?: string[];
  bet_structures?: string[];
  // ML Model filter (uses trade_predictions_pnl_weighted - PnL-weighted model)
  use_model_score?: boolean;
  min_model_score?: number; // 0-1, filter trades where model_win_probability >= this
}

interface Trade {
  trade_time: any; // BigQuery returns timestamps in various formats
  wallet_address: string;
  condition_id: string;
  token_label: string;
  entry_price: number;
  trade_size_usd: number;
  L_win_rate: number;
  L_resolved_count: number;
  stat_confidence: string;
  outcome: string;
  // From enriched data (if use_conviction is true)
  conviction_z_score?: number;
  // From ML model predictions (if use_model_score is true)
  model_win_probability?: number;
  // Computed fields
  edge?: number;  // L_win_rate - entry_price
  ev?: number;    // Expected value per $1
}

// Helper to safely convert BigQuery timestamps to Date strings
function toDateString(val: any): string {
  if (!val) return '';
  // If it's already a string in YYYY-MM-DD format
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    return val.slice(0, 10);
  }
  // BigQuery timestamp object with .value property
  if (val.value) {
    return toDateString(val.value);
  }
  // Date object
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  // BigQuery BigQueryTimestamp has toISOString()
  if (typeof val.toISOString === 'function') {
    return val.toISOString().slice(0, 10);
  }
  // Fallback - try to create a date
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {}
  return String(val).slice(0, 10);
}

function getBigQueryClient() {
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  
  if (credentials) {
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: JSON.parse(credentials),
    });
  }
  
  return new BigQuery({ projectId: PROJECT_ID });
}

// Compute trader basket at the start of backtest period
async function getTraderBasket(
  client: BigQuery,
  config: BacktestConfig
): Promise<string[]> {
  if (config.trader_selection === 'ALL') {
    return []; // Empty means no filter
  }
  
  if (config.trader_selection === 'SPECIFIC_WALLETS') {
    return config.specific_wallets || [];
  }
  
  // For TOP_BY_* selections, compute based on performance BEFORE the backtest start date
  let orderBy: string;
  switch (config.trader_selection) {
    case 'TOP_BY_PROFIT':
      orderBy = 'total_profit DESC';
      break;
    case 'TOP_BY_VOLUME':
      orderBy = 'trade_count DESC';
      break;
    case 'TOP_BY_WINRATE':
    default:
      orderBy = 'win_rate DESC';
      break;
  }
  
  // Query trader stats as of the backtest start date (using trades that resolved before start)
  const query = `
    WITH trader_stats AS (
      SELECT 
        wallet_address,
        COUNT(*) as trade_count,
        COUNTIF(outcome = 'WON') as wins,
        COUNTIF(outcome = 'WON') / COUNT(*) as win_rate,
        SUM(CASE 
          WHEN outcome = 'WON' THEN (1 - entry_price) / entry_price
          ELSE -1
        END) as total_profit
      FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\`
      WHERE trade_time < '${config.start_date}'
        AND outcome IN ('WON', 'LOST')
      GROUP BY wallet_address
      HAVING COUNT(*) >= ${config.trader_min_trades || 50}
    )
    SELECT wallet_address
    FROM trader_stats
    WHERE win_rate >= ${config.min_win_rate || 0.55}
    ORDER BY ${orderBy}
    LIMIT ${config.trader_count || 50}
  `;
  
  const [rows] = await client.query(query);
  const wallets = (rows as any[]).map(r => r.wallet_address);
  
  console.log(`Trader basket: ${wallets.length} traders selected (${config.trader_selection})`);
  return wallets;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const config: BacktestConfig = await request.json();
    const client = getBigQueryClient();
    
    // Generate run ID
    const runId = `bt_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
    const runName = `${config.strategy_type}_${config.start_date}_${config.end_date}`;
    
    // Record run start
    await client.query(`
      INSERT INTO \`${PROJECT_ID}.${DATASET}.backtest_runs\`
      (run_id, run_name, created_by, description, strategy_type, 
       start_date, end_date, initial_capital, slippage_pct, status, started_at)
      VALUES (
        '${runId}',
        '${runName}',
        'web_ui',
        '${(config.description || '').replace(/'/g, "''")}',
        '${config.strategy_type}',
        '${config.start_date}',
        '${config.end_date}',
        ${config.initial_capital},
        ${config.slippage_pct},
        'running',
        CURRENT_TIMESTAMP()
      )
    `);
    
    // Get trader basket (computed as of start date)
    const traderBasket = await getTraderBasket(client, config);
    
    // Build wallet filter
    let walletFilter = '';
    if (traderBasket.length > 0) {
      const walletList = traderBasket.map(w => `'${w}'`).join(',');
      walletFilter = `AND wallet_address IN (${walletList})`;
    }
    
    // Build confidence filter
    const confidenceLevels = config.confidence_levels && config.confidence_levels.length > 0
      ? config.confidence_levels
      : ['HIGH', 'MEDIUM']; // Default to HIGH and MEDIUM
    const confFilter = `stat_confidence IN (${confidenceLevels.map(c => `'${c}'`).join(',')})`;
    
    // Build edge filter (for THRESHOLD selection - decidable at trade time)
    // min_edge_pct is passed as percentage (e.g., 5 for 5%), convert to decimal
    const minEdgeDecimal = (config.min_edge_pct || 0) / 100;
    const edgeFilter = minEdgeDecimal > 0 
      ? `AND (L_win_rate - entry_price) >= ${minEdgeDecimal}` 
      : '';
    
    // Build price band filter
    const priceMin = config.price_min ?? 0;
    const priceMax = config.price_max ?? 1;
    const priceFilter = (priceMin > 0 || priceMax < 1)
      ? `AND entry_price >= ${priceMin} AND entry_price <= ${priceMax}`
      : '';
    
    // Build trade size filter
    const tradeSizeMin = config.trade_size_min ?? 0;
    const tradeSizeMax = config.trade_size_max ?? 0;
    let tradeSizeFilter = '';
    if (tradeSizeMin > 0) {
      tradeSizeFilter += `AND trade_size_usd >= ${tradeSizeMin}`;
    }
    if (tradeSizeMax > 0) {
      tradeSizeFilter += ` AND trade_size_usd <= ${tradeSizeMax}`;
    }
    
    // Build conviction filter (requires join with enriched_trades)
    const useConviction = config.use_conviction ?? false;
    const minConvictionZ = config.min_conviction_z ?? 0;
    
    // Build market type filter (requires join with markets table)
    const hasMarketFilters = (config.market_types && config.market_types.length > 0) || 
                             (config.bet_structures && config.bet_structures.length > 0);
    
    let marketTypeFilter = '';
    let betStructureFilter = '';
    
    if (config.market_types && config.market_types.length > 0) {
      marketTypeFilter = `AND m.market_type IN (${config.market_types.map(t => `'${t}'`).join(',')})`;
    }
    
    if (config.bet_structures && config.bet_structures.length > 0) {
      betStructureFilter = `AND m.bet_structure IN (${config.bet_structures.map(s => `'${s}'`).join(',')})`;
    }
    
    // Build ML model score filter (requires join with trade_predictions_pnl_weighted)
    const useModelScore = config.use_model_score ?? false;
    const minModelScore = config.min_model_score ?? 0.5;
    
    // Fetch qualifying trades (with optional joins)
    let tradeQuery: string;
    
    if (useModelScore) {
      // Join with trade_predictions_pnl_weighted for ML model scores (PnL-weighted model)
      tradeQuery = `
        SELECT 
          t.trade_time,
          t.wallet_address,
          t.condition_id,
          t.token_label,
          t.entry_price,
          t.trade_size_usd,
          t.L_win_rate,
          t.L_resolved_count,
          t.stat_confidence,
          t.outcome,
          p.model_win_probability
          ${hasMarketFilters ? ', m.market_type, m.bet_structure' : ''}
        FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
        INNER JOIN \`${PROJECT_ID}.${DATASET}.trade_predictions_pnl_weighted\` p
          ON t.trade_key = p.trade_key
        ${hasMarketFilters ? `LEFT JOIN \`${PROJECT_ID}.${DATASET}.markets\` m ON t.condition_id = m.condition_id` : ''}
        WHERE t.trade_time >= '${config.start_date}'
          AND t.trade_time < '${config.end_date}'
          AND ${confFilter.replace(/stat_confidence/g, 't.stat_confidence')}
          AND t.L_resolved_count >= ${config.min_resolved_trades}
          AND t.L_win_rate >= ${config.min_win_rate}
          AND p.model_win_probability >= ${minModelScore}
          ${walletFilter.replace(/wallet_address/g, 't.wallet_address')}
          ${edgeFilter.replace(/L_win_rate/g, 't.L_win_rate').replace(/entry_price/g, 't.entry_price')}
          ${priceFilter.replace(/entry_price/g, 't.entry_price')}
          ${tradeSizeFilter.replace(/trade_size_usd/g, 't.trade_size_usd')}
          ${marketTypeFilter}
          ${betStructureFilter}
        ORDER BY t.trade_time
        LIMIT 500000
      `;
    } else if (useConviction) {
      // Join with enriched_trades_training_v11 for conviction data
      tradeQuery = `
        SELECT 
          t.trade_time,
          t.wallet_address,
          t.condition_id,
          t.token_label,
          t.entry_price,
          t.trade_size_usd,
          t.L_win_rate,
          t.L_resolved_count,
          t.stat_confidence,
          t.outcome,
          e.conviction_z_score
          ${hasMarketFilters ? ', m.market_type, m.bet_structure' : ''}
        FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.enriched_trades_training_v11\` e 
          ON t.wallet_address = e.wallet_address 
          AND t.condition_id = e.condition_id
          AND DATE(t.trade_time) = DATE(e.timestamp)
        ${hasMarketFilters ? `LEFT JOIN \`${PROJECT_ID}.${DATASET}.markets\` m ON t.condition_id = m.condition_id` : ''}
        WHERE t.trade_time >= '${config.start_date}'
          AND t.trade_time < '${config.end_date}'
          AND ${confFilter.replace(/stat_confidence/g, 't.stat_confidence')}
          AND t.L_resolved_count >= ${config.min_resolved_trades}
          AND t.L_win_rate >= ${config.min_win_rate}
          ${walletFilter.replace(/wallet_address/g, 't.wallet_address')}
          ${edgeFilter.replace(/L_win_rate/g, 't.L_win_rate').replace(/entry_price/g, 't.entry_price')}
          ${priceFilter.replace(/entry_price/g, 't.entry_price')}
          ${tradeSizeFilter.replace(/trade_size_usd/g, 't.trade_size_usd')}
          AND e.conviction_z_score >= ${minConvictionZ}
          ${marketTypeFilter}
          ${betStructureFilter}
        ORDER BY t.trade_time
        LIMIT 500000
      `;
    } else if (hasMarketFilters) {
      // Need to join with markets table for market_type and bet_structure
      tradeQuery = `
        SELECT 
          t.trade_time,
          t.wallet_address,
          t.condition_id,
          t.token_label,
          t.entry_price,
          t.trade_size_usd,
          t.L_win_rate,
          t.L_resolved_count,
          t.stat_confidence,
          t.outcome,
          m.market_type,
          m.bet_structure
        FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\` t
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.markets\` m ON t.condition_id = m.condition_id
        WHERE t.trade_time >= '${config.start_date}'
          AND t.trade_time < '${config.end_date}'
          AND ${confFilter.replace(/stat_confidence/g, 't.stat_confidence')}
          AND t.L_resolved_count >= ${config.min_resolved_trades}
          AND t.L_win_rate >= ${config.min_win_rate}
          ${walletFilter.replace(/wallet_address/g, 't.wallet_address')}
          ${edgeFilter.replace(/L_win_rate/g, 't.L_win_rate').replace(/entry_price/g, 't.entry_price')}
          ${priceFilter.replace(/entry_price/g, 't.entry_price')}
          ${tradeSizeFilter.replace(/trade_size_usd/g, 't.trade_size_usd')}
          ${marketTypeFilter}
          ${betStructureFilter}
        ORDER BY t.trade_time
        LIMIT 500000
      `;
    } else {
      // No special filters - simpler query without join
      tradeQuery = `
        SELECT 
          trade_time,
          wallet_address,
          condition_id,
          token_label,
          entry_price,
          trade_size_usd,
          L_win_rate,
          L_resolved_count,
          stat_confidence,
          outcome
        FROM \`${PROJECT_ID}.${DATASET}.trader_stats_at_trade\`
        WHERE trade_time >= '${config.start_date}'
          AND trade_time < '${config.end_date}'
          AND ${confFilter}
          AND L_resolved_count >= ${config.min_resolved_trades}
          AND L_win_rate >= ${config.min_win_rate}
          ${walletFilter}
          ${edgeFilter}
          ${priceFilter}
          ${tradeSizeFilter}
        ORDER BY trade_time
        LIMIT 500000
      `;
    }
    
    const [trades] = await client.query(tradeQuery);
    
    // Log query results for debugging
    console.log(`Backtest ${runId}: Found ${(trades as any[]).length} qualifying trades`);
    console.log(`  Filters: edge>=${config.min_edge_pct}, price=${priceMin}-${priceMax}, confidence=${confidenceLevels.join(',')}`);
    if (tradeSizeMin > 0 || tradeSizeMax > 0) {
      console.log(`  Trade size: $${tradeSizeMin} - $${tradeSizeMax > 0 ? tradeSizeMax : 'unlimited'}`);
    }
    if (useConviction) {
      console.log(`  Conviction: z-score >= ${minConvictionZ}`);
    }
    if (hasMarketFilters) {
      console.log(`  Market filters: types=${config.market_types?.join(',') || 'all'}, structures=${config.bet_structures?.join(',') || 'all'}`);
    }
    if (useModelScore) {
      console.log(`  Model score filter: >= ${minModelScore * 100}%`);
    }
    
    // Apply defaults for new options
    const selectionMethod = config.selection_method || 'CHRONOLOGICAL';
    const sizingMethod = config.sizing_method || 'FIXED';
    const dailyBudgetPct = config.daily_budget_pct || 0.10; // Default 10% daily budget
    
    // Enrich trades with computed fields
    const enrichedTrades = (trades as Trade[]).map(trade => ({
      ...trade,
      edge: trade.L_win_rate - trade.entry_price,
      // EV per $1 = p(win) * profit_if_win - p(loss) * loss_if_loss
      ev: trade.L_win_rate * ((1 - trade.entry_price) / trade.entry_price) - (1 - trade.L_win_rate),
    }));
    
    // Group trades by day
    const tradesByDay = new Map<string, Trade[]>();
    for (const trade of enrichedTrades) {
      const tradeDate = toDateString(trade.trade_time);
      if (!tradeDate || tradeDate.length < 10) continue;
      
      if (!tradesByDay.has(tradeDate)) {
        tradesByDay.set(tradeDate, []);
      }
      tradesByDay.get(tradeDate)!.push(trade);
    }
    
    // Sort days chronologically
    const sortedDays = Array.from(tradesByDay.keys()).sort();
    
    // Fill rate (default 100% if not specified)
    const fillRate = config.fill_rate_pct ?? 1.0;
    
    // Run simulation
    let capital = config.initial_capital;
    let peakCapital = config.initial_capital;
    let maxDrawdown = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let skippedTrades = 0;
    const returns: number[] = [];
    
    // Track equity curve and individual trades
    const equityCurve: { date: string; capital: number; pnl: number }[] = [];
    const executedTrades: {
      date: string;
      wallet: string;
      condition_id: string;
      entry_price: number;
      effective_price: number;
      win_rate: number;
      edge: number;
      position_size: number;
      outcome: string;
      pnl: number;
      capital_after: number;
    }[] = [];
    
    for (const day of sortedDays) {
      let dayTrades = tradesByDay.get(day)!;
      const dayStartCapital = capital;
      
      // Apply selection method
      switch (selectionMethod) {
        case 'RANDOM':
          for (let i = dayTrades.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [dayTrades[i], dayTrades[j]] = [dayTrades[j], dayTrades[i]];
          }
          break;
        case 'THRESHOLD':
        case 'CHRONOLOGICAL':
        default:
          break;
      }
      
      const selectedTrades = dayTrades.slice(0, config.max_trades_per_day);
      const dailyBudget = capital * dailyBudgetPct;
      const totalPositiveEdge = selectedTrades.reduce((sum, t) => sum + Math.max(0, t.edge || 0), 0);
      
      for (const trade of selectedTrades) {
        // Apply fill rate - randomly skip trades based on fill rate
        if (Math.random() > fillRate) {
          skippedTrades++;
          continue;
        }
        
        let positionSize: number;
        
        switch (sizingMethod) {
          case 'KELLY':
            const profitRatio = (1 - trade.entry_price) / trade.entry_price;
            const kellyFraction = trade.L_win_rate - (1 - trade.L_win_rate) / profitRatio;
            const safeFraction = Math.max(0, Math.min(kellyFraction * 0.25, 0.5));
            positionSize = Math.min(
              dailyBudget * safeFraction * selectedTrades.length,
              dailyBudget / selectedTrades.length,
              100
            );
            break;
            
          case 'PROPORTIONAL':
            if (totalPositiveEdge > 0 && (trade.edge || 0) > 0) {
              const edgeShare = (trade.edge || 0) / totalPositiveEdge;
              positionSize = Math.min(dailyBudget * edgeShare, 100);
            } else {
              positionSize = Math.min(dailyBudget / selectedTrades.length, 100);
            }
            break;
          
          case 'CONVICTION':
            // Size based on conviction z-score (requires use_conviction)
            // Higher conviction = larger position
            const convictionZ = trade.conviction_z_score ?? 0;
            // Normalize to 0-1 range: z-scores typically -3 to +3, we focus on positive
            const convictionFactor = Math.max(0, Math.min((convictionZ + 1) / 3, 1)); // 0 at z=-1, 1 at z=2
            const baseSizeConv = dailyBudget / selectedTrades.length;
            // Scale from 50% to 150% of base size based on conviction
            positionSize = Math.min(baseSizeConv * (0.5 + convictionFactor), 100);
            break;
          
          case 'MODEL':
            // Size based on model win probability (requires use_model_score)
            // Higher predicted probability = larger position
            const modelProb = trade.model_win_probability ?? 0.5;
            // Scale position based on confidence: 50% at prob=0.5, 150% at prob=0.9
            const modelFactor = Math.max(0, Math.min((modelProb - 0.5) * 2.5, 1)); // 0 at 50%, 1 at 90%
            const baseSizeModel = dailyBudget / selectedTrades.length;
            positionSize = Math.min(baseSizeModel * (0.5 + modelFactor), 100);
            break;
            
          case 'FIXED':
          default:
            positionSize = Math.min(dailyBudget / selectedTrades.length, 100);
            break;
        }
        
        if (positionSize < 1 || capital < 1) continue;
        
        totalTrades++;
        const effectivePrice = Math.min(trade.entry_price * (1 + config.slippage_pct), 0.99);
        
        let pnl: number;
        if (trade.outcome === 'WON') {
          winningTrades++;
          pnl = positionSize * ((1 - effectivePrice) / effectivePrice);
        } else {
          pnl = -positionSize;
        }
        
        capital += pnl;
        returns.push(pnl / config.initial_capital);
        
        // Store trade details (limit to first 10000 to avoid huge payloads)
        if (executedTrades.length < 10000) {
          executedTrades.push({
            date: day,
            wallet: trade.wallet_address,
            condition_id: trade.condition_id,
            entry_price: trade.entry_price,
            effective_price: effectivePrice,
            win_rate: trade.L_win_rate,
            edge: trade.edge || 0,
            position_size: positionSize,
            outcome: trade.outcome,
            pnl: pnl,
            capital_after: capital,
          });
        }
        
        if (capital > peakCapital) peakCapital = capital;
        const currentDrawdown = (peakCapital - capital) / peakCapital;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
      }
      
      // Store end-of-day equity
      equityCurve.push({
        date: day,
        capital: capital,
        pnl: capital - dayStartCapital,
      });
    }
    
    const totalReturn = ((capital - config.initial_capital) / config.initial_capital) * 100;
    
    // Sharpe ratio (simplified)
    let sharpeRatio = 0;
    if (returns.length > 1) {
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length;
      const stdReturn = Math.sqrt(variance);
      sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    }
    
    // Update run with results
    await client.query(`
      UPDATE \`${PROJECT_ID}.${DATASET}.backtest_runs\`
      SET 
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP(),
        total_trades = ${totalTrades},
        winning_trades = ${winningTrades},
        total_return_pct = ${totalReturn},
        sharpe_ratio = ${sharpeRatio},
        max_drawdown_pct = ${maxDrawdown * 100},
        final_capital = ${capital}
      WHERE run_id = '${runId}'
    `);
    
    const duration = (Date.now() - startTime) / 1000;
    
    return NextResponse.json({
      success: true,
      run_id: runId,
      results: {
        total_trades: totalTrades,
        winning_trades: winningTrades,
        skipped_trades: skippedTrades,
        win_rate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        total_return_pct: totalReturn,
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: maxDrawdown * 100,
        final_capital: capital,
        duration_seconds: duration,
      },
      equity_curve: equityCurve,
      trades: executedTrades,
    });
    
  } catch (error) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: 'Backtest failed', message: String(error) },
      { status: 500 }
    );
  }
}
