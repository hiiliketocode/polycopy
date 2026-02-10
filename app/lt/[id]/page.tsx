'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, Wallet, ListOrdered, BarChart3, RefreshCw, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface LTStrategyDetail {
  strategy_id: string;
  ft_wallet_id: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  is_paused: boolean;
  launched_at: string | null;
  starting_capital: number;
  wallet_address: string;
  last_sync_time: string | null;
  health_status: string;
  created_at: string;
  lt_risk_state?: Array<{ current_equity?: number; peak_equity?: number; current_drawdown_pct?: number; consecutive_losses?: number; is_paused?: boolean; circuit_breaker_active?: boolean }>;
}

interface LTOrder {
  lt_order_id: string;
  market_title: string | null;
  market_slug: string | null;
  token_label: string | null;
  trader_address: string | null;
  signal_price: number | null;
  signal_size_usd: number | null;
  executed_price: number | null;
  executed_size: number | null;
  slippage_pct: number | null;
  fill_rate: number | null;
  execution_latency_ms: number | null;
  status: string;
  rejection_reason: string | null;
  outcome: string | null;
  pnl: number | null;
  winning_label: string | null;
  ft_entry_price: number | null;
  ft_pnl: number | null;
  performance_diff_pct: number | null;
  order_placed_at: string;
  resolved_at: string | null;
}

interface OrderStats {
  total_attempts: number;
  filled: number;
  failed: number;
  pending: number;
  open_positions: number;
  closed_positions: number;
  won: number;
  lost: number;
  win_rate: number | null;
  realized_pnl: number;
  total_signal_usd: number;
  total_executed_usd: number;
  fill_rate_pct: number | null;
  avg_fill_rate: number | null;
  avg_slippage_pct: number | null;
  max_slippage_pct: number | null;
  avg_latency_ms: number | null;
}

type OrderSortField = 'market' | 'size' | 'price' | 'pnl' | 'time' | 'slippage' | 'fill_rate';

export default function LTStrategyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<LTStrategyDetail | null>(null);
  const [openOrders, setOpenOrders] = useState<LTOrder[]>([]);
  const [pendingOrders, setPendingOrders] = useState<LTOrder[]>([]);
  const [closedOrders, setClosedOrders] = useState<LTOrder[]>([]);
  const [failedOrders, setFailedOrders] = useState<LTOrder[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [startingCapital, setStartingCapital] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'open' | 'closed' | 'failed' | 'settings'>('pending');
  const [sortField, setSortField] = useState<OrderSortField>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchStrategy = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setStrategy(data.strategy);
      setDisplayName(data.strategy.display_name || '');
      setStartingCapital(String(data.strategy.starting_capital ?? ''));
      setIsActive(!!data.strategy.is_active);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchOrders = useCallback(async () => {
    if (!id) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(id)}/orders`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setOpenOrders(data.open_orders || []);
        setPendingOrders(data.pending_orders || []);
        setClosedOrders(data.closed_orders || []);
        setFailedOrders(data.failed_orders || []);
        setOrderStats(data.stats || null);
      }
    } catch {
      // non-blocking
    } finally {
      setOrdersLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchStrategy(); }, [fetchStrategy]);
  useEffect(() => { if (id && !loading) fetchOrders(); }, [id, loading, fetchOrders]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName || undefined,
          starting_capital: startingCapital ? parseFloat(startingCapital) : undefined,
          is_active: isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setStrategy(data.strategy);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const formatUsd = (n: number) => (n >= 0 ? `$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);
  const formatPct = (n: number | null) => n != null ? `${(n * 100).toFixed(2)}%` : '-';
  const formatTime = (s: string | null) => s ? new Date(s).toLocaleString() : '-';
  const formatPrice = (n: number | null) => n != null ? `${(Number(n) * 100).toFixed(1)}¢` : '-';

  const handleSort = (field: OrderSortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortOrders = useCallback((orders: LTOrder[]) => {
    return [...orders].sort((a, b) => {
      const m = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'market': return m * (a.market_title || '').localeCompare(b.market_title || '');
        case 'size': return m * ((Number(a.executed_size) || 0) - (Number(b.executed_size) || 0));
        case 'price': return m * ((Number(a.executed_price) || 0) - (Number(b.executed_price) || 0));
        case 'pnl': return m * ((Number(a.pnl) || 0) - (Number(b.pnl) || 0));
        case 'slippage': return m * ((Number(a.slippage_pct) || 0) - (Number(b.slippage_pct) || 0));
        case 'fill_rate': return m * ((Number(a.fill_rate) || 0) - (Number(b.fill_rate) || 0));
        case 'time': default: return m * (new Date(a.order_placed_at).getTime() - new Date(b.order_placed_at).getTime());
      }
    });
  }, [sortField, sortDir]);

  const sortedOpen = useMemo(() => sortOrders(openOrders), [openOrders, sortOrders]);
  const sortedPending = useMemo(() => sortOrders(pendingOrders), [pendingOrders, sortOrders]);
  const sortedClosed = useMemo(() => sortOrders(closedOrders), [closedOrders, sortOrders]);
  const sortedFailed = useMemo(() => sortOrders(failedOrders), [failedOrders, sortOrders]);

  const SortTH = ({ field, label, align }: { field: OrderSortField; label: string; align?: 'right' }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => handleSort(field)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {sortField === field && (sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
      </span>
    </TableHead>
  );

  const risk = strategy?.lt_risk_state?.[0] || null;

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4 flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !strategy) {
    const ftWalletId = id.startsWith('LT_') ? id.slice(3) : null;
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="text-muted-foreground text-sm">This live strategy may not exist yet or may belong to a different account.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/ft"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Back to FT</Button></Link>
            {ftWalletId && (
              <Link href={`/lt?createFrom=${encodeURIComponent(ftWalletId)}`}>
                <Button className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90">Create this live strategy</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const returnPct = strategy && strategy.starting_capital > 0
    ? (((risk?.current_equity ?? strategy.starting_capital) - strategy.starting_capital) / strategy.starting_capital) * 100
    : 0;

  const OrderRow = ({ o, showOutcome }: { o: LTOrder; showOutcome: boolean }) => (
    <TableRow>
      <TableCell className="font-medium max-w-[220px] truncate" title={o.market_title || ''}>{o.market_title || o.market_slug || '-'}</TableCell>
      <TableCell>{o.token_label || '-'}</TableCell>
      <TableCell className="text-right">{o.executed_size != null ? formatUsd(Number(o.executed_size)) : o.signal_size_usd != null ? formatUsd(Number(o.signal_size_usd)) : '-'}</TableCell>
      <TableCell className="text-right">{formatPrice(o.executed_price ?? o.signal_price)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{o.slippage_pct != null ? `${(Number(o.slippage_pct) * 100).toFixed(2)}%` : '-'}</TableCell>
      <TableCell className="text-right text-muted-foreground">{o.fill_rate != null ? `${(Number(o.fill_rate) * 100).toFixed(0)}%` : '-'}</TableCell>
      {showOutcome && (
        <TableCell className={`text-right font-medium ${o.pnl != null && Number(o.pnl) >= 0 ? 'text-green-600' : o.pnl != null ? 'text-red-600' : ''}`}>
          {o.outcome === 'WON' ? 'Won' : o.outcome === 'LOST' ? 'Lost' : o.outcome || '-'}
          {o.pnl != null && ` (${formatUsd(Number(o.pnl))})`}
        </TableCell>
      )}
      <TableCell className="text-muted-foreground text-xs">{formatTime(o.order_placed_at)}</TableCell>
    </TableRow>
  );

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <Link href="/ft" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to FT
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {strategy?.display_name}
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">LIVE</Badge>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mirrors <Link href={`/ft/${strategy?.ft_wallet_id}`} className="text-[#FDB022] hover:underline">{strategy?.ft_wallet_id}</Link>
            {' · '}{strategy?.is_active ? 'Active' : 'Inactive'}{strategy?.is_paused ? ' · Paused' : ''}
          </p>
        </div>
        <Button variant="outline" onClick={() => { fetchStrategy(); fetchOrders(); }} disabled={ordersLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${ordersLoading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Capital</p>
          <p className="text-xl font-bold">{formatUsd(risk?.current_equity ?? strategy?.starting_capital ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Return</p>
          <p className={`text-xl font-bold ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">P&L</p>
          <p className={`text-xl font-bold ${(orderStats?.realized_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatUsd(orderStats?.realized_pnl ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-xl font-bold">{orderStats?.win_rate != null ? `${orderStats.win_rate}%` : '-'}</p>
          <p className="text-xs text-muted-foreground">{orderStats?.won ?? 0}W / {orderStats?.lost ?? 0}L</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Fill Rate</p>
          <p className="text-xl font-bold">{orderStats?.fill_rate_pct != null ? `${orderStats.fill_rate_pct}%` : '-'}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Avg Slippage</p>
          <p className="text-xl font-bold">{orderStats?.avg_slippage_pct != null ? `${(orderStats.avg_slippage_pct * 100).toFixed(2)}%` : '-'}</p>
          {orderStats?.max_slippage_pct != null && <p className="text-xs text-muted-foreground">Max: {(orderStats.max_slippage_pct * 100).toFixed(2)}%</p>}
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Attempts</p>
          <p className="text-xl font-bold">{orderStats?.total_attempts ?? 0}</p>
          <p className="text-xs text-muted-foreground">{orderStats?.filled ?? 0} filled · {orderStats?.failed ?? 0} failed</p>
        </CardContent></Card>
      </div>

      {/* Tabs: Pending | Open | Closed | Failed | Settings */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">Pending ({pendingOrders.length})</TabsTrigger>
          <TabsTrigger value="open">Open ({openOrders.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({closedOrders.length})</TabsTrigger>
          <TabsTrigger value="failed">Failed ({failedOrders.length})</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Pending Orders — placed but not yet filled (force-test & cron) */}
        <TabsContent value="pending">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pending orders</CardTitle>
              <CardDescription>Orders placed and awaiting fill (force-test and live execution)</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? <p className="text-muted-foreground text-sm py-4">Loading…</p> :
               pendingOrders.length === 0 ? <p className="text-muted-foreground text-sm py-4">No pending orders.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <SortTH field="market" label="Market" />
                      <TableHead>Outcome</TableHead>
                      <SortTH field="size" label="Size" align="right" />
                      <SortTH field="price" label="Price" align="right" />
                      <SortTH field="slippage" label="Slippage" align="right" />
                      <SortTH field="time" label="Placed" />
                    </TableRow></TableHeader>
                    <TableBody>{sortedPending.map((o) => <OrderRow key={o.lt_order_id} o={o} showOutcome={false} />)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Open Orders */}
        <TabsContent value="open">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open positions</CardTitle>
              <CardDescription>Active orders awaiting resolution</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? <p className="text-muted-foreground text-sm py-4">Loading…</p> :
               openOrders.length === 0 ? <p className="text-muted-foreground text-sm py-4">No open positions.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <SortTH field="market" label="Market" />
                      <TableHead>Outcome</TableHead>
                      <SortTH field="size" label="Size" align="right" />
                      <SortTH field="price" label="Price" align="right" />
                      <SortTH field="slippage" label="Slippage" align="right" />
                      <SortTH field="fill_rate" label="Fill" align="right" />
                      <SortTH field="time" label="Placed" />
                    </TableRow></TableHeader>
                    <TableBody>{sortedOpen.map((o) => <OrderRow key={o.lt_order_id} o={o} showOutcome={false} />)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Closed Orders */}
        <TabsContent value="closed">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Closed positions</CardTitle>
              <CardDescription>Resolved orders with P&L</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? <p className="text-muted-foreground text-sm py-4">Loading…</p> :
               closedOrders.length === 0 ? <p className="text-muted-foreground text-sm py-4">No closed positions yet.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <SortTH field="market" label="Market" />
                      <TableHead>Outcome</TableHead>
                      <SortTH field="size" label="Size" align="right" />
                      <SortTH field="price" label="Price" align="right" />
                      <SortTH field="slippage" label="Slippage" align="right" />
                      <SortTH field="fill_rate" label="Fill" align="right" />
                      <SortTH field="pnl" label="Result" align="right" />
                      <SortTH field="time" label="Placed" />
                    </TableRow></TableHeader>
                    <TableBody>{sortedClosed.map((o) => <OrderRow key={o.lt_order_id} o={o} showOutcome={true} />)}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failed Orders */}
        <TabsContent value="failed">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Failed & rejected
              </CardTitle>
              <CardDescription>Orders that were rejected, cancelled, or failed risk checks</CardDescription>
            </CardHeader>
            <CardContent>
              {ordersLoading ? <p className="text-muted-foreground text-sm py-4">Loading…</p> :
               failedOrders.length === 0 ? <p className="text-muted-foreground text-sm py-4">No failed orders.</p> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Signal Size</TableHead>
                      <TableHead className="text-right">Signal Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Placed</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {sortedFailed.map((o) => (
                        <TableRow key={o.lt_order_id}>
                          <TableCell className="font-medium max-w-[220px] truncate" title={o.market_title || ''}>{o.market_title || '-'}</TableCell>
                          <TableCell>{o.token_label || '-'}</TableCell>
                          <TableCell className="text-right">{o.signal_size_usd != null ? formatUsd(Number(o.signal_size_usd)) : '-'}</TableCell>
                          <TableCell className="text-right">{formatPrice(o.signal_price)}</TableCell>
                          <TableCell className="text-red-600">{o.status}</TableCell>
                          <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate" title={o.rejection_reason || ''}>{o.rejection_reason || '-'}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{formatTime(o.order_placed_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Wallet className="h-5 w-5" /> Strategy settings</CardTitle>
              <CardDescription>Display name, capital, and activation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Display name</label>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm" placeholder="e.g. Live: My FT Wallet" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Starting capital ($)</label>
                <input type="number" value={startingCapital} onChange={(e) => setStartingCapital(e.target.value)}
                  className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm w-32" min={0} step={100} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-input" />
                <label htmlFor="is_active" className="text-sm">Strategy active (execution will run when not paused)</label>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Wallet: <code className="font-mono">{strategy?.wallet_address}</code></p>
                <p>Created: {formatTime(strategy?.created_at || null)}</p>
                <p>Health: {strategy?.health_status}</p>
                {risk && (
                  <p>Risk: Equity {formatUsd(risk.current_equity ?? 0)} / Peak {formatUsd(risk.peak_equity ?? 0)}
                    {(risk.current_drawdown_pct ?? 0) > 0 && ` · DD ${((risk.current_drawdown_pct ?? 0) * 100).toFixed(1)}%`}
                    {(risk.consecutive_losses ?? 0) > 0 && ` · ${risk.consecutive_losses} consecutive losses`}
                  </p>
                )}
              </div>
              <Button onClick={handleSave} disabled={saving} className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90">
                <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
