#!/usr/bin/env npx tsx
/**
 * FT Forward Test Performance Analysis
 * =====================================
 * Comprehensive analysis of all forward testing strategies.
 * 
 * Run: npx tsx scripts/ft-performance-analysis.ts
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

// Try multiple .env.local locations (worktree, main repo, home)
const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
  path.resolve(process.cwd(), '..', '.env.local'),
];
for (const p of envPaths) {
  config({ path: p });
}
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Types
// ============================================================================
interface FTWallet {
  wallet_id: string;
  config_id: string;
  display_name: string;
  description: string;
  starting_balance: number;
  current_balance: number;
  total_pnl: number;
  model_threshold: number | null;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  bet_size: number;
  allocation_method: string;
  kelly_fraction: number | null;
  min_bet: number;
  max_bet: number;
  min_trader_resolved_count: number;
  min_conviction: number;
  total_trades: number;
  open_positions: number;
  trades_seen: number;
  trades_skipped: number;
  is_active: boolean;
  thesis_tier: string | null;
  hypothesis: string | null;
  start_date: string;
  last_sync_time: string | null;
  created_at: string;
}

interface FTOrder {
  order_id: string;
  wallet_id: string;
  side: string;
  market_slug: string;
  condition_id: string;
  market_title: string;
  token_label: string;
  source_trade_id: string;
  trader_address: string;
  entry_price: number;
  size: number;
  market_end_time: string | null;
  trader_win_rate: number | null;
  trader_roi: number | null;
  trader_resolved_count: number | null;
  model_probability: number | null;
  edge_pct: number | null;
  conviction: number | null;
  outcome: string;
  winning_label: string | null;
  pnl: number | null;
  order_time: string;
  resolved_time: string | null;
  created_at: string;
}

// ============================================================================
// Helpers
// ============================================================================
const fmt = (n: number, decimals = 2) => n.toFixed(decimals);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDollar = (n: number) => `$${n.toFixed(2)}`;
const pad = (s: string, len: number) => s.padEnd(len);
const padL = (s: string, len: number) => s.padStart(len);

function printSection(title: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(80)}`);
}

function printSubsection(title: string) {
  console.log(`\n--- ${title} ---`);
}

// ============================================================================
// Data fetching (paginate to avoid 1000-row limit)
// ============================================================================
async function fetchAllOrders(): Promise<FTOrder[]> {
  const allOrders: FTOrder[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('*')
      .order('order_time', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching orders:', error.message);
      break;
    }

    if (data && data.length > 0) {
      allOrders.push(...(data as FTOrder[]));
      offset += data.length;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allOrders;
}

async function fetchAllWallets(): Promise<FTWallet[]> {
  const { data, error } = await supabase
    .from('ft_wallets')
    .select('*')
    .order('wallet_id');

  if (error) {
    console.error('Error fetching wallets:', error.message);
    return [];
  }
  return (data || []) as FTWallet[];
}

// ============================================================================
// Analysis functions
// ============================================================================

interface WalletAnalysis {
  wallet: FTWallet;
  orders: FTOrder[];
  totalTrades: number;
  openTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  avgTradeSize: number;
  avgEntryPrice: number;
  avgWinPnl: number;
  avgLossPnl: number;
  profitFactor: number;
  roi: number;
  avgEdge: number;
  avgModelProb: number | null;
  avgTraderWR: number | null;
  avgConviction: number | null;
  maxWin: number;
  maxLoss: number;
  uniqueMarkets: number;
  uniqueTraders: number;
  // Time analysis
  avgDaysToResolve: number | null;
  // Resolution distribution
  openPct: number;
  // Unrealized detail
  openPositionValue: number;
}

function analyzeWallet(wallet: FTWallet, orders: FTOrder[]): WalletAnalysis {
  const totalTrades = orders.length;
  const openTrades = orders.filter(o => o.outcome === 'OPEN').length;
  const wonOrders = orders.filter(o => o.outcome === 'WON');
  const lostOrders = orders.filter(o => o.outcome === 'LOST');
  const resolvedTrades = wonOrders.length + lostOrders.length;
  const wins = wonOrders.length;
  const losses = lostOrders.length;
  const winRate = resolvedTrades > 0 ? wins / resolvedTrades : 0;

  const realizedPnl = [...wonOrders, ...lostOrders].reduce((sum, o) => sum + (o.pnl ?? 0), 0);

  // Unrealized PnL estimate: for open orders, unrealized = size * (current_market_implied_pnl)
  // We don't have current prices in ft_orders, so we estimate from entry_price
  // A BUY at price p has potential pnl of size * ((1/p) - 1) if it wins, or -size if it loses
  // For now, unrealized = 0 (we'll use the wallet's stored total_pnl - realized)
  const openOrders = orders.filter(o => o.outcome === 'OPEN');
  const openPositionValue = openOrders.reduce((sum, o) => sum + (o.size ?? 0), 0);

  // Use wallet total_pnl as the realized - this already accounts for resolved trades
  const unrealizedPnl = wallet.total_pnl - realizedPnl;
  const totalPnl = wallet.total_pnl;

  const totalInvested = orders.reduce((sum, o) => sum + (o.size ?? 0), 0);
  const avgTradeSize = totalTrades > 0 ? totalInvested / totalTrades : 0;
  const avgEntryPrice = totalTrades > 0
    ? orders.reduce((sum, o) => sum + (o.entry_price ?? 0), 0) / totalTrades : 0;

  const avgWinPnl = wins > 0 ? wonOrders.reduce((sum, o) => sum + (o.pnl ?? 0), 0) / wins : 0;
  const avgLossPnl = losses > 0 ? lostOrders.reduce((sum, o) => sum + (o.pnl ?? 0), 0) / losses : 0;

  const totalWinPnl = wonOrders.reduce((sum, o) => sum + (o.pnl ?? 0), 0);
  const totalLossPnl = Math.abs(lostOrders.reduce((sum, o) => sum + (o.pnl ?? 0), 0));
  const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : (totalWinPnl > 0 ? Infinity : 0);

  const roi = totalInvested > 0 ? (realizedPnl / totalInvested) * 100 : 0;

  // Signal averages
  const edgeOrders = orders.filter(o => o.edge_pct !== null);
  const avgEdge = edgeOrders.length > 0
    ? edgeOrders.reduce((sum, o) => sum + (o.edge_pct ?? 0), 0) / edgeOrders.length : 0;

  const modelOrders = orders.filter(o => o.model_probability !== null && o.model_probability > 0);
  const avgModelProb = modelOrders.length > 0
    ? modelOrders.reduce((sum, o) => sum + (o.model_probability ?? 0), 0) / modelOrders.length : null;

  const wrOrders = orders.filter(o => o.trader_win_rate !== null);
  const avgTraderWR = wrOrders.length > 0
    ? wrOrders.reduce((sum, o) => sum + (o.trader_win_rate ?? 0), 0) / wrOrders.length : null;

  const convOrders = orders.filter(o => o.conviction !== null && o.conviction > 0);
  const avgConviction = convOrders.length > 0
    ? convOrders.reduce((sum, o) => sum + (o.conviction ?? 0), 0) / convOrders.length : null;

  // Max win/loss
  const allPnls = [...wonOrders, ...lostOrders].map(o => o.pnl ?? 0);
  const maxWin = allPnls.length > 0 ? Math.max(...allPnls) : 0;
  const maxLoss = allPnls.length > 0 ? Math.min(...allPnls) : 0;

  // Unique counts
  const uniqueMarkets = new Set(orders.map(o => o.condition_id).filter(Boolean)).size;
  const uniqueTraders = new Set(orders.map(o => o.trader_address).filter(Boolean)).size;

  // Time to resolve
  const resolvedWithTimes = [...wonOrders, ...lostOrders].filter(o => o.resolved_time && o.order_time);
  const avgDaysToResolve = resolvedWithTimes.length > 0
    ? resolvedWithTimes.reduce((sum, o) => {
        const diff = new Date(o.resolved_time!).getTime() - new Date(o.order_time).getTime();
        return sum + diff / (1000 * 60 * 60 * 24);
      }, 0) / resolvedWithTimes.length
    : null;

  const openPct = totalTrades > 0 ? openTrades / totalTrades : 0;

  return {
    wallet,
    orders,
    totalTrades,
    openTrades,
    resolvedTrades,
    wins,
    losses,
    winRate,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    avgTradeSize,
    avgEntryPrice,
    avgWinPnl,
    avgLossPnl,
    profitFactor,
    roi,
    avgEdge,
    avgModelProb,
    avgTraderWR,
    avgConviction,
    maxWin,
    maxLoss,
    uniqueMarkets,
    uniqueTraders,
    avgDaysToResolve,
    openPct,
    openPositionValue,
  };
}

// ============================================================================
// Report: Strategy Leaderboard
// ============================================================================
function printLeaderboard(analyses: WalletAnalysis[]) {
  printSection('STRATEGY LEADERBOARD (by Realized PnL)');

  // Sort by realized PnL
  const sorted = [...analyses].sort((a, b) => b.realizedPnl - a.realizedPnl);

  // Header
  console.log(
    pad('Rank', 5) +
    pad('Strategy', 30) +
    padL('Trades', 8) +
    padL('Open', 7) +
    padL('Resolved', 10) +
    padL('WinRate', 9) +
    padL('Realized$', 11) +
    padL('AvgWin$', 9) +
    padL('AvgLoss$', 10) +
    padL('PF', 6) +
    padL('Model', 7) +
    padL('Tier', 12)
  );
  console.log('-'.repeat(124));

  sorted.forEach((a, i) => {
    const tier = a.wallet.thesis_tier || '-';
    const useModel = a.wallet.use_model ? 'Yes' : 'No';
    console.log(
      pad(`${i + 1}.`, 5) +
      pad(a.wallet.display_name.slice(0, 28), 30) +
      padL(a.totalTrades.toString(), 8) +
      padL(a.openTrades.toString(), 7) +
      padL(a.resolvedTrades.toString(), 10) +
      padL(a.resolvedTrades > 0 ? fmtPct(a.winRate) : 'N/A', 9) +
      padL(fmtDollar(a.realizedPnl), 11) +
      padL(a.wins > 0 ? fmtDollar(a.avgWinPnl) : 'N/A', 9) +
      padL(a.losses > 0 ? fmtDollar(a.avgLossPnl) : 'N/A', 10) +
      padL(a.profitFactor === Infinity ? '∞' : fmt(a.profitFactor, 1), 6) +
      padL(useModel, 7) +
      padL(tier, 12)
    );
  });
}

// ============================================================================
// Report: Win Rate vs PnL Paradox Analysis
// ============================================================================
function printWinRatePnlAnalysis(analyses: WalletAnalysis[]) {
  printSection('WIN RATE vs PnL PARADOX ANALYSIS');

  const withResolved = analyses.filter(a => a.resolvedTrades >= 3);

  if (withResolved.length === 0) {
    console.log('  Not enough resolved trades to analyze.');
    return;
  }

  // Low WR but positive PnL
  printSubsection('Low Win Rate (<50%) but Positive PnL');
  const lowWrPosPnl = withResolved.filter(a => a.winRate < 0.5 && a.realizedPnl > 0);
  if (lowWrPosPnl.length === 0) {
    console.log('  None found.');
  } else {
    lowWrPosPnl.forEach(a => {
      console.log(`  ${a.wallet.display_name}: WR=${fmtPct(a.winRate)}, PnL=${fmtDollar(a.realizedPnl)}`);
      console.log(`    AvgWin=${fmtDollar(a.avgWinPnl)}, AvgLoss=${fmtDollar(a.avgLossPnl)}, PF=${fmt(a.profitFactor, 2)}`);
      console.log(`    AvgEntryPrice=${fmt(a.avgEntryPrice, 3)}, AvgEdge=${fmtPct(a.avgEdge)}`);
      console.log(`    -> Wins are ${Math.abs(a.avgWinPnl / (a.avgLossPnl || 1)).toFixed(1)}x larger than losses (underdog strategy)`);
    });
  }

  // High WR but negative PnL
  printSubsection('High Win Rate (>55%) but Negative PnL');
  const highWrNegPnl = withResolved.filter(a => a.winRate > 0.55 && a.realizedPnl < 0);
  if (highWrNegPnl.length === 0) {
    console.log('  None found.');
  } else {
    highWrNegPnl.forEach(a => {
      console.log(`  ${a.wallet.display_name}: WR=${fmtPct(a.winRate)}, PnL=${fmtDollar(a.realizedPnl)}`);
      console.log(`    AvgWin=${fmtDollar(a.avgWinPnl)}, AvgLoss=${fmtDollar(a.avgLossPnl)}, PF=${fmt(a.profitFactor, 2)}`);
      console.log(`    -> Losses are ${Math.abs(a.avgLossPnl / (a.avgWinPnl || 1)).toFixed(1)}x larger than wins (favorites trap)`);
    });
  }

  // Entry price distribution analysis
  printSubsection('Entry Price vs Outcome Dynamics');
  console.log('  Strategy               | AvgPrice | UnderdogWR | FavoriteWR | Underdog PnL/trade | Fav PnL/trade');
  console.log('  ' + '-'.repeat(100));

  withResolved.forEach(a => {
    const underdogs = a.orders.filter(o => o.entry_price < 0.5 && o.outcome !== 'OPEN');
    const favorites = a.orders.filter(o => o.entry_price >= 0.5 && o.outcome !== 'OPEN');

    const udWins = underdogs.filter(o => o.outcome === 'WON').length;
    const udWR = underdogs.length > 0 ? udWins / underdogs.length : 0;
    const udPnl = underdogs.length > 0
      ? underdogs.reduce((s, o) => s + (o.pnl ?? 0), 0) / underdogs.length : 0;

    const favWins = favorites.filter(o => o.outcome === 'WON').length;
    const favWR = favorites.length > 0 ? favWins / favorites.length : 0;
    const favPnl = favorites.length > 0
      ? favorites.reduce((s, o) => s + (o.pnl ?? 0), 0) / favorites.length : 0;

    if (underdogs.length + favorites.length > 0) {
      console.log(
        `  ${pad(a.wallet.display_name.slice(0, 23), 25)}| ` +
        `${padL(fmt(a.avgEntryPrice, 3), 8)} | ` +
        `${padL(underdogs.length > 0 ? fmtPct(udWR) : 'N/A', 10)} | ` +
        `${padL(favorites.length > 0 ? fmtPct(favWR) : 'N/A', 10)} | ` +
        `${padL(underdogs.length > 0 ? fmtDollar(udPnl) : 'N/A', 18)} | ` +
        `${padL(favorites.length > 0 ? fmtDollar(favPnl) : 'N/A', 13)}`
      );
    }
  });
}

// ============================================================================
// Report: Model vs Non-Model Comparison
// ============================================================================
function printModelComparison(analyses: WalletAnalysis[]) {
  printSection('MODEL vs NON-MODEL COMPARISON');

  const modelStrats = analyses.filter(a => a.wallet.use_model);
  const nonModelStrats = analyses.filter(a => !a.wallet.use_model);

  const summarize = (strats: WalletAnalysis[], label: string) => {
    const withTrades = strats.filter(a => a.totalTrades > 0);
    const withResolved = strats.filter(a => a.resolvedTrades > 0);
    const totalTrades = withTrades.reduce((s, a) => s + a.totalTrades, 0);
    const totalResolved = withResolved.reduce((s, a) => s + a.resolvedTrades, 0);
    const totalWins = withResolved.reduce((s, a) => s + a.wins, 0);
    const totalRealizedPnl = withResolved.reduce((s, a) => s + a.realizedPnl, 0);
    const totalInvested = withTrades.reduce((s, a) => s + a.orders.reduce((ss, o) => ss + (o.size ?? 0), 0), 0);
    const avgWR = totalResolved > 0 ? totalWins / totalResolved : 0;
    const avgROI = totalInvested > 0 ? (totalRealizedPnl / totalInvested) * 100 : 0;
    const avgPnlPerTrade = totalResolved > 0 ? totalRealizedPnl / totalResolved : 0;

    console.log(`\n  ${label}:`);
    console.log(`    Strategies:     ${strats.length} (${withTrades.length} with trades)`);
    console.log(`    Total Trades:   ${totalTrades}`);
    console.log(`    Resolved:       ${totalResolved}`);
    console.log(`    Overall WR:     ${fmtPct(avgWR)}`);
    console.log(`    Realized PnL:   ${fmtDollar(totalRealizedPnl)}`);
    console.log(`    Avg PnL/trade:  ${fmtDollar(avgPnlPerTrade)}`);
    console.log(`    ROI:            ${fmt(avgROI, 2)}%`);
    console.log(`    Total Invested: ${fmtDollar(totalInvested)}`);
  };

  summarize(modelStrats, 'MODEL-GATED STRATEGIES (use_model=true)');
  summarize(nonModelStrats, 'NON-MODEL STRATEGIES (use_model=false)');

  // Paired comparisons (same concept, model vs not)
  printSubsection('Paired Comparisons (Similar Strategy, Model On vs Off)');

  const pairs = [
    { model: 'FT_T1_PURE_ML', noModel: 'FT_T1_BASELINE', label: 'ML vs Baseline' },
    { model: 'FT_ML_UNDERDOG', noModel: 'FT_T2_CONTRARIAN', label: 'ML Underdog vs Contrarian' },
    { model: 'FT_ML_FAVORITES', noModel: 'FT_T2_FAVORITES', label: 'ML Favorites vs Favorites' },
    { model: 'FT_ML_MIDRANGE', noModel: 'FT_T2_MIDRANGE', label: 'ML Mid-Range vs Mid-Range' },
    { model: 'FT_ML_HEAVY_FAV', noModel: 'FT_T2_HEAVY_FAV', label: 'ML Heavy Fav vs Heavy Fav' },
    { model: 'FT_ML_CONTRARIAN', noModel: 'FT_T2_CONTRARIAN', label: 'ML Contrarian vs Contrarian' },
    { model: 'FT_MODEL_ONLY', noModel: 'FT_T1_BASELINE', label: 'Model Only vs Baseline' },
    { model: 'FT_UNDERDOG_HUNTER', noModel: 'FT_HIGH_CONVICTION', label: 'Underdog Hunter (ML) vs High Conviction (no ML)' },
    { model: 'FT_LIVE_MODEL_ONLY', noModel: 'FT_LIVE_WR_ONLY', label: 'Live ML vs Live WR Only' },
  ];

  const analysisMap = new Map(analyses.map(a => [a.wallet.wallet_id, a]));

  pairs.forEach(pair => {
    const m = analysisMap.get(pair.model);
    const n = analysisMap.get(pair.noModel);
    if (!m || !n) return;

    const mResolved = m.resolvedTrades;
    const nResolved = n.resolvedTrades;

    if (mResolved === 0 && nResolved === 0) return;

    console.log(`\n  ${pair.label}:`);
    console.log(`    ${pad('', 20)} | ${padL('Trades', 8)} | ${padL('Resolved', 10)} | ${padL('WinRate', 9)} | ${padL('PnL', 10)} | ${padL('AvgPnL', 10)}`);
    console.log(`    ${pad(m.wallet.display_name.slice(0, 18) + ' (ML)', 20)} | ${padL(m.totalTrades.toString(), 8)} | ${padL(mResolved.toString(), 10)} | ${padL(mResolved > 0 ? fmtPct(m.winRate) : 'N/A', 9)} | ${padL(fmtDollar(m.realizedPnl), 10)} | ${padL(mResolved > 0 ? fmtDollar(m.realizedPnl / mResolved) : 'N/A', 10)}`);
    console.log(`    ${pad(n.wallet.display_name.slice(0, 18) + ' (No)', 20)} | ${padL(n.totalTrades.toString(), 8)} | ${padL(nResolved.toString(), 10)} | ${padL(nResolved > 0 ? fmtPct(n.winRate) : 'N/A', 9)} | ${padL(fmtDollar(n.realizedPnl), 10)} | ${padL(nResolved > 0 ? fmtDollar(n.realizedPnl / nResolved) : 'N/A', 10)}`);

    if (mResolved > 0 && nResolved > 0) {
      const pnlDelta = m.realizedPnl - n.realizedPnl;
      const wrDelta = m.winRate - n.winRate;
      console.log(`    Delta: PnL ${pnlDelta >= 0 ? '+' : ''}${fmtDollar(pnlDelta)}, WR ${wrDelta >= 0 ? '+' : ''}${fmtPct(wrDelta)} -> ML ${pnlDelta >= 0 ? 'WINS' : 'LOSES'}`);
    }
  });
}

// ============================================================================
// Report: Tier Comparison
// ============================================================================
function printTierComparison(analyses: WalletAnalysis[]) {
  printSection('TIER COMPARISON');

  const tiers = new Map<string, WalletAnalysis[]>();
  analyses.forEach(a => {
    const tier = a.wallet.thesis_tier || 'ORIGINAL';
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier)!.push(a);
  });

  const tierOrder = ['ORIGINAL', 'T1_SINGLE', 'T2_PRICE', 'T3_MARKET', 'T4_COMPOUND', 'T5_ANTI', 'ML_MIX', 'LIVE', 'SPECIAL'];

  for (const tier of tierOrder) {
    const strats = tiers.get(tier);
    if (!strats || strats.length === 0) continue;

    const withResolved = strats.filter(a => a.resolvedTrades > 0);
    const totalTrades = strats.reduce((s, a) => s + a.totalTrades, 0);
    const totalResolved = withResolved.reduce((s, a) => s + a.resolvedTrades, 0);
    const totalWins = withResolved.reduce((s, a) => s + a.wins, 0);
    const totalPnl = withResolved.reduce((s, a) => s + a.realizedPnl, 0);
    const avgWR = totalResolved > 0 ? totalWins / totalResolved : 0;
    const profitableCount = withResolved.filter(a => a.realizedPnl > 0).length;

    console.log(`\n  ${tier} (${strats.length} strategies):`);
    console.log(`    Trades: ${totalTrades}, Resolved: ${totalResolved}, WR: ${fmtPct(avgWR)}`);
    console.log(`    Total PnL: ${fmtDollar(totalPnl)}, Profitable: ${profitableCount}/${withResolved.length}`);

    // Sort strategies by realized PnL within tier
    const sorted = [...strats].sort((a, b) => b.realizedPnl - a.realizedPnl);
    sorted.forEach(a => {
      const wr = a.resolvedTrades > 0 ? fmtPct(a.winRate) : 'N/A';
      const status = a.totalTrades === 0 ? '[NO TRADES]' :
        a.resolvedTrades === 0 ? `[${a.openTrades} OPEN]` : '';
      console.log(`      ${pad(a.wallet.display_name, 28)} | ${padL(a.totalTrades.toString(), 5)} trades | WR ${padL(wr, 6)} | PnL ${padL(fmtDollar(a.realizedPnl), 9)} ${status}`);
    });
  }
}

// ============================================================================
// Report: Anti-Strategy Validation
// ============================================================================
function printAntiStrategyValidation(analyses: WalletAnalysis[]) {
  printSection('ANTI-STRATEGY VALIDATION (Sanity Checks)');
  console.log('  Anti-strategies should LOSE money. If they profit, something is wrong.\n');

  const antiStrats = analyses.filter(a => a.wallet.thesis_tier === 'T5_ANTI');

  if (antiStrats.length === 0) {
    console.log('  No anti-strategies found.');
    return;
  }

  antiStrats.forEach(a => {
    const status = a.resolvedTrades === 0 ? 'PENDING (no resolved trades yet)' :
      a.realizedPnl > 0 ? 'WARNING: PROFITABLE (unexpected!)' :
      a.realizedPnl < 0 ? 'OK: Losing money (expected)' :
      'NEUTRAL (breakeven)';

    const statusIcon = a.resolvedTrades === 0 ? '⏳' :
      a.realizedPnl > 0 ? '🚨' :
      a.realizedPnl < 0 ? '✅' : '⚠️';

    console.log(`  ${statusIcon} ${a.wallet.display_name}`);
    console.log(`     Hypothesis: ${a.wallet.hypothesis || 'N/A'}`);
    console.log(`     Trades: ${a.totalTrades}, Resolved: ${a.resolvedTrades}, WR: ${a.resolvedTrades > 0 ? fmtPct(a.winRate) : 'N/A'}`);
    console.log(`     PnL: ${fmtDollar(a.realizedPnl)} -> ${status}`);
    console.log('');
  });
}

// ============================================================================
// Report: Anomaly & Data Quality Detection
// ============================================================================
function printAnomalyDetection(analyses: WalletAnalysis[], allOrders: FTOrder[]) {
  printSection('ANOMALY & DATA QUALITY DETECTION');

  // 1. Strategies with 0 trades
  printSubsection('Strategies with 0 trades (potential sync issue)');
  const noTrades = analyses.filter(a => a.totalTrades === 0 && a.wallet.is_active);
  if (noTrades.length === 0) {
    console.log('  None - all active strategies have trades.');
  } else {
    noTrades.forEach(a => {
      const syncAge = a.wallet.last_sync_time
        ? Math.round((Date.now() - new Date(a.wallet.last_sync_time).getTime()) / (1000 * 60))
        : null;
      console.log(`  ${a.wallet.display_name} (${a.wallet.wallet_id})`);
      console.log(`    Last sync: ${syncAge !== null ? `${syncAge} min ago` : 'NEVER'}`);
      console.log(`    Seen/Skipped: ${a.wallet.trades_seen}/${a.wallet.trades_skipped}`);
    });
  }

  // 2. Negative balance wallets
  printSubsection('Wallets with negative or anomalous balance');
  const negBalance = analyses.filter(a => a.wallet.current_balance < 0);
  if (negBalance.length === 0) {
    console.log('  None found.');
  } else {
    negBalance.forEach(a => {
      console.log(`  ${a.wallet.display_name}: balance=${fmtDollar(a.wallet.current_balance)}, starting=${fmtDollar(a.wallet.starting_balance)}`);
    });
  }

  // 3. Orders with null/zero PnL that are resolved
  printSubsection('Resolved orders with missing PnL (potential calculation bug)');
  const brokenPnl = allOrders.filter(o => (o.outcome === 'WON' || o.outcome === 'LOST') && (o.pnl === null || o.pnl === 0));
  console.log(`  Count: ${brokenPnl.length}`);
  if (brokenPnl.length > 0) {
    console.log(`  Sample (first 5):`);
    brokenPnl.slice(0, 5).forEach(o => {
      console.log(`    ${o.wallet_id} | ${o.outcome} | entry=${o.entry_price} | size=${o.size} | pnl=${o.pnl}`);
    });
  }

  // 4. WON orders with negative PnL or LOST orders with positive PnL
  printSubsection('PnL direction mismatches');
  const wonNeg = allOrders.filter(o => o.outcome === 'WON' && o.pnl !== null && o.pnl < 0);
  const lostPos = allOrders.filter(o => o.outcome === 'LOST' && o.pnl !== null && o.pnl > 0);
  console.log(`  WON with negative PnL: ${wonNeg.length}`);
  if (wonNeg.length > 0) {
    wonNeg.slice(0, 3).forEach(o => {
      console.log(`    wallet=${o.wallet_id} | entry=${o.entry_price} | size=${o.size} | pnl=${o.pnl} | side=${o.side} | token=${o.token_label} | winning=${o.winning_label}`);
    });
  }
  console.log(`  LOST with positive PnL: ${lostPos.length}`);
  if (lostPos.length > 0) {
    lostPos.slice(0, 3).forEach(o => {
      console.log(`    wallet=${o.wallet_id} | entry=${o.entry_price} | size=${o.size} | pnl=${o.pnl} | side=${o.side} | token=${o.token_label} | winning=${o.winning_label}`);
    });
  }

  // 5. Duplicate source trades across wallets (expected, but verify)
  printSubsection('Trade overlap analysis');
  const sourceTradeMap = new Map<string, string[]>();
  allOrders.forEach(o => {
    if (!o.source_trade_id) return;
    if (!sourceTradeMap.has(o.source_trade_id)) sourceTradeMap.set(o.source_trade_id, []);
    sourceTradeMap.get(o.source_trade_id)!.push(o.wallet_id);
  });

  const uniqueSourceTrades = sourceTradeMap.size;
  const multiWalletTrades = Array.from(sourceTradeMap.values()).filter(w => w.length > 1).length;
  const maxOverlap = Math.max(...Array.from(sourceTradeMap.values()).map(w => w.length));
  console.log(`  Unique source trades: ${uniqueSourceTrades}`);
  console.log(`  Trades in multiple wallets: ${multiWalletTrades} (${uniqueSourceTrades > 0 ? fmt((multiWalletTrades / uniqueSourceTrades) * 100, 1) : 0}%)`);
  console.log(`  Max wallet overlap for a single trade: ${maxOverlap}`);

  // 6. Orders with entry_price >= 1 or <= 0
  printSubsection('Invalid entry prices');
  const badPrice = allOrders.filter(o => o.entry_price <= 0 || o.entry_price >= 1);
  console.log(`  Entry price <= 0 or >= 1.0: ${badPrice.length}`);
  if (badPrice.length > 0) {
    badPrice.slice(0, 5).forEach(o => {
      console.log(`    wallet=${o.wallet_id} | entry=${o.entry_price} | side=${o.side} | market=${o.market_slug?.slice(0, 40)}`);
    });
  }

  // 7. Large unresolved open positions
  printSubsection('Resolution rate analysis');
  const totalOrders = allOrders.length;
  const openOrders = allOrders.filter(o => o.outcome === 'OPEN').length;
  const wonOrders = allOrders.filter(o => o.outcome === 'WON').length;
  const lostOrders = allOrders.filter(o => o.outcome === 'LOST').length;
  console.log(`  Total orders: ${totalOrders}`);
  console.log(`  Open: ${openOrders} (${fmt((openOrders / totalOrders) * 100, 1)}%)`);
  console.log(`  Won: ${wonOrders} (${fmt((wonOrders / totalOrders) * 100, 1)}%)`);
  console.log(`  Lost: ${lostOrders} (${fmt((lostOrders / totalOrders) * 100, 1)}%)`);
  console.log(`  Resolution rate: ${fmt(((wonOrders + lostOrders) / totalOrders) * 100, 1)}%`);

  // 8. Check if open positions have past market_end_time (should be resolved)
  printSubsection('Open orders past market end time (should be resolved)');
  const now = new Date();
  const pastEnd = allOrders.filter(o => 
    o.outcome === 'OPEN' && o.market_end_time && new Date(o.market_end_time) < now
  );
  console.log(`  Open orders with market_end_time in the past: ${pastEnd.length}`);
  if (pastEnd.length > 0) {
    // Group by wallet
    const byWallet = new Map<string, number>();
    pastEnd.forEach(o => {
      byWallet.set(o.wallet_id, (byWallet.get(o.wallet_id) ?? 0) + 1);
    });
    Array.from(byWallet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([w, c]) => console.log(`    ${w}: ${c} orders`));
  }

  // 9. Stale syncs
  printSubsection('Stale sync detection');
  const staleWallets = analyses.filter(a => {
    if (!a.wallet.is_active || !a.wallet.last_sync_time) return false;
    const ageMs = Date.now() - new Date(a.wallet.last_sync_time).getTime();
    return ageMs > 4 * 60 * 60 * 1000; // More than 4 hours
  });
  if (staleWallets.length === 0) {
    console.log('  All active wallets synced within 4 hours.');
  } else {
    staleWallets.forEach(a => {
      const ageMin = Math.round((Date.now() - new Date(a.wallet.last_sync_time!).getTime()) / 60000);
      console.log(`  ${a.wallet.display_name}: last sync ${ageMin} min ago`);
    });
  }
}

// ============================================================================
// Report: Signal Quality Analysis
// ============================================================================
function printSignalAnalysis(analyses: WalletAnalysis[], allOrders: FTOrder[]) {
  printSection('SIGNAL QUALITY ANALYSIS');

  // 1. Model probability vs actual outcome
  printSubsection('Model Probability vs Outcome (for model-gated trades)');
  const modelOrders = allOrders.filter(o => o.model_probability !== null && o.model_probability > 0 && o.outcome !== 'OPEN');

  if (modelOrders.length > 0) {
    // Bucket by model probability
    const buckets = [
      { label: '50-55%', min: 0.50, max: 0.55 },
      { label: '55-60%', min: 0.55, max: 0.60 },
      { label: '60-65%', min: 0.60, max: 0.65 },
      { label: '65-70%', min: 0.65, max: 0.70 },
      { label: '70%+', min: 0.70, max: 1.01 },
    ];

    console.log(`  ${pad('ML Bucket', 12)} | ${padL('Trades', 8)} | ${padL('Won', 6)} | ${padL('Lost', 6)} | ${padL('WinRate', 9)} | ${padL('AvgPnL', 9)} | ${padL('TotalPnL', 10)}`);
    console.log('  ' + '-'.repeat(75));

    buckets.forEach(b => {
      const inBucket = modelOrders.filter(o => o.model_probability! >= b.min && o.model_probability! < b.max);
      if (inBucket.length === 0) return;
      const won = inBucket.filter(o => o.outcome === 'WON').length;
      const lost = inBucket.filter(o => o.outcome === 'LOST').length;
      const wr = (won + lost) > 0 ? won / (won + lost) : 0;
      const avgPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0) / inBucket.length;
      const totalPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(b.label, 12)} | ${padL(inBucket.length.toString(), 8)} | ${padL(won.toString(), 6)} | ${padL(lost.toString(), 6)} | ${padL(fmtPct(wr), 9)} | ${padL(fmtDollar(avgPnl), 9)} | ${padL(fmtDollar(totalPnl), 10)}`
      );
    });
  } else {
    console.log('  No resolved model-gated orders to analyze.');
  }

  // 2. Edge vs outcome
  printSubsection('Edge % vs Outcome');
  const edgeOrders = allOrders.filter(o => o.edge_pct !== null && o.outcome !== 'OPEN');

  if (edgeOrders.length > 0) {
    const edgeBuckets = [
      { label: 'Neg edge', min: -1.0, max: 0.0 },
      { label: '0-5%', min: 0.0, max: 0.05 },
      { label: '5-10%', min: 0.05, max: 0.10 },
      { label: '10-20%', min: 0.10, max: 0.20 },
      { label: '20-30%', min: 0.20, max: 0.30 },
      { label: '30%+', min: 0.30, max: 10.0 },
    ];

    console.log(`  ${pad('Edge Range', 12)} | ${padL('Trades', 8)} | ${padL('WinRate', 9)} | ${padL('AvgPnL', 9)} | ${padL('TotalPnL', 10)}`);
    console.log('  ' + '-'.repeat(58));

    edgeBuckets.forEach(b => {
      const inBucket = edgeOrders.filter(o => o.edge_pct! >= b.min && o.edge_pct! < b.max);
      if (inBucket.length === 0) return;
      const won = inBucket.filter(o => o.outcome === 'WON').length;
      const lost = inBucket.filter(o => o.outcome === 'LOST').length;
      const wr = (won + lost) > 0 ? won / (won + lost) : 0;
      const avgPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0) / inBucket.length;
      const totalPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(b.label, 12)} | ${padL(inBucket.length.toString(), 8)} | ${padL(fmtPct(wr), 9)} | ${padL(fmtDollar(avgPnl), 9)} | ${padL(fmtDollar(totalPnl), 10)}`
      );
    });
  }

  // 3. Trader WR vs actual outcome
  printSubsection('Trader Win Rate vs Actual Outcome');
  const wrOrders = allOrders.filter(o => o.trader_win_rate !== null && o.outcome !== 'OPEN');

  if (wrOrders.length > 0) {
    const wrBuckets = [
      { label: '<50%', min: 0, max: 0.50 },
      { label: '50-55%', min: 0.50, max: 0.55 },
      { label: '55-60%', min: 0.55, max: 0.60 },
      { label: '60-65%', min: 0.60, max: 0.65 },
      { label: '65-75%', min: 0.65, max: 0.75 },
      { label: '75%+', min: 0.75, max: 1.01 },
    ];

    console.log(`  ${pad('Trader WR', 12)} | ${padL('Trades', 8)} | ${padL('ActualWR', 10)} | ${padL('AvgPnL', 9)} | ${padL('TotalPnL', 10)}`);
    console.log('  ' + '-'.repeat(58));

    wrBuckets.forEach(b => {
      const inBucket = wrOrders.filter(o => o.trader_win_rate! >= b.min && o.trader_win_rate! < b.max);
      if (inBucket.length === 0) return;
      const won = inBucket.filter(o => o.outcome === 'WON').length;
      const lost = inBucket.filter(o => o.outcome === 'LOST').length;
      const wr = (won + lost) > 0 ? won / (won + lost) : 0;
      const avgPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0) / inBucket.length;
      const totalPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(b.label, 12)} | ${padL(inBucket.length.toString(), 8)} | ${padL(fmtPct(wr), 10)} | ${padL(fmtDollar(avgPnl), 9)} | ${padL(fmtDollar(totalPnl), 10)}`
      );
    });
  }

  // 4. Conviction vs outcome
  printSubsection('Trader Conviction vs Outcome');
  const convOrders = allOrders.filter(o => o.conviction !== null && o.conviction > 0 && o.outcome !== 'OPEN');

  if (convOrders.length > 0) {
    const convBuckets = [
      { label: '<1x', min: 0, max: 1.0 },
      { label: '1-1.5x', min: 1.0, max: 1.5 },
      { label: '1.5-2x', min: 1.5, max: 2.0 },
      { label: '2-3x', min: 2.0, max: 3.0 },
      { label: '3-5x', min: 3.0, max: 5.0 },
      { label: '5x+', min: 5.0, max: 10000 },
    ];

    console.log(`  ${pad('Conviction', 12)} | ${padL('Trades', 8)} | ${padL('WinRate', 9)} | ${padL('AvgPnL', 9)} | ${padL('TotalPnL', 10)}`);
    console.log('  ' + '-'.repeat(58));

    convBuckets.forEach(b => {
      const inBucket = convOrders.filter(o => o.conviction! >= b.min && o.conviction! < b.max);
      if (inBucket.length === 0) return;
      const won = inBucket.filter(o => o.outcome === 'WON').length;
      const lost = inBucket.filter(o => o.outcome === 'LOST').length;
      const wr = (won + lost) > 0 ? won / (won + lost) : 0;
      const avgPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0) / inBucket.length;
      const totalPnl = inBucket.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(b.label, 12)} | ${padL(inBucket.length.toString(), 8)} | ${padL(fmtPct(wr), 9)} | ${padL(fmtDollar(avgPnl), 9)} | ${padL(fmtDollar(totalPnl), 10)}`
      );
    });
  }
}

// ============================================================================
// Report: Top/Bottom Traders
// ============================================================================
function printTraderAnalysis(allOrders: FTOrder[]) {
  printSection('TRADER ANALYSIS');

  const resolvedOrders = allOrders.filter(o => o.outcome !== 'OPEN' && o.trader_address);
  const traderMap = new Map<string, { wins: number; losses: number; pnl: number; orders: number }>();

  resolvedOrders.forEach(o => {
    const addr = o.trader_address;
    if (!traderMap.has(addr)) traderMap.set(addr, { wins: 0, losses: 0, pnl: 0, orders: 0 });
    const t = traderMap.get(addr)!;
    t.orders++;
    if (o.outcome === 'WON') t.wins++;
    else t.losses++;
    t.pnl += o.pnl ?? 0;
  });

  const traders = Array.from(traderMap.entries())
    .map(([addr, stats]) => ({ addr, ...stats, winRate: stats.orders > 0 ? stats.wins / stats.orders : 0 }))
    .filter(t => t.orders >= 3);

  // Top by PnL
  printSubsection('Top 10 Traders by PnL (min 3 resolved trades)');
  const byPnl = [...traders].sort((a, b) => b.pnl - a.pnl).slice(0, 10);
  byPnl.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.addr.slice(0, 10)}... | ${t.orders} trades | WR ${fmtPct(t.winRate)} | PnL ${fmtDollar(t.pnl)}`);
  });

  // Bottom by PnL
  printSubsection('Bottom 10 Traders by PnL (min 3 resolved trades)');
  const bottomPnl = [...traders].sort((a, b) => a.pnl - b.pnl).slice(0, 10);
  bottomPnl.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.addr.slice(0, 10)}... | ${t.orders} trades | WR ${fmtPct(t.winRate)} | PnL ${fmtDollar(t.pnl)}`);
  });

  // Summary stats
  printSubsection('Trader Distribution');
  const allTraders = Array.from(traderMap.values());
  const totalUniqueTraders = traderMap.size;
  const profitableTraders = allTraders.filter(t => t.pnl > 0).length;
  const losingTraders = allTraders.filter(t => t.pnl < 0).length;
  console.log(`  Total unique traders: ${totalUniqueTraders}`);
  console.log(`  Profitable: ${profitableTraders} (${fmt((profitableTraders / totalUniqueTraders) * 100, 1)}%)`);
  console.log(`  Losing: ${losingTraders} (${fmt((losingTraders / totalUniqueTraders) * 100, 1)}%)`);
}

// ============================================================================
// Report: Market Analysis
// ============================================================================
function printMarketAnalysis(allOrders: FTOrder[]) {
  printSection('MARKET ANALYSIS');

  const resolvedOrders = allOrders.filter(o => o.outcome !== 'OPEN' && o.condition_id);
  const marketMap = new Map<string, { title: string; wins: number; losses: number; pnl: number; orders: number }>();

  resolvedOrders.forEach(o => {
    const cid = o.condition_id;
    if (!marketMap.has(cid)) marketMap.set(cid, { title: o.market_title || cid, wins: 0, losses: 0, pnl: 0, orders: 0 });
    const m = marketMap.get(cid)!;
    m.orders++;
    if (o.outcome === 'WON') m.wins++;
    else m.losses++;
    m.pnl += o.pnl ?? 0;
  });

  // Markets with most exposure
  printSubsection('Markets by total PnL impact (most impactful)');
  const byImpact = Array.from(marketMap.entries())
    .map(([cid, stats]) => ({ cid, ...stats }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 15);

  byImpact.forEach((m, i) => {
    const wr = m.orders > 0 ? m.wins / m.orders : 0;
    console.log(`  ${i + 1}. ${m.title?.slice(0, 50) || m.cid.slice(0, 20)} | ${m.orders} orders | WR ${fmtPct(wr)} | PnL ${fmtDollar(m.pnl)}`);
  });

  // Total market count
  printSubsection('Market distribution');
  const uniqueMarkets = new Set(allOrders.map(o => o.condition_id).filter(Boolean)).size;
  const uniqueSlugs = new Set(allOrders.map(o => o.market_slug).filter(Boolean)).size;
  console.log(`  Unique condition_ids: ${uniqueMarkets}`);
  console.log(`  Unique market_slugs: ${uniqueSlugs}`);
  console.log(`  Total resolved across markets: ${resolvedOrders.length}`);
}

// ============================================================================
// Report: Key Insights Summary
// ============================================================================
function printKeyInsights(analyses: WalletAnalysis[], allOrders: FTOrder[]) {
  printSection('KEY INSIGHTS & EARLY LEARNINGS');

  const withResolved = analyses.filter(a => a.resolvedTrades >= 3);

  if (withResolved.length === 0) {
    console.log('  Not enough resolved trades for meaningful insights.');
    return;
  }

  // 1. Best performing strategy
  const best = [...withResolved].sort((a, b) => b.realizedPnl - a.realizedPnl)[0];
  console.log(`\n  1. BEST STRATEGY: ${best.wallet.display_name}`);
  console.log(`     PnL: ${fmtDollar(best.realizedPnl)} | WR: ${fmtPct(best.winRate)} | Trades: ${best.resolvedTrades}`);
  console.log(`     Config: use_model=${best.wallet.use_model}, edge>=${best.wallet.min_edge}, threshold=${best.wallet.model_threshold ?? 'none'}`);

  // 2. Worst performing strategy
  const worst = [...withResolved].sort((a, b) => a.realizedPnl - b.realizedPnl)[0];
  console.log(`\n  2. WORST STRATEGY: ${worst.wallet.display_name}`);
  console.log(`     PnL: ${fmtDollar(worst.realizedPnl)} | WR: ${fmtPct(worst.winRate)} | Trades: ${worst.resolvedTrades}`);
  console.log(`     Config: use_model=${worst.wallet.use_model}, edge>=${worst.wallet.min_edge}, threshold=${worst.wallet.model_threshold ?? 'none'}`);

  // 3. Average win size vs loss size across all
  const allResolved = allOrders.filter(o => o.outcome !== 'OPEN');
  const allWins = allResolved.filter(o => o.outcome === 'WON');
  const allLosses = allResolved.filter(o => o.outcome === 'LOST');
  const avgWin = allWins.length > 0 ? allWins.reduce((s, o) => s + (o.pnl ?? 0), 0) / allWins.length : 0;
  const avgLoss = allLosses.length > 0 ? allLosses.reduce((s, o) => s + (o.pnl ?? 0), 0) / allLosses.length : 0;
  const winLossRatio = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;
  const overallWR = allResolved.length > 0 ? allWins.length / allResolved.length : 0;

  console.log(`\n  3. WIN/LOSS ASYMMETRY (all strategies combined):`);
  console.log(`     Overall WR: ${fmtPct(overallWR)} (${allWins.length}W / ${allLosses.length}L)`);
  console.log(`     Avg Win: ${fmtDollar(avgWin)} | Avg Loss: ${fmtDollar(avgLoss)}`);
  console.log(`     Win:Loss Ratio: ${fmt(winLossRatio, 2)}:1`);
  if (overallWR < 0.5 && winLossRatio > 1) {
    console.log(`     -> Win rate is below 50% but wins are ${fmt(winLossRatio, 1)}x bigger than losses.`);
    console.log(`        This is EXPECTED for underdog-heavy strategies. PnL can be positive even with low WR.`);
  }

  // 4. Model impact
  const modelStrats = withResolved.filter(a => a.wallet.use_model);
  const noModelStrats = withResolved.filter(a => !a.wallet.use_model);
  const modelTrades = modelStrats.reduce((s, a) => s + a.resolvedTrades, 0);
  const noModelTrades = noModelStrats.reduce((s, a) => s + a.resolvedTrades, 0);
  const modelPnl = modelStrats.reduce((s, a) => s + a.realizedPnl, 0);
  const noModelPnl = noModelStrats.reduce((s, a) => s + a.realizedPnl, 0);
  const modelWR = modelTrades > 0 ? modelStrats.reduce((s, a) => s + a.wins, 0) / modelTrades : 0;
  const noModelWR = noModelTrades > 0 ? noModelStrats.reduce((s, a) => s + a.wins, 0) / noModelTrades : 0;

  console.log(`\n  4. MODEL IMPACT:`);
  console.log(`     Model ON:  ${modelStrats.length} strats, ${modelTrades} resolved, WR ${fmtPct(modelWR)}, PnL ${fmtDollar(modelPnl)}`);
  console.log(`     Model OFF: ${noModelStrats.length} strats, ${noModelTrades} resolved, WR ${fmtPct(noModelWR)}, PnL ${fmtDollar(noModelPnl)}`);
  if (modelTrades > 0 && noModelTrades > 0) {
    const pnlPerTradeModel = modelPnl / modelTrades;
    const pnlPerTradeNoModel = noModelPnl / noModelTrades;
    console.log(`     PnL/trade: Model ${fmtDollar(pnlPerTradeModel)} vs No-Model ${fmtDollar(pnlPerTradeNoModel)}`);
    console.log(`     -> Model strategies ${pnlPerTradeModel > pnlPerTradeNoModel ? 'OUTPERFORM' : 'UNDERPERFORM'} on per-trade basis`);
  }

  // 5. Resolution rate concern
  const totalOpen = allOrders.filter(o => o.outcome === 'OPEN').length;
  const totalAll = allOrders.length;
  const resolutionRate = totalAll > 0 ? ((totalAll - totalOpen) / totalAll) * 100 : 0;
  console.log(`\n  5. RESOLUTION RATE: ${fmt(resolutionRate, 1)}% (${totalAll - totalOpen}/${totalAll})`);
  if (resolutionRate < 30) {
    console.log(`     -> LOW resolution rate. Most trades are still open.`);
    console.log(`        Current results are PRELIMINARY. Wait for more markets to resolve.`);
  } else if (resolutionRate < 60) {
    console.log(`     -> Moderate resolution rate. Results becoming meaningful but still early.`);
  } else {
    console.log(`     -> Good resolution rate. Results have reasonable statistical significance.`);
  }

  // 6. Entry price sweet spot
  const priceRanges = [
    { label: '0-20¢ (longshots)', min: 0, max: 0.20 },
    { label: '20-40¢ (underdogs)', min: 0.20, max: 0.40 },
    { label: '40-60¢ (mid-range)', min: 0.40, max: 0.60 },
    { label: '60-80¢ (favorites)', min: 0.60, max: 0.80 },
    { label: '80-100¢ (heavy fav)', min: 0.80, max: 1.0 },
  ];

  console.log(`\n  6. ENTRY PRICE SWEET SPOT:`);
  const resolvedAll = allOrders.filter(o => o.outcome !== 'OPEN');
  priceRanges.forEach(r => {
    const inRange = resolvedAll.filter(o => o.entry_price >= r.min && o.entry_price < r.max);
    if (inRange.length === 0) return;
    const w = inRange.filter(o => o.outcome === 'WON').length;
    const wr = w / inRange.length;
    const pnl = inRange.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const avgPnlPerTrade = pnl / inRange.length;
    console.log(`     ${pad(r.label, 25)}: ${padL(inRange.length.toString(), 5)} trades, WR ${padL(fmtPct(wr), 6)}, PnL ${padL(fmtDollar(pnl), 9)}, $/trade ${padL(fmtDollar(avgPnlPerTrade), 7)}`);
  });

  // 7. Allocation method comparison
  printSubsection('Allocation Method Comparison');
  const methods = new Map<string, WalletAnalysis[]>();
  withResolved.forEach(a => {
    const m = a.wallet.allocation_method || 'UNKNOWN';
    if (!methods.has(m)) methods.set(m, []);
    methods.get(m)!.push(a);
  });

  methods.forEach((strats, method) => {
    const totalTrades = strats.reduce((s, a) => s + a.resolvedTrades, 0);
    const totalPnl = strats.reduce((s, a) => s + a.realizedPnl, 0);
    const totalWins = strats.reduce((s, a) => s + a.wins, 0);
    const wr = totalTrades > 0 ? totalWins / totalTrades : 0;
    console.log(`  ${pad(method, 15)}: ${strats.length} strats, ${totalTrades} trades, WR ${fmtPct(wr)}, PnL ${fmtDollar(totalPnl)}, $/trade ${fmtDollar(totalTrades > 0 ? totalPnl / totalTrades : 0)}`);
  });
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('  FORWARD TEST PERFORMANCE ANALYSIS');
  console.log('  ' + new Date().toISOString());
  console.log('█'.repeat(80));

  // Fetch data
  console.log('\nFetching data...');
  const [wallets, allOrders] = await Promise.all([
    fetchAllWallets(),
    fetchAllOrders(),
  ]);

  console.log(`  Wallets: ${wallets.length}`);
  console.log(`  Orders: ${allOrders.length}`);

  // Build analysis per wallet
  const ordersByWallet = new Map<string, FTOrder[]>();
  allOrders.forEach(o => {
    if (!ordersByWallet.has(o.wallet_id)) ordersByWallet.set(o.wallet_id, []);
    ordersByWallet.get(o.wallet_id)!.push(o);
  });

  const analyses: WalletAnalysis[] = wallets.map(w => {
    const orders = ordersByWallet.get(w.wallet_id) || [];
    return analyzeWallet(w, orders);
  });

  // Run all reports
  printLeaderboard(analyses);
  printWinRatePnlAnalysis(analyses);
  printModelComparison(analyses);
  printTierComparison(analyses);
  printAntiStrategyValidation(analyses);
  printAnomalyDetection(analyses, allOrders);
  printSignalAnalysis(analyses, allOrders);
  printTraderAnalysis(allOrders);
  printMarketAnalysis(allOrders);
  printKeyInsights(analyses, allOrders);

  console.log('\n' + '█'.repeat(80));
  console.log('  ANALYSIS COMPLETE');
  console.log('█'.repeat(80) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
