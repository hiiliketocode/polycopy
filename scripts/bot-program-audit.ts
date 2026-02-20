#!/usr/bin/env npx tsx
/**
 * Bot Program Audit & Optimization Report
 * ========================================
 * Comprehensive audit of all forward testing bots to:
 * - Group strategies into families and understand them
 * - Identify inactive/underperforming bots
 * - Analyze ML performance trends
 * - Detect configuration issues vs bad ideas
 * - Generate actionable recommendations (pause/modify/keep/create)
 * - Synthesize key learnings across all bots
 *
 * Run: npx tsx scripts/bot-program-audit.ts
 *      npx tsx scripts/bot-program-audit.ts --json   (JSON output for agent consumption)
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

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

const JSON_MODE = process.argv.includes('--json');
const ML_CHECK_MODE = process.argv.includes('--ml-check');

// ============================================================================
// Types
// ============================================================================
interface FTWallet {
  wallet_id: string;
  config_id: string;
  display_name: string;
  description: string;
  detailed_description: string;
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
  market_categories: string[] | null;
  target_traders: string[] | null;
  thesis_tier: string | null;
  hypothesis: string | null;
  total_trades: number;
  open_positions: number;
  trades_seen: number;
  trades_skipped: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  last_sync_time: string | null;
  created_at: string;
  updated_at: string;
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

interface Snapshot {
  wallet_id: string;
  snapshot_at: string;
  total_pnl: number;
  realized_pnl: number;
  unrealized_pnl: number;
  return_pct: number;
  total_trades: number;
  open_positions: number;
}

// ============================================================================
// Strategy Group Classification
// ============================================================================
type StrategyGroup =
  | 'ORIGINAL'
  | 'THESIS_T1'
  | 'THESIS_T2'
  | 'THESIS_T3'
  | 'THESIS_T4'
  | 'THESIS_T5'
  | 'ML_MIX'
  | 'ML_SWEEP'
  | 'ML_CONTEXT'
  | 'LEARNINGS'
  | 'LIVE'
  | 'SPECIAL'
  | 'ALPHA_AGENT'
  | 'PNL_ROTATION'
  | 'UNKNOWN';

function classifyStrategy(w: FTWallet): StrategyGroup {
  const id = w.wallet_id;

  // Alpha Agent
  if (id.startsWith('FT_ALPHA_') || id.startsWith('ALPHA_')) return 'ALPHA_AGENT';

  // Live Trading mirrors
  if (id.startsWith('FT_LIVE_')) return 'LIVE';

  // PnL rotation / top trader followers
  if (id.startsWith('FT_TOP_') || id.startsWith('TOP_')) return 'PNL_ROTATION';
  if (id.startsWith('TRADER_')) return 'PNL_ROTATION';

  // ML Sweep (threshold comparison) - check before ML_MIX
  if (id.includes('ML_SWEEP_')) return 'ML_SWEEP';

  // ML Context (category/filter variants) - check before ML_MIX
  if (id.includes('ML_CTX_')) return 'ML_CONTEXT';

  // ML Mix
  if (id.startsWith('FT_ML_') || id.includes('_ML_')) return 'ML_MIX';

  // Learnings
  if (id.includes('LEARNINGS') || id.includes('LEARN_')) return 'LEARNINGS';

  // Thesis tiers - handle both FT_ prefixed and non-prefixed
  if (id.match(/^(FT_)?T1_/)) return 'THESIS_T1';
  if (id.match(/^(FT_)?T0_/) || id === 'T0_CONTROL') return 'THESIS_T1'; // T0 control is baseline
  if (id.match(/^(FT_)?T2_/)) return 'THESIS_T2';
  if (id.match(/^(FT_)?T3_/)) return 'THESIS_T3';
  if (id.match(/^(FT_)?T4_/)) return 'THESIS_T4';
  if (id.match(/^(FT_)?T5_/)) return 'THESIS_T5';

  // Special strategies (S_ prefix)
  if (id.match(/^(FT_)?S_/)) return 'SPECIAL';

  // Sharpshooter V2 variants
  if (id.includes('SHARPSHOOTER_V2')) return 'SPECIAL';

  // Original 6
  if (['FT_HIGH_CONVICTION', 'FT_MODEL_BALANCED', 'FT_UNDERDOG_HUNTER',
       'FT_FAVORITE_GRINDER', 'FT_SHARP_SHOOTER', 'FT_MODEL_ONLY'].includes(id)) return 'ORIGINAL';

  // Fallback: check thesis_tier column
  if (w.thesis_tier) {
    if (w.thesis_tier.includes('T1')) return 'THESIS_T1';
    if (w.thesis_tier.includes('T2')) return 'THESIS_T2';
    if (w.thesis_tier.includes('T3')) return 'THESIS_T3';
    if (w.thesis_tier.includes('T4')) return 'THESIS_T4';
    if (w.thesis_tier.includes('T5')) return 'THESIS_T5';
  }

  return 'UNKNOWN';
}

const GROUP_LABELS: Record<StrategyGroup, string> = {
  ORIGINAL: 'Original Strategies (6 founding bots)',
  THESIS_T1: 'Thesis T1: Single Factor Isolation',
  THESIS_T2: 'Thesis T2: Price Band Tests',
  THESIS_T3: 'Thesis T3: Market Specialization',
  THESIS_T4: 'Thesis T4: Compound Strategies',
  THESIS_T5: 'Thesis T5: Anti-Strategies (control)',
  ML_MIX: 'ML Mix: ML + Other Filters',
  ML_SWEEP: 'ML Sweep: Threshold Comparison',
  ML_CONTEXT: 'ML Context: Category & Filter Variants',
  LEARNINGS: 'Learnings: Hypothesis-Driven Iterations',
  LIVE: 'Live Trading FT Mirrors',
  SPECIAL: 'Special: Edge Cases & Experiments',
  ALPHA_AGENT: 'Alpha Agent: AI-Managed Bots',
  PNL_ROTATION: 'PnL Rotation: Top Trader Followers',
  UNKNOWN: 'Uncategorized',
};

const GROUP_ORDER: StrategyGroup[] = [
  'ORIGINAL', 'THESIS_T1', 'THESIS_T2', 'THESIS_T3', 'THESIS_T4', 'THESIS_T5',
  'ML_MIX', 'ML_SWEEP', 'ML_CONTEXT', 'LEARNINGS', 'LIVE', 'SPECIAL',
  'ALPHA_AGENT', 'PNL_ROTATION', 'UNKNOWN',
];

// ============================================================================
// Helpers
// ============================================================================
const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDollar = (n: number) => `$${n.toFixed(2)}`;
const pad = (s: string, len: number) => s.padEnd(len);
const padL = (s: string, len: number) => s.padStart(len);

function hr(char = '=', len = 100) { console.log(char.repeat(len)); }
function section(title: string) {
  console.log(`\n${'='.repeat(100)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(100)}`);
}
function subsection(title: string) { console.log(`\n  --- ${title} ---`); }

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// Data Fetching
// ============================================================================
async function fetchResolvedOrders(): Promise<FTOrder[]> {
  const all: FTOrder[] = [];
  const PAGE = 500;
  let offset = 0;
  let more = true;
  let retries = 0;

  while (more) {
    const { data, error } = await supabase
      .from('ft_orders')
      .select('order_id,wallet_id,side,market_slug,condition_id,market_title,token_label,source_trade_id,trader_address,entry_price,size,market_end_time,trader_win_rate,trader_roi,trader_resolved_count,model_probability,edge_pct,conviction,outcome,winning_label,pnl,order_time,resolved_time,created_at')
      .in('outcome', ['WON', 'LOST'])
      .order('order_time', { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      if (retries < 3) {
        retries++;
        console.error(`  Retry ${retries}/3 fetching orders at offset ${offset}: ${error.message}`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      console.error('Error fetching resolved orders (giving up):', error.message);
      break;
    }

    retries = 0;
    if (data && data.length > 0) {
      all.push(...(data as FTOrder[]));
      offset += data.length;
      more = data.length === PAGE;
      if (all.length % 5000 === 0) console.log(`  ... fetched ${all.length} resolved orders so far`);
    } else {
      more = false;
    }
  }
  return all;
}

async function fetchAllWallets(): Promise<FTWallet[]> {
  const { data, error } = await supabase.from('ft_wallets').select('*').order('wallet_id');
  if (error) { console.error('Error fetching wallets:', error.message); return []; }
  return (data || []) as FTWallet[];
}

interface WalletOrderSummary {
  wallet_id: string;
  won: number;
  lost: number;
  total_won_pnl: number;
  total_lost_pnl: number;
}

async function fetchWalletOrderSummaries(walletIds: string[]): Promise<Map<string, WalletOrderSummary>> {
  const summaries = new Map<string, WalletOrderSummary>();
  const BATCH = 10;

  for (let i = 0; i < walletIds.length; i += BATCH) {
    const batch = walletIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (wid) => {
      const [wonRes, lostRes] = await Promise.all([
        supabase.from('ft_orders').select('pnl', { count: 'exact', head: false })
          .eq('wallet_id', wid).eq('outcome', 'WON').limit(10000),
        supabase.from('ft_orders').select('pnl', { count: 'exact', head: false })
          .eq('wallet_id', wid).eq('outcome', 'LOST').limit(10000),
      ]);
      const won = wonRes.data?.length ?? 0;
      const lost = lostRes.data?.length ?? 0;
      const totalWonPnl = wonRes.data?.reduce((s: number, o: any) => s + (Number(o.pnl) || 0), 0) ?? 0;
      const totalLostPnl = lostRes.data?.reduce((s: number, o: any) => s + (Number(o.pnl) || 0), 0) ?? 0;
      return { wallet_id: wid, won, lost, total_won_pnl: totalWonPnl, total_lost_pnl: totalLostPnl };
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') summaries.set(r.value.wallet_id, r.value);
    }
    if ((i + BATCH) % 50 === 0 && i > 0) console.log(`  ... summarized ${Math.min(i + BATCH, walletIds.length)}/${walletIds.length} wallets`);
  }
  return summaries;
}

async function fetchSnapshots(): Promise<Snapshot[]> {
  const all: Snapshot[] = [];
  const PAGE = 1000;
  let offset = 0;
  let more = true;
  while (more) {
    const { data, error } = await supabase
      .from('ft_performance_snapshots')
      .select('wallet_id, snapshot_at, total_pnl, realized_pnl, unrealized_pnl, return_pct, total_trades, open_positions')
      .order('snapshot_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (error.message.includes('could not find') || error.message.includes('schema cache')) {
        console.log('  Snapshots table not available (migration may not have run). Skipping trend analysis.');
      } else {
        console.error('Error fetching snapshots:', error.message);
      }
      break;
    }
    if (data && data.length > 0) { all.push(...(data as Snapshot[])); offset += data.length; more = data.length === PAGE; }
    else more = false;
  }
  return all;
}

// ============================================================================
// Bot Analysis
// ============================================================================
interface BotAnalysis {
  wallet: FTWallet;
  group: StrategyGroup;
  orders: FTOrder[];
  totalTrades: number;
  openTrades: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  realizedPnl: number;
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
  uniqueMarkets: number;
  uniqueTraders: number;
  daysActive: number;
  tradesPerDay: number;
  // Health flags
  isInactive: boolean;
  isLowActivity: boolean;
  isStaleSync: boolean;
  hasConfigIssue: boolean;
  configIssueDetail: string;
}

function analyzeBot(w: FTWallet, orders: FTOrder[], summary?: WalletOrderSummary): BotAnalysis {
  const group = classifyStrategy(w);

  const totalTrades = w.total_trades || orders.length;
  const openTrades = w.open_positions || 0;
  const totalPnl = w.total_pnl || 0;

  // Prefer wallet summary (complete counts) over partial order fetch
  const wins = summary?.won ?? orders.filter(o => o.outcome === 'WON').length;
  const losses = summary?.lost ?? orders.filter(o => o.outcome === 'LOST').length;
  const resolvedTrades = wins + losses;
  const winRate = resolvedTrades > 0 ? wins / resolvedTrades : 0;
  const realizedPnl = summary
    ? (summary.total_won_pnl + summary.total_lost_pnl)
    : orders.filter(o => o.outcome !== 'OPEN').reduce((s, o) => s + (o.pnl ?? 0), 0);

  const wonOrders = orders.filter(o => o.outcome === 'WON');
  const lostOrders = orders.filter(o => o.outcome === 'LOST');

  const totalInvested = orders.reduce((s, o) => s + (o.size ?? 0), 0);
  const avgTradeSize = orders.length > 0 ? totalInvested / orders.length : 0;
  const avgEntryPrice = orders.length > 0 ? orders.reduce((s, o) => s + (o.entry_price ?? 0), 0) / orders.length : 0;
  const avgWinPnl = wonOrders.length > 0 ? wonOrders.reduce((s, o) => s + (o.pnl ?? 0), 0) / wonOrders.length : 0;
  const avgLossPnl = lostOrders.length > 0 ? lostOrders.reduce((s, o) => s + (o.pnl ?? 0), 0) / lostOrders.length : 0;
  const totalWin = wonOrders.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const totalLoss = Math.abs(lostOrders.reduce((s, o) => s + (o.pnl ?? 0), 0));
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : (totalWin > 0 ? Infinity : 0);
  const roi = totalInvested > 0 ? (realizedPnl / totalInvested) * 100 : 0;

  const edgeOrders = orders.filter(o => o.edge_pct != null);
  const avgEdge = edgeOrders.length > 0 ? edgeOrders.reduce((s, o) => s + (o.edge_pct ?? 0), 0) / edgeOrders.length : 0;
  const mlOrders = orders.filter(o => o.model_probability != null && o.model_probability > 0);
  const avgModelProb = mlOrders.length > 0 ? mlOrders.reduce((s, o) => s + (o.model_probability ?? 0), 0) / mlOrders.length : null;
  const wrOrders = orders.filter(o => o.trader_win_rate != null);
  const avgTraderWR = wrOrders.length > 0 ? wrOrders.reduce((s, o) => s + (o.trader_win_rate ?? 0), 0) / wrOrders.length : null;
  const convOrders = orders.filter(o => o.conviction != null && o.conviction > 0);
  const avgConviction = convOrders.length > 0 ? convOrders.reduce((s, o) => s + (o.conviction ?? 0), 0) / convOrders.length : null;

  const uniqueMarkets = new Set(orders.map(o => o.condition_id).filter(Boolean)).size;
  const uniqueTraders = new Set(orders.map(o => o.trader_address).filter(Boolean)).size;
  const daysActive = daysSince(w.created_at);
  const tradesPerDay = daysActive > 0 ? totalTrades / daysActive : 0;

  // Health checks - use wallet-level total_trades (always accurate)
  const isInactive = w.is_active && totalTrades === 0 && daysActive > 2;
  const isLowActivity = w.is_active && totalTrades > 0 && totalTrades < 5 && daysActive > 5;
  const syncAgeMs = w.last_sync_time ? Date.now() - new Date(w.last_sync_time).getTime() : Infinity;
  const isStaleSync = w.is_active && syncAgeMs > 6 * 60 * 60 * 1000;

  let hasConfigIssue = false;
  let configIssueDetail = '';
  if (w.is_active && totalTrades === 0 && daysActive > 5) {
    hasConfigIssue = true;
    configIssueDetail = `Zero trades after ${fmt(daysActive, 0)} days. Filters may be too strict or no matching market activity.`;
  } else if (w.is_active && totalTrades > 0 && totalTrades < 3 && daysActive > 7) {
    hasConfigIssue = true;
    configIssueDetail = `Only ${totalTrades} trades in ${fmt(daysActive, 0)} days. Very selective - may need relaxed filters.`;
  }

  return {
    wallet: w, group, orders, totalTrades, openTrades,
    resolvedTrades, wins, losses, winRate, realizedPnl, totalPnl,
    avgTradeSize, avgEntryPrice, avgWinPnl, avgLossPnl, profitFactor, roi,
    avgEdge, avgModelProb, avgTraderWR, avgConviction,
    uniqueMarkets, uniqueTraders, daysActive, tradesPerDay,
    isInactive, isLowActivity, isStaleSync, hasConfigIssue, configIssueDetail,
  };
}

// ============================================================================
// SECTION 1: Executive Overview
// ============================================================================
function printExecutiveOverview(bots: BotAnalysis[]) {
  section('1. EXECUTIVE OVERVIEW');
  const active = bots.filter(b => b.wallet.is_active);
  const inactive = bots.filter(b => !b.wallet.is_active);
  const withTrades = bots.filter(b => b.totalTrades > 0);
  const withResolved = bots.filter(b => b.resolvedTrades >= 3);
  const profitable = withResolved.filter(b => b.realizedPnl > 0);
  const totalRealizedPnl = withResolved.reduce((s, b) => s + b.realizedPnl, 0);
  const totalTrades = bots.reduce((s, b) => s + b.totalTrades, 0);
  const totalResolved = bots.reduce((s, b) => s + b.resolvedTrades, 0);

  console.log(`\n  Total bots:         ${bots.length} (${active.length} active, ${inactive.length} paused)`);
  console.log(`  Bots with trades:   ${withTrades.length}`);
  console.log(`  Bots w/ 3+ resolved: ${withResolved.length}`);
  console.log(`  Profitable bots:    ${profitable.length}/${withResolved.length} (${withResolved.length > 0 ? fmt((profitable.length / withResolved.length) * 100, 0) : 0}%)`);
  console.log(`  Total trades:       ${totalTrades} (${totalResolved} resolved, ${totalTrades - totalResolved} open)`);
  console.log(`  Total realized PnL: ${fmtDollar(totalRealizedPnl)}`);
  console.log(`  Resolution rate:    ${totalTrades > 0 ? fmtPct(totalResolved / totalTrades) : 'N/A'}`);

  // Group distribution
  subsection('Strategy Family Distribution');
  const groups = new Map<StrategyGroup, BotAnalysis[]>();
  bots.forEach(b => {
    if (!groups.has(b.group)) groups.set(b.group, []);
    groups.get(b.group)!.push(b);
  });

  console.log(`  ${pad('Group', 45)} | ${padL('Bots', 5)} | ${padL('Active', 7)} | ${padL('Trades', 7)} | ${padL('Resolved', 9)} | ${padL('Realized$', 11)} | ${padL('Profitable', 11)}`);
  console.log(`  ${'-'.repeat(100)}`);

  for (const g of GROUP_ORDER) {
    const gb = groups.get(g);
    if (!gb || gb.length === 0) continue;
    const gActive = gb.filter(b => b.wallet.is_active).length;
    const gTrades = gb.reduce((s, b) => s + b.totalTrades, 0);
    const gResolved = gb.reduce((s, b) => s + b.resolvedTrades, 0);
    const gPnl = gb.reduce((s, b) => s + b.realizedPnl, 0);
    const gProfitable = gb.filter(b => b.resolvedTrades >= 3 && b.realizedPnl > 0).length;
    const gWithResolved = gb.filter(b => b.resolvedTrades >= 3).length;
    console.log(
      `  ${pad(GROUP_LABELS[g].slice(0, 43), 45)} | ${padL(gb.length.toString(), 5)} | ${padL(gActive.toString(), 7)} | ${padL(gTrades.toString(), 7)} | ${padL(gResolved.toString(), 9)} | ${padL(fmtDollar(gPnl), 11)} | ${padL(gWithResolved > 0 ? `${gProfitable}/${gWithResolved}` : '-', 11)}`
    );
  }
}

// ============================================================================
// SECTION 2: Health Check & Problem Bots
// ============================================================================
function printHealthCheck(bots: BotAnalysis[]) {
  section('2. HEALTH CHECK: PROBLEM BOTS');

  // 2a: Inactive bots (0 trades after multiple days)
  subsection('2a. Inactive Bots (0 trades, active for 2+ days)');
  const inactive = bots.filter(b => b.isInactive);
  if (inactive.length === 0) {
    console.log('  None found - all active bots have trades.');
  } else {
    console.log(`  Found ${inactive.length} inactive bots:\n`);
    inactive.forEach(b => {
      const sync = b.wallet.last_sync_time
        ? `${Math.round((Date.now() - new Date(b.wallet.last_sync_time).getTime()) / 60000)} min ago`
        : 'NEVER';
      console.log(`  [INACTIVE] ${b.wallet.display_name} (${b.wallet.wallet_id})`);
      console.log(`    Active for: ${fmt(b.daysActive, 1)} days | Last sync: ${sync}`);
      console.log(`    Seen: ${b.wallet.trades_seen} | Skipped: ${b.wallet.trades_skipped}`);
      if (b.hasConfigIssue) console.log(`    CONFIG ISSUE: ${b.configIssueDetail}`);
      console.log('');
    });
  }

  // 2b: Low activity bots
  subsection('2b. Low Activity Bots (<5 trades after 5+ days)');
  const lowActivity = bots.filter(b => b.isLowActivity);
  if (lowActivity.length === 0) {
    console.log('  None found.');
  } else {
    console.log(`  Found ${lowActivity.length} low-activity bots:\n`);
    lowActivity.forEach(b => {
      console.log(`  [LOW-ACTIVITY] ${b.wallet.display_name} (${b.wallet.wallet_id})`);
      console.log(`    Trades: ${b.totalTrades} in ${fmt(b.daysActive, 1)} days (${fmt(b.tradesPerDay, 2)}/day)`);
      console.log(`    Skip rate: ${b.wallet.trades_seen > 0 ? fmtPct(b.wallet.trades_skipped / b.wallet.trades_seen) : 'N/A'}`);
      if (b.hasConfigIssue) console.log(`    CONFIG ISSUE: ${b.configIssueDetail}`);
      console.log('');
    });
  }

  // 2c: Config issues
  subsection('2c. Configuration Issues (seeing trades but skipping nearly all)');
  const configIssues = bots.filter(b => b.hasConfigIssue && !b.isInactive);
  if (configIssues.length === 0) {
    console.log('  None found.');
  } else {
    configIssues.forEach(b => {
      console.log(`  [CONFIG] ${b.wallet.display_name}: ${b.configIssueDetail}`);
    });
  }

  // 2d: Stale syncs
  subsection('2d. Stale Syncs (active but last sync > 6 hours ago)');
  const stale = bots.filter(b => b.isStaleSync);
  if (stale.length === 0) {
    console.log('  All active bots syncing normally.');
  } else {
    stale.forEach(b => {
      const mins = Math.round((Date.now() - new Date(b.wallet.last_sync_time!).getTime()) / 60000);
      console.log(`  [STALE] ${b.wallet.display_name}: last sync ${mins} min ago`);
    });
  }

  // Summary
  const problemCount = new Set([...inactive, ...lowActivity, ...configIssues, ...stale].map(b => b.wallet.wallet_id)).size;
  console.log(`\n  HEALTH SUMMARY: ${problemCount} bots with issues out of ${bots.filter(b => b.wallet.is_active).length} active bots`);
}

// ============================================================================
// SECTION 3: Strategy Group Deep Dives
// ============================================================================
function printGroupDeepDives(bots: BotAnalysis[]) {
  section('3. STRATEGY GROUP DEEP DIVES');

  const groups = new Map<StrategyGroup, BotAnalysis[]>();
  bots.forEach(b => {
    if (!groups.has(b.group)) groups.set(b.group, []);
    groups.get(b.group)!.push(b);
  });

  for (const g of GROUP_ORDER) {
    const gb = groups.get(g);
    if (!gb || gb.length === 0) continue;

    subsection(`${GROUP_LABELS[g]}`);

    // Group summary
    const withResolved = gb.filter(b => b.resolvedTrades >= 1);
    const totalTrades = gb.reduce((s, b) => s + b.totalTrades, 0);
    const totalResolved = gb.reduce((s, b) => s + b.resolvedTrades, 0);
    const totalWins = gb.reduce((s, b) => s + b.wins, 0);
    const totalPnl = gb.reduce((s, b) => s + b.realizedPnl, 0);
    const wr = totalResolved > 0 ? totalWins / totalResolved : 0;
    console.log(`  Group totals: ${gb.length} bots | ${totalTrades} trades | ${totalResolved} resolved | WR ${fmtPct(wr)} | PnL ${fmtDollar(totalPnl)}`);

    // Individual bot table
    console.log(`\n  ${pad('Bot', 32)} | ${padL('Trds', 5)} | ${padL('Rslvd', 6)} | ${padL('WR', 7)} | ${padL('PnL', 10)} | ${padL('$/trade', 9)} | ${padL('PF', 5)} | ${padL('ML?', 4)} | ${padL('Trds/d', 7)} | Status`);
    console.log(`  ${'-'.repeat(110)}`);

    const sorted = [...gb].sort((a, b) => b.realizedPnl - a.realizedPnl);
    sorted.forEach(b => {
      const wr = b.resolvedTrades > 0 ? fmtPct(b.winRate) : 'N/A';
      const pnlPerTrade = b.resolvedTrades > 0 ? fmtDollar(b.realizedPnl / b.resolvedTrades) : 'N/A';
      const pf = b.profitFactor === Infinity ? 'INF' : fmt(b.profitFactor, 1);
      const ml = b.wallet.use_model ? 'Yes' : 'No';

      let status = '';
      if (!b.wallet.is_active) status = '[PAUSED]';
      else if (b.isInactive) status = '[INACTIVE]';
      else if (b.isLowActivity) status = '[LOW-ACT]';
      else if (b.hasConfigIssue) status = '[CONFIG]';
      else if (b.resolvedTrades < 3) status = '[EARLY]';
      else if (b.realizedPnl > 0) status = '[OK]';
      else status = '[LOSING]';

      console.log(
        `  ${pad(b.wallet.display_name.slice(0, 30), 32)} | ${padL(b.totalTrades.toString(), 5)} | ${padL(b.resolvedTrades.toString(), 6)} | ${padL(wr, 7)} | ${padL(fmtDollar(b.realizedPnl), 10)} | ${padL(pnlPerTrade, 9)} | ${padL(pf, 5)} | ${padL(ml, 4)} | ${padL(fmt(b.tradesPerDay, 1), 7)} | ${status}`
      );
    });

    // Group-specific insights
    if (withResolved.length >= 2) {
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      console.log(`\n  Group insight: Best = ${best.wallet.display_name} (${fmtDollar(best.realizedPnl)}), Worst = ${worst.wallet.display_name} (${fmtDollar(worst.realizedPnl)})`);

      if (g === 'ML_SWEEP') {
        console.log('  ML Sweep finding: Compare thresholds to find the sweet spot.');
        sorted.forEach(b => {
          const thresh = b.wallet.model_threshold ?? 'N/A';
          console.log(`    Threshold ${thresh}: ${b.totalTrades} trades, WR ${b.resolvedTrades > 0 ? fmtPct(b.winRate) : 'N/A'}, PnL ${fmtDollar(b.realizedPnl)}`);
        });
      }
    }
    console.log('');
  }
}

// ============================================================================
// SECTION 4: ML Performance Analysis
// ============================================================================
function printMLAnalysis(bots: BotAnalysis[], allOrders: FTOrder[], snapshots: Snapshot[]) {
  section('4. ML MODEL PERFORMANCE ANALYSIS');

  // 4a: ML vs Non-ML aggregate
  subsection('4a. ML-Gated vs Non-ML Bots (Aggregate)');
  const mlBots = bots.filter(b => b.wallet.use_model && b.resolvedTrades >= 3);
  const noMlBots = bots.filter(b => !b.wallet.use_model && b.resolvedTrades >= 3);

  const summarizeGroup = (group: BotAnalysis[], label: string) => {
    const totalTrades = group.reduce((s, b) => s + b.resolvedTrades, 0);
    const totalWins = group.reduce((s, b) => s + b.wins, 0);
    const totalPnl = group.reduce((s, b) => s + b.realizedPnl, 0);
    const wr = totalTrades > 0 ? totalWins / totalTrades : 0;
    const pnlPerTrade = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const profitable = group.filter(b => b.realizedPnl > 0).length;
    console.log(`  ${pad(label, 22)}: ${group.length} bots | ${totalTrades} trades | WR ${fmtPct(wr)} | PnL ${fmtDollar(totalPnl)} | $/trade ${fmtDollar(pnlPerTrade)} | ${profitable}/${group.length} profitable`);
  };

  summarizeGroup(mlBots, 'ML-Gated (use_model)');
  summarizeGroup(noMlBots, 'Non-ML');

  // 4b: ML threshold buckets across ALL orders
  subsection('4b. ML Score Bucket Performance (all resolved orders with ML score)');
  const mlResolved = allOrders.filter(o => o.model_probability != null && o.model_probability > 0 && o.outcome !== 'OPEN');

  if (mlResolved.length > 0) {
    const buckets = [
      { label: '<50%', min: 0, max: 0.50 },
      { label: '50-55%', min: 0.50, max: 0.55 },
      { label: '55-60%', min: 0.55, max: 0.60 },
      { label: '60-65%', min: 0.60, max: 0.65 },
      { label: '65-70%', min: 0.65, max: 0.70 },
      { label: '70-80%', min: 0.70, max: 0.80 },
      { label: '80%+', min: 0.80, max: 1.01 },
    ];

    console.log(`  ${pad('ML Bucket', 12)} | ${padL('Trades', 7)} | ${padL('Won', 5)} | ${padL('Lost', 5)} | ${padL('WR', 7)} | ${padL('Avg PnL', 9)} | ${padL('Total PnL', 11)} | Verdict`);
    console.log(`  ${'-'.repeat(85)}`);

    buckets.forEach(b => {
      const inB = mlResolved.filter(o => o.model_probability! >= b.min && o.model_probability! < b.max);
      if (inB.length === 0) return;
      const won = inB.filter(o => o.outcome === 'WON').length;
      const lost = inB.filter(o => o.outcome === 'LOST').length;
      const wr = (won + lost) > 0 ? won / (won + lost) : 0;
      const avgPnl = inB.reduce((s, o) => s + (o.pnl ?? 0), 0) / inB.length;
      const totalPnl = inB.reduce((s, o) => s + (o.pnl ?? 0), 0);
      const verdict = totalPnl > 0 ? 'PROFITABLE' : 'LOSING';
      console.log(
        `  ${pad(b.label, 12)} | ${padL(inB.length.toString(), 7)} | ${padL(won.toString(), 5)} | ${padL(lost.toString(), 5)} | ${padL(fmtPct(wr), 7)} | ${padL(fmtDollar(avgPnl), 9)} | ${padL(fmtDollar(totalPnl), 11)} | ${verdict}`
      );
    });
  } else {
    console.log('  No resolved orders with ML scores found.');
  }

  // 4c: ML performance over time (using snapshots)
  subsection('4c. ML Performance Trend (weekly snapshots of ML bots vs non-ML)');
  const mlWalletIds = new Set(bots.filter(b => b.wallet.use_model).map(b => b.wallet.wallet_id));
  const noMlWalletIds = new Set(bots.filter(b => !b.wallet.use_model).map(b => b.wallet.wallet_id));

  if (snapshots.length > 0) {
    // Group snapshots by week
    const weeklyData = new Map<string, { mlPnl: number[]; noMlPnl: number[] }>();
    snapshots.forEach(s => {
      const weekStart = new Date(s.snapshot_at);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      if (!weeklyData.has(key)) weeklyData.set(key, { mlPnl: [], noMlPnl: [] });
      const w = weeklyData.get(key)!;
      if (mlWalletIds.has(s.wallet_id)) w.mlPnl.push(s.total_pnl);
      else if (noMlWalletIds.has(s.wallet_id)) w.noMlPnl.push(s.total_pnl);
    });

    const weeks = Array.from(weeklyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (weeks.length > 0) {
      console.log(`  ${pad('Week', 12)} | ${padL('ML Avg PnL', 12)} | ${padL('No-ML Avg', 12)} | ${padL('ML Bots', 8)} | ${padL('No-ML Bots', 11)}`);
      console.log(`  ${'-'.repeat(60)}`);
      weeks.forEach(([week, d]) => {
        const mlAvg = d.mlPnl.length > 0 ? d.mlPnl.reduce((a, b) => a + b, 0) / d.mlPnl.length : 0;
        const noMlAvg = d.noMlPnl.length > 0 ? d.noMlPnl.reduce((a, b) => a + b, 0) / d.noMlPnl.length : 0;
        console.log(`  ${pad(week, 12)} | ${padL(fmtDollar(mlAvg), 12)} | ${padL(fmtDollar(noMlAvg), 12)} | ${padL(d.mlPnl.length.toString(), 8)} | ${padL(d.noMlPnl.length.toString(), 11)}`);
      });
    }
  } else {
    console.log('  No snapshot data available for trend analysis.');
  }

  // 4d: ML candidates - non-ML bots performing well that could benefit from ML
  subsection('4d. ML Candidates: Non-ML Bots That Could Benefit from ML');
  const mlCandidates = noMlBots
    .filter(b => b.realizedPnl > 0 || (b.resolvedTrades >= 5 && b.winRate > 0.35))
    .sort((a, b) => b.realizedPnl - a.realizedPnl);

  if (mlCandidates.length === 0) {
    console.log('  No strong non-ML candidates found yet.');
  } else {
    console.log('  These non-ML bots are performing well and could test ML overlay:\n');
    mlCandidates.forEach(b => {
      const hasMLEquivalent = bots.some(
        other => other.wallet.use_model && other.wallet.wallet_id !== b.wallet.wallet_id &&
        (other.wallet.wallet_id.includes(b.wallet.config_id) || b.wallet.wallet_id.includes('T2') && other.wallet.wallet_id.includes('ML'))
      );
      const mlStatus = hasMLEquivalent ? '(ML variant exists)' : '** NO ML VARIANT **';
      console.log(`  ${pad(b.wallet.display_name, 30)} | PnL ${padL(fmtDollar(b.realizedPnl), 10)} | WR ${padL(fmtPct(b.winRate), 6)} | ${b.resolvedTrades} trades | ${mlStatus}`);
    });
  }
}

// ============================================================================
// SECTION 5: Performance Leaderboard
// ============================================================================
function printLeaderboard(bots: BotAnalysis[]) {
  section('5. PERFORMANCE LEADERBOARD');

  const withResolved = bots.filter(b => b.resolvedTrades >= 3);

  // Top 15 by realized PnL
  subsection('5a. Top 15 by Realized PnL (min 3 resolved trades)');
  const byPnl = [...withResolved].sort((a, b) => b.realizedPnl - a.realizedPnl).slice(0, 15);
  console.log(`  ${pad('Rank', 5)}${pad('Bot', 32)} | ${padL('PnL', 10)} | ${padL('WR', 7)} | ${padL('Trades', 7)} | ${padL('PF', 5)} | ${padL('$/trade', 9)} | Group`);
  console.log(`  ${'-'.repeat(100)}`);
  byPnl.forEach((b, i) => {
    const pnlPerTrade = b.resolvedTrades > 0 ? fmtDollar(b.realizedPnl / b.resolvedTrades) : 'N/A';
    const pf = b.profitFactor === Infinity ? 'INF' : fmt(b.profitFactor, 1);
    console.log(
      `  ${pad(`${i + 1}.`, 5)}${pad(b.wallet.display_name.slice(0, 30), 32)} | ${padL(fmtDollar(b.realizedPnl), 10)} | ${padL(fmtPct(b.winRate), 7)} | ${padL(b.resolvedTrades.toString(), 7)} | ${padL(pf, 5)} | ${padL(pnlPerTrade, 9)} | ${b.group}`
    );
  });

  // Bottom 15
  subsection('5b. Bottom 15 by Realized PnL');
  const bottomPnl = [...withResolved].sort((a, b) => a.realizedPnl - b.realizedPnl).slice(0, 15);
  console.log(`  ${pad('Rank', 5)}${pad('Bot', 32)} | ${padL('PnL', 10)} | ${padL('WR', 7)} | ${padL('Trades', 7)} | ${padL('PF', 5)} | ${padL('$/trade', 9)} | Group`);
  console.log(`  ${'-'.repeat(100)}`);
  bottomPnl.forEach((b, i) => {
    const pnlPerTrade = b.resolvedTrades > 0 ? fmtDollar(b.realizedPnl / b.resolvedTrades) : 'N/A';
    const pf = b.profitFactor === Infinity ? 'INF' : fmt(b.profitFactor, 1);
    console.log(
      `  ${pad(`${i + 1}.`, 5)}${pad(b.wallet.display_name.slice(0, 30), 32)} | ${padL(fmtDollar(b.realizedPnl), 10)} | ${padL(fmtPct(b.winRate), 7)} | ${padL(b.resolvedTrades.toString(), 7)} | ${padL(pf, 5)} | ${padL(pnlPerTrade, 9)} | ${b.group}`
    );
  });

  // Best risk-adjusted (PnL per trade, min 10 trades)
  subsection('5c. Best Risk-Adjusted (PnL/trade, min 10 resolved trades)');
  const riskAdj = withResolved
    .filter(b => b.resolvedTrades >= 10)
    .map(b => ({ ...b, pnlPerTrade: b.realizedPnl / b.resolvedTrades }))
    .sort((a, b) => b.pnlPerTrade - a.pnlPerTrade)
    .slice(0, 10);

  if (riskAdj.length === 0) {
    console.log('  Not enough bots with 10+ resolved trades yet.');
  } else {
    riskAdj.forEach((b, i) => {
      console.log(`  ${i + 1}. ${pad(b.wallet.display_name.slice(0, 28), 30)} | $/trade ${padL(fmtDollar(b.pnlPerTrade), 9)} | PnL ${padL(fmtDollar(b.realizedPnl), 10)} | ${b.resolvedTrades} trades | WR ${fmtPct(b.winRate)}`);
    });
  }
}

// ============================================================================
// SECTION 6: Factor Attribution Analysis
// ============================================================================
function printFactorAnalysis(allOrders: FTOrder[]) {
  section('6. FACTOR ATTRIBUTION: WHAT DRIVES PERFORMANCE?');

  const resolved = allOrders.filter(o => o.outcome !== 'OPEN');
  if (resolved.length < 10) {
    console.log('  Not enough resolved trades for factor analysis.');
    return;
  }

  // Entry price
  subsection('6a. Entry Price Band');
  const priceBands = [
    { label: '0-20c (longshots)', min: 0, max: 0.20 },
    { label: '20-40c (underdogs)', min: 0.20, max: 0.40 },
    { label: '40-60c (mid-range)', min: 0.40, max: 0.60 },
    { label: '60-80c (favorites)', min: 0.60, max: 0.80 },
    { label: '80-100c (heavy fav)', min: 0.80, max: 1.01 },
  ];

  console.log(`  ${pad('Price Band', 25)} | ${padL('Trades', 7)} | ${padL('WR', 7)} | ${padL('Total PnL', 11)} | ${padL('$/trade', 9)} | ${padL('AvgWin', 9)} | ${padL('AvgLoss', 9)}`);
  console.log(`  ${'-'.repeat(90)}`);

  priceBands.forEach(pb => {
    const inBand = resolved.filter(o => o.entry_price >= pb.min && o.entry_price < pb.max);
    if (inBand.length === 0) return;
    const won = inBand.filter(o => o.outcome === 'WON');
    const lost = inBand.filter(o => o.outcome === 'LOST');
    const wr = inBand.length > 0 ? won.length / inBand.length : 0;
    const totalPnl = inBand.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const pnlPerTrade = totalPnl / inBand.length;
    const avgWin = won.length > 0 ? won.reduce((s, o) => s + (o.pnl ?? 0), 0) / won.length : 0;
    const avgLoss = lost.length > 0 ? lost.reduce((s, o) => s + (o.pnl ?? 0), 0) / lost.length : 0;
    console.log(
      `  ${pad(pb.label, 25)} | ${padL(inBand.length.toString(), 7)} | ${padL(fmtPct(wr), 7)} | ${padL(fmtDollar(totalPnl), 11)} | ${padL(fmtDollar(pnlPerTrade), 9)} | ${padL(fmtDollar(avgWin), 9)} | ${padL(fmtDollar(avgLoss), 9)}`
    );
  });

  // Conviction
  subsection('6b. Conviction Level');
  const convBands = [
    { label: '<1x (below avg)', min: 0, max: 1.0 },
    { label: '1-1.5x (normal)', min: 1.0, max: 1.5 },
    { label: '1.5-2x (elevated)', min: 1.5, max: 2.0 },
    { label: '2-3x (high)', min: 2.0, max: 3.0 },
    { label: '3-5x (very high)', min: 3.0, max: 5.0 },
    { label: '5x+ (extreme)', min: 5.0, max: 100000 },
  ];

  const convResolved = resolved.filter(o => o.conviction != null && o.conviction > 0);
  if (convResolved.length > 0) {
    console.log(`  ${pad('Conviction', 22)} | ${padL('Trades', 7)} | ${padL('WR', 7)} | ${padL('Total PnL', 11)} | ${padL('$/trade', 9)}`);
    console.log(`  ${'-'.repeat(65)}`);
    convBands.forEach(cb => {
      const inBand = convResolved.filter(o => o.conviction! >= cb.min && o.conviction! < cb.max);
      if (inBand.length === 0) return;
      const won = inBand.filter(o => o.outcome === 'WON').length;
      const wr = won / inBand.length;
      const totalPnl = inBand.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(cb.label, 22)} | ${padL(inBand.length.toString(), 7)} | ${padL(fmtPct(wr), 7)} | ${padL(fmtDollar(totalPnl), 11)} | ${padL(fmtDollar(totalPnl / inBand.length), 9)}`
      );
    });
  }

  // Trader WR
  subsection('6c. Trader Win Rate');
  const wrBands = [
    { label: '<50%', min: 0, max: 0.50 },
    { label: '50-55%', min: 0.50, max: 0.55 },
    { label: '55-60% (sweet spot?)', min: 0.55, max: 0.60 },
    { label: '60-65%', min: 0.60, max: 0.65 },
    { label: '65-75%', min: 0.65, max: 0.75 },
    { label: '75%+', min: 0.75, max: 1.01 },
  ];

  const wrResolved = resolved.filter(o => o.trader_win_rate != null);
  if (wrResolved.length > 0) {
    console.log(`  ${pad('Trader WR', 22)} | ${padL('Trades', 7)} | ${padL('Actual WR', 10)} | ${padL('Total PnL', 11)} | ${padL('$/trade', 9)}`);
    console.log(`  ${'-'.repeat(68)}`);
    wrBands.forEach(wb => {
      const inBand = wrResolved.filter(o => o.trader_win_rate! >= wb.min && o.trader_win_rate! < wb.max);
      if (inBand.length === 0) return;
      const won = inBand.filter(o => o.outcome === 'WON').length;
      const wr = won / inBand.length;
      const totalPnl = inBand.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(wb.label, 22)} | ${padL(inBand.length.toString(), 7)} | ${padL(fmtPct(wr), 10)} | ${padL(fmtDollar(totalPnl), 11)} | ${padL(fmtDollar(totalPnl / inBand.length), 9)}`
      );
    });
  }

  // Edge
  subsection('6d. Edge (trader WR - entry price)');
  const edgeBands = [
    { label: 'Negative', min: -10, max: 0 },
    { label: '0-5%', min: 0, max: 0.05 },
    { label: '5-10%', min: 0.05, max: 0.10 },
    { label: '10-20%', min: 0.10, max: 0.20 },
    { label: '20-30%', min: 0.20, max: 0.30 },
    { label: '30%+', min: 0.30, max: 10 },
  ];

  const edgeResolved = resolved.filter(o => o.edge_pct != null);
  if (edgeResolved.length > 0) {
    console.log(`  ${pad('Edge Range', 15)} | ${padL('Trades', 7)} | ${padL('WR', 7)} | ${padL('Total PnL', 11)} | ${padL('$/trade', 9)}`);
    console.log(`  ${'-'.repeat(58)}`);
    edgeBands.forEach(eb => {
      const inBand = edgeResolved.filter(o => o.edge_pct! >= eb.min && o.edge_pct! < eb.max);
      if (inBand.length === 0) return;
      const won = inBand.filter(o => o.outcome === 'WON').length;
      const wr = won / inBand.length;
      const totalPnl = inBand.reduce((s, o) => s + (o.pnl ?? 0), 0);
      console.log(
        `  ${pad(eb.label, 15)} | ${padL(inBand.length.toString(), 7)} | ${padL(fmtPct(wr), 7)} | ${padL(fmtDollar(totalPnl), 11)} | ${padL(fmtDollar(totalPnl / inBand.length), 9)}`
      );
    });
  }

  // Market category detection
  subsection('6e. Market Category Impact');
  const cryptoKeywords = ['btc', 'bitcoin', 'eth', 'ethereum', 'crypto', 'solana', 'sol ', 'xrp', 'doge'];
  const sportsKeywords = ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'tennis', 'ufc', 'super bowl', 'match', 'game', 'win against', 'championship'];
  const politicsKeywords = ['trump', 'biden', 'election', 'president', 'congress', 'senate', 'governor', 'democrat', 'republican', 'vote', 'political'];

  function categorize(title: string): string {
    const t = (title || '').toLowerCase();
    if (cryptoKeywords.some(k => t.includes(k))) return 'Crypto';
    if (sportsKeywords.some(k => t.includes(k))) return 'Sports';
    if (politicsKeywords.some(k => t.includes(k))) return 'Politics';
    return 'Other';
  }

  const catMap = new Map<string, { trades: number; won: number; pnl: number }>();
  resolved.forEach(o => {
    const cat = categorize(o.market_title);
    if (!catMap.has(cat)) catMap.set(cat, { trades: 0, won: 0, pnl: 0 });
    const c = catMap.get(cat)!;
    c.trades++;
    if (o.outcome === 'WON') c.won++;
    c.pnl += o.pnl ?? 0;
  });

  console.log(`  ${pad('Category', 12)} | ${padL('Trades', 7)} | ${padL('WR', 7)} | ${padL('Total PnL', 11)} | ${padL('$/trade', 9)} | ${padL('% of All', 9)}`);
  console.log(`  ${'-'.repeat(65)}`);
  Array.from(catMap.entries()).sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl)).forEach(([cat, d]) => {
    const wr = d.trades > 0 ? d.won / d.trades : 0;
    const pctAll = resolved.length > 0 ? d.trades / resolved.length : 0;
    console.log(
      `  ${pad(cat, 12)} | ${padL(d.trades.toString(), 7)} | ${padL(fmtPct(wr), 7)} | ${padL(fmtDollar(d.pnl), 11)} | ${padL(fmtDollar(d.pnl / d.trades), 9)} | ${padL(fmtPct(pctAll), 9)}`
    );
  });
}

// ============================================================================
// SECTION 7: Pattern Correlation Matrix
// ============================================================================
function printPatternMatrix(bots: BotAnalysis[]) {
  section('7. CONFIG PATTERN CORRELATION');
  console.log('  Which configuration patterns correlate with profitable bots?\n');

  const withResolved = bots.filter(b => b.resolvedTrades >= 5);
  if (withResolved.length < 5) {
    console.log('  Not enough bots with 5+ resolved trades for pattern analysis.');
    return;
  }

  const profitable = withResolved.filter(b => b.realizedPnl > 0);
  const losing = withResolved.filter(b => b.realizedPnl <= 0);

  const compareAvg = (label: string, profFn: (b: BotAnalysis) => number, loseFn: (b: BotAnalysis) => number) => {
    const profAvg = profitable.length > 0 ? profitable.reduce((s, b) => s + profFn(b), 0) / profitable.length : 0;
    const loseAvg = losing.length > 0 ? losing.reduce((s, b) => s + loseFn(b), 0) / losing.length : 0;
    const direction = profAvg > loseAvg ? 'HIGHER is better' : profAvg < loseAvg ? 'LOWER is better' : 'No clear signal';
    console.log(`  ${pad(label, 28)} | Profitable avg: ${padL(fmt(profAvg, 3), 8)} | Losing avg: ${padL(fmt(loseAvg, 3), 8)} | ${direction}`);
  };

  console.log(`  Profitable bots: ${profitable.length}, Losing bots: ${losing.length}\n`);

  compareAvg('Avg Entry Price', b => b.avgEntryPrice, b => b.avgEntryPrice);
  compareAvg('Avg Edge', b => b.avgEdge, b => b.avgEdge);
  compareAvg('Avg Model Prob', b => b.avgModelProb ?? 0, b => b.avgModelProb ?? 0);
  compareAvg('Avg Trader WR', b => b.avgTraderWR ?? 0, b => b.avgTraderWR ?? 0);
  compareAvg('Avg Conviction', b => b.avgConviction ?? 0, b => b.avgConviction ?? 0);
  compareAvg('Trades per Day', b => b.tradesPerDay, b => b.tradesPerDay);

  // ML usage in profitable vs losing
  const profML = profitable.filter(b => b.wallet.use_model).length;
  const loseML = losing.filter(b => b.wallet.use_model).length;
  console.log(`\n  ML usage: ${profML}/${profitable.length} (${profitable.length > 0 ? fmt((profML / profitable.length) * 100, 0) : 0}%) profitable use ML vs ${loseML}/${losing.length} (${losing.length > 0 ? fmt((loseML / losing.length) * 100, 0) : 0}%) losing use ML`);

  // Allocation method breakdown
  subsection('Allocation Method Performance');
  const methods = new Map<string, { profitable: number; losing: number; totalPnl: number }>();
  withResolved.forEach(b => {
    const m = b.wallet.allocation_method;
    if (!methods.has(m)) methods.set(m, { profitable: 0, losing: 0, totalPnl: 0 });
    const md = methods.get(m)!;
    if (b.realizedPnl > 0) md.profitable++;
    else md.losing++;
    md.totalPnl += b.realizedPnl;
  });

  methods.forEach((d, method) => {
    const total = d.profitable + d.losing;
    console.log(`  ${pad(method, 15)}: ${d.profitable}/${total} profitable | Total PnL ${fmtDollar(d.totalPnl)}`);
  });
}

// ============================================================================
// SECTION 8: Recommendations Engine
// ============================================================================
function printRecommendations(bots: BotAnalysis[]) {
  section('8. RECOMMENDATIONS');

  const active = bots.filter(b => b.wallet.is_active);

  // PAUSE recommendations
  subsection('8a. PAUSE: Bots to Deactivate');
  console.log('  Criteria: Active, 10+ resolved trades, negative PnL, negative PnL/trade, and not anti-strategies\n');
  const pauseCandidates = active
    .filter(b =>
      b.resolvedTrades >= 10 &&
      b.realizedPnl < -20 &&
      b.group !== 'THESIS_T5' &&
      (b.realizedPnl / b.resolvedTrades) < -1
    )
    .sort((a, b) => a.realizedPnl - b.realizedPnl);

  if (pauseCandidates.length === 0) {
    console.log('  No clear pause candidates yet (may need more resolved trades).');
  } else {
    pauseCandidates.forEach(b => {
      console.log(`  PAUSE: ${b.wallet.display_name} (${b.wallet.wallet_id})`);
      console.log(`    PnL: ${fmtDollar(b.realizedPnl)} | ${b.resolvedTrades} trades | WR ${fmtPct(b.winRate)} | $/trade ${fmtDollar(b.realizedPnl / b.resolvedTrades)}`);
      console.log(`    Hypothesis: ${b.wallet.hypothesis || 'N/A'}`);
      console.log(`    Reason: Consistently losing after sufficient sample size.`);
      console.log('');
    });
  }

  // MODIFY recommendations
  subsection('8b. MODIFY: Good Idea, Bad Config');
  console.log('  Criteria: Active, hypothesis looks valid, but config issues causing no/few trades\n');
  const modifyCandidates = active.filter(b =>
    (b.isInactive || b.isLowActivity || b.hasConfigIssue) && b.wallet.hypothesis
  );

  if (modifyCandidates.length === 0) {
    console.log('  No modify candidates found.');
  } else {
    modifyCandidates.forEach(b => {
      console.log(`  MODIFY: ${b.wallet.display_name} (${b.wallet.wallet_id})`);
      console.log(`    Trades: ${b.totalTrades} in ${fmt(b.daysActive, 1)} days`);
      console.log(`    Hypothesis: ${b.wallet.hypothesis}`);
      if (b.hasConfigIssue) console.log(`    Config issue: ${b.configIssueDetail}`);
      console.log(`    Suggestion: Relax filters (lower min_edge, broaden price range, or lower ML threshold).`);
      console.log('');
    });
  }

  // KEEP / MONITOR recommendations
  subsection('8c. KEEP & MONITOR: Performing Well or Needs More Data');
  const keepBots = active
    .filter(b => b.resolvedTrades >= 3 && b.realizedPnl > 0 && b.group !== 'THESIS_T5')
    .sort((a, b) => b.realizedPnl - a.realizedPnl);

  if (keepBots.length === 0) {
    console.log('  No clearly profitable bots yet.');
  } else {
    keepBots.forEach(b => {
      const confidence = b.resolvedTrades >= 30 ? 'HIGH' : b.resolvedTrades >= 15 ? 'MEDIUM' : 'LOW';
      console.log(`  KEEP [${confidence}]: ${pad(b.wallet.display_name.slice(0, 28), 30)} | PnL ${padL(fmtDollar(b.realizedPnl), 10)} | ${b.resolvedTrades} trades | WR ${fmtPct(b.winRate)}`);
    });
  }

  // NEW BOT IDEAS
  subsection('8d. CREATE: New Bot Ideas from Data');
  console.log('  Based on analysis patterns, consider creating these new bots:\n');

  const ideas = [
    {
      name: 'Top 10 Yesterday PnL Traders',
      rationale: 'Follow the top 10 traders by PnL from yesterday. Rotates daily. Tests if yesterday\'s winners predict today\'s winners.',
      config: 'target_traders = top 10 by daily PnL | use_model = true | model_threshold = 0.55 | price 0.10-0.80',
    },
    {
      name: 'Top 10 Last 7D PnL Traders',
      rationale: 'Follow top 10 traders by 7-day rolling PnL. More stable than daily. Tests momentum over a week.',
      config: 'target_traders = top 10 by 7D PnL | use_model = true | model_threshold = 0.55 | price 0.10-0.80',
    },
    {
      name: 'Top 10 Yesterday + ML 60%',
      rationale: 'Same as above but with stricter ML filter (60%). Tests if ML can improve top-trader selection.',
      config: 'target_traders = top 10 by daily PnL | use_model = true | model_threshold = 0.60 | price 0.10-0.80',
    },
    {
      name: 'Top 10 7D + No Crypto',
      rationale: 'Top 7D traders excluding crypto markets. Data shows crypto drags performance heavily.',
      config: 'target_traders = top 10 by 7D PnL | use_model = true | exclude crypto | price 0.10-0.80',
    },
    {
      name: 'Sweet Spot + ML 60% + Conv 2x',
      rationale: 'Combine the three strongest signals: 20-40c entry, ML 60%+, and 2x+ conviction.',
      config: 'price 0.20-0.40 | use_model = true | model_threshold = 0.60 | min_conviction = 2.0',
    },
    {
      name: 'Non-Crypto Underdog Hunter',
      rationale: 'Existing Underdog Hunter is top performer. Excluding crypto should improve further (crypto = -91% drag).',
      config: 'Same as Underdog Hunter but market_categories excludes crypto',
    },
    {
      name: 'High Conv + Sports Only',
      rationale: 'Conviction is strongest signal. Sports may offer more predictable patterns. Test the combo.',
      config: 'min_conviction = 3.0 | market_categories = [sports] | price 0.15-0.65',
    },
    {
      name: 'ML 60% + Edge 10% + Conv 1.5x',
      rationale: 'Triple filter: ML confidence + edge + conviction. Tests if three-signal alignment outperforms.',
      config: 'model_threshold = 0.60 | min_edge = 0.10 | min_conviction = 1.5 | price 0.10-0.70',
    },
  ];

  ideas.forEach((idea, i) => {
    console.log(`  ${i + 1}. ${idea.name}`);
    console.log(`     Rationale: ${idea.rationale}`);
    console.log(`     Config: ${idea.config}`);
    console.log('');
  });
}

// ============================================================================
// SECTION 9: Key Learnings Synthesis
// ============================================================================
function printKeySynthesis(bots: BotAnalysis[], allOrders: FTOrder[]) {
  section('9. KEY LEARNINGS SYNTHESIS');

  const resolved = allOrders.filter(o => o.outcome !== 'OPEN');
  const withResolved = bots.filter(b => b.resolvedTrades >= 3);

  if (resolved.length < 10 || withResolved.length < 3) {
    console.log('  Insufficient data for synthesis. Need more resolved trades.');
    return;
  }

  const totalWon = resolved.filter(o => o.outcome === 'WON');
  const totalLost = resolved.filter(o => o.outcome === 'LOST');
  const overallWR = totalWon.length / resolved.length;
  const avgWin = totalWon.length > 0 ? totalWon.reduce((s, o) => s + (o.pnl ?? 0), 0) / totalWon.length : 0;
  const avgLoss = totalLost.length > 0 ? totalLost.reduce((s, o) => s + (o.pnl ?? 0), 0) / totalLost.length : 0;

  console.log('\n  THESIS CONFIRMED:');
  console.log('  ─────────────────');

  // 1. Win rate vs PnL
  console.log(`  1. Low win rate CAN mean profit. Overall WR: ${fmtPct(overallWR)}, but avg win (${fmtDollar(avgWin)}) is ${fmt(Math.abs(avgWin / (avgLoss || 1)), 1)}x avg loss (${fmtDollar(avgLoss)}).`);

  // 2. Entry price sweet spot
  const underdogTrades = resolved.filter(o => o.entry_price >= 0.20 && o.entry_price < 0.40);
  const udPnl = underdogTrades.reduce((s, o) => s + (o.pnl ?? 0), 0);
  const udWon = underdogTrades.filter(o => o.outcome === 'WON').length;
  if (underdogTrades.length > 0) {
    console.log(`  2. Entry 20-40c is the sweet spot: ${underdogTrades.length} trades, WR ${fmtPct(udWon / underdogTrades.length)}, PnL ${fmtDollar(udPnl)}`);
  }

  // 3. Crypto impact
  const cryptoKeywords = ['btc', 'bitcoin', 'eth', 'ethereum', 'crypto', 'solana', 'sol ', 'xrp', 'doge'];
  const cryptoTrades = resolved.filter(o => cryptoKeywords.some(k => (o.market_title || '').toLowerCase().includes(k)));
  const nonCryptoTrades = resolved.filter(o => !cryptoKeywords.some(k => (o.market_title || '').toLowerCase().includes(k)));
  if (cryptoTrades.length > 0) {
    const cryptoPnl = cryptoTrades.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const nonCryptoPnl = nonCryptoTrades.reduce((s, o) => s + (o.pnl ?? 0), 0);
    console.log(`  3. Crypto is toxic: ${cryptoTrades.length} crypto trades = ${fmtDollar(cryptoPnl)} vs ${nonCryptoTrades.length} non-crypto = ${fmtDollar(nonCryptoPnl)}`);
  }

  // 4. Conviction
  const highConv = resolved.filter(o => o.conviction != null && o.conviction >= 3);
  const lowConv = resolved.filter(o => o.conviction != null && o.conviction > 0 && o.conviction < 1);
  if (highConv.length > 0 && lowConv.length > 0) {
    const highPnl = highConv.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const lowPnl = lowConv.reduce((s, o) => s + (o.pnl ?? 0), 0);
    const highWR = highConv.filter(o => o.outcome === 'WON').length / highConv.length;
    const lowWR = lowConv.filter(o => o.outcome === 'WON').length / lowConv.length;
    console.log(`  4. Conviction matters: 3x+ conv WR ${fmtPct(highWR)}, PnL ${fmtDollar(highPnl)} vs <1x conv WR ${fmtPct(lowWR)}, PnL ${fmtDollar(lowPnl)}`);
  }

  // 5. Anti-strategy validation
  const antiStrats = withResolved.filter(b => b.group === 'THESIS_T5');
  if (antiStrats.length > 0) {
    const antiLosing = antiStrats.filter(b => b.realizedPnl < 0).length;
    console.log(`  5. Anti-strategies: ${antiLosing}/${antiStrats.length} are losing as expected. ${antiLosing === antiStrats.length ? 'THESIS VALIDATED.' : 'Some anomalies - investigate.'}`);
  }

  // OPEN QUESTIONS
  console.log('\n  OPEN QUESTIONS:');
  console.log('  ───────────────');
  console.log('  - Is 60% ML threshold really the inflection point? (Compare ML_SWEEP bots)');
  console.log('  - Do individual top traders outperform aggregate strategies?');
  console.log('  - Does ML improve performance when layered on already-good strategies?');
  console.log('  - What is the right balance between selectivity (fewer, better trades) vs volume?');
  console.log('  - Are sports markets genuinely more predictable, or just less noisy than crypto?');

  // STRATEGIC PRIORITIES
  console.log('\n  STRATEGIC PRIORITIES:');
  console.log('  ─────────────────────');
  const profitable = withResolved.filter(b => b.realizedPnl > 0);
  console.log(`  1. ${profitable.length}/${withResolved.length} bots profitable - focus on REPLICATING winners, not saving losers`);
  console.log('  2. Exclude crypto from all new strategies until proven otherwise');
  console.log('  3. Conviction 2x+ should be default minimum for new bots');
  console.log('  4. Test individual top-trader bots (yesterday, 7D) for personalized alpha');
  console.log('  5. ML 60%+ appears to be the quality threshold - use as default for new ML bots');
  console.log('  6. Log all changes to existing bots in alpha_agent_decisions or a changelog');
}

// ============================================================================
// SECTION 10: Change Log Template
// ============================================================================
function printChangeLogTemplate() {
  section('10. CHANGE TRACKING METHODOLOGY');

  console.log(`
  To track bot modifications, use this approach:

  1. BEFORE making any change, record:
     - Bot wallet_id
     - Current config (snapshot the row from ft_wallets)
     - Reason for change
     - Hypothesis (what you expect to improve)
     - Date

  2. AFTER making the change, record:
     - New config
     - Date applied

  3. MONITORING: After 7+ days, check:
     - Did win rate change?
     - Did PnL/trade change?
     - Did trade volume change?
     - Mark outcome as: improved / degraded / neutral

  SQL to snapshot a bot before modification:

    SELECT wallet_id, display_name, model_threshold, price_min, price_max,
           min_edge, use_model, allocation_method, kelly_fraction,
           bet_size, min_bet, max_bet, min_conviction,
           market_categories, total_trades, total_pnl, 
           NOW() as snapshot_time
    FROM ft_wallets WHERE wallet_id = '<WALLET_ID>';

  SQL to log a change:

    INSERT INTO alpha_agent_decisions (
      decision_id, run_id, bot_id, decision_type,
      config_before, config_after, config_diff,
      reasoning, hypothesis, confidence, created_at
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), '<WALLET_ID>', 'manual_modification',
      '<before_json>', '<after_json>', '<diff_json>',
      '<reason>', '<hypothesis>', 0.7, NOW()
    );

  The alpha_agent_decisions table already supports manual changes via decision_type = 'manual_modification'.
  `);
}

// ============================================================================
// ML Bots Check (--ml-check): verify ML wallets trade and get ML signal
// ============================================================================
const LOOKBACK_DAYS_ML = 14;

async function runMlCheck(): Promise<void> {
  console.log('=== ML bots check (use_model = true) ===\n');

  const { data: mlWallets, error: walletsError } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, use_model, model_threshold, is_active, total_trades, last_sync_time')
    .eq('use_model', true);

  if (walletsError) {
    console.error('Error fetching ML wallets:', walletsError.message);
    return;
  }
  if (!mlWallets || mlWallets.length === 0) {
    console.log('No ft_wallets with use_model = true found.');
    return;
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS_ML);
  const sinceIso = since.toISOString();
  console.log('Found', mlWallets.length, 'ML wallets. Orders since', sinceIso.slice(0, 10), '\n');

  const issues: string[] = [];

  for (const w of mlWallets) {
    const threshold = w.model_threshold;
    const thresholdOk = threshold != null && typeof threshold === 'number';

    const { data: orders, error: ordersError } = await supabase
      .from('ft_orders')
      .select('order_id, model_probability, order_time')
      .eq('wallet_id', w.wallet_id)
      .gte('order_time', sinceIso)
      .order('order_time', { ascending: false })
      .limit(5000);

    if (ordersError) {
      console.log(w.wallet_id, 'Error:', ordersError.message);
      continue;
    }

    const total = orders?.length ?? 0;
    const withMl = orders?.filter((o: { model_probability?: number | null }) => o.model_probability != null)?.length ?? 0;
    const name = (w.display_name || w.wallet_id).slice(0, 42);

    if (!thresholdOk) {
      issues.push(w.wallet_id + ': use_model=true but model_threshold is null/undefined -> ML is never called in sync.');
    }
    if (thresholdOk && total > 0 && withMl === 0) {
      issues.push(w.wallet_id + ': has ' + total + ' recent orders but none have model_probability -> ML may be failing or not applied.');
    }

    console.log(w.wallet_id, '|', name, w.is_active ? '' : '[inactive]');
    console.log('  model_threshold:', threshold ?? 'NULL', thresholdOk ? '' : '  [ML DISABLED - sync skips getPolyScore]');
    console.log('  total_trades (wallet):', w.total_trades ?? 0);
    console.log('  last ' + LOOKBACK_DAYS_ML + 'd orders:', total, '| with model_probability:', withMl);
    if (orders && withMl > 0) {
      const probs = orders.filter((o: { model_probability?: number | null }) => o.model_probability != null).map((o: { model_probability: number }) => o.model_probability);
      const minP = Math.min(...probs);
      const maxP = Math.max(...probs);
      const avgP = probs.reduce((a: number, b: number) => a + b, 0) / probs.length;
      console.log('  model_probability range:', (minP * 100).toFixed(1) + '% - ' + (maxP * 100).toFixed(1) + '% (avg ' + (avgP * 100).toFixed(1) + '%)');
    }
    console.log('');
  }

  if (issues.length > 0) {
    console.log('--- Issues ---');
    issues.forEach((i) => console.log('  ', i));
  }
  console.log('Done.');
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  if (ML_CHECK_MODE) {
    await runMlCheck();
    return;
  }
  console.log('\n' + '█'.repeat(100));
  console.log('  BOT PROGRAM AUDIT & OPTIMIZATION REPORT');
  console.log(`  Generated: ${new Date().toISOString()}`);
  console.log('█'.repeat(100));

  console.log('\nFetching data...');
  const [wallets, allOrders, snapshots] = await Promise.all([
    fetchAllWallets(),
    fetchResolvedOrders(),
    fetchSnapshots(),
  ]);

  const totalDbTrades = wallets.reduce((s, w) => s + (w.total_trades || 0), 0);
  console.log(`  Wallets: ${wallets.length}`);
  console.log(`  Resolved orders fetched: ${allOrders.length} (total trades in DB: ${totalDbTrades})`);
  console.log(`  Snapshots: ${snapshots.length}`);

  // Fetch per-wallet win/loss summaries (parallel, much faster than fetching all orders)
  console.log('\nFetching per-wallet win/loss summaries...');
  const walletIds = wallets.map(w => w.wallet_id);
  const walletSummaries = await fetchWalletOrderSummaries(walletIds);
  console.log(`  Got summaries for ${walletSummaries.size} wallets`);

  const ordersByWallet = new Map<string, FTOrder[]>();
  allOrders.forEach(o => {
    if (!ordersByWallet.has(o.wallet_id)) ordersByWallet.set(o.wallet_id, []);
    ordersByWallet.get(o.wallet_id)!.push(o);
  });

  const bots: BotAnalysis[] = wallets.map(w => {
    const orders = ordersByWallet.get(w.wallet_id) || [];
    const summary = walletSummaries.get(w.wallet_id);
    return analyzeBot(w, orders, summary);
  });

  // Data integrity spot-check: verify summary queries match for a few bots
  subsection('Data Integrity Spot-Check');
  const spotCheckWallets = bots.filter(b => b.totalTrades > 100).slice(0, 5);
  let integrityOk = true;
  for (const b of spotCheckWallets) {
    const summary = walletSummaries.get(b.wallet.wallet_id);
    if (!summary) continue;
    const actualResolved = summary.won + summary.lost;
    const walletTotal = b.wallet.total_trades;
    const { count: actualTotal } = await supabase.from('ft_orders')
      .select('order_id', { count: 'exact', head: true }).eq('wallet_id', b.wallet.wallet_id);
    if (actualTotal && Math.abs(actualTotal - walletTotal) > walletTotal * 0.01) {
      console.log(`  WARNING: ${b.wallet.wallet_id} total_trades=${walletTotal} but actual=${actualTotal} (${((actualTotal - walletTotal) / walletTotal * 100).toFixed(1)}% drift)`);
      integrityOk = false;
    }
  }
  if (integrityOk) console.log('  All spot-checks passed. Wallet stats match order counts.');

  // Run all sections
  printExecutiveOverview(bots);
  printHealthCheck(bots);
  printGroupDeepDives(bots);
  printMLAnalysis(bots, allOrders, snapshots);
  printLeaderboard(bots);
  printFactorAnalysis(allOrders);
  printPatternMatrix(bots);
  printRecommendations(bots);
  printKeySynthesis(bots, allOrders);
  printChangeLogTemplate();

  console.log('\n' + '█'.repeat(100));
  console.log('  AUDIT COMPLETE');
  console.log('  Next steps:');
  console.log('  1. Review PAUSE recommendations and deactivate confirmed losers');
  console.log('  2. Review MODIFY recommendations and fix config issues');
  console.log('  3. Create new bots from the IDEAS section');
  console.log('  4. Re-run this audit weekly to track progress');
  console.log('  5. Use the change log template to track all modifications');
  console.log('█'.repeat(100) + '\n');

  if (JSON_MODE) {
    const jsonOutput = {
      generated_at: new Date().toISOString(),
      total_bots: bots.length,
      active_bots: bots.filter(b => b.wallet.is_active).length,
      total_trades: allOrders.length,
      total_resolved: allOrders.filter(o => o.outcome !== 'OPEN').length,
      groups: Object.fromEntries(
        GROUP_ORDER.map(g => [g, bots.filter(b => b.group === g).map(b => ({
          wallet_id: b.wallet.wallet_id,
          display_name: b.wallet.display_name,
          total_trades: b.totalTrades,
          resolved_trades: b.resolvedTrades,
          win_rate: b.winRate,
          realized_pnl: b.realizedPnl,
          trades_per_day: b.tradesPerDay,
          use_model: b.wallet.use_model,
          is_active: b.wallet.is_active,
          health_flags: {
            inactive: b.isInactive,
            low_activity: b.isLowActivity,
            stale_sync: b.isStaleSync,
            config_issue: b.hasConfigIssue,
          },
        }))])
      ),
      pause_candidates: bots
        .filter(b => b.wallet.is_active && b.resolvedTrades >= 10 && b.realizedPnl < -20 && b.group !== 'THESIS_T5' && (b.realizedPnl / b.resolvedTrades) < -1)
        .map(b => b.wallet.wallet_id),
      profitable_bots: bots
        .filter(b => b.resolvedTrades >= 3 && b.realizedPnl > 0)
        .sort((a, b) => b.realizedPnl - a.realizedPnl)
        .map(b => ({ wallet_id: b.wallet.wallet_id, pnl: b.realizedPnl, trades: b.resolvedTrades })),
    };
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify(jsonOutput, null, 2));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
