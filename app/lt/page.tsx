'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Plus, Pause, Play, ArrowRight, Wallet, AlertCircle, Zap } from 'lucide-react';

interface RiskState {
  current_equity: number;
  peak_equity: number;
  current_drawdown_pct: number;
  consecutive_losses: number;
  is_paused: boolean;
  circuit_breaker_active: boolean;
}

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
  last_sync_time: string | null;
  health_status: string;
  created_at: string;
  lt_risk_state?: RiskState[] | RiskState | null;
}

interface FTWalletOption {
  wallet_id: string;
  display_name: string;
  description: string | null;
}

function formatUsd(n: number): string {
  if (n >= 0) return `$${n.toFixed(2)}`;
  return `-$${Math.abs(n).toFixed(2)}`;
}

export default function LiveTradingPage() {
  const searchParams = useSearchParams();
  const createFromFtId = useMemo(() => searchParams.get('createFrom') || searchParams.get('ft') || '', [searchParams]);
  const [strategies, setStrategies] = useState<LTStrategy[]>([]);
  const [ftWallets, setFtWallets] = useState<FTWalletOption[]>([]);
  const [myPolymarketWallet, setMyPolymarketWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createWalletId, setCreateWalletId] = useState<string>('');
  const [createCapital, setCreateCapital] = useState<string>('1000');
  const [createWalletAddress, setCreateWalletAddress] = useState<string>('');
  const [useConnectedAccount, setUseConnectedAccount] = useState(true);
  const hasPrefilledWallet = useRef(false);
  const [forceTestRunning, setForceTestRunning] = useState(false);
  const [forceTestResult, setForceTestResult] = useState<{ ok: boolean; summary?: string; results?: any[] } | null>(null);

  const loadStrategies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/lt/strategies', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load strategies');
      setStrategies(data.strategies || []);
      if (data.my_polymarket_wallet != null) setMyPolymarketWallet(data.my_polymarket_wallet);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadFtWallets = async () => {
    try {
      const res = await fetch('/api/ft/wallets', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.wallets) {
        setFtWallets(data.wallets.map((w: any) => ({
          wallet_id: w.wallet_id,
          display_name: w.display_name,
          description: w.description,
        })));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadStrategies();
    loadFtWallets();
  }, []);

  useEffect(() => {
    if (createFromFtId && ftWallets.some((w) => w.wallet_id === createFromFtId) && !createWalletId) {
      setCreateWalletId(createFromFtId);
    }
  }, [createFromFtId, ftWallets, createWalletId]);

  useEffect(() => {
    if (myPolymarketWallet && !hasPrefilledWallet.current) {
      hasPrefilledWallet.current = true;
      setCreateWalletAddress(myPolymarketWallet);
    }
  }, [myPolymarketWallet]);

  const handlePause = async (strategyId: string) => {
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(strategyId)}/pause`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadStrategies();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleResume = async (strategyId: string) => {
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(strategyId)}/resume`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
      await loadStrategies();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCreate = async () => {
    if (!createWalletId) {
      setError('Select an FT wallet to mirror');
      return;
    }
    const walletAddress = useConnectedAccount ? '' : createWalletAddress.trim();
    if (!useConnectedAccount && (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length < 40)) {
      setError('Enter a valid Polymarket wallet address (0x...) or use your connected account.');
      return;
    }
    if (useConnectedAccount && !myPolymarketWallet) {
      setError('No connected Polymarket account. Connect a wallet in Portfolio or Profile first.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/lt/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ft_wallet_id: createWalletId,
          wallet_address: useConnectedAccount ? undefined : walletAddress,
          starting_capital: parseFloat(createCapital) || 1000,
          display_name: `Live: ${ftWallets.find(w => w.wallet_id === createWalletId)?.display_name || createWalletId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create strategy');
      setCreateWalletId('');
      setCreateCapital('1000');
      await loadStrategies();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const runForceTestTrade = async () => {
    setForceTestRunning(true);
    setForceTestResult(null);
    setError(null);
    try {
      const res = await fetch('/api/lt/force-test-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Force test failed');
      setForceTestResult({ ok: data.ok, summary: data.summary, results: data.results });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setForceTestRunning(false);
    }
  };

  const getRiskState = (s: LTStrategy): RiskState | null => {
    const rs = s.lt_risk_state;
    if (Array.isArray(rs) && rs.length) return rs[0];
    if (rs && typeof rs === 'object' && 'current_equity' in rs) return rs as RiskState;
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-[#FDB022]" />
            <div>
              <h1 className="text-2xl font-bold">Live Trading</h1>
              <p className="text-slate-600 text-sm">
                Real trades that mirror your Forward Test strategies. Manage strategies, risk, and execution here.
              </p>
            </div>
          </div>
          <Link href="/ft">
            <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <ArrowRight className="h-4 w-4 mr-2" />
              FT
            </Button>
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Create strategy */}
        <Card className="mb-6 border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
              <Plus className="h-5 w-5" />
              New Live Strategy
            </CardTitle>
            <CardDescription className="text-slate-600">
              Create a live trading strategy that mirrors one of your Forward Test wallets. Trades will be placed on your connected Polymarket account so you see them as real orders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-slate-600 mb-1">FT wallet to mirror</label>
                <select
                  value={createWalletId}
                  onChange={(e) => setCreateWalletId(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm min-w-[200px] text-slate-900"
                >
                  <option value="">Select…</option>
                  {ftWallets.map((w) => (
                    <option key={w.wallet_id} value={w.wallet_id}>
                      {w.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Starting capital ($)</label>
                <input
                  type="number"
                  value={createCapital}
                  onChange={(e) => setCreateCapital(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 text-slate-900"
                  min={1}
                  step={100}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="use_connected"
                  checked={useConnectedAccount}
                  onChange={(e) => setUseConnectedAccount(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <label htmlFor="use_connected" className="text-sm text-slate-700">
                  Use my connected Polymarket account (recommended)
                </label>
              </div>
              {!useConnectedAccount && (
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Polymarket wallet address (0x…)</label>
                  <input
                    type="text"
                    value={createWalletAddress}
                    onChange={(e) => setCreateWalletAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full max-w-md bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-900"
                  />
                </div>
              )}
              {useConnectedAccount && myPolymarketWallet && (
                <p className="text-xs text-slate-500">
                  Trades will go to: {myPolymarketWallet.slice(0, 10)}…{myPolymarketWallet.slice(-8)}
                </p>
              )}
            </div>
            <Button
              onClick={handleCreate}
              disabled={creating || !createWalletId || (useConnectedAccount ? !myPolymarketWallet : !createWalletAddress.trim())}
              className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90"
            >
              {creating ? 'Creating…' : 'Create strategy'}
            </Button>
          </CardContent>
        </Card>

        {/* List strategies */}
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
              <Wallet className="h-5 w-5" />
              Your live strategies
            </CardTitle>
            <CardDescription className="text-slate-600">
              Pause or resume execution. Strategies start inactive; activate in strategy settings when ready. Open a strategy to view trades, orders, fill rates, and failed attempts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-slate-600 text-sm">Loading…</p>
            ) : strategies.length === 0 ? (
              <p className="text-slate-600 text-sm">
                No live strategies yet. Create one above to start.
              </p>
            ) : (
              <ul className="space-y-3">
                {strategies.map((s) => {
                  const risk = getRiskState(s);
                  const isPaused = s.is_paused || risk?.is_paused;
                  return (
                    <li
                      key={s.strategy_id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-2 text-slate-900">
                          <Link href={`/lt/${s.strategy_id}`} className="hover:underline">
                            {s.display_name}
                          </Link>
                          {s.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-slate-200 text-slate-600">Inactive</Badge>
                          )}
                          {isPaused && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">Paused</Badge>
                          )}
                          {risk?.circuit_breaker_active && (
                            <Badge variant="destructive" className="bg-red-100 text-red-700">Circuit breaker</Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Mirrors: {s.ft_wallet_id} · Capital: {formatUsd(risk?.current_equity ?? s.starting_capital)}
                          {risk && (risk.consecutive_losses > 0 || (risk.current_drawdown_pct && risk.current_drawdown_pct > 0)) && (
                            <> · Losses: {risk.consecutive_losses} · Drawdown: {(risk.current_drawdown_pct * 100).toFixed(1)}%</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPaused ? (
                          <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-600 hover:bg-emerald-50" onClick={() => handleResume(s.strategy_id)}>
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="border-amber-600 text-amber-600 hover:bg-amber-50" onClick={() => handlePause(s.strategy_id)}>
                            <Pause className="h-4 w-4 mr-1" />
                            Pause
                          </Button>
                        )}
                        <Link href={`/lt/${s.strategy_id}`}>
                          <Button size="sm" variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100">
                            View trades & settings
                          </Button>
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Force test trade — one-click replay of last FT trade per strategy */}
        <Card className="mt-6 border border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-slate-800">
              <Zap className="h-4 w-4 text-amber-600" />
              Force test trade
            </CardTitle>
            <CardDescription className="text-slate-600">
              Replay the last Forward Test trade for each active LT strategy as a real order (capped at $5). Use this to verify execution without waiting for cron.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={runForceTestTrade}
              disabled={forceTestRunning || strategies.length === 0}
              variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-100"
            >
              {forceTestRunning ? 'Running…' : 'Run force test trade'}
            </Button>
            {forceTestResult && (
              <div className="text-sm rounded-lg bg-white border border-slate-200 p-3 text-slate-700">
                <p className="font-medium text-slate-800">{forceTestResult.summary ?? (forceTestResult.ok ? 'Done' : 'Failed')}</p>
                {forceTestResult.results?.length ? (
                  <ul className="mt-2 space-y-1 text-xs">
                    {forceTestResult.results.map((r: any, i: number) => (
                      <li key={i}>
                        {r.strategy_id}: {r.ok ? (r.market ? `✓ ${r.market}` : '✓') : (r.error || 'failed')}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-base text-slate-700">Where to manage</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600 space-y-2">
            <p><strong className="text-slate-800">This page:</strong> Create live strategies, pause/resume, and see risk state.</p>
            <p><strong className="text-slate-800">Strategy detail:</strong> Open a strategy to view trades like FT, edit capital, risk rules, and activation.</p>
            <p><strong className="text-slate-800">FT page:</strong> <Link href="/ft" className="text-[#FDB022] hover:underline">/ft</Link> — Forward Test wallets; use the Live tab to create and filter live strategies.</p>
            <p><strong className="text-slate-800">Cron:</strong> Execution runs every 2 minutes; resolution and redemptions every 10 minutes.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
