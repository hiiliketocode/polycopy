'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Wallet } from 'lucide-react';

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

export default function LTStrategyDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [strategy, setStrategy] = useState<LTStrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [startingCapital, setStartingCapital] = useState('');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
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
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05070E] text-white p-4 md:p-8 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    );
  }

  if (error && !strategy) {
    return (
      <div className="min-h-screen bg-[#05070E] text-white p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-400">{error}</p>
          <Link href="/lt">
            <Button variant="outline" className="mt-4 border-slate-600 text-slate-300">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Live Trading
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070E] text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/lt">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Strategy settings</h1>
            <p className="text-slate-400 text-sm">{strategy?.strategy_id}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Edit strategy
            </CardTitle>
            <CardDescription className="text-slate-400">
              Display name, Polymarket wallet address, starting capital, and activation. Pause/resume from the main Live Trading page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Live: My FT Wallet"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Polymarket wallet address</label>
              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="0x..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Starting capital ($)</label>
              <input
                type="number"
                value={startingCapital}
                onChange={(e) => setStartingCapital(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm w-32"
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
                className="rounded border-slate-600 bg-slate-800"
              />
              <label htmlFor="is_active" className="text-sm text-slate-300">
                Strategy active (execution will run for this strategy when not paused)
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

        <p className="mt-4 text-sm text-slate-500">
          Mirrors FT wallet: <Link href={`/ft/${strategy?.ft_wallet_id}`} className="text-[#FDB022] hover:underline">{strategy?.ft_wallet_id}</Link>
        </p>
      </div>
    </div>
  );
}
