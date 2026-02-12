'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  RefreshCw, 
  ArrowLeft,
  Save,
  Calendar,
  DollarSign,
  Settings
} from 'lucide-react';

interface WalletSettings {
  wallet_id: string;
  config_id: string;
  display_name: string;
  description: string;
  detailed_description: string | null;
  starting_balance: number;
  bet_size: number;
  bet_allocation_weight: number;
  allocation_method: 'FIXED' | 'KELLY' | 'EDGE_SCALED' | 'TIERED' | 'CONFIDENCE';
  kelly_fraction: number;
  min_bet: number;
  max_bet: number;
  start_date: { value: string };
  end_date: { value: string };
  model_threshold: number;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  is_active: boolean;
}

export default function WalletSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [endDate, setEndDate] = useState('');
  const [betSize, setBetSize] = useState('');
  const [allocationWeight, setAllocationWeight] = useState('1.0');
  const [allocationMethod, setAllocationMethod] = useState<string>('KELLY');
  const [kellyFraction, setKellyFraction] = useState('0.25');
  const [minBet, setMinBet] = useState('0.50');
  const [maxBet, setMaxBet] = useState('10.00');
  const [isActive, setIsActive] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ft/wallets/${id}/settings`);
      const data = await res.json();
      
      if (data.success) {
        setSettings(data.settings);
        // Initialize form values
        const endDateObj = new Date(data.settings.end_date.value);
        setEndDate(endDateObj.toISOString().split('T')[0]);
        setBetSize(data.settings.bet_size?.toString() || '1.20');
        setAllocationWeight(data.settings.bet_allocation_weight?.toString() || '1.0');
        setAllocationMethod(data.settings.allocation_method || 'KELLY');
        setKellyFraction(data.settings.kelly_fraction?.toString() || '0.25');
        setMinBet(data.settings.min_bet?.toString() || '0.50');
        setMaxBet(data.settings.max_bet?.toString() || '10.00');
        setIsActive(data.settings.is_active);
      } else {
        setError(data.error || 'Failed to fetch settings');
      }
    } catch (err) {
      setError('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updates: Record<string, unknown> = {};
      
      // Only include changed values
      if (endDate) {
        updates.end_date = `${endDate}T23:59:59Z`;
      }
      if (betSize && parseFloat(betSize) > 0) {
        updates.bet_size = parseFloat(betSize);
      }
      if (allocationMethod) {
        updates.allocation_method = allocationMethod;
      }
      if (kellyFraction && parseFloat(kellyFraction) > 0) {
        updates.kelly_fraction = parseFloat(kellyFraction);
      }
      if (minBet && parseFloat(minBet) >= 0) {
        updates.min_bet = parseFloat(minBet);
      }
      if (maxBet && parseFloat(maxBet) > 0) {
        updates.max_bet = parseFloat(maxBet);
      }
      updates.is_active = isActive;

      const res = await fetch(`/api/ft/wallets/${id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Settings saved successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const extendTest = (days: number) => {
    const currentEnd = new Date(endDate);
    currentEnd.setDate(currentEnd.getDate() + days);
    setEndDate(currentEnd.toISOString().split('T')[0]);
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

  if (!settings) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Wallet not found'}</p>
          <Link href="/trading">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Strategies
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/ft/${id}`} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" />
          Back to {settings.display_name}
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Settings className="h-6 w-6" />
          Wallet Settings
        </h1>
        <p className="text-muted-foreground mt-1">{settings.display_name}</p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-3 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Strategy Info (Read Only) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Strategy Configuration</CardTitle>
          <CardDescription>These settings are fixed for this test</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Config ID:</span>
              <span className="ml-2 font-mono">{settings.config_id}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Starting Balance:</span>
              <span className="ml-2 font-semibold">${settings.starting_balance}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Price Range:</span>
              <span className="ml-2">{(settings.price_min * 100).toFixed(0)}¢ - {(settings.price_max * 100).toFixed(0)}¢</span>
            </div>
            <div>
              <span className="text-muted-foreground">Min Edge:</span>
              <span className="ml-2">{(settings.min_edge * 100).toFixed(0)}%</span>
            </div>
            {settings.use_model && (
              <div>
                <span className="text-muted-foreground">Model Threshold:</span>
                <span className="ml-2">{(settings.model_threshold * 100).toFixed(0)}%</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Test Started:</span>
              <span className="ml-2">{new Date(settings.start_date.value).toLocaleDateString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Settings</CardTitle>
          <CardDescription>Adjust test duration and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="end-date" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Test End Date
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="max-w-[200px]"
              />
              <Button variant="outline" size="sm" onClick={() => extendTest(1)}>
                +1 day
              </Button>
              <Button variant="outline" size="sm" onClick={() => extendTest(7)}>
                +1 week
              </Button>
            </div>
          </div>

          {/* Allocation Method */}
          <div className="space-y-2">
            <Label htmlFor="allocation-method" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Bet Sizing Method
            </Label>
            <select
              id="allocation-method"
              value={allocationMethod}
              onChange={(e) => setAllocationMethod(e.target.value)}
              className="w-full max-w-[250px] p-2 border rounded-md bg-background"
            >
              <option value="KELLY">Kelly Criterion (Recommended)</option>
              <option value="FIXED">Fixed Bet Size</option>
              <option value="EDGE_SCALED">Edge-Scaled</option>
              <option value="TIERED">Tiered Brackets</option>
              <option value="CONFIDENCE">Confidence Score</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {allocationMethod === 'KELLY' && 'Bet size based on edge and bankroll - mathematically optimal'}
              {allocationMethod === 'FIXED' && 'Same bet size for every trade'}
              {allocationMethod === 'EDGE_SCALED' && 'Higher edge = bigger bet (linear scaling)'}
              {allocationMethod === 'TIERED' && 'Bracket-based: <5% edge = 0.5x, 5-10% = 1x, 10-15% = 1.5x, 15%+ = 2x'}
              {allocationMethod === 'CONFIDENCE' && 'Multi-factor score combining edge and trader win rate'}
            </p>
          </div>

          {/* Kelly Fraction (only show for Kelly method) */}
          {allocationMethod === 'KELLY' && (
            <div className="space-y-2">
              <Label htmlFor="kelly-fraction">Kelly Fraction</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="kelly-fraction"
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="1.0"
                  value={kellyFraction}
                  onChange={(e) => setKellyFraction(e.target.value)}
                  className="max-w-[100px]"
                />
                <span className="text-muted-foreground">
                  ({(parseFloat(kellyFraction) * 100).toFixed(0)}% of full Kelly)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Lower = safer (0.25 = quarter Kelly recommended). Full Kelly (1.0) is too aggressive.
              </p>
            </div>
          )}

          {/* Base Bet Size (only show for FIXED method) */}
          {allocationMethod === 'FIXED' && (
            <div className="space-y-2">
              <Label htmlFor="bet-size">Base Bet Size</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="bet-size"
                  type="number"
                  step="0.10"
                  min="0.10"
                  value={betSize}
                  onChange={(e) => setBetSize(e.target.value)}
                  className="max-w-[120px]"
                />
              </div>
            </div>
          )}

          {/* Min/Max Bet Caps */}
          <div className="space-y-2">
            <Label>Bet Size Limits</Label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Min:</span>
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.10"
                  min="0.10"
                  value={minBet}
                  onChange={(e) => setMinBet(e.target.value)}
                  className="w-[80px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Max:</span>
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="1.00"
                  min="1.00"
                  value={maxBet}
                  onChange={(e) => setMaxBet(e.target.value)}
                  className="w-[80px]"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Safety caps to prevent extreme bet sizes
            </p>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="is-active">Test Active</Label>
              <p className="text-sm text-muted-foreground">
                Pause the test to stop syncing new trades
              </p>
            </div>
            <Switch
              id="is-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.push(`/ft/${id}`)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
