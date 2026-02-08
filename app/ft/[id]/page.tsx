'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  ArrowLeft,
  Clock,
  Target,
  Activity,
  BarChart3,
  ListOrdered,
  Briefcase,
  Settings,
  Calendar,
  Info,
  AlertCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface WalletData {
  wallet_id: string;
  config_id: string;
  display_name: string;
  description: string;
  detailed_description: string | null;
  starting_balance: number;
  current_balance: number;
  cash_available: number;
  trades_seen: number;
  trades_skipped: number;
  bet_size: number;
  bet_allocation_weight: number;
  allocation_method: string;
  kelly_fraction: number;
  min_bet: number;
  max_bet: number;
  start_date: { value: string };
  end_date: { value: string };
  last_sync_time: { value: string } | null;
  hours_remaining: number;
  test_status: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
  model_threshold: number;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  is_active: boolean;
}

interface Stats {
  total_trades: number;
  open_positions: number;
  won: number;
  lost: number;
  win_rate: number | null;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  open_exposure: number;
  avg_entry_price: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  last_trade: { value: string } | null;
  first_trade: { value: string } | null;
  max_drawdown_usd?: number;
  max_drawdown_pct?: number;
  sharpe_ratio?: number | null;
}

interface Position {
  order_id: string;
  market_title: string;
  market_slug: string;
  entry_price: number;
  current_price: number | null;
  size: number;
  side: string;
  token_label: string;
  trader_address: string;
  trader_name?: string | null;
  trader_win_rate: number | null;
  model_probability: number | null;
  edge_pct: number | null;
  conviction: number | null;
  unrealized_pnl: number | null;
  market_end_time: { value: string };
  order_time: { value: string } | null;
  minutes_to_resolution: number;
}

interface Trade {
  order_id: string;
  market_title: string;
  market_slug: string;
  entry_price: number;
  size: number;
  side: string;
  token_label: string;
  winning_label: string;
  outcome: string;
  pnl: number;
  trader_address?: string;
  trader_name?: string | null;
  trader_win_rate: number | null;
  model_probability: number | null;
  edge_pct: number | null;
  order_time: { value: string } | null;
  resolved_time: { value: string };
}

interface DailyPnl {
  date: { value: string };
  trades: number;
  won: number;
  lost: number;
  win_rate: number;
  daily_pnl: number;
  cumulative_pnl: number;
}

interface PerformanceSnapshot {
  snapshot_at: string;
  cash: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  return_pct: number;
  starting_balance: number;
}

interface CategoryPerf {
  category: string;
  trades: number;
  won: number;
  lost: number;
  win_rate: number;
  total_pnl: number;
  avg_entry_price: number;
}

type ExtendedFilters = {
  market_categories?: string[];
  target_traders?: string[];
  target_trader?: string;
  target_trader_name?: string;
  min_trader_win_rate?: number;
  max_trader_win_rate?: number;
  min_edge?: number;
  max_edge?: number;
  min_conviction?: number;
  max_conviction?: number;
  hypothesis?: string;
  thesis_tier?: string;
  trader_pool?: string;
  min_original_trade_usd?: number;
  max_original_trade_usd?: number;
};

function StrategyDetailsCard({ detailedDescription, description }: { detailedDescription: string; description: string }) {
  let filters: ExtendedFilters | null = null;
  try {
    const parsed = JSON.parse(detailedDescription);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      filters = parsed;
    }
  } catch {
    // Not JSON, treat as plain text
  }

  const items: { label: string; text: string }[] = [];

  if (filters) {
    if (filters.market_categories?.length) {
      const cats = filters.market_categories.join(', ');
      items.push({
        label: 'Market categories',
        text: `This strategy only copies trades whose market titles match at least one of these keywords: ${cats}. All other markets (e.g. crypto, sports, finance) are excluded.`,
      });
    }
    if (filters.target_traders?.length) {
      const count = filters.target_traders.length;
      const shortened = filters.target_traders.slice(0, 3).map(a => `${a.slice(0, 6)}…${a.slice(-4)}`).join(', ');
      const more = count > 3 ? ` and ${count - 3} more` : '';
      items.push({
        label: 'Target traders',
        text: `This strategy follows ${count} specific trader${count === 1 ? '' : 's'} selected by niche performance (e.g. from trader_profile_stats). ${count === 1 ? 'Address' : 'Addresses'}: ${shortened}${more}.`,
      });
    }
    if (filters.target_trader) {
      const addr = filters.target_trader;
      const display = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
      const name = filters.target_trader_name ? ` (${filters.target_trader_name})` : '';
      items.push({
        label: 'Target trader',
        text: `This strategy copies a single trader${name}: ${display}.`,
      });
    }
    if (filters.trader_pool) {
      items.push({
        label: 'Trader pool',
        text: `Traders are drawn from: ${filters.trader_pool}.`,
      });
    }
    if (filters.min_trader_win_rate !== undefined) {
      const pct = (filters.min_trader_win_rate * 100).toFixed(0);
      items.push({
        label: 'Minimum trader win rate',
        text: `Only copies trades from traders with at least ${pct}% historical win rate.`,
      });
    }
    if (filters.max_trader_win_rate !== undefined) {
      const pct = (filters.max_trader_win_rate * 100).toFixed(0);
      items.push({
        label: 'Maximum trader win rate',
        text: `Excludes traders above ${pct}% win rate (used for anti-strategy tests).`,
      });
    }
    if (filters.min_conviction !== undefined && filters.min_conviction > 0) {
      items.push({
        label: 'Minimum conviction',
        text: `Only copies trades where the trader’s bet size is at least ${filters.min_conviction}x their average (skin in the game filter).`,
      });
    }
    if (filters.max_conviction !== undefined) {
      items.push({
        label: 'Maximum conviction',
        text: `Excludes trades where conviction exceeds ${filters.max_conviction}x (avoids oversized bets).`,
      });
    }
    if (filters.hypothesis) {
      items.push({
        label: 'Hypothesis',
        text: filters.hypothesis,
      });
    }
    if (filters.thesis_tier) {
      items.push({
        label: 'Thesis tier',
        text: `Part of thesis architecture: ${filters.thesis_tier.replace(/_/g, ' ')}.`,
      });
    }
    if (filters.min_original_trade_usd !== undefined || filters.max_original_trade_usd !== undefined) {
      const parts: string[] = [];
      if (filters.min_original_trade_usd !== undefined) parts.push(`at least $${filters.min_original_trade_usd}`);
      if (filters.max_original_trade_usd !== undefined) parts.push(`at most $${filters.max_original_trade_usd}`);
      items.push({
        label: 'Original trade size filter',
        text: `Only copies trades where the original trader’s size is ${parts.join(' and ')}.`,
      });
    }
  }

  // Fallback: plain text / markdown-style
  const isPlainText = !filters || items.length === 0;
  const paragraphs = isPlainText ? detailedDescription.split('\n\n') : null;

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-600" />
          Strategy Details
        </CardTitle>
        {description && (
          <CardDescription className="text-slate-600 mt-1">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none text-slate-700 space-y-4">
          {items.length > 0 ? (
            items.map((item, i) => (
              <div key={i}>
                <strong className="text-slate-900 block mb-1">{item.label}</strong>
                <p className="mb-0 text-slate-700">{item.text}</p>
              </div>
            ))
          ) : paragraphs ? (
            paragraphs.map((p, i) => {
              if (p.startsWith('**')) {
                const parts = p.split('**');
                return (
                  <div key={i} className="mb-3">
                    <strong className="text-slate-900">{parts[1]}</strong>
                    <span>{parts[2]}</span>
                  </div>
                );
              }
              return <p key={i} className="mb-2">{p}</p>;
            })
          ) : (
            <p className="text-slate-600">{detailedDescription}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function WalletDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [categoryPerf, setCategoryPerf] = useState<CategoryPerf[]>([]);
  const [snapshots, setSnapshots] = useState<PerformanceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('positions');
  const [positionsSortField, setPositionsSortField] = useState<string>('order_time');
  const [positionsSortDir, setPositionsSortDir] = useState<'asc' | 'desc'>('desc');
  const [tradesSortField, setTradesSortField] = useState<string>('order_time');
  const [tradesSortDir, setTradesSortDir] = useState<'asc' | 'desc'>('desc');
  const [autoSyncActive, setAutoSyncActive] = useState(true);

  const fetchWalletData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch(`/api/ft/wallets/${id}`, { cache: 'no-store' });
      const data = await res.json();
      
      if (data.success) {
        setWallet(data.wallet);
        setStats(data.stats);
        setOpenPositions(data.open_positions || []);
        setRecentTrades(data.recent_trades || []);
        setDailyPnl(data.daily_pnl || []);
        setCategoryPerf(data.performance_by_category || []);

        // Fetch hourly snapshots for charts
        const start = data.wallet?.start_date?.value || data.wallet?.start_date;
        const params = new URLSearchParams({ wallet_id: id });
        if (start) params.set('from', new Date(start).toISOString());
        params.set('to', new Date().toISOString());
        const snapRes = await fetch(`/api/ft/snapshots?${params}`, { cache: 'no-store' });
        const snapData = await snapRes.json();
        if (snapData.success && snapData.snapshots) {
          setSnapshots(snapData.snapshots);
        } else {
          setSnapshots([]);
        }
      } else if (!silent) {
        setError(data.error || 'Failed to fetch wallet');
      }
    } catch (err) {
      if (!silent) setError('Failed to fetch wallet data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Auto-sync every 30 seconds
  useEffect(() => {
    if (!autoSyncActive) return;
    
    const autoSync = async () => {
      try {
        // Sync new trades and check resolutions
        await fetch('/api/ft/sync', { method: 'POST', cache: 'no-store' });
        await fetch('/api/ft/resolve', { method: 'POST', cache: 'no-store' });
        // Enrich orders with ML scores (processes a batch each time)
        await fetch('/api/ft/enrich-ml', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 30 }) // Process up to 30 orders per sync (backfill if sync-time ML failed)
        });
        // Refresh this wallet's data silently (no loading flash)
        await fetchWalletData(true);
      } catch (err) {
        console.error('[ft/wallet] Auto-sync error:', err);
      }
    };
    
    const interval = setInterval(autoSync, 30000);
    return () => clearInterval(interval);
  }, [fetchWalletData, autoSyncActive]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPnl = (value: number) => {
    const formatted = formatCurrency(Math.abs(value));
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const PosSortHeader = ({ field, label, align = 'left' }: { field: string; label: string; align?: 'left' | 'right' }) => (
    <TableHead className={`cursor-pointer hover:bg-muted/50 select-none ${align === 'right' ? 'text-right' : ''}`} onClick={() => {
      if (positionsSortField === field) setPositionsSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setPositionsSortField(field); setPositionsSortDir('desc'); }
    }}>
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {positionsSortField === field ? (positionsSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </TableHead>
  );
  const TradeSortHeader = ({ field, label, align = 'left' }: { field: string; label: string; align?: 'left' | 'right' }) => (
    <TableHead className={`cursor-pointer hover:bg-muted/50 select-none ${align === 'right' ? 'text-right' : ''}`} onClick={() => {
      if (tradesSortField === field) setTradesSortDir(d => d === 'asc' ? 'desc' : 'asc');
      else { setTradesSortField(field); setTradesSortDir('desc'); }
    }}>
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {tradesSortField === field ? (tradesSortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </TableHead>
  );

  const sortedPositions = useMemo(() => {
    return [...openPositions].sort((a, b) => {
      const mult = positionsSortDir === 'asc' ? 1 : -1;
      let cmp = 0;
      switch (positionsSortField) {
        case 'market': cmp = (a.market_title || '').localeCompare(b.market_title || ''); break;
        case 'trader': cmp = ((a.trader_name || a.trader_address || '')).localeCompare((b.trader_name || b.trader_address || '')); break;
        case 'order_time': cmp = new Date((a.order_time?.value || 0)).getTime() - new Date((b.order_time?.value || 0)).getTime(); break;
        case 'entry': cmp = (a.entry_price || 0) - (b.entry_price || 0); break;
        case 'size': cmp = (a.size || 0) - (b.size || 0); break;
        case 'pnl': cmp = (a.unrealized_pnl ?? 0) - (b.unrealized_pnl ?? 0); break;
        case 'wr': cmp = (a.trader_win_rate ?? 0) - (b.trader_win_rate ?? 0); break;
        default: break;
      }
      return mult * cmp;
    });
  }, [openPositions, positionsSortField, positionsSortDir]);

  const sortedTrades = useMemo(() => {
    return [...recentTrades].sort((a, b) => {
      const mult = tradesSortDir === 'asc' ? 1 : -1;
      let cmp = 0;
      switch (tradesSortField) {
        case 'market': cmp = (a.market_title || '').localeCompare(b.market_title || ''); break;
        case 'trader': cmp = ((a.trader_name || a.trader_address || '')).localeCompare((b.trader_name || b.trader_address || '')); break;
        case 'order_time': cmp = new Date((a.order_time?.value || 0)).getTime() - new Date((b.order_time?.value || 0)).getTime(); break;
        case 'resolved_time': cmp = new Date((a.resolved_time?.value || 0)).getTime() - new Date((b.resolved_time?.value || 0)).getTime(); break;
        case 'entry': cmp = (a.entry_price || 0) - (b.entry_price || 0); break;
        case 'size': cmp = (a.size || 0) - (b.size || 0); break;
        case 'pnl': cmp = (a.pnl || 0) - (b.pnl || 0); break;
        case 'outcome': cmp = (a.outcome || '').localeCompare(b.outcome || ''); break;
        default: break;
      }
      return mult * cmp;
    });
  }, [recentTrades, tradesSortField, tradesSortDir]);

  const formatTime = (timestamp: { value: string } | null) => {
    if (!timestamp) return '-';
    return new Date(timestamp.value).toLocaleString();
  };

  const formatTimeAgo = (minutes: number) => {
    if (minutes < 0) return 'Awaiting resolution';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (minutes < 1440) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const days = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    return h > 0 ? `${days}d ${h}h` : `${days}d`;
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !wallet || !stats) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Wallet not found'}</p>
          <Link href="/ft">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Wallets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const returnPct = wallet.starting_balance > 0 
    ? ((wallet.current_balance - wallet.starting_balance) / wallet.starting_balance) * 100
    : 0;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link href="/ft" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Wallets
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {wallet.display_name}
            {stats.realized_pnl >= 0 ? (
              <TrendingUp className="h-8 w-8 text-green-600" />
            ) : (
              <TrendingDown className="h-8 w-8 text-red-600" />
            )}
          </h1>
          <p className="text-muted-foreground mt-1">{wallet.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <div className={`w-2 h-2 rounded-full ${autoSyncActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-xs text-muted-foreground">
              {autoSyncActive ? 'Live' : 'Paused'}
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs"
              onClick={() => setAutoSyncActive(!autoSyncActive)}
            >
              {autoSyncActive ? 'Pause' : 'Resume'}
            </Button>
          </div>
          <Link href={`/ft/${id}/settings`}>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
          <Button onClick={() => fetchWalletData()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-8 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{formatCurrency(wallet.current_balance)}</div>
            <div className={`text-sm ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(stats.total_pnl)} ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
            </div>
            <p className="text-xs text-muted-foreground mt-1">Portfolio Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className={`text-3xl font-bold ${wallet.cash_available < 0 ? 'text-amber-600' : ''}`}>
              {formatCurrency(wallet.cash_available)}
            </div>
            <div className="text-sm text-muted-foreground">
              {formatCurrency(stats.open_exposure)} in positions
            </div>
            <p className="text-xs text-muted-foreground mt-1" title={wallet.cash_available < 0 ? 'Negative = oversubscribed. No new trades until positions resolve and free up cash.' : 'Resolved trades have a 3-hour cool-off before proceeds are added to available cash'}>
              {wallet.cash_available < 0 ? 'Cash (paused - no new trades until resolved)' : 'Cash Available (3h cool-off on resolved)'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className={`text-3xl font-bold ${stats.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(stats.realized_pnl)}
            </div>
            <div className="text-sm text-muted-foreground">
              {stats.won + stats.lost} resolved
            </div>
            <p className="text-xs text-muted-foreground mt-1">Realized P&L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className={`text-3xl font-bold ${stats.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(stats.unrealized_pnl)}
            </div>
            <div className="text-sm text-muted-foreground">
              {stats.open_positions} open
            </div>
            <p className="text-xs text-muted-foreground mt-1">Unrealized P&L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{stats.total_trades}</div>
            <div className="text-sm text-muted-foreground">
              {wallet.trades_seen} seen • {wallet.trades_skipped} skipped
            </div>
            <p className="text-xs text-muted-foreground mt-1">Trades Taken</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">
              {stats.win_rate !== null ? `${(stats.win_rate * 100).toFixed(1)}%` : '-'}
            </div>
            <div className="text-sm">
              <span className="text-green-600">{stats.won} W</span>
              {' • '}
              <span className="text-red-600">{stats.lost} L</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Win Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">
              {stats.max_drawdown_pct != null && stats.won + stats.lost >= 1
                ? `${stats.max_drawdown_pct.toFixed(1)}%`
                : '-'}
            </div>
            <div className="text-sm text-muted-foreground">
              {stats.max_drawdown_usd != null && stats.won + stats.lost >= 1
                ? formatPnl(-stats.max_drawdown_usd)
                : ''}
            </div>
            <p className="text-xs text-muted-foreground mt-1" title="Largest peak-to-trough decline in equity">Max Drawdown</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">
              {stats.sharpe_ratio != null ? stats.sharpe_ratio.toFixed(2) : '-'}
            </div>
            <div className="text-sm text-muted-foreground">
              Per-trade
            </div>
            <p className="text-xs text-muted-foreground mt-1" title="Mean PnL / Std PnL across resolved trades">Sharpe Ratio</p>
          </CardContent>
        </Card>
      </div>

      {/* Test Status & Duration */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                <strong>Test Period:</strong>{' '}
                {new Date(wallet.start_date.value).toLocaleDateString()} - {new Date(wallet.end_date.value).toLocaleDateString()}
              </span>
            </div>
            <Badge variant={
              wallet.test_status === 'ACTIVE' ? 'default' : 
              wallet.test_status === 'ENDED' ? 'secondary' : 'outline'
            }>
              {wallet.test_status === 'ACTIVE' && `${Math.ceil(wallet.hours_remaining / 24)} days remaining`}
              {wallet.test_status === 'ENDED' && 'Test Ended'}
              {wallet.test_status === 'SCHEDULED' && 'Scheduled'}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {wallet.allocation_method === 'KELLY' ? (
                  <>Sizing: <strong>Kelly ({((wallet.kelly_fraction || 0.25) * 100).toFixed(0)}%)</strong> • ${wallet.min_bet?.toFixed(2) || '0.50'}-${wallet.max_bet?.toFixed(2) || '10.00'}</>
                ) : wallet.allocation_method === 'FIXED' ? (
                  <>Bet size: <strong>${((wallet.bet_size || 1.20) * (wallet.bet_allocation_weight || 1.0)).toFixed(2)}</strong> per trade</>
                ) : (
                  <>Sizing: <strong>{wallet.allocation_method || 'FIXED'}</strong> • ${wallet.min_bet?.toFixed(2) || '0.50'}-${wallet.max_bet?.toFixed(2) || '10.00'}</>
                )}
              </span>
            </div>
            {wallet.last_sync_time && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-3 w-3" />
                Last sync: {new Date(wallet.last_sync_time.value).toLocaleString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Strategy Parameters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {wallet.use_model && (
          <Badge variant="outline">
            <Target className="h-3 w-3 mr-1" />
            Model ≥{((wallet.model_threshold || 0) * 100).toFixed(0)}%
          </Badge>
        )}
        <Badge variant="outline">
          Price: {((wallet.price_min || 0) * 100).toFixed(0)}¢ - {((wallet.price_max || 1) * 100).toFixed(0)}¢
        </Badge>
        {(wallet.min_edge || 0) > 0 && (
          <Badge variant="outline">
            Edge ≥{((wallet.min_edge || 0) * 100).toFixed(0)}%
          </Badge>
        )}
        <Badge variant={wallet.is_active ? 'default' : 'secondary'}>
          {wallet.is_active ? 'Active' : 'Paused'}
        </Badge>
      </div>

      {/* Strategy Description Panel */}
      {wallet.detailed_description && (
        <StrategyDetailsCard detailedDescription={wallet.detailed_description} description={wallet.description} />
      )}

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Open Positions ({stats.open_positions})
          </TabsTrigger>
          <TabsTrigger value="trades" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Recent Trades
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* Open Positions Tab */}
        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Open Positions
              </CardTitle>
              <CardDescription>
                Active positions waiting for market resolution
              </CardDescription>
            </CardHeader>
            <CardContent>
              {openPositions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No open positions</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <PosSortHeader field="market" label="Market" />
                      <PosSortHeader field="trader" label="Trader" />
                      <PosSortHeader field="wr" label="WR" align="right" />
                      <PosSortHeader field="entry" label="Entry" align="right" />
                      <TableHead className="text-right">ML</TableHead>
                      <TableHead className="text-right">Conv</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <PosSortHeader field="size" label="Cost" align="right" />
                      <TableHead className="text-right">Value</TableHead>
                      <PosSortHeader field="pnl" label="P&L" align="right" />
                      <PosSortHeader field="order_time" label="Ordered" align="right" />
                      <TableHead className="text-right">Resolves</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPositions.map((pos) => {
                      // Calculate current value: shares * current_price
                      const shares = pos.entry_price > 0 ? pos.size / pos.entry_price : 0;
                      const currentValue = pos.current_price !== null ? shares * pos.current_price : null;
                      const minutes = pos.minutes_to_resolution ?? 0;
                      const eventEnded = minutes < 0;
                      const price = pos.current_price;
                      // When event ended but market not resolved, P&L is unknown (final will be 0¢ or 100¢).
                      // Last price still counts for display; Value and P&L show "Pending".
                      const showPendingPnl = eventEnded && price != null && price > 0.05 && price < 0.95;

                      return (
                        <TableRow key={pos.order_id}>
                          <TableCell>
                            <div className="max-w-xs">
                              <div className="font-medium truncate">
                                {pos.market_slug ? (
                                  <a
                                    href={`https://polymarket.com/market/${pos.market_slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline"
                                  >
                                    {pos.market_title}
                                  </a>
                                ) : (
                                  pos.market_title
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Betting: {pos.token_label}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <a 
                              href={`https://polymarket.com/profile/${pos.trader_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              {pos.trader_name || (pos.trader_address ? `${pos.trader_address.slice(0, 6)}...${pos.trader_address.slice(-4)}` : '-')}
                            </a>
                          </TableCell>
                          <TableCell className="text-right">
                            {pos.trader_win_rate != null && typeof pos.trader_win_rate === 'number' ? (
                              <span className={`font-mono text-xs ${pos.trader_win_rate >= 0.60 ? 'text-green-600' : pos.trader_win_rate >= 0.55 ? 'text-yellow-600' : ''}`}>
                                {(pos.trader_win_rate * 100).toFixed(0)}%
                              </span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {((pos.entry_price || 0) * 100).toFixed(0)}¢
                          </TableCell>
                          <TableCell className="text-right">
                            {pos.model_probability != null && typeof pos.model_probability === 'number' ? (
                              <span className={`font-mono text-xs ${pos.model_probability >= 0.60 ? 'text-green-600' : pos.model_probability >= 0.55 ? 'text-yellow-600' : ''}`}>
                                {(pos.model_probability * 100).toFixed(0)}%
                              </span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {pos.conviction != null && typeof pos.conviction === 'number' ? (
                              <span className={`font-mono text-xs ${pos.conviction >= 2.0 ? 'text-green-600' : pos.conviction >= 1.5 ? 'text-yellow-600' : ''}`}>
                                {pos.conviction.toFixed(1)}x
                              </span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {price != null && typeof price === 'number' ? (
                              <span 
                                className={
                                  showPendingPnl 
                                    ? 'text-amber-600' 
                                    : price > (pos.entry_price || 0) ? 'text-green-600' : price < (pos.entry_price || 0) ? 'text-red-600' : ''
                                }
                                title={showPendingPnl ? 'Last price; final resolution (0¢ or 100¢) pending' : undefined}
                              >
                                {(price * 100).toFixed(0)}¢
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatCurrency(pos.size)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {showPendingPnl ? (
                              <span className="text-amber-600" title="Awaiting Polymarket resolution">Pending</span>
                            ) : currentValue !== null ? (
                              <span className={currentValue > pos.size ? 'text-green-600' : currentValue < pos.size ? 'text-red-600' : ''}>
                                {formatCurrency(currentValue)}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-semibold ${showPendingPnl ? 'text-amber-600' : pos.unrealized_pnl !== null ? (pos.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                            {showPendingPnl ? (
                              <span title="Awaiting Polymarket resolution">Pending</span>
                            ) : pos.unrealized_pnl !== null ? (
                              formatPnl(pos.unrealized_pnl)
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(pos.order_time)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatTimeAgo(minutes)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent Trades Tab */}
        <TabsContent value="trades">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Recent Trades
              </CardTitle>
              <CardDescription>
                Last 50 resolved trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentTrades.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No resolved trades yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TradeSortHeader field="market" label="Market" />
                      <TradeSortHeader field="trader" label="Trader" />
                      <TableHead>Bet</TableHead>
                      <TableHead>Winner</TableHead>
                      <TradeSortHeader field="entry" label="Entry" align="right" />
                      <TradeSortHeader field="size" label="Size" align="right" />
                      <TradeSortHeader field="outcome" label="Result" align="right" />
                      <TradeSortHeader field="pnl" label="P&L" align="right" />
                      <TradeSortHeader field="order_time" label="Ordered" align="right" />
                      <TradeSortHeader field="resolved_time" label="Resolved" align="right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTrades.map((trade) => (
                      <TableRow key={trade.order_id}>
                        <TableCell>
                          <div className="max-w-xs">
                            <div className="font-medium truncate">
                              {trade.market_slug ? (
                                <a
                                  href={`https://polymarket.com/market/${trade.market_slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {trade.market_title}
                                </a>
                              ) : (
                                trade.market_title
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {trade.token_label}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {trade.winning_label}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(trade.entry_price * 100).toFixed(1)}¢
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(trade.size)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={trade.outcome === 'WON' ? 'default' : 'destructive'}>
                            {trade.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPnl(trade.pnl)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(trade.order_time)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(trade.resolved_time)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          {/* Hourly performance charts */}
          {(() => {
            const chartData = snapshots.length > 0
              ? snapshots.map((s) => ({
                  time: new Date(s.snapshot_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                  fullTime: s.snapshot_at,
                  returnPct: Number(s.return_pct),
                  cash: Number(s.cash),
                  totalPnl: Number(s.total_pnl),
                  cumulatedReturn: Number(s.return_pct),
                }))
              : dailyPnl.length > 0
                ? dailyPnl.map((d, i) => {
                    const date = new Date(d.date.value);
                    const start = wallet?.starting_balance ?? 1000;
                    const retPct = start > 0 ? (d.cumulative_pnl / start) * 100 : 0;
                    return {
                      time: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                      fullTime: d.date.value,
                      returnPct: retPct,
                      cash: start + d.cumulative_pnl,
                      totalPnl: d.cumulative_pnl,
                      cumulatedReturn: retPct,
                    };
                  })
                : [];

            return chartData.length > 0 ? (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Performance Over Time
                  </CardTitle>
                  <CardDescription>
                    {snapshots.length > 0 ? 'Hourly snapshots' : 'Daily (hourly snapshots appear after cron runs)'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="time"
                          tick={{ fontSize: 11 }}
                          tickLine={false}
                        />
                        <YAxis
                          yAxisId="left"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `$${v.toFixed(0)}`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                          labelFormatter={(_, payload) => payload[0]?.payload?.fullTime}
                          formatter={(value: number, name: string) => [
                            name === 'returnPct' || name === 'cumulatedReturn' ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%` : `$${value.toFixed(2)}`,
                            name === 'returnPct' ? 'PnL %' : name === 'cash' ? 'Cash' : name === 'cumulatedReturn' ? 'Cumulated return %' : name,
                          ]}
                        />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="returnPct"
                          name="PnL % / Cumulated return"
                          stroke="hsl(142 76% 36%)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="cash"
                          name="Cash"
                          stroke="hsl(221 83% 53%)"
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ) : null;
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daily P&L */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Daily Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyPnl.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No daily data yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">W/L</TableHead>
                        <TableHead className="text-right">Day P&L</TableHead>
                        <TableHead className="text-right">Cumulative</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyPnl.map((day) => (
                        <TableRow key={day.date.value}>
                          <TableCell className="font-medium">
                            {new Date(day.date.value).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">{day.trades}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-green-600">{day.won}</span>
                            /
                            <span className="text-red-600">{day.lost}</span>
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${day.daily_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPnl(day.daily_pnl)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${day.cumulative_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPnl(day.cumulative_pnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* By Category */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Performance by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {categoryPerf.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No category data yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryPerf.map((cat) => (
                        <TableRow key={cat.category}>
                          <TableCell className="font-medium">{cat.category}</TableCell>
                          <TableCell className="text-right">{cat.trades}</TableCell>
                          <TableCell className="text-right">
                            {(cat.win_rate * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${cat.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPnl(cat.total_pnl)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
