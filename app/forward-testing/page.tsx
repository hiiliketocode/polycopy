'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, TrendingUp, TrendingDown, Target, Activity, Calendar } from 'lucide-react';

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

// Backtest expectations for comparison
const BACKTEST_EXPECTATIONS: Record<string, { avg_pnl: number; win_rate: number }> = {
  MODEL_50: { avg_pnl: 0.1219, win_rate: 0.725 },
  UNDERDOG_M50_E5: { avg_pnl: 0.4337, win_rate: 0.496 },
  BALANCED_MODEL50: { avg_pnl: 0.1678, win_rate: 0.608 },
  FAVORITES_95ct: { avg_pnl: 0.006, win_rate: 0.986 }, // New - based on initial run
};

const CONFIG_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  MODEL_50: { name: 'Bot Trading', description: 'All prices, model >= 50%' },
  UNDERDOG_M50_E5: { name: 'Manual Trading', description: 'Underdogs (<50ct), model >= 50%, edge >= 5%' },
  BALANCED_MODEL50: { name: 'Balanced', description: 'Mid-range (30-70ct), model >= 50%' },
  FAVORITES_95ct: { name: 'Heavy Favorites', description: 'Entry >= 95ct, no model filter' },
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
          const pnlStatus = getPerformanceStatus(result.config_id, 'avg_pnl', result.avg_pnl_pct);
          const wrStatus = getPerformanceStatus(result.config_id, 'win_rate', result.win_rate);
          
          return (
            <Card key={result.config_id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{config?.name || result.config_id}</CardTitle>
                    <CardDescription>{config?.description}</CardDescription>
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
                </div>
              </CardContent>
            </Card>
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
                return (
                  <TableRow key={result.config_id}>
                    <TableCell className="font-medium">{result.config_id}</TableCell>
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
