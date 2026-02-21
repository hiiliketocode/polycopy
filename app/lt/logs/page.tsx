'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, ArrowLeft, Activity, AlertCircle, Info, X, ListOrdered } from 'lucide-react';

interface LtLogEntry {
    id: string;
    created_at: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    strategy_id: string | null;
    ft_wallet_id: string | null;
    source_trade_id: string | null;
    extra?: Record<string, unknown> | null;
}

interface LtOrderRow {
    lt_order_id: string;
    strategy_id: string;
    order_id: string;
    market_title: string | null;
    market_slug: string | null;
    token_label: string | null;
    status: string;
    outcome: string | null;
    signal_price: number | null;
    signal_size_usd: number | null;
    executed_price: number | null;
    executed_size_usd: number | null;
    shares_bought: number | null;
    order_placed_at: string;
    fully_filled_at: string | null;
    rejection_reason: string | null;
    pnl: number | null;
    created_at: string;
}

const LOG_TYPE_KEYWORDS = ['POLL', 'TRADE', 'CASH', 'ERROR', 'SELL', 'FILTER'] as const;
type LogTypeKeyword = (typeof LOG_TYPE_KEYWORDS)[number];

function messageMatchesType(message: string, type: LogTypeKeyword): boolean {
    return message.includes(`${type}:`) || message.includes(` ${type} `) || message.startsWith(`${type} `);
}

function getLogTypeFromMessage(message: string): LogTypeKeyword | null {
    for (const k of LOG_TYPE_KEYWORDS) {
        if (messageMatchesType(message, k)) return k;
    }
    return null;
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleString();
}

export default function LTLogsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center text-slate-500">Loading logs…</div>}>
            <LTLogsContent />
        </Suspense>
    );
}

function LTLogsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const strategyFilter = searchParams.get('strategy') || undefined;

    const [logs, setLogs] = useState<LtLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [typeFilter, setTypeFilter] = useState<LogTypeKeyword | ''>('');
    const [searchText, setSearchText] = useState('');
    const [orders, setOrders] = useState<LtOrderRow[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersError, setOrdersError] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setOrdersLoading(true);
        setOrdersError(null);
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (strategyFilter) params.set('strategy_id', strategyFilter);
            const res = await fetch(`/api/lt/orders?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load orders');
            setOrders(data.orders || []);
        } catch (e: unknown) {
            setOrdersError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setOrdersLoading(false);
        }
    }, [strategyFilter]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (strategyFilter) {
                params.set('strategy_id', strategyFilter);
            }
            const res = await fetch(`/api/lt/logs?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load logs');
            setLogs(data.logs || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }, [strategyFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = setInterval(fetchLogs, 10000);
        return () => clearInterval(id);
    }, [autoRefresh, fetchLogs]);

    const LevelIcon = ({ level }: { level: string }) => {
        if (level === 'error') return <AlertCircle className="h-4 w-4 text-red-500" />;
        if (level === 'warn') return <AlertCircle className="h-4 w-4 text-amber-500" />;
        return <Info className="h-4 w-4 text-slate-500" />;
    };

    const levelBadge = (level: string) => {
        if (level === 'error') return <Badge variant="destructive" className="text-xs">ERROR</Badge>;
        if (level === 'warn') return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">WARN</Badge>;
        return <Badge variant="secondary" className="text-xs">INFO</Badge>;
    };

    const filteredLogs = logs.filter((log) => {
        if (typeFilter && !messageMatchesType(log.message, typeFilter) && !(typeFilter === 'ERROR' && log.level === 'error')) return false;
        if (searchText) {
            const q = searchText.toLowerCase();
            if (!log.message.toLowerCase().includes(q) && !(log.strategy_id || '').toLowerCase().includes(q)) return false;
        }
        return true;
    });

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Link href={strategyFilter ? `/lt/${strategyFilter}` : '/trading'}>
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                Back
                            </Button>
                        </Link>
                        <Activity className="h-8 w-8 text-[#FDB022]" />
                        <div>
                            <h1 className="text-2xl font-bold">Live Trading Logs</h1>
                            <p className="text-slate-600 text-sm">
                                LT execute diagnostic logs. No FT orders, token resolution, risk checks, execution outcomes. Updates every 10s when auto-refresh is on.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant={autoRefresh ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                </div>

                {strategyFilter && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 flex-shrink-0" />
                            <span>Showing logs for <strong>{strategyFilter}</strong></span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 h-7 px-2"
                            onClick={() => router.push('/lt/logs')}
                        >
                            <X className="h-3 w-3 mr-1" />
                            Clear filter
                        </Button>
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <Tabs defaultValue="logs" className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="logs">Execution Logs</TabsTrigger>
                        <TabsTrigger value="trades">LT Trades</TabsTrigger>
                    </TabsList>

                    <TabsContent value="logs" className="mt-0">
                <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium text-slate-700">Log filters</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant={typeFilter === '' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTypeFilter('')}
                        >
                            All
                        </Button>
                        {LOG_TYPE_KEYWORDS.map((k) => (
                            <Button
                                key={k}
                                variant={typeFilter === k ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTypeFilter(typeFilter === k ? '' : k)}
                            >
                                {k}
                            </Button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Search message or strategy…"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="mt-2 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-[#FDB022] focus:outline-none focus:ring-1 focus:ring-[#FDB022]"
                    />
                    {(typeFilter || searchText) && (
                        <p className="text-xs text-slate-500">
                            Showing {filteredLogs.length} of {logs.length} logs
                        </p>
                    )}
                </div>

                <Card className="border border-slate-200 bg-white">
                    <CardHeader>
                        <CardTitle className="text-lg">Execution Logs</CardTitle>
                        <CardDescription>
                            No FT orders found (with by-wallet diagnostic), token resolution failures, risk checks, and execution outcomes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading && logs.length === 0 ? (
                            <p className="text-slate-600 text-sm py-8 text-center">Loading logs…</p>
                        ) : logs.length === 0 ? (
                            <p className="text-slate-600 text-sm py-8 text-center">
                                No logs yet. Logs appear when the LT execute cron runs (every 2 min).
                            </p>
                        ) : filteredLogs.length === 0 ? (
                            <p className="text-slate-600 text-sm py-8 text-center">
                                No logs match the current filter. Try &quot;All&quot; or a different type.
                            </p>
                        ) : (
                            <ul className="space-y-2 font-mono text-sm">
                                {filteredLogs.map((log) => {
                                    const logType = getLogTypeFromMessage(log.message);
                                    return (
                                    <li
                                        key={log.id}
                                        className={`flex items-start gap-2 p-3 rounded-lg border ${
                                            log.level === 'error'
                                                ? 'bg-red-50 border-red-200'
                                                : log.level === 'warn'
                                                ? 'bg-amber-50 border-amber-200'
                                                : 'bg-slate-50 border-slate-200'
                                        }`}
                                    >
                                        <LevelIcon level={log.level} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                {levelBadge(log.level)}
                                                {logType && (
                                                    <Badge variant="outline" className="text-xs bg-white">
                                                        {logType}
                                                    </Badge>
                                                )}
                                                <span className="text-slate-500 text-xs">
                                                    {formatTime(log.created_at)}
                                                </span>
                                                {log.strategy_id && (
                                                    <span className="text-slate-600 text-xs">
                                                        {log.strategy_id}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-800 break-words">{log.message}</p>
                                            {log.extra && Object.keys(log.extra).length > 0 && (
                                                <pre className="mt-2 text-xs text-slate-600 overflow-x-auto">
                                                    {JSON.stringify(log.extra, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </li>
                                    );
                                })}
                            </ul>
                        )}
                    </CardContent>
                </Card>
                    </TabsContent>

                    <TabsContent value="trades" className="mt-0">
                        <Card className="border border-slate-200 bg-white">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <ListOrdered className="h-5 w-5" />
                                        LT Trades
                                    </CardTitle>
                                    <CardDescription>
                                        Recent orders across all LT strategies. Click a strategy to open its detail page.
                                    </CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchOrders} disabled={ordersLoading}>
                                    <RefreshCw className={`h-4 w-4 mr-1 ${ordersLoading ? 'animate-spin' : ''}`} />
                                    Refresh
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {ordersError && (
                                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        {ordersError}
                                    </div>
                                )}
                                {ordersLoading && orders.length === 0 ? (
                                    <p className="text-slate-600 text-sm py-8 text-center">Loading orders…</p>
                                ) : orders.length === 0 ? (
                                    <p className="text-slate-600 text-sm py-8 text-center">No LT orders yet.</p>
                                ) : (
                                    <div className="overflow-x-auto -mx-2">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left py-2 px-2 font-medium text-slate-600">Strategy</th>
                                                    <th className="text-left py-2 px-2 font-medium text-slate-600">Market</th>
                                                    <th className="text-left py-2 px-2 font-medium text-slate-600">Status</th>
                                                    <th className="text-right py-2 px-2 font-medium text-slate-600">Size</th>
                                                <th className="text-left py-2 px-2 font-medium text-slate-600">Timestamp</th>
                                                <th className="text-left py-2 px-2 font-medium text-slate-600">Outcome</th>
                                                <th className="text-left py-2 px-2 font-medium text-slate-600">Rejection reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {orders.map((o) => (
                                                    <tr key={o.lt_order_id} className="border-b border-slate-100 hover:bg-slate-50">
                                                        <td className="py-2 px-2">
                                                            <Link href={`/lt/${o.strategy_id}`} className="text-[#FDB022] hover:underline font-medium">
                                                                {o.strategy_id}
                                                            </Link>
                                                        </td>
                                                        <td className="py-2 px-2 max-w-[200px] truncate text-slate-700" title={o.market_title || ''}>
                                                            {o.market_title || '—'}
                                                        </td>
                                                        <td className="py-2 px-2">
                                                            <Badge variant={o.status === 'FILLED' ? 'default' : o.status === 'REJECTED' ? 'destructive' : 'secondary'} className="text-xs">
                                                                {o.status}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2 px-2 text-right font-mono">
                                                            ${Number(o.executed_size_usd ?? o.signal_size_usd ?? 0).toFixed(2)}
                                                        </td>
                                                        <td className="py-2 px-2 text-slate-500 text-xs whitespace-nowrap">
                                                            {o.order_placed_at ? new Date(o.order_placed_at).toLocaleString() : '—'}
                                                        </td>
                                                        <td className="py-2 px-2 text-slate-600">{o.outcome ?? '—'}</td>
                                                        <td className="py-2 px-2 max-w-[220px] truncate text-slate-500 text-xs" title={o.rejection_reason || ''}>
                                                            {o.rejection_reason ?? '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
