'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, TrendingUp, TrendingDown, Target, Activity, Calendar, ChevronDown, Info } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ForwardTestResult {
  config_id: string;
  snapshot_date: string;
  period_start: string;
  period_end: string;
  total_trades: number;
  won_trades: number;
  lost_trades: number;
  win_rate: number;
  avg_pnl_pct: number;
  total_pnl: number;
}

interface DailyResult {
  config_id: string;
  trade_date: string;
  total_trades: number;
  won_trades: number;
  lost_trades: number;
  win_rate: number;
  avg_pnl: number;
  total_pnl: number;
  avg_entry_price: number;
}

// Backtest expectations for comparison (from holdout backtest)
const BACKTEST_EXPECTATIONS: Record<string, { avg_pnl: number; win_rate: number }> = {
  MODEL_50: { avg_pnl: 0.1219, win_rate: 0.725 },
  UNDERDOG_M50_E5: { avg_pnl: 0.4337, win_rate: 0.496 },
  BALANCED_MODEL50: { avg_pnl: 0.1678, win_rate: 0.608 },
  FAVORITES_95ct: { avg_pnl: 0.006, win_rate: 0.986 },
  // FT core strategies
  MODEL_ONLY: { avg_pnl: 0.12, win_rate: 0.70 },
  HIGH_CONVICTION: { avg_pnl: 0.15, win_rate: 0.65 },
  UNDERDOG_HUNTER: { avg_pnl: 0.43, win_rate: 0.50 },
  FAVORITE_GRINDER: { avg_pnl: 0.05, win_rate: 0.85 },
  MODEL_BALANCED: { avg_pnl: 0.17, win_rate: 0.61 },
  SHARP_SHOOTER: { avg_pnl: 0.25, win_rate: 0.68 },
  // FT learnings (Feb 2026)
  LEARNINGS_SWEET_SPOT: { avg_pnl: 0.30, win_rate: 0.55 },
  LEARNINGS_ML_60: { avg_pnl: 0.20, win_rate: 0.74 },
};

type ConfigMeta = {
  name: string;
  description: string;
  hypothesis: string;
  settings: string;
  compareAgainst: string;
};

const CONFIG_DESCRIPTIONS: Record<string, ConfigMeta> = {
  MODEL_50: {
    name: 'Bot Trading',
    description: 'Pure model signal across all price ranges. No trader filters.',
    hypothesis: 'Does the ML model alone generate positive expectancy without trader filters?',
    settings: 'Model ≥50%, Price 0-100¢, Edge ≥0%, No WR filter',
    compareAgainst: 'UNDERDOG_M50_E5, MODEL_BALANCED — if MODEL_50 underperforms, trader filters add alpha.',
  },
  UNDERDOG_M50_E5: {
    name: 'Manual Trading',
    description: 'Underdogs only, model + 5% edge. Combines ML with strict value filter.',
    hypothesis: 'Do underdogs with model confidence and edge outperform the full-price baseline?',
    settings: 'Model ≥50%, Price 0-50¢, Edge ≥5%, Trader WR implicit',
    compareAgainst: 'MODEL_50 (broader), UNDERDOG_HUNTER (same config). Compare PnL vs volume trade-off.',
  },
  BALANCED_MODEL50: {
    name: 'Balanced',
    description: 'Mid-range prices only. Avoids extremes (longshots and heavy favorites).',
    hypothesis: 'Does constraining to 30-70¢ reduce variance while preserving edge?',
    settings: 'Model ≥50%, Price 30-70¢, Edge ≥0%',
    compareAgainst: 'MODEL_50 (full range), SHARP_SHOOTER (tighter 10-70¢).',
  },
  FAVORITES_95ct: {
    name: 'Heavy Favorites',
    description: 'Ultra-safe: 95-100¢ entries only. No model, no edge filter.',
    hypothesis: 'Do near-certain favorites with minimal payout offer stable returns?',
    settings: 'No model, Price 95-100¢, Edge 0%',
    compareAgainst: 'FAVORITE_GRINDER (50-90¢, wider). Heavy favorites = lower variance, lower upside.',
  },
  MODEL_ONLY: {
    name: 'Model Only',
    description: 'Isolated ML signal. Model 55%+ only, no trader WR or edge filter.',
    hypothesis: 'If MODEL_ONLY underperforms vs trader-filtered strategies, trader selection adds alpha.',
    settings: 'Model ≥55%, Price 0-100¢, Edge ≥0%, Min 10 resolved trades',
    compareAgainst: 'HIGH_CONVICTION (no model, underdogs), UNDERDOG_HUNTER (model+edge). Key: does ML add value?',
  },
  HIGH_CONVICTION: {
    name: 'High Conviction',
    description: 'Trader WR only. 0-50¢ underdogs, no model. Pure trader signal.',
    hypothesis: 'Does trader track record alone (95%+ WR) beat model-gated underdog strategies?',
    settings: 'No model, Price 0-50¢, Edge 0%, Trader WR 95%+',
    compareAgainst: 'MODEL_ONLY, UNDERDOG_HUNTER. If HIGH_CONVICTION beats MODEL_ONLY, ML may not add value for underdogs.',
  },
  UNDERDOG_HUNTER: {
    name: 'Underdog Hunter',
    description: 'Model + edge on underdogs. Model 50%+, 0-50¢, 5% edge.',
    hypothesis: 'Do model and edge together improve underdog selection vs WR-only?',
    settings: 'Model ≥50%, Price 0-50¢, Edge ≥5%',
    compareAgainst: 'HIGH_CONVICTION (no model), FAVORITE_GRINDER (opposite: favorites). Underdogs vs favorites risk profile.',
  },
  FAVORITE_GRINDER: {
    name: 'Favorite Grinder',
    description: 'Favorites 50-90¢, 3% edge, no model. Steady small wins.',
    hypothesis: 'Are favorites with high-WR traders more consistent than underdog strategies?',
    settings: 'No model, Price 50-90¢, Edge ≥3%, Trader WR 60%+',
    compareAgainst: 'UNDERDOG_HUNTER (underdogs). Favorites = lower variance, smaller payouts.',
  },
  MODEL_BALANCED: {
    name: 'Model Balanced',
    description: 'Broad model+trader baseline. Full range, 5% edge, 55%+ WR.',
    hypothesis: 'Baseline for diversified approach. Does combining model and trader filters beat pure ML?',
    settings: 'Model ≥50%, Price 0-100¢, Edge ≥5%',
    compareAgainst: 'MODEL_ONLY (model alone), SHARP_SHOOTER (more selective).',
  },
  SHARP_SHOOTER: {
    name: 'Sharp Shooter',
    description: 'Highest bar: model 55%+, 10-70¢, 10% edge, 65%+ WR.',
    hypothesis: 'Does selectivity (fewer trades, higher bar) improve risk-adjusted returns?',
    settings: 'Model ≥55%, Price 10-70¢, Edge ≥10%, Trader WR 65%+',
    compareAgainst: 'MODEL_BALANCED (volume vs selectivity). Sharpe ratio, trade count.',
  },
  LEARNINGS_SWEET_SPOT: {
    name: 'Sweet Spot 20-40¢',
    description: 'FT best-performing band. 20-40¢ only, model 55%, 5% edge.',
    hypothesis: 'Is 20-40¢ the optimal band when made explicit? (FT analysis: +$6.9k PnL in this band.)',
    settings: 'Model ≥55%, Price 20-40¢, Edge ≥5%',
    compareAgainst: 'UNDERDOG_HUNTER (0-50¢ broader), LEARNINGS_ML_60. Does narrowing to 20-40¢ improve?',
  },
  LEARNINGS_ML_60: {
    name: 'ML Band 60%',
    description: 'Tighter ML bar: 60%+ only. FT: 60-65% had 73.5% WR vs 55-60% at 34.9%.',
    hypothesis: 'Does ML 60%+ (narrower than 55%+) improve precision and win rate?',
    settings: 'Model ≥60%, Price 0-100¢, Edge ≥5%',
    compareAgainst: 'MODEL_ONLY (55%), SHARP_SHOOTER. Fewer trades, higher confidence.',
  },
};

export default function ForwardTestingPage() {
  const [results, setResults] = useState<ForwardTestResult[]>([]);
  const [dailyData, setDailyData] = useState<Record<string, DailyResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('summary');

  const fetchResults = async () => {
    try {
      setLoading(true);
      const [summaryRes, dailyRes] = await Promise.all([
        fetch('/api/forward-test/update'),
        fetch('/api/forward-test/daily'),
      ]);
      
      const summaryData = await summaryRes.json();
      const dailyDataRes = await dailyRes.json();
      
      if (summaryData.success) {
        setResults(summaryData.latest || []);
      }
      if (dailyDataRes.success) {
        setDailyData(dailyDataRes.daily || {});
      }
      if (!summaryData.success && !dailyDataRes.success) {
        setError(summaryData.error || dailyDataRes.error);
      }
    } catch (err) {
      setError('Failed to fetch results');
    } finally {
      setLoading(false);
    }
  };

  const updateResults = async () => {
    try {
      setUpdating(true);
      await Promise.all([
        fetch('/api/forward-test/update', { method: 'POST' }),
        fetch('/api/forward-test/daily', { method: 'POST' }),
      ]);
      await fetchResults();
    } catch (err) {
      setError('Failed to update results');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const formatPct = (value: number) => {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value: number) => {
    return value.toLocaleString();
  };

  const getPerformanceStatus = (configId: string, metric: 'avg_pnl' | 'win_rate', actual: number) => {
    const expected = BACKTEST_EXPECTATIONS[configId as keyof typeof BACKTEST_EXPECTATIONS];
    if (!expected) return 'neutral';
    
    const expectedValue = expected[metric];
    const diff = actual - expectedValue;
    
    if (diff >= 0.02) return 'above';
    if (diff <= -0.02) return 'below';
    return 'on-target';
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Forward Testing Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Live performance tracking for recommended configurations
          </p>
        </div>
        <Button onClick={updateResults} disabled={updating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
          {updating ? 'Updating...' : 'Update Results'}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {results.map((result) => {
          const config = CONFIG_DESCRIPTIONS[result.config_id as keyof typeof CONFIG_DESCRIPTIONS];
          const meta = config as ConfigMeta | undefined;
          const pnlStatus = getPerformanceStatus(result.config_id, 'avg_pnl', result.avg_pnl_pct);
          const wrStatus = getPerformanceStatus(result.config_id, 'win_rate', result.win_rate);
          
          return (
            <Collapsible key={result.config_id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{meta?.name || result.config_id}</CardTitle>
                      <CardDescription>{meta?.description}</CardDescription>
                    </div>
                    <Badge variant={result.total_pnl >= 0 ? 'default' : 'destructive'}>
                      {result.total_pnl >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                      {formatNumber(Math.round(result.total_pnl))}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Avg PnL/Trade</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${result.avg_pnl_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPct(result.avg_pnl_pct)}
                        </span>
                        {pnlStatus === 'above' && <Badge variant="outline" className="text-xs bg-green-50">Above Expected</Badge>}
                        {pnlStatus === 'below' && <Badge variant="outline" className="text-xs bg-red-50">Below Expected</Badge>}
                        {pnlStatus === 'on-target' && <Badge variant="outline" className="text-xs"><Target className="h-3 w-3" /></Badge>}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Win Rate</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{(result.win_rate * 100).toFixed(1)}%</span>
                        {wrStatus === 'above' && <Badge variant="outline" className="text-xs bg-green-50">Above</Badge>}
                        {wrStatus === 'below' && <Badge variant="outline" className="text-xs bg-red-50">Below</Badge>}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Trades</span>
                      <span className="font-semibold">{formatNumber(result.total_trades)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">W / L</span>
                      <span className="font-mono text-sm">
                        <span className="text-green-600">{formatNumber(result.won_trades)}</span>
                        {' / '}
                        <span className="text-red-600">{formatNumber(result.lost_trades)}</span>
                      </span>
                    </div>

                    {meta?.hypothesis && (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground -mb-1">
                          <span className="flex items-center gap-2">
                            <Info className="h-3.5 w-3.5" />
                            Hypothesis, settings & compare
                          </span>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                  {meta?.hypothesis && (
                    <CollapsibleContent>
                      <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-muted-foreground">Hypothesis:</span>
                          <p className="mt-0.5 text-foreground">{meta.hypothesis}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Settings:</span>
                          <p className="mt-0.5 font-mono text-xs text-foreground">{meta.settings}</p>
                        </div>
                        <div>
                          <span className="font-medium text-muted-foreground">Compare against:</span>
                          <p className="mt-0.5 text-foreground">{meta.compareAgainst}</p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  )}
                </CardContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Forward Test Results
          </CardTitle>
          <CardDescription>
            Period: Feb 1, 2026 - Present | Updated: {results[0]?.snapshot_date || 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Configuration</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Expected WR</TableHead>
                <TableHead className="text-right">Avg PnL</TableHead>
                <TableHead className="text-right">Expected Avg PnL</TableHead>
                <TableHead className="text-right">Total PnL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => {
                const expected = BACKTEST_EXPECTATIONS[result.config_id as keyof typeof BACKTEST_EXPECTATIONS];
                const meta = CONFIG_DESCRIPTIONS[result.config_id as keyof typeof CONFIG_DESCRIPTIONS] as ConfigMeta | undefined;
                return (
                  <TableRow key={result.config_id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{meta?.name || result.config_id}</div>
                        {meta && <div className="text-xs text-muted-foreground mt-0.5">{meta.settings}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(result.total_trades)}</TableCell>
                    <TableCell className="text-right">{(result.win_rate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {expected ? `${(expected.win_rate * 100).toFixed(1)}%` : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${result.avg_pnl_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPct(result.avg_pnl_pct)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {expected ? formatPct(expected.avg_pnl) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${result.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {result.total_pnl >= 0 ? '+' : ''}{formatNumber(Math.round(result.total_pnl))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Daily Breakdown */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Performance Breakdown
          </CardTitle>
          <CardDescription>
            Day-by-day performance for each configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              {Object.keys(dailyData).map((configId) => (
                <TabsTrigger key={configId} value={configId}>
                  {CONFIG_DESCRIPTIONS[configId]?.name || configId}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {Object.entries(dailyData).map(([configId, days]) => {
              let cumulativePnl = 0;
              return (
                <TabsContent key={configId} value={configId}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Trades</TableHead>
                        <TableHead className="text-right">Won</TableHead>
                        <TableHead className="text-right">Lost</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Avg PnL</TableHead>
                        <TableHead className="text-right">Day PnL</TableHead>
                        <TableHead className="text-right">Cumulative</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {days.map((day) => {
                        cumulativePnl += day.total_pnl;
                        return (
                          <TableRow key={day.trade_date}>
                            <TableCell className="font-medium">{day.trade_date}</TableCell>
                            <TableCell className="text-right">{day.total_trades.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-green-600">{day.won_trades.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-red-600">{day.lost_trades.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{(day.win_rate * 100).toFixed(1)}%</TableCell>
                            <TableCell className={`text-right ${day.avg_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {day.avg_pnl >= 0 ? '+' : ''}{(day.avg_pnl * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${day.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {day.total_pnl >= 0 ? '+' : ''}{Math.round(day.total_pnl).toLocaleString()}
                            </TableCell>
                            <TableCell className={`text-right font-bold ${cumulativePnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {cumulativePnl >= 0 ? '+' : ''}{Math.round(cumulativePnl).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>

      {/* Backtest Comparison Info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Backtest vs Forward Test Comparison</CardTitle>
          <CardDescription>
            How do live results compare to backtested expectations?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2">
            <p>
              <strong>Backtest Period:</strong> Jan 15-31, 2026 (Holdout data)
            </p>
            <p>
              <strong>Forward Test Period:</strong> Feb 1, 2026 - Present (Rolling daily updates)
            </p>
            <p className="text-muted-foreground mt-4">
              Configurations performing at or above expected levels indicate the model is generalizing well.
              Significant underperformance may indicate market drift requiring model retraining.
            </p>
            <p className="text-muted-foreground">
              <strong>Note:</strong> Data comes from resolved markets only. There is typically a 12-48 hour lag
              between when a trade is placed and when the market resolves.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
