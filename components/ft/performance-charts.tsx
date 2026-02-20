'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

type Metric = 'cumulative_pnl' | 'pnl' | 'win_rate' | 'trades' | 'avg_pnl';

const METRICS: { value: Metric; label: string; format: (v: number) => string }[] = [
  { value: 'cumulative_pnl', label: 'Cumulative PnL ($)', format: v => `$${v.toFixed(0)}` },
  { value: 'pnl', label: 'Daily PnL ($)', format: v => `$${v.toFixed(0)}` },
  { value: 'win_rate', label: 'Daily Win Rate (%)', format: v => `${(v * 100).toFixed(0)}%` },
  { value: 'trades', label: 'Daily Trades', format: v => v.toFixed(0) },
  { value: 'avg_pnl', label: 'Avg PnL per Trade ($)', format: v => `$${v.toFixed(2)}` },
];

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#db2777',
  '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#be123c', '#0d9488',
  '#c026d3', '#ca8a04', '#059669', '#e11d48', '#6366f1', '#84cc16',
  '#f59e0b', '#8b5cf6',
];

interface WalletInfo { id: string; name: string; active: boolean }
interface DayData {
  wallet_id: string; date: string; won: number; lost: number; sold: number;
  pnl: number; cumulative_pnl: number; trades: number; win_rate: number | null; avg_pnl: number;
}

export function PerformanceCharts() {
  const [metric, setMetric] = useState<Metric>('cumulative_pnl');
  const [allWallets, setAllWallets] = useState<WalletInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async (walletIds?: string[]) => {
    setLoading(true);
    try {
      const params = walletIds?.length ? `?wallets=${walletIds.join(',')}` : '';
      const res = await fetch(`/api/ft/daily-stats${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        if (!walletIds) {
          setAllWallets(json.wallets || []);
          // Auto-select top 5 by total PnL
          const pnlByWallet = new Map<string, number>();
          for (const d of json.data || []) {
            pnlByWallet.set(d.wallet_id, (pnlByWallet.get(d.wallet_id) || 0) + d.pnl);
          }
          const top5 = [...pnlByWallet.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([id]) => id);
          setSelectedIds(new Set(top5));
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleWallet = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const metricConfig = METRICS.find(m => m.value === metric)!;

  // Build chart data: one row per date, one key per wallet
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number | string>>();
    const selected = data.filter(d => selectedIds.has(d.wallet_id));

    for (const d of selected) {
      if (!dateMap.has(d.date)) dateMap.set(d.date, { date: d.date });
      const row = dateMap.get(d.date)!;
      const val = d[metric];
      row[d.wallet_id] = val ?? 0;
    }

    return [...dateMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, row]) => row);
  }, [data, selectedIds, metric]);

  const walletNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of allWallets) m.set(w.id, w.name);
    return m;
  }, [allWallets]);

  const filteredWallets = useMemo(() => {
    if (!search) return allWallets;
    const q = search.toLowerCase();
    return allWallets.filter(w => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q));
  }, [allWallets, search]);

  const selectedWalletIds = [...selectedIds];

  if (loading && allWallets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Metric:</span>
        {METRICS.map(m => (
          <Button
            key={m.value}
            variant={metric === m.value ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setMetric(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {/* Bot selector */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-muted-foreground">
              Bots ({selectedIds.size} selected):
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectorOpen(!selectorOpen)}>
              {selectorOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {selectorOpen ? 'Hide' : 'Select'}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set(allWallets.map(w => w.id)))}>
              All
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              None
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
              const pnlByWallet = new Map<string, number>();
              for (const d of data) pnlByWallet.set(d.wallet_id, (pnlByWallet.get(d.wallet_id) || 0) + d.pnl);
              const top10 = [...pnlByWallet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
              setSelectedIds(new Set(top10));
            }}>
              Top 10
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
              const pnlByWallet = new Map<string, number>();
              for (const d of data) pnlByWallet.set(d.wallet_id, (pnlByWallet.get(d.wallet_id) || 0) + d.pnl);
              const bottom10 = [...pnlByWallet.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10).map(([id]) => id);
              setSelectedIds(new Set(bottom10));
            }}>
              Bottom 10
            </Button>
          </div>

          {/* Selected chips */}
          <div className="flex flex-wrap gap-1 mb-2">
            {selectedWalletIds.map((id, i) => (
              <Badge
                key={id}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-destructive/20 flex items-center gap-1 py-0.5"
                style={{ borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}
                onClick={() => toggleWallet(id)}
              >
                {walletNameMap.get(id) || id}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>

          {/* Dropdown selector */}
          {selectorOpen && (
            <Card className="mb-4">
              <CardContent className="pt-3 pb-2">
                <div className="flex items-center gap-2 mb-2 border rounded-md px-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search bots..."
                    className="flex-1 py-1.5 text-sm bg-transparent outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 max-h-60 overflow-y-auto">
                  {filteredWallets.map(w => (
                    <label
                      key={w.id}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer hover:bg-muted/50 ${!w.active ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(w.id)}
                        onChange={() => toggleWallet(w.id)}
                        className="rounded"
                      />
                      <span className="truncate">{w.name}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{metricConfig.label} — Daily Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              {selectedIds.size === 0 ? 'Select bots to compare' : 'No resolved trades for selected bots'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={450}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => {
                    const d = new Date(v + 'T00:00:00');
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => metricConfig.format(Number(v))}
                />
                <Tooltip
                  labelFormatter={v => {
                    const d = new Date(v + 'T00:00:00');
                    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  }}
                  formatter={(value: number, name: string) => [
                    metricConfig.format(value),
                    walletNameMap.get(name) || name,
                  ]}
                />
                <Legend
                  formatter={(value: string) => (
                    <span className="text-xs">{walletNameMap.get(value) || value}</span>
                  )}
                />
                {selectedWalletIds.map((id, i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    name={id}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
