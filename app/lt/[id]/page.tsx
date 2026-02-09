'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Wallet, ListOrdered, BarChart3, RefreshCw } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  lt_risk_rules?: unknown[];
  lt_risk_state?: unknown[];
}

interface LTOrder {
  lt_order_id: string;
  market_title: string | null;
  market_slug: string | null;
  token_label: string | null;
  signal_price: number | null;
  signal_size_usd: number | null;
  executed_price: number | null;
  executed_size: number | null;
  status: string;
  rejection_reason: string | null;
  fill_rate: number | null;
  order_placed_at: string;
  outcome: string | null;
  pnl: number | null;
  resolved_at: string | null;
}

interface OrderStats {
  attempts: number;
  filled: number;
  partial: number;
  failed: number;
  pending: number;
  fill_rate_pct: number | null;
  avg_fill_rate: number | null;
  total_signal_usd: number;
  total_executed_usd: number;
}

export default function LTStrategyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<LTStrategyDetail | null>(null);
  const [orders, setOrders] = useState<LTOrder[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [startingCapital, setStartingCapital] = useState('');
  const [isActive, setIsActive] = useState(false);

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
      setWalletAddress(data.strategy.wallet_address || '');
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
      if (res.ok && data.orders) {
        setOrders(data.orders);
        setOrderStats(data.stats || null);
      }
    } catch {
      // non-blocking
    } finally {
      setOrdersLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStrategy();
  }, [fetchStrategy]);

  useEffect(() => {
    if (id && !loading) fetchOrders();
  }, [id, loading, fetchOrders]);

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
          wallet_address: walletAddress || undefined,
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
  const formatTime = (s: string) => (s ? new Date(s).toLocaleString() : '-');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 flex items-center justify-center">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  if (error && !strategy) {
    const isNotFound = error.toLowerCase().includes('not found');
    const ftWalletId = id.startsWith('LT_') ? id.slice(3) : null;
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-red-600 font-medium">{error}</p>
          {isNotFound && (
            <p className="text-slate-600 text-sm">
              This live strategy may not exist yet in this environment, or it may belong to a different account.
              {ftWalletId && (
                <> You can create it from the Forward Test page by opening the <strong>Live</strong> tab and choosing the matching FT wallet, or use the link below.</>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/lt">
              <Button variant="outline" className="border-slate-300 text-slate-700">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Live Trading
              </Button>
            </Link>
            {ftWalletId && (
              <>
                <Link href={`/lt?createFrom=${encodeURIComponent(ftWalletId)}`}>
                  <Button className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90">
                    Create this live strategy
                  </Button>
                </Link>
                <Link href="/ft">
                  <Button variant="outline" className="border-slate-300 text-slate-700">
                    Forward Test (Live tab)
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/lt">
            <Button variant="ghost" size="icon" className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{strategy?.display_name}</h1>
            <p className="text-slate-500 text-sm">
              Mirrors <Link href={`/ft/${strategy?.ft_wallet_id}`} className="text-[#FDB022] hover:underline">{strategy?.ft_wallet_id}</Link>
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Execution stats */}
        {orderStats && (
          <Card className="mb-6 border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Execution summary
              </CardTitle>
              <CardDescription>Attempts, fills, and fill rate for this live strategy</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Attempts</p>
                  <p className="font-semibold">{orderStats.attempts}</p>
                </div>
                <div>
                  <p className="text-slate-500">Filled</p>
                  <p className="font-semibold text-green-600">{orderStats.filled}</p>
                </div>
                <div>
                  <p className="text-slate-500">Failed</p>
                  <p className="font-semibold text-red-600">{orderStats.failed}</p>
                </div>
                <div>
                  <p className="text-slate-500">Fill rate</p>
                  <p className="font-semibold">
                    {orderStats.fill_rate_pct != null ? `${orderStats.fill_rate_pct.toFixed(1)}%` : orderStats.avg_fill_rate != null ? `${(orderStats.avg_fill_rate * 100).toFixed(1)}%` : '-'}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchOrders} disabled={ordersLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${ordersLoading ? 'animate-spin' : ''}`} />
                  Refresh orders
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Orders / Trades table */}
        <Card className="mb-6 border border-slate-200 bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Trades & orders
            </CardTitle>
            <CardDescription>Live orders placed by this strategy (same view as FT: trades and execution status)</CardDescription>
          </CardHeader>
          <CardContent>
            {ordersLoading ? (
              <p className="text-slate-500 text-sm py-4">Loading orders…</p>
            ) : orders.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">No orders yet. Execution runs every 2 minutes when the strategy is active and not paused.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200">
                      <TableHead className="text-slate-600">Market</TableHead>
                      <TableHead className="text-slate-600">Outcome</TableHead>
                      <TableHead className="text-slate-600 text-right">Signal</TableHead>
                      <TableHead className="text-slate-600 text-right">Executed</TableHead>
                      <TableHead className="text-slate-600">Status</TableHead>
                      <TableHead className="text-slate-600 text-right">P&L</TableHead>
                      <TableHead className="text-slate-600">Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.lt_order_id} className="border-slate-100">
                        <TableCell className="font-medium text-slate-900 max-w-[200px] truncate" title={o.market_title || ''}>
                          {o.market_title || o.market_slug || '-'}
                        </TableCell>
                        <TableCell className="text-slate-600">{o.token_label || '-'}</TableCell>
                        <TableCell className="text-right text-slate-600">
                          {o.signal_size_usd != null ? formatUsd(Number(o.signal_size_usd)) : '-'} {o.signal_price != null ? `@ ${(Number(o.signal_price) * 100).toFixed(0)}¢` : ''}
                        </TableCell>
                        <TableCell className="text-right text-slate-600">
                          {o.executed_size != null ? formatUsd(Number(o.executed_size)) : '-'} {o.executed_price != null ? `@ ${(Number(o.executed_price) * 100).toFixed(0)}¢` : ''}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              o.status === 'FILLED'
                                ? 'text-green-600'
                                : o.status === 'REJECTED' || o.status === 'CANCELLED'
                                  ? 'text-red-600'
                                  : 'text-slate-600'
                            }
                          >
                            {o.status}
                            {o.rejection_reason ? `: ${o.rejection_reason}` : ''}
                          </span>
                        </TableCell>
                        <TableCell className={`text-right ${o.pnl != null && Number(o.pnl) >= 0 ? 'text-green-600' : o.pnl != null ? 'text-red-600' : 'text-slate-500'}`}>
                          {o.pnl != null ? formatUsd(Number(o.pnl)) : o.outcome === 'OPEN' ? 'Open' : '-'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{formatTime(o.order_placed_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="mb-6 border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Strategy settings
            </CardTitle>
            <CardDescription className="text-slate-600">
              Display name, capital, and activation. Pause/resume from the Live tab on the FT page or the Live Trading page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900"
                placeholder="e.g. Live: My FT Wallet"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Polymarket wallet address (trades go here)</label>
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900"
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Starting capital ($)</label>
              <input
                type="number"
                value={startingCapital}
                onChange={(e) => setStartingCapital(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm w-32 text-slate-900"
                min={0}
                step={100}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              <label htmlFor="is_active" className="text-sm text-slate-700">
                Strategy active (execution will run when not paused)
              </label>
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
