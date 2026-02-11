'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileText
} from 'lucide-react';

type ViewMode = 'ft' | 'lt' | 'all';
type SortField = 'name' | 'balance' | 'pnl' | 'pnl_pct' | 'taken' | 'won' | 'lost' | 'win_rate' | 'avg_size' | 'open';
type SortDir = 'asc' | 'desc';

interface UnifiedStrategy {
  id: string;
  type: 'FT' | 'LT';
  name: string;
  started: string;
  running_time: string;
  balance: number;
  pnl: number;
  pnl_pct: number;
  realized_pnl: number;
  unrealized_pnl: number;
  taken: number;
  avg_size: number;
  pct_made: number | null;
  open: number;
  won: number;
  lost: number;
  win_rate: number | null;
  cash_available: number;
  is_active: boolean;
  is_paused: boolean;
  drawdown_pct: number | null;
  
  // LT specific
  fill_rate?: number | null;
  avg_slippage?: number | null;
  attempts?: number;
  filled?: number;
  failed?: number;
  pending?: number;
  
  // Links
  detail_url: string;
  source_id: string; // ft_wallet_id or lt_strategy_id
}

export default function TradingOverviewPage() {
  const [ftStrategies, setFtStrategies] = useState<UnifiedStrategy[]>([]);
  const [ltStrategies, setLtStrategies] = useState<UnifiedStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [sortField, setSortField] = useState<SortField>('pnl_pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ftRes, ltRes] = await Promise.all([
        fetch('/api/ft/wallets', { cache: 'no-store' }),
        fetch('/api/lt/strategies', { cache: 'no-store' })
      ]);

      const ftData = await ftRes.json();
      const ltData = await ltRes.json();

      // Transform FT wallets
      const ft: UnifiedStrategy[] = (ftData.wallets || []).map((w: any) => ({
        id: `ft-${w.wallet_id}`,
        type: 'FT' as const,
        name: w.display_name,
        started: w.start_date?.value || w.start_date,
        running_time: calculateRunningTime(w.start_date?.value || w.start_date),
        balance: w.current_balance,
        pnl: w.total_pnl,
        pnl_pct: w.starting_balance > 0 ? (w.total_pnl / w.starting_balance) * 100 : 0,
        realized_pnl: w.realized_pnl,
        unrealized_pnl: w.unrealized_pnl,
        taken: w.total_trades,
        avg_size: w.avg_trade_size,
        pct_made: w.total_trades > 0 ? (w.total_trades / (w.trades_seen || w.total_trades)) * 100 : null,
        open: w.open_positions,
        won: w.won,
        lost: w.lost,
        win_rate: w.win_rate,
        cash_available: w.cash_available,
        is_active: w.is_active,
        is_paused: false,
        drawdown_pct: w.max_drawdown_pct,
        detail_url: `/ft/${w.wallet_id}`,
        source_id: w.wallet_id
      }));

      // Transform LT strategies
      const lt: UnifiedStrategy[] = (ltData.strategies || []).map((s: any) => {
        const stats = s.lt_stats || {};
        const riskState = Array.isArray(s.lt_risk_state) ? s.lt_risk_state[0] : s.lt_risk_state;
        
        return {
          id: `lt-${s.strategy_id}`,
          type: 'LT' as const,
          name: s.display_name,
          started: s.launched_at || s.created_at,
          running_time: calculateRunningTime(s.launched_at || s.created_at),
          balance: riskState?.current_equity || s.starting_capital,
          pnl: stats.total_pnl || 0,
          pnl_pct: s.starting_capital > 0 ? ((stats.total_pnl || 0) / s.starting_capital) * 100 : 0,
          realized_pnl: stats.realized_pnl || 0,
          unrealized_pnl: stats.unrealized_pnl || 0,
          taken: stats.total_trades || 0,
          avg_size: stats.avg_trade_size || 0,
          pct_made: null, // Not applicable for LT
          open: stats.open_positions || 0,
          won: stats.won || 0,
          lost: stats.lost || 0,
          win_rate: stats.win_rate,
          cash_available: stats.cash_available || s.starting_capital,
          is_active: s.is_active,
          is_paused: s.is_paused,
          drawdown_pct: riskState ? riskState.current_drawdown_pct * 100 : null,
          
          // LT specific
          fill_rate: stats.fill_rate_pct,
          avg_slippage: stats.avg_slippage_pct,
          attempts: stats.attempts || 0,
          filled: stats.filled || 0,
          failed: stats.failed || 0,
          pending: stats.pending || 0,
          
          detail_url: `/lt/${s.strategy_id}`,
          source_id: s.strategy_id
        };
      });

      setFtStrategies(ft);
      setLtStrategies(lt);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateRunningTime = (startDate: string | null): string => {
    if (!startDate) return '-';
    const start = new Date(startDate);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return '<1h';
  };

  const formatUsd = (n: number): string => {
    if (n >= 0) return `$${n.toFixed(2)}`;
    return `-$${Math.abs(n).toFixed(2)}`;
  };

  const formatPct = (n: number | null): string => {
    if (n === null || n === undefined) return '-';
    const sign = n >= 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  };

  // Combine and filter strategies
  const displayedStrategies = (() => {
    let combined: UnifiedStrategy[] = [];
    
    if (viewMode === 'ft' || viewMode === 'all') {
      combined = [...combined, ...ftStrategies];
    }
    if (viewMode === 'lt' || viewMode === 'all') {
      combined = [...combined, ...ltStrategies];
    }
    
    return combined;
  })();

  // Sort strategies
  const sortedStrategies = [...displayedStrategies].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];
    
    // Handle null/undefined
    if (aVal === null || aVal === undefined) aVal = sortDir === 'asc' ? Infinity : -Infinity;
    if (bVal === null || bVal === undefined) bVal = sortDir === 'asc' ? Infinity : -Infinity;
    
    if (sortDir === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-4 w-4 opacity-30" />;
    return sortDir === 'asc' 
      ? <ChevronUp className="h-4 w-4" />
      : <ChevronDown className="h-4 w-4" />;
  };

  // Calculate totals
  const totals = sortedStrategies.reduce((acc, s) => ({
    balance: acc.balance + s.balance,
    pnl: acc.pnl + s.pnl,
    realized: acc.realized + s.realized_pnl,
    unrealized: acc.unrealized + s.unrealized_pnl,
    taken: acc.taken + s.taken,
    won: acc.won + s.won,
    lost: acc.lost + s.lost,
    open: acc.open + s.open
  }), { balance: 0, pnl: 0, realized: 0, unrealized: 0, taken: 0, won: 0, lost: 0, open: 0 });

  const overallWinRate = (totals.won + totals.lost) > 0 
    ? (totals.won / (totals.won + totals.lost)) * 100 
    : null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-[#FDB022]" />
            <div>
              <h1 className="text-2xl font-bold">Trading Overview</h1>
              <p className="text-slate-600 text-sm">
                Unified view of Forward Testing and Live Trading performance
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/lt/logs">
              <Button variant="outline" className="border-[#FDB022] text-[#FDB022]">
                <FileText className="h-4 w-4 mr-2" />
                Live Logs
              </Button>
            </Link>
            <Button variant="outline" onClick={loadData}>
              <Activity className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Balance</div>
              <div className="text-2xl font-bold">{formatUsd(totals.balance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total P&L</div>
              <div className={`text-2xl font-bold ${totals.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatUsd(totals.pnl)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Trades</div>
              <div className="text-2xl font-bold">{totals.taken}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Win Rate</div>
              <div className="text-2xl font-bold">
                {overallWinRate !== null ? `${overallWinRate.toFixed(1)}%` : '-'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Open Positions</div>
              <div className="text-2xl font-bold">{totals.open}</div>
            </CardContent>
          </Card>
        </div>

        {/* View Filter */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            size="sm"
            variant={viewMode === 'all' ? 'default' : 'outline'}
            onClick={() => setViewMode('all')}
          >
            All ({ftStrategies.length + ltStrategies.length})
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'ft' ? 'default' : 'outline'}
            onClick={() => setViewMode('ft')}
          >
            Forward Testing ({ftStrategies.length})
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'lt' ? 'default' : 'outline'}
            onClick={() => setViewMode('lt')}
          >
            Live Trading ({ltStrategies.length})
          </Button>
        </div>

        {/* Unified Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Strategies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">Type</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">
                        Strategy <SortIcon field="name" />
                      </div>
                    </TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Running</TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('balance')}>
                      <div className="flex items-center justify-end gap-1">
                        Balance <SortIcon field="balance" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('pnl')}>
                      <div className="flex items-center justify-end gap-1">
                        P&L <SortIcon field="pnl" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('pnl_pct')}>
                      <div className="flex items-center justify-end gap-1">
                        Return <SortIcon field="pnl_pct" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('taken')}>
                      <div className="flex items-center justify-end gap-1">
                        Taken <SortIcon field="taken" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Avg Size</TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('open')}>
                      <div className="flex items-center justify-end gap-1">
                        Open <SortIcon field="open" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('won')}>
                      <div className="flex items-center justify-end gap-1">
                        Won <SortIcon field="won" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('lost')}>
                      <div className="flex items-center justify-end gap-1">
                        Lost <SortIcon field="lost" />
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer text-right" onClick={() => handleSort('win_rate')}>
                      <div className="flex items-center justify-end gap-1">
                        WR% <SortIcon field="win_rate" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : sortedStrategies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground">
                        No strategies found
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedStrategies.map((strategy) => (
                      <TableRow key={strategy.id} className="hover:bg-slate-50">
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={strategy.type === 'FT' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}
                          >
                            {strategy.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={strategy.detail_url} className="hover:underline font-medium">
                            {strategy.name}
                          </Link>
                          {strategy.is_paused && (
                            <Badge variant="destructive" className="ml-2 text-xs">Paused</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {strategy.started ? new Date(strategy.started).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell className="text-sm">{strategy.running_time}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatUsd(strategy.balance)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${strategy.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatUsd(strategy.pnl)}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${strategy.pnl_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPct(strategy.pnl_pct)}
                        </TableCell>
                        <TableCell className="text-right">{strategy.taken}</TableCell>
                        <TableCell className="text-right text-sm">
                          {strategy.avg_size > 0 ? formatUsd(strategy.avg_size) : '-'}
                        </TableCell>
                        <TableCell className="text-right">{strategy.open}</TableCell>
                        <TableCell className="text-right text-green-600">{strategy.won}</TableCell>
                        <TableCell className="text-right text-red-600">{strategy.lost}</TableCell>
                        <TableCell className="text-right">
                          {strategy.win_rate !== null ? `${(strategy.win_rate * 100).toFixed(1)}%` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col gap-1">
                            {strategy.is_active ? (
                              <Badge variant="default" className="bg-green-600">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                            {strategy.type === 'LT' && strategy.drawdown_pct !== null && (
                              <span className="text-xs text-muted-foreground">
                                DD: {strategy.drawdown_pct.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link href={strategy.detail_url}>
                            <Button size="sm" variant="ghost">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals Row */}
            {sortedStrategies.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Balance:</span>
                    <span className="ml-2 font-semibold">{formatUsd(totals.balance)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total P&L:</span>
                    <span className={`ml-2 font-semibold ${totals.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatUsd(totals.pnl)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trades:</span>
                    <span className="ml-2 font-semibold">{totals.taken}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Win Rate:</span>
                    <span className="ml-2 font-semibold">
                      {overallWinRate !== null ? `${overallWinRate.toFixed(1)}%` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Record:</span>
                    <span className="ml-2 font-semibold">
                      {totals.won}W - {totals.lost}L
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Open:</span>
                    <span className="ml-2 font-semibold">{totals.open}</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LT Specific Stats (when viewing LT only) */}
        {viewMode === 'lt' && ltStrategies.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Live Trading Execution Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Attempts:</span>
                  <span className="ml-2 font-semibold">
                    {ltStrategies.reduce((sum, s) => sum + (s.attempts || 0), 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Filled:</span>
                  <span className="ml-2 font-semibold text-green-600">
                    {ltStrategies.reduce((sum, s) => sum + (s.filled || 0), 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Pending:</span>
                  <span className="ml-2 font-semibold text-orange-600">
                    {ltStrategies.reduce((sum, s) => sum + (s.pending || 0), 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Failed:</span>
                  <span className="ml-2 font-semibold text-red-600">
                    {ltStrategies.reduce((sum, s) => sum + (s.failed || 0), 0)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg Fill Rate:</span>
                  <span className="ml-2 font-semibold">
                    {(() => {
                      const withFillRate = ltStrategies.filter(s => s.fill_rate !== null);
                      if (withFillRate.length === 0) return '-';
                      const avg = withFillRate.reduce((sum, s) => sum + (s.fill_rate || 0), 0) / withFillRate.length;
                      return `${avg.toFixed(1)}%`;
                    })()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2 mt-6">
          <Link href="/ft">
            <Button variant="outline">
              View FT Details
            </Button>
          </Link>
          <Link href="/lt">
            <Button variant="outline">
              View LT Details
            </Button>
          </Link>
          <Link href="/lt/logs">
            <Button variant="outline" className="border-[#FDB022] text-[#FDB022]">
              <FileText className="h-4 w-4 mr-2" />
              Activity Logs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
