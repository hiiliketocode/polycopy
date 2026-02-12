/**
 * LT Strategy Detail Page (V2)
 * Matches FT detail page format with live pricing and all KPIs.
 * Uses new V2 schema: risk state inline on lt_strategies, 3-bucket cash model.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft,
  RefreshCw,
  Briefcase,
  ListOrdered,
  BarChart3,
  Settings,
  Target,
  Activity,
  Filter,
  FileText,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ExternalLink,
  Clock
} from 'lucide-react';
import { RiskSettingsPanel } from '@/components/lt/risk-settings-panel';

interface LTStrategy {
  strategy_id: string;
  ft_wallet_id: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_paused: boolean;
  shadow_mode: boolean;
  launched_at: string | null;
  initial_capital: number;
  available_cash: number;
  locked_capital: number;
  cooldown_capital: number;
  wallet_address: string;
  slippage_tolerance_pct: number;
  order_type: string;
  min_order_size_usd: number;
  max_order_size_usd: number;
  cooldown_hours: number;
  // Risk rules (inline)
  max_position_size_usd: number | null;
  max_total_exposure_usd: number | null;
  daily_budget_usd: number | null;
  max_daily_loss_usd: number | null;
  circuit_breaker_loss_pct: number | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  max_hold_hours: number | null;
  // Risk state (inline)
  daily_spent_usd: number;
  daily_loss_usd: number;
  consecutive_losses: number;
  peak_equity: number;
  current_drawdown_pct: number;
  circuit_breaker_active: boolean;
  last_sync_time: string | null;
  created_at: string;
}

interface Stats {
  total_trades: number;
  total_attempts: number;
  attempts: number;
  open_positions: number;
  won: number;
  lost: number;
  win_rate: number | null;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  avg_trade_size: number;
  filled: number;
  failed: number;
  pending: number;
  fill_rate_pct: number | null;
  avg_slippage_pct: number | null;
  avg_latency_ms: number | null;
}

interface Position {
  lt_order_id: string;
  order_id: string;
  market_title: string;
  market_slug: string | null;
  token_label: string;
  trader_address: string;
  ft_trader_wallet: string;
  executed_price: number;
  executed_size: number;
  executed_size_usd: number;
  shares_bought: number;
  signal_price: number;
  signal_size_usd?: number;
  order_placed_at: string;
  outcome: string;
  current_price?: number | null;
}

interface Trade {
  lt_order_id: string;
  market_title: string;
  market_slug: string | null;
  token_label: string;
  executed_price: number;
  executed_size: number;
  executed_size_usd: number;
  shares_bought: number;
  outcome: string;
  pnl: number;
  resolved_at: string;
  order_placed_at: string;
}

type SortField = 'market' | 'trader' | 'entry' | 'current' | 'size' | 'value' | 'pnl' | 'order_time';

export default function LTDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  
  const [strategy, setStrategy] = useState<LTStrategy | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Position[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'pending' | 'trades' | 'performance' | 'settings'>('positions');
  const [sortField, setSortField] = useState<SortField>('order_time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [livePrices, setLivePrices] = useState<Record<string, { current_price: number; unrealized_pnl: number }>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Fetch live prices for open positions
  const fetchLivePrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/lt/live-prices?strategy=${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.prices) {
        setLivePrices(data.prices);
      }
    } catch (error) {
      console.error('Failed to fetch live prices:', error);
    }
  }, [id]);

  // Load strategy data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [stratRes, ordersRes] = await Promise.all([
        fetch(`/api/lt/strategies/${id}`, { cache: 'no-store' }),
        fetch(`/api/lt/strategies/${id}/orders`, { cache: 'no-store' })
      ]);

      const stratData = await stratRes.json();
      const ordersData = await ordersRes.json();

      if (!stratRes.ok) throw new Error(stratData.error || 'Failed to load strategy');
      if (!ordersRes.ok) throw new Error(ordersData.error || 'Failed to load orders');

      setStrategy(stratData.strategy);
      setStats(ordersData.stats || null);
      setOpenPositions(ordersData.open_orders || []);
      setPendingOrders(ordersData.pending_orders || []);
      setClosedTrades(ordersData.closed_orders || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
    fetchLivePrices();
  }, [loadData, fetchLivePrices]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshing) {
        setRefreshing(true);
        loadData().finally(() => setRefreshing(false));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData, refreshing]);

  // Auto-refresh live prices every 15 seconds
  useEffect(() => {
    const priceInterval = setInterval(() => {
      fetchLivePrices();
    }, 15000);
    return () => clearInterval(priceInterval);
  }, [fetchLivePrices]);

  const handleRefresh = () => {
    setRefreshing(true);
    Promise.all([loadData(), fetchLivePrices()])
      .finally(() => setRefreshing(false));
  };

  const patchStrategy = async (updates: Record<string, any>) => {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await fetch(`/api/lt/strategies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setStrategy(data.strategy);
      setSettingsMsg('Saved');
      setTimeout(() => setSettingsMsg(null), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' }) => (
    <TableHead
      className={`cursor-pointer ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => handleSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {sortField === field ? (
          sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  );

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...openPositions].sort((a, b) => {
      let aVal: any = 0;
      let bVal: any = 0;

      switch (sortField) {
        case 'market':
          aVal = a.market_title || '';
          bVal = b.market_title || '';
          break;
        case 'trader':
          aVal = a.trader_address || a.ft_trader_wallet || '';
          bVal = b.trader_address || b.ft_trader_wallet || '';
          break;
        case 'entry':
          aVal = a.executed_price || 0;
          bVal = b.executed_price || 0;
          break;
        case 'current':
          aVal = a.current_price || 0;
          bVal = b.current_price || 0;
          break;
        case 'size':
          aVal = Number(a.executed_size_usd) || (a.executed_price * (a.shares_bought || a.executed_size || 0));
          bVal = Number(b.executed_size_usd) || (b.executed_price * (b.shares_bought || b.executed_size || 0));
          break;
        case 'pnl': {
          const aPnl = a.current_price ? ((a.current_price - a.executed_price) * (a.shares_bought || a.executed_size || 0)) : 0;
          const bPnl = b.current_price ? ((b.current_price - b.executed_price) * (b.shares_bought || b.executed_size || 0)) : 0;
          aVal = aPnl;
          bVal = bPnl;
          break;
        }
        case 'order_time':
          aVal = new Date(a.order_placed_at || a.lt_order_id).getTime();
          bVal = new Date(b.order_placed_at || b.lt_order_id).getTime();
          break;
      }

      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [openPositions, sortField, sortDir]);

  // Helper functions
  const formatUsd = (n: number | null | undefined): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const formatPnl = (n: number | null | undefined): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const formatPct = (n: number | null | undefined): string => {
    if (n === null || n === undefined || isNaN(n)) return '-';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  };

  const formatPrice = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '-';
    if (n < 0.01) return '<1c';
    return `${(n * 100).toFixed(0)}c`;
  };

  // Client-side unrealized P&L using live prices (must be before early returns to maintain hook order)
  const liveUnrealizedPnl = useMemo(() => {
    return openPositions.reduce((sum, pos) => {
      const liveData = livePrices[pos.lt_order_id];
      const currentPrice = liveData?.current_price ?? pos.current_price ?? pos.executed_price;
      const shares = Number(pos.shares_bought) || Number(pos.executed_size) || 0;
      return sum + ((currentPrice - pos.executed_price) * shares);
    }, 0);
  }, [openPositions, livePrices]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">
          <Activity className="h-12 w-12 mx-auto mb-4 animate-pulse text-muted-foreground" />
          <p className="text-muted-foreground">Loading strategy...</p>
        </div>
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-red-600 mb-4">{error || 'Strategy not found'}</p>
          <Link href="/lt">
            <Button>Back to LT</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Compute equity from 3-bucket model
  const equity = (Number(strategy.available_cash) || 0) + (Number(strategy.locked_capital) || 0) + (Number(strategy.cooldown_capital) || 0);
  const returnPct = Number(strategy.initial_capital) > 0
    ? (equity - Number(strategy.initial_capital)) / Number(strategy.initial_capital) * 100
    : 0;

  // Break down locked capital: filled positions vs pending orders
  const lockedInPositions = openPositions.reduce((sum, pos) => sum + (Number(pos.executed_size_usd) || (Number(pos.executed_price) * Number(pos.shares_bought || 0))), 0);
  const lockedInPending = Math.max(0, Number(strategy.locked_capital) - lockedInPositions);
  const winRate = stats && (stats.won + stats.lost) > 0 
    ? (stats.won / (stats.won + stats.lost)) * 100 
    : null;

  const realizedPnl = stats?.realized_pnl || 0;
  const totalPnl = realizedPnl + liveUnrealizedPnl;
  const liveTotalReturnPct = Number(strategy.initial_capital) > 0
    ? (totalPnl / Number(strategy.initial_capital)) * 100
    : 0;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link href="/lt" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to LT
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            {strategy.display_name}
            <Badge className="bg-purple-100 text-purple-700 border-purple-200">LIVE</Badge>
            {strategy.shadow_mode && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">SHADOW</Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mirrors <Link href={`/ft/${strategy.ft_wallet_id}`} className="text-[#FDB022] hover:underline">{strategy.ft_wallet_id}</Link>
            {' · '}{strategy.is_active ? (strategy.is_paused ? 'Paused' : 'Active') : 'Inactive'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/lt/logs?strategy=${id}`}>
            <Button variant="outline" size="sm" className="border-[#FDB022] text-[#FDB022]">
              <Filter className="h-4 w-4 mr-2" />
              Strategy Logs
            </Button>
          </Link>
          <Link href="/lt/logs">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2" />
              All Logs
            </Button>
          </Link>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatUsd(Number(strategy.initial_capital))}</div>
            <div className="text-xs text-muted-foreground">
              Cash: {formatUsd(Number(strategy.available_cash))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Capital</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(totalPnl)}
            </div>
            <div className={`text-sm font-medium ${liveTotalReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPct(liveTotalReturnPct)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total P&L</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1">
              {formatPnl(realizedPnl)}
            </div>
            <div className={`text-lg font-semibold ${liveUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(liveUnrealizedPnl)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-muted-foreground">Realized</span> / Unrealized
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.open_positions || 0}</div>
            <div className="text-xs text-muted-foreground">
              {pendingOrders.length > 0 ? `+${pendingOrders.length} pending` : 'open'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {winRate !== null ? `${winRate.toFixed(0)}%` : '-'}
            </div>
            <div className="text-xs text-green-600">
              {stats?.won || 0}W
            </div>
            <div className="text-xs text-red-600">
              {stats?.lost || 0}L
            </div>
            <p className="text-xs text-muted-foreground mt-1">Win Rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {stats?.fill_rate_pct !== null && stats?.fill_rate_pct !== undefined ? `${stats.fill_rate_pct.toFixed(0)}%` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats?.filled || 0} / {stats?.attempts || 0} fills
            </div>
            <p className="text-xs text-muted-foreground mt-1">Fill Rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {(stats && stats.avg_slippage_pct !== null && stats.avg_slippage_pct !== undefined) ? `${(Math.abs(stats.avg_slippage_pct) * 100).toFixed(2)}%` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">
              Avg slippage
            </div>
            <p className="text-xs text-muted-foreground mt-1">Execution</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Banner */}
      {strategy.is_paused && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-900">Strategy Paused</p>
                {strategy.circuit_breaker_active && (
                  <p className="text-sm text-orange-700">Circuit breaker triggered</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk State Summary (inline from strategy) */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Cash & Risk Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Available Cash:</span>
              <span className="ml-2 font-semibold text-green-600">{formatUsd(Number(strategy.available_cash))}</span>
            </div>
            <div>
              <span className="text-muted-foreground">In Positions:</span>
              <span className="ml-2 font-semibold">{formatUsd(lockedInPositions)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">In Pending:</span>
              <span className="ml-2 font-semibold text-amber-600">{formatUsd(lockedInPending)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Drawdown:</span>
              <span className={`ml-2 font-semibold ${Number(strategy.current_drawdown_pct) > 0.15 ? 'text-orange-600' : ''}`}>
                {(Number(strategy.current_drawdown_pct) * 100).toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Daily Spent:</span>
              <span className="ml-2 font-semibold">{formatUsd(Number(strategy.daily_spent_usd))}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Circuit Breaker:</span>
              <span className={`ml-2 font-semibold ${strategy.circuit_breaker_active ? 'text-red-600' : 'text-green-600'}`}>
                {strategy.circuit_breaker_active ? 'Active' : 'OK'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="mb-4">
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Open Trades ({stats?.open_positions || 0})
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending ({pendingOrders.length})
          </TabsTrigger>
          <TabsTrigger value="trades" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Resolved ({(stats?.won || 0) + (stats?.lost || 0)})
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Pending Orders Tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Orders
              </CardTitle>
              <CardDescription>
                Limit orders placed on Polymarket, waiting to be filled. Fill status syncs every minute. GTD orders expire after 10 minutes if unfilled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No pending orders</p>
                  {lockedInPending > 0.01 && (
                    <p className="text-sm text-amber-600 mt-2">
                      {formatUsd(lockedInPending)} in capital is still locked from expired/cancelled orders. 
                      The sync cron will release this automatically.
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Size (USD)</TableHead>
                        <TableHead className="text-right">Placed</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingOrders.map((p) => (
                        <TableRow key={p.lt_order_id}>
                          <TableCell className="max-w-[350px]">
                            <div className="font-medium">
                              {p.market_slug ? (
                                <a
                                  href={`https://polymarket.com/market/${p.market_slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                >
                                  {p.market_title}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              ) : (
                                p.market_title
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{p.token_label}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatPrice(p.signal_price)}</TableCell>
                          <TableCell className="text-right">{formatUsd(Number(p.signal_size_usd) || Number(p.signal_price) * Number(p.shares_bought || 0))}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {p.order_placed_at ? new Date(p.order_placed_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">Pending</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Filled Positions Tab */}
        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Open Trades
              </CardTitle>
              <CardDescription>
                Active positions waiting for market resolution
              </CardDescription>
            </CardHeader>
            <CardContent>
              {openPositions.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No open trades{pendingOrders.length > 0 ? ' — check the Pending tab for orders waiting to fill' : ''}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHeader field="market" label="Market" />
                      <SortHeader field="trader" label="Trader" />
                      <SortHeader field="entry" label="Entry" align="right" />
                      <SortHeader field="current" label="Current" align="right" />
                      <SortHeader field="size" label="Cost" align="right" />
                      <TableHead className="text-right">Value</TableHead>
                      <SortHeader field="pnl" label="P&L" align="right" />
                      <SortHeader field="order_time" label="Ordered" align="right" />
                      <TableHead className="text-right">Resolves</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPositions.map((pos) => {
                      const liveData = livePrices[pos.lt_order_id];
                      const currentPrice = liveData?.current_price ?? pos.current_price ?? pos.executed_price;
                      const hasLivePrice = !!liveData;
                      
                      const shares = Number(pos.shares_bought) || Number(pos.executed_size) || 0;
                      const cost = Number(pos.executed_size_usd) || (pos.executed_price * shares);
                      const currentValue = currentPrice * shares;
                      const unrealizedPnl = (currentPrice - pos.executed_price) * shares;

                      return (
                        <TableRow key={pos.lt_order_id}>
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
                            {pos.trader_address || pos.ft_trader_wallet ? (
                              <a
                                href={`https://polymarket.com/profile/${pos.trader_address || pos.ft_trader_wallet}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-mono text-xs"
                              >
                                {`${(pos.trader_address || pos.ft_trader_wallet || '').slice(0, 6)}...${(pos.trader_address || pos.ft_trader_wallet || '').slice(-4)}`}
                              </a>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatPrice(pos.executed_price)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span
                              className={
                                currentPrice > (pos.executed_price || 0) ? 'text-green-600' :
                                currentPrice < (pos.executed_price || 0) ? 'text-red-600' : ''
                              }
                            >
                              {formatPrice(currentPrice)}
                            </span>
                            {hasLivePrice && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 ml-1 animate-pulse" title="Live" />
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatUsd(cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            <span className={currentValue > cost ? 'text-green-600' : currentValue < cost ? 'text-red-600' : ''}>
                              {formatUsd(currentValue)}
                            </span>
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs font-semibold ${unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatPnl(unrealizedPnl)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            {pos.order_placed_at ? new Date(pos.order_placed_at).toLocaleString('en-US', { 
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            }) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            Live
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

        {/* Resolved Trades Tab */}
        <TabsContent value="trades">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5" />
                Resolved Trades
              </CardTitle>
              <CardDescription>
                Historical trades with final P&L
              </CardDescription>
            </CardHeader>
            <CardContent>
              {closedTrades.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No resolved trades yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Outcome</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">Placed</TableHead>
                        <TableHead className="text-right">Resolved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedTrades.map((trade) => {
                        const shares = Number(trade.shares_bought) || Number(trade.executed_size) || 0;
                        const cost = Number(trade.executed_size_usd) || (trade.executed_price * shares);

                        return (
                          <TableRow key={trade.lt_order_id}>
                            <TableCell className="max-w-[300px]">
                              <div className="font-medium">
                                {trade.market_slug ? (
                                  <a
                                    href={`https://polymarket.com/market/${trade.market_slug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline inline-flex items-center gap-1"
                                  >
                                    {trade.market_title}
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  trade.market_title
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{trade.token_label}</div>
                            </TableCell>
                            <TableCell className="text-right">{formatPrice(trade.executed_price)}</TableCell>
                            <TableCell className="text-right">{formatUsd(cost)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={trade.outcome === 'WON' ? 'default' : trade.outcome === 'LOST' ? 'destructive' : 'secondary'} className="text-xs">
                                {trade.outcome}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${(trade.pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPnl(trade.pnl)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {trade.order_placed_at ? new Date(trade.order_placed_at).toLocaleDateString() : '-'}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {trade.resolved_at ? new Date(trade.resolved_at).toLocaleDateString() : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Trade Size</p>
                    <p className="text-xl font-semibold">{formatUsd(stats?.avg_trade_size || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Drawdown</p>
                    <p className="text-xl font-semibold text-red-600">
                      {(Number(strategy.current_drawdown_pct) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fill Rate</p>
                    <p className="text-xl font-semibold">
                      {(stats && stats.fill_rate_pct != null) ? `${stats.fill_rate_pct.toFixed(0)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Slippage</p>
                    <p className="text-xl font-semibold">
                      {(stats && stats.avg_slippage_pct != null) ? `${(Math.abs(stats.avg_slippage_pct) * 100).toFixed(2)}%` : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Execution Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Attempts:</span>
                    <span className="ml-2 font-semibold">{stats?.attempts || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Filled:</span>
                    <span className="ml-2 font-semibold text-green-600">{stats?.filled || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pending:</span>
                    <span className="ml-2 font-semibold text-orange-600">{stats?.pending || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Failed:</span>
                    <span className="ml-2 font-semibold text-red-600">{stats?.failed || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Avg Latency:</span>
                    <span className="ml-2 font-semibold">{stats?.avg_latency_ms != null ? `${stats.avg_latency_ms}ms` : '-'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="space-y-6">
            {/* Strategy Config */}
            <Card>
              <CardHeader>
                <CardTitle>Strategy Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Initial Capital:</span>
                    <span className="ml-2 font-semibold">{formatUsd(Number(strategy.initial_capital))}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Slippage Tolerance:</span>
                    <span className="ml-2 font-semibold">{strategy.slippage_tolerance_pct}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Order Type:</span>
                    <span className="ml-2 font-semibold">{strategy.order_type}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cooldown Hours:</span>
                    <span className="ml-2 font-semibold">{strategy.cooldown_hours}h</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Order Size Range:</span>
                    <span className="ml-2 font-semibold">{formatUsd(strategy.min_order_size_usd)} - {formatUsd(strategy.max_order_size_usd)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wallet:</span>
                    <span className="ml-2 font-mono text-xs">{strategy.wallet_address?.substring(0, 10)}...</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <RiskSettingsPanel strategyId={id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
