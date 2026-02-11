'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Save, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * V2: Risk rules are inline on lt_strategies.
 * The /api/lt/strategies/[id]/risk endpoint returns { rules, state }
 * where rules = { max_position_size_usd, max_total_exposure_usd, daily_budget_usd,
 *                 max_daily_loss_usd, circuit_breaker_loss_pct, stop_loss_pct,
 *                 take_profit_pct, max_hold_hours }
 * and state = { is_paused, circuit_breaker_active, daily_spent_usd, daily_loss_usd,
 *               consecutive_losses, peak_equity, current_drawdown_pct, last_reset_date }
 */

interface RiskRules {
  max_position_size_usd: number | null;
  max_total_exposure_usd: number | null;
  daily_budget_usd: number | null;
  max_daily_loss_usd: number | null;
  circuit_breaker_loss_pct: number | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  max_hold_hours: number | null;
}

interface RiskState {
  is_paused: boolean;
  circuit_breaker_active: boolean;
  daily_spent_usd: number;
  daily_loss_usd: number;
  consecutive_losses: number;
  peak_equity: number;
  current_drawdown_pct: number;
  last_reset_date: string | null;
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
          <p className="text-sm text-red-600">{error || 'Failed to load risk settings'}</p>
        </CardContent>
      </Card>
    );
  }

  const drawdownPct = (Number(state.current_drawdown_pct) * 100).toFixed(2);
  const cbLossPct = rules.circuit_breaker_loss_pct != null ? (Number(rules.circuit_breaker_loss_pct) * 100).toFixed(0) : null;
  const isNearDrawdownLimit = rules.circuit_breaker_loss_pct != null && Number(state.current_drawdown_pct) > Number(rules.circuit_breaker_loss_pct) * 0.8;

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
            Risk settings saved successfully
          </div>
        )}

        {/* Current Risk State */}
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
          <h3 className="font-semibold mb-3 text-sm">Current Risk State</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Peak Equity:</span>
              <span className="ml-2 font-medium">${Number(state.peak_equity).toFixed(2)}</span>
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
              <span className="ml-2 font-medium">${Number(state.daily_spent_usd).toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Daily Loss:</span>
              <span className="ml-2 font-medium">${Number(state.daily_loss_usd).toFixed(2)}</span>
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
          {state.last_reset_date && (
            <div className="mt-2 text-xs text-muted-foreground">
              Last daily reset: {state.last_reset_date}
            </div>
          )}
        </div>

        {/* Circuit Breaker / Drawdown Controls */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Drawdown & Circuit Breaker</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="circuit_breaker_loss_pct">Circuit Breaker Drawdown %</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="circuit_breaker_loss_pct"
                  type="number"
                  step="1"
                  min="5"
                  max="50"
                  value={getValue('circuit_breaker_loss_pct') != null ? Number(getValue('circuit_breaker_loss_pct')) * 100 : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('circuit_breaker_loss_pct', v === '' ? null : parseFloat(v) / 100);
                  }}
                  placeholder="No limit"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {drawdownPct}%{cbLossPct ? ` / ${cbLossPct}%` : ''}
                {isNearDrawdownLimit && <span className="text-orange-600 font-medium ml-1">Near limit!</span>}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_daily_loss">Max Daily Loss (USD)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm">$</span>
                <Input
                  id="max_daily_loss"
                  type="number"
                  step="10"
                  min="0"
                  value={getValue('max_daily_loss_usd') ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('max_daily_loss_usd', v === '' ? null : parseFloat(v));
                  }}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Today's loss: ${Number(state.daily_loss_usd).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
            <strong>Recommendation:</strong> For copy trading, use 20-25% max drawdown. 
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
                  value={getValue('daily_budget_usd') ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('daily_budget_usd', v === '' ? null : parseFloat(v));
                  }}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Spent today: ${Number(state.daily_spent_usd).toFixed(2)}
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
                  value={getValue('max_position_size_usd') ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('max_position_size_usd', v === '' ? null : parseFloat(v));
                  }}
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
                  value={getValue('max_total_exposure_usd') ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('max_total_exposure_usd', v === '' ? null : parseFloat(v));
                  }}
                  placeholder="No limit"
                  className="w-32"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Exit Controls */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Auto-Exit Rules</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stop_loss">Stop Loss %</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="stop_loss"
                  type="number"
                  step="1"
                  min="1"
                  max="90"
                  value={getValue('stop_loss_pct') != null ? Number(getValue('stop_loss_pct')) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('stop_loss_pct', v === '' ? null : parseFloat(v));
                  }}
                  placeholder="Off"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-sell if position down X%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="take_profit">Take Profit %</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="take_profit"
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  value={getValue('take_profit_pct') != null ? Number(getValue('take_profit_pct')) : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('take_profit_pct', v === '' ? null : parseFloat(v));
                  }}
                  placeholder="Off"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-sell if position up X%</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_hold_hours">Max Hold Hours</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="max_hold_hours"
                  type="number"
                  step="1"
                  min="1"
                  value={getValue('max_hold_hours') ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateField('max_hold_hours', v === '' ? null : parseInt(v));
                  }}
                  placeholder="Off"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-exit after X hours</p>
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
                  circuit_breaker_loss_pct: 0.10,
                  daily_budget_usd: 50,
                  max_daily_loss_usd: 25,
                  max_position_size_usd: 10,
                });
              }}
            >
              Conservative (10% CB, $50/day)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditedRules({
                  circuit_breaker_loss_pct: 0.20,
                  daily_budget_usd: 200,
                  max_daily_loss_usd: 100,
                  max_position_size_usd: 50,
                });
              }}
            >
              Moderate (20% CB, $200/day)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditedRules({
                  circuit_breaker_loss_pct: 0.35,
                  daily_budget_usd: null,
                  max_daily_loss_usd: null,
                  max_position_size_usd: null,
                });
              }}
            >
              Aggressive (35% CB, No Limits)
            </Button>
          </div>
        </div>

        {/* Warning if near drawdown limit */}
        {isNearDrawdownLimit && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
            <strong>Warning:</strong> Current drawdown ({drawdownPct}%) is close to your circuit breaker limit ({cbLossPct}%). 
            Strategy will auto-pause if it reaches {cbLossPct}%. Consider increasing the limit or monitoring closely.
          </div>
        )}

        {state.is_paused && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <strong>Strategy Paused</strong>
            {state.circuit_breaker_active && <span> — Circuit breaker triggered</span>}
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
