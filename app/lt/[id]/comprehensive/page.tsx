/**
 * Comprehensive LT Strategy Detail Page
 * Matches FT detail page format with live pricing and all KPIs
 * 
 * This will replace the existing /lt/[id]/page.tsx once complete
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
  TrendingUp,
  TrendingDown,
  Briefcase,
  ListOrdered,
  BarChart3,
  Settings,
  Target,
  Clock,
  Activity,
  Filter,
  FileText,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown
} from 'lucide-react';
import { RiskSettingsPanel } from '@/components/lt/risk-settings-panel';

interface LTStrategy {
  strategy_id: string;
  ft_wallet_id: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_paused: boolean;
  launched_at: string | null;
  starting_capital: number;
  wallet_address: string;
  slippage_tolerance_pct: number;
  order_type: string;
  last_sync_time: string | null;
  created_at: string;
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
  current_balance: number;
  cash_available: number;
  avg_trade_size: number;
  first_trade: string | null;
  last_trade: string | null;
  attempts: number;
  filled: number;
  failed: number;
  pending: number;
  fill_rate_pct: number | null;
  avg_slippage_pct: number | null;
}

interface RiskState {
  current_equity: number;
  peak_equity: number;
  current_drawdown_pct: number;
  consecutive_losses: number;
  daily_spent_usd: number;
  is_paused: boolean;
  circuit_breaker_active: boolean;
  pause_reason: string | null;
}

interface Position {
  lt_order_id: string;
  order_id: string;
  market_title: string;
  market_slug: string | null;
  token_label: string;
  trader_address: string;
  executed_price: number;
  executed_size: number;
  signal_price: number;
  order_placed_at: string;
  outcome: string;
  // Will add current_price via live pricing
  current_price?: number | null;
}

interface Trade {
  lt_order_id: string;
  market_title: string;
  token_label: string;
  executed_price: number;
  executed_size: number;
  outcome: string;
  pnl: number;
  resolved_at: string;
  order_placed_at: string;
}

type SortField = 'market' | 'trader' | 'entry' | 'current' | 'size' | 'value' | 'pnl' | 'order_time' | 'resolves';

export default function ComprehensiveLTDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  
  const [strategy, setStrategy] = useState<LTStrategy | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [riskState, setRiskState] = useState<RiskState | null>(null);
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [closedTrades, setClosedTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'trades' | 'performance' | 'settings'>('positions');
  const [sortField, setSortField] = useState<SortField>('order_time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
      
      // Extract risk state if available
      const rs = stratData.strategy?.lt_risk_state;
      if (Array.isArray(rs) && rs.length > 0) {
        setRiskState(rs[0]);
      } else if (rs && typeof rs === 'object') {
        setRiskState(rs as RiskState);
      }

      // Set stats
      setStats(ordersData.stats || null);
      
      // Set positions and trades
      setOpenPositions(ordersData.open_orders || []);
      setClosedTrades(ordersData.closed_orders || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!refreshing) {
        setRefreshing(true);
        loadData().finally(() => setRefreshing(false));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [loadData, refreshing]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData().finally(() => setRefreshing(false));
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
          aVal = a.trader_address || '';
          bVal = b.trader_address || '';
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
          aVal = (a.executed_price * a.executed_size) || 0;
          bVal = (b.executed_price * b.executed_size) || 0;
          break;
        case 'value':
          aVal = a.current_price ? (a.current_price * a.executed_size) : 0;
          bVal = b.current_price ? (b.current_price * b.executed_size) : 0;
          break;
        case 'pnl':
          const aPnl = a.current_price ? ((a.current_price - a.executed_price) * a.executed_size) : 0;
          const bPnl = b.current_price ? ((b.current_price - b.executed_price) * b.executed_size) : 0;
          aVal = aPnl;
          bVal = bPnl;
          break;
        case 'order_time':
          aVal = new Date(a.order_placed_at).getTime();
          bVal = new Date(b.order_placed_at).getTime();
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
    if (n === null || n === undefined) return '-';
    return n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const formatPnl = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '-';
    const sign = n >= 0 ? '+' : '';
    return n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
  };

  const formatPct = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '-';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  };

  const formatPrice = (n: number | null | undefined): string => {
    if (n === null || n === undefined) return '-';
    if (n < 0.01) return '<1¢';
    return `${(n * 100).toFixed(0)}¢`;
  };

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

  const winRate = stats && (stats.won + stats.lost) > 0 
    ? (stats.won / (stats.won + stats.lost)) * 100 
    : null;
  
  const returnPct = strategy.starting_capital > 0
    ? ((riskState?.current_equity || strategy.starting_capital) - strategy.starting_capital) / strategy.starting_capital * 100
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

      {/* Summary Cards (Matching FT Format) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatUsd(riskState?.current_equity || strategy.starting_capital)}</div>
            <div className="text-xs text-muted-foreground">
              Cash: {formatUsd(stats?.cash_available || strategy.starting_capital)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className={`text-2xl font-bold ${(stats?.total_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(stats?.total_pnl || 0)}
            </div>
            <div className={`text-sm font-medium ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPct(returnPct)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total P&L</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground mb-1">
              {formatPnl(stats?.realized_pnl || 0)}
            </div>
            <div className={`text-lg font-semibold ${(stats?.unrealized_pnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPnl(stats?.unrealized_pnl || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-muted-foreground">Realized</span> / Unrealized
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.total_trades || 0}</div>
            <div className="text-xs text-muted-foreground">
              {stats?.open_positions || 0} open
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
              {stats?.fill_rate_pct !== null ? `${stats?.fill_rate_pct.toFixed(0)}%` : '-'}
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
              {stats?.avg_slippage_pct !== null ? `${(Math.abs(stats.avg_slippage_pct) * 100).toFixed(2)}%` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">
              Avg slippage
            </div>
            <p className="text-xs text-muted-foreground mt-1">Execution</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Banner (if paused or issues) */}
      {strategy.is_paused && riskState?.pause_reason && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-900">Strategy Paused</p>
                <p className="text-sm text-orange-700">{riskState.pause_reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risk State Summary */}
      {riskState && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              Risk Management Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Current Drawdown:</span>
                <span className={`ml-2 font-semibold ${riskState.current_drawdown_pct > 0.15 ? 'text-orange-600' : ''}`}>
                  {(riskState.current_drawdown_pct * 100).toFixed(2)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Peak Equity:</span>
                <span className="ml-2 font-semibold">{formatUsd(riskState.peak_equity)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Consecutive Losses:</span>
                <span className="ml-2 font-semibold">{riskState.consecutive_losses}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Daily Spent:</span>
                <span className="ml-2 font-semibold">{formatUsd(riskState.daily_spent_usd)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Circuit Breaker:</span>
                <span className={`ml-2 font-semibold ${riskState.circuit_breaker_active ? 'text-red-600' : 'text-green-600'}`}>
                  {riskState.circuit_breaker_active ? 'Active' : 'OK'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="mb-4">
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Open Trades ({stats?.open_positions || 0})
          </TabsTrigger>
          <TabsTrigger value="trades" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Resolved Trades ({(stats?.won || 0) + (stats?.lost || 0)})
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

        {/* Open Positions Tab */}
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
                <p className="text-center py-8 text-muted-foreground">No open positions</p>
              ) : (
                <div className="overflow-x-auto">
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
                        <SortHeader field="order_time" label="Placed" align="right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPositions.map((pos) => {
                        const cost = pos.executed_price * pos.executed_size;
                        const currentValue = pos.current_price ? pos.current_price * pos.executed_size : cost;
                        const unrealizedPnl = pos.current_price ? (pos.current_price - pos.executed_price) * pos.executed_size : 0;
                        const pnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : 0;

                        return (
                          <TableRow key={pos.lt_order_id}>
                            <TableCell className="max-w-[300px]">
                              <div className="font-medium">{pos.market_title}</div>
                              <div className="text-xs text-muted-foreground">
                                {pos.token_label} · {pos.executed_size.toFixed(2)} contracts
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {pos.trader_address ? `${pos.trader_address.substring(0, 6)}...${pos.trader_address.substring(38)}` : '-'}
                            </TableCell>
                            <TableCell className="text-right">{formatPrice(pos.executed_price)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {pos.current_price ? formatPrice(pos.current_price) : formatPrice(pos.executed_price)}
                            </TableCell>
                            <TableCell className="text-right">{formatUsd(cost)}</TableCell>
                            <TableCell className="text-right font-medium">{formatUsd(currentValue)}</TableCell>
                            <TableCell className={`text-right font-semibold ${unrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPnl(unrealizedPnl)}
                              <div className="text-xs">
                                {formatPct(pnlPct)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {new Date(pos.order_placed_at).toLocaleString('en-US', { 
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
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
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Outcome</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">Placed</TableHead>
                        <TableHead className="text-right">Resolved</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedTrades.map((trade) => {
                        const cost = trade.executed_price * trade.executed_size;

                        return (
                          <TableRow key={trade.lt_order_id}>
                            <TableCell className="max-w-[300px]">
                              <div className="font-medium">{trade.market_title}</div>
                              <div className="text-xs text-muted-foreground">{trade.token_label}</div>
                            </TableCell>
                            <TableCell className="text-right">{formatPrice(trade.executed_price)}</TableCell>
                            <TableCell className="text-right text-sm">{trade.executed_size.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{formatUsd(cost)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={trade.outcome === 'WON' ? 'default' : trade.outcome === 'LOST' ? 'destructive' : 'secondary'} className="text-xs">
                                {trade.outcome}
                              </Badge>
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPnl(trade.pnl)}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {new Date(trade.order_placed_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {new Date(trade.resolved_at).toLocaleDateString()}
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
            {/* Performance Metrics */}
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
                    <p className="text-sm text-muted-foreground">Max Drawdown</p>
                    <p className="text-xl font-semibold text-red-600">
                      {riskState ? `${(riskState.current_drawdown_pct * 100).toFixed(2)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fill Rate</p>
                    <p className="text-xl font-semibold">
                      {stats?.fill_rate_pct !== null ? `${stats.fill_rate_pct.toFixed(0)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Slippage</p>
                    <p className="text-xl font-semibold">
                      {stats?.avg_slippage_pct !== null ? `${(Math.abs(stats.avg_slippage_pct) * 100).toFixed(2)}%` : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Execution Quality */}
            <Card>
              <CardHeader>
                <CardTitle>Execution Quality</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
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
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="space-y-6">
            {/* Strategy Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Strategy Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Starting Capital:</span>
                    <span className="ml-2 font-semibold">{formatUsd(strategy.starting_capital)}</span>
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
                    <span className="text-muted-foreground">Wallet:</span>
                    <span className="ml-2 font-mono text-xs">{strategy.wallet_address.substring(0, 10)}...</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Risk Management Panel */}
            <RiskSettingsPanel strategyId={id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
