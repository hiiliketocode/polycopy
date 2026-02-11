'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Save, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RiskRules {
  rule_id: string;
  strategy_id: string;
  daily_budget_usd: number | null;
  max_position_size_usd: number | null;
  max_total_exposure_usd: number | null;
  max_concurrent_positions: number;
  max_drawdown_pct: number;
  max_consecutive_losses: number;
  max_slippage_pct: number;
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

interface RiskSettingsPanelProps {
  strategyId: string;
}

export function RiskSettingsPanel({ strategyId }: RiskSettingsPanelProps) {
  const [rules, setRules] = useState<RiskRules | null>(null);
  const [state, setState] = useState<RiskState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [editedRules, setEditedRules] = useState<Partial<RiskRules>>({});

  useEffect(() => {
    loadRiskData();
  }, [strategyId]);

  const loadRiskData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(strategyId)}/risk`, {
        cache: 'no-store'
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to load risk data');
      
      setRules(data.rules);
      setState(data.state);
      setEditedRules({});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (Object.keys(editedRules).length === 0) return;
    
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      const res = await fetch(`/api/lt/strategies/${encodeURIComponent(strategyId)}/risk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedRules)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      await loadRiskData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditedRules({});
  };

  const updateField = (field: keyof RiskRules, value: any) => {
    setEditedRules(prev => ({ ...prev, [field]: value }));
  };

  const getValue = (field: keyof RiskRules) => {
    if (field in editedRules) {
      return editedRules[field];
    }
    return rules ? rules[field] : null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!rules || !state) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">Failed to load risk settings</p>
        </CardContent>
      </Card>
    );
  }

  const drawdownPct = (state.current_drawdown_pct * 100).toFixed(2);
  const maxDrawdownPct = (rules.max_drawdown_pct * 100).toFixed(0);
  const isNearDrawdownLimit = state.current_drawdown_pct > rules.max_drawdown_pct * 0.8;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Risk Management Settings
          <div className="flex gap-2">
            {Object.keys(editedRules).length > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={saving}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Adjust risk limits and circuit breakers. Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
            ✅ Risk settings saved successfully
          </div>
        )}

        {/* Current Risk State */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h3 className="font-semibold mb-3 text-sm">Current Risk State</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Current Equity:</span>
              <span className="ml-2 font-medium">${state.current_equity.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Peak Equity:</span>
              <span className="ml-2 font-medium">${state.peak_equity.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Drawdown:</span>
              <span className="ml-2 font-medium">
                {drawdownPct}%
                {isNearDrawdownLimit && (
                  <Badge variant="destructive" className="ml-2">Near Limit</Badge>
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Consecutive Losses:</span>
              <span className="ml-2 font-medium">{state.consecutive_losses}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Daily Spent:</span>
              <span className="ml-2 font-medium">${state.daily_spent_usd.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>
              {state.is_paused ? (
                <Badge variant="destructive" className="ml-2">Paused</Badge>
              ) : state.circuit_breaker_active ? (
                <Badge variant="destructive" className="ml-2">Circuit Breaker</Badge>
              ) : (
                <Badge variant="default" className="ml-2 bg-green-600">Active</Badge>
              )}
            </div>
          </div>
          {state.pause_reason && (
            <div className="mt-3 p-2 rounded bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              <strong>Pause Reason:</strong> {state.pause_reason}
            </div>
          )}
        </div>

        {/* Drawdown Controls */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Drawdown Controls (Auto-Pause Triggers)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_drawdown">Max Drawdown % (Auto-Pause)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max_drawdown"
                  type="number"
                  step="1"
                  min="5"
                  max="50"
                  value={getValue('max_drawdown_pct') ? (getValue('max_drawdown_pct') as number) * 100 : ''}
                  onChange={(e) => updateField('max_drawdown_pct', parseFloat(e.target.value) / 100)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {drawdownPct}% / {maxDrawdownPct}%
                {isNearDrawdownLimit && <span className="text-orange-600 font-medium ml-1">⚠️ Near limit!</span>}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_consecutive_losses">Max Consecutive Losses</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max_consecutive_losses"
                  type="number"
                  step="1"
                  min="3"
                  max="20"
                  value={getValue('max_consecutive_losses') || ''}
                  onChange={(e) => updateField('max_consecutive_losses', parseInt(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">losses</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {state.consecutive_losses} losses
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <strong>💡 Recommendation:</strong> For copy trading, use 20-25% max drawdown. 
            Lower values (5-10%) cause frequent auto-pauses from normal variance.
          </div>
        </div>

        {/* Budget Controls */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Budget Limits</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily_budget">Daily Budget (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input
                  id="daily_budget"
                  type="number"
                  step="10"
                  min="0"
                  value={getValue('daily_budget_usd') || ''}
                  onChange={(e) => updateField('daily_budget_usd', parseFloat(e.target.value))}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Spent today: ${state.daily_spent_usd.toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_position_size">Max Position Size (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input
                  id="max_position_size"
                  type="number"
                  step="5"
                  min="1"
                  value={getValue('max_position_size_usd') || ''}
                  onChange={(e) => updateField('max_position_size_usd', parseFloat(e.target.value))}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_exposure">Max Total Exposure (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input
                  id="max_exposure"
                  type="number"
                  step="50"
                  min="0"
                  value={getValue('max_total_exposure_usd') || ''}
                  onChange={(e) => updateField('max_total_exposure_usd', parseFloat(e.target.value))}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_concurrent">Max Concurrent Positions</Label>
              <Input
                id="max_concurrent"
                type="number"
                step="5"
                min="1"
                value={getValue('max_concurrent_positions') || ''}
                onChange={(e) => updateField('max_concurrent_positions', parseInt(e.target.value))}
                className="w-32"
              />
            </div>
          </div>
        </div>

        {/* Circuit Breaker Controls */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Circuit Breakers</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="max_slippage">Max Slippage % (Reject Order)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max_slippage"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={getValue('max_slippage_pct') ? (getValue('max_slippage_pct') as number) * 100 : ''}
                  onChange={(e) => updateField('max_slippage_pct', parseFloat(e.target.value) / 100)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Orders with higher slippage are rejected
              </p>
            </div>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Quick Presets</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditedRules({
                  max_drawdown_pct: 0.10,
                  max_consecutive_losses: 5,
                  daily_budget_usd: 50,
                  max_position_size_usd: 10
                });
              }}
            >
              Conservative (10% DD, $50/day)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditedRules({
                  max_drawdown_pct: 0.20,
                  max_consecutive_losses: 8,
                  daily_budget_usd: 200,
                  max_position_size_usd: 50
                });
              }}
            >
              Moderate (20% DD, $200/day)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditedRules({
                  max_drawdown_pct: 0.35,
                  max_consecutive_losses: 15,
                  daily_budget_usd: null,
                  max_position_size_usd: null
                });
              }}
            >
              Aggressive (35% DD, No Limits)
            </Button>
          </div>
        </div>

        {/* Warning if auto-pause likely */}
        {isNearDrawdownLimit && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
            <strong>⚠️ Warning:</strong> Current drawdown ({drawdownPct}%) is close to your limit ({maxDrawdownPct}%). 
            Strategy will auto-pause if it reaches {maxDrawdownPct}%. Consider increasing the limit or monitoring closely.
          </div>
        )}

        {state.is_paused && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <strong>🛑 Strategy Paused:</strong> {state.pause_reason || 'Unknown reason'}
            <div className="mt-2">
              <Button
                size="sm"
                onClick={async () => {
                  const res = await fetch(`/api/lt/strategies/${encodeURIComponent(strategyId)}/resume`, {
                    method: 'POST'
                  });
                  if (res.ok) {
                    await loadRiskData();
                  }
                }}
              >
                Resume Strategy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
