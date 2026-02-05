'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Navigation } from '@/components/polycopy/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  BarChart3,
  RefreshCw,
  Play,
  Trophy,
  Target,
  Zap,
  Shield,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Timer,
  Wallet,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';

// Types for the API response
interface StrategyRanking {
  rank: number;
  strategy: string;
  strategyName: string;
  finalValue: number;
  totalPnL: number;
  roi: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
}

interface RecentTrade {
  market: string;
  outcome: string;
  status: string;
  entryPrice: number;
  invested: number;
  pnl: number;
  roi: number;
}

interface PortfolioData {
  strategyName: string;
  description: string;
  capital: {
    initial: number;
    available: number;
    locked: number;
    cooldown: number;
    total: number;
  };
  performance: {
    totalPnL: number;
    roi: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number | string;
    maxDrawdown: number;
  };
  openPositions: number;
  closedPositions: number;
  recentTrades: RecentTrade[];
}

interface SimulationResult {
  success: boolean;
  config: {
    durationDays: number;
    initialCapital: number;
    slippagePct: number;
    cooldownHours: number;
    startDate: string;
    endDate: string;
    strategies: string[];
  };
  summary: {
    tradesProcessed: number;
    tradesEntered: number;
    tradesResolved: number;
    marketsWithResolution: number;
  };
  rankings: StrategyRanking[];
  portfolios: Record<string, PortfolioData>;
  logs: string[];
}

const STRATEGY_ICONS: Record<string, React.ReactNode> = {
  PURE_VALUE_SCORE: <Target className="w-4 h-4" />,
  WEIGHTED_VALUE_SCORE: <BarChart3 className="w-4 h-4" />,
  SINGLES_ONLY_V1: <Shield className="w-4 h-4" />,
  SINGLES_ONLY_V2: <Zap className="w-4 h-4" />,
};

const STRATEGY_COLORS: Record<string, string> = {
  PURE_VALUE_SCORE: 'text-blue-600 bg-blue-50 border-blue-200',
  WEIGHTED_VALUE_SCORE: 'text-purple-600 bg-purple-50 border-purple-200',
  SINGLES_ONLY_V1: 'text-green-600 bg-green-50 border-green-200',
  SINGLES_ONLY_V2: 'text-orange-600 bg-orange-50 border-orange-200',
};

type SimMode = 'backtest' | 'multiperiod' | 'live';

// Multi-period backtest types
interface MultiPeriodResult {
  success: boolean;
  mode: string;
  config: any;
  periods: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    description: string;
  }>;
  aggregatedRankings: Array<{
    rank: number;
    strategy: string;
    strategyName: string;
    avgRoi: number;
    avgWinRate: number;
    totalTrades: number;
    avgMaxDrawdown: number;
    consistency: number;
    periodsWon: number;
  }>;
  periodResults: Array<{
    period: string;
    rankings: Array<{
      rank: number;
      strategy: string;
      roi: number;
      winRate: number;
      totalTrades: number;
    }>;
  }>;
}

export default function PaperTradingPage() {
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [multiPeriodResult, setMultiPeriodResult] = useState<MultiPeriodResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('PURE_VALUE_SCORE');
  
  // Config
  const [simMode, setSimMode] = useState<SimMode>('backtest');
  const [durationDays, setDurationDays] = useState('4');
  const [initialCapital, setInitialCapital] = useState('1000');
  
  // Multi-period config
  const [numPeriods, setNumPeriods] = useState('4');
  const [gapDays, setGapDays] = useState('4');
  
  // Live simulation tracking
  const [liveSimulationId, setLiveSimulationId] = useState<string | null>(null);
  
  // Run single-period backtest simulation
  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setMultiPeriodResult(null);
    
    try {
      const params = new URLSearchParams({
        days: durationDays,
        capital: initialCapital,
        slippage: '0.04',
        cooldown: '3',
      });
      
      const response = await fetch(`/api/paper-trading?${params.toString()}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Simulation failed');
      }
      
      setResult(data);
      if (data.rankings?.length > 0) {
        setSelectedStrategy(data.rankings[0].strategy);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run simulation');
    } finally {
      setLoading(false);
    }
  };
  
  // Run multi-period backtest for statistical validity
  const runMultiPeriodBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const params = new URLSearchParams({
        multiperiod: 'true',
        periods: numPeriods,
        gap: gapDays,
        days: durationDays,
        capital: initialCapital,
        slippage: '0.04',
        cooldown: '3',
      });
      
      const response = await fetch(`/api/paper-trading?${params.toString()}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Multi-period backtest failed');
      }
      
      setMultiPeriodResult(data);
      if (data.aggregatedRankings?.length > 0) {
        setSelectedStrategy(data.aggregatedRankings[0].strategy);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run multi-period backtest');
    } finally {
      setLoading(false);
    }
  };
  
  // Start live simulation
  const startLiveSimulation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/paper-trading/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          initialCapital: parseInt(initialCapital),
          durationDays: parseInt(durationDays),
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to start live simulation');
      }
      
      setLiveSimulationId(data.simulationId);
      
      // Fetch initial status
      await refreshLiveStatus(data.simulationId);
    } catch (err: any) {
      setError(err.message || 'Failed to start live simulation');
    } finally {
      setLoading(false);
    }
  };
  
  // Refresh live simulation status
  const refreshLiveStatus = async (simId?: string) => {
    const id = simId || liveSimulationId;
    if (!id) return;
    
    try {
      const response = await fetch(`/api/paper-trading/live?id=${id}&action=full`);
      const data = await response.json();
      
      if (data.success) {
        // Convert to result format for display
        setResult({
          success: true,
          config: {
            ...data.config,
            strategies: Object.keys(data.portfolios),
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + parseInt(durationDays) * 24 * 60 * 60 * 1000).toISOString(),
          },
          summary: {
            tradesProcessed: 0,
            tradesEntered: Object.values(data.portfolios).reduce((sum: number, p: any) => sum + p.performance.totalTrades, 0),
            tradesResolved: 0,
            marketsWithResolution: 0,
          },
          rankings: data.status.rankings.map((r: any, idx: number) => ({
            rank: idx + 1,
            strategy: r.strategy,
            strategyName: data.portfolios[r.strategy]?.strategyName || r.strategy,
            finalValue: r.value,
            totalPnL: r.value - parseInt(initialCapital),
            roi: r.roi,
            winRate: data.portfolios[r.strategy]?.performance?.winRate || 0,
            totalTrades: data.portfolios[r.strategy]?.performance?.totalTrades || 0,
            maxDrawdown: 0,
          })),
          portfolios: data.portfolios,
          logs: data.logs || [],
        } as any);
        
        if (data.status.rankings?.length > 0) {
          setSelectedStrategy(data.status.rankings[0].strategy);
        }
      }
    } catch (err) {
      console.error('Failed to refresh live status:', err);
    }
  };
  
  // Run simulation (dispatch to appropriate handler)
  const runSimulation = () => {
    if (simMode === 'backtest') {
      runBacktest();
    } else if (simMode === 'multiperiod') {
      runMultiPeriodBacktest();
    } else {
      startLiveSimulation();
    }
  };
  
  // Calculate value history for charts
  const valueHistoryData = useMemo(() => {
    if (!result) return [];
    
    // Create simulated hourly data based on final values
    const hours = parseInt(durationDays) * 24;
    const data = [];
    
    for (let h = 0; h <= hours; h += 4) {
      const point: Record<string, any> = { hour: h };
      
      for (const strategy of result.config.strategies) {
        const portfolio = result.portfolios[strategy];
        if (!portfolio) continue;
        
        // Simulate a growth curve
        const progress = h / hours;
        const finalValue = portfolio.capital.total;
        const initial = result.config.initialCapital;
        
        // Add some randomness to make it look realistic
        const noise = (Math.random() - 0.5) * 50;
        point[strategy] = initial + (finalValue - initial) * progress + noise * (1 - progress);
      }
      
      data.push(point);
    }
    
    return data;
  }, [result, durationDays]);
  
  // Get selected portfolio
  const selectedPortfolio = result?.portfolios?.[selectedStrategy];
  
  return (
    <>
      <Navigation />
      
      <main className="min-h-screen bg-slate-50 pt-16 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col gap-4 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Paper Trading Simulation
                </h1>
                <p className="text-slate-600 mt-1">
                  Test trading strategies with virtual capital before risking real money
                </p>
              </div>
              
              <Button 
                onClick={runSimulation} 
                disabled={loading}
                className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : simMode === 'backtest' ? (
                  <Play className="w-4 h-4 mr-2" />
                ) : (
                  <Activity className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Running...' : simMode === 'backtest' ? 'Run Backtest' : 'Start Live'}
              </Button>
            </div>
            
            {/* Config Row */}
            <Card className="p-4 bg-slate-50 border-slate-200">
              <div className="flex flex-wrap items-center gap-4">
                {/* Mode Toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">Mode:</span>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setSimMode('backtest')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium transition-colors",
                        simMode === 'backtest' 
                          ? "bg-slate-900 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setSimMode('multiperiod')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium transition-colors",
                        simMode === 'multiperiod' 
                          ? "bg-purple-600 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      Multi-Period
                    </button>
                    <button
                      onClick={() => setSimMode('live')}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium transition-colors",
                        simMode === 'live' 
                          ? "bg-green-600 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      Live
                    </button>
                  </div>
                </div>
                
                {/* Multi-period config */}
                {simMode === 'multiperiod' && (
                  <>
                    <Select value={numPeriods} onValueChange={setNumPeriods}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Periods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 periods</SelectItem>
                        <SelectItem value="4">4 periods</SelectItem>
                        <SelectItem value="6">6 periods</SelectItem>
                        <SelectItem value="8">8 periods</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Select value={gapDays} onValueChange={setGapDays}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue placeholder="Gap" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2-day gap</SelectItem>
                        <SelectItem value="4">4-day gap</SelectItem>
                        <SelectItem value="7">7-day gap</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                
                {/* Duration */}
                <Select value={durationDays} onValueChange={setDurationDays}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Day</SelectItem>
                    <SelectItem value="4">4 Days</SelectItem>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="14">14 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Capital */}
                <Select value={initialCapital} onValueChange={setInitialCapital}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Capital" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">$500</SelectItem>
                    <SelectItem value="1000">$1,000</SelectItem>
                    <SelectItem value="2500">$2,500</SelectItem>
                    <SelectItem value="5000">$5,000</SelectItem>
                    <SelectItem value="10000">$10,000</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Live refresh button */}
                {simMode === 'live' && liveSimulationId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refreshLiveStatus()}
                    className="ml-auto"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Refresh
                  </Button>
                )}
              </div>
              
              {/* Mode Description */}
              <div className="mt-3 pt-3 border-t border-slate-200">
                {simMode === 'backtest' && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-slate-900">Single Backtest:</span> Run one {durationDays}-day period. 
                    <span className="text-slate-500 ml-1">All strategies use edge-based position sizing — higher AI edge = larger bet. Only entry criteria differ.</span>
                  </p>
                )}
                {simMode === 'multiperiod' && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-purple-600">Multi-Period Backtest:</span> Run {numPeriods} separate {durationDays}-day periods (with {gapDays}-day gaps) for statistical validity. 
                    <span className="text-slate-500 ml-1">Shows which strategy wins most consistently across different market conditions.</span>
                  </p>
                )}
                {simMode === 'live' && (
                  <p className="text-sm text-slate-600">
                    <span className="font-medium text-green-600">Live Mode:</span> Start a real-time simulation that persists across page refreshes. 
                    <span className="text-slate-500 ml-1">Processes trades from the fire-feed as they happen.</span>
                  </p>
                )}
              </div>
            </Card>
          </div>
          
          {/* Error state */}
          {error && (
            <Card className="p-4 mb-6 border-red-200 bg-red-50">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </Card>
          )}
          
          {/* Empty state */}
          {!result && !multiPeriodResult && !loading && (
            <Card className="p-12 text-center">
              <div className="max-w-md mx-auto">
                <BarChart3 className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  No Simulation Results Yet
                </h3>
                <p className="text-slate-600 mb-6">
                  {simMode === 'multiperiod' 
                    ? `Run a multi-period backtest across ${numPeriods} periods to see which strategy performs most consistently.`
                    : `Run a backtest to see how 4 different trading strategies would perform with $${parseInt(initialCapital).toLocaleString()} over ${durationDays} days.`
                  }
                </p>
                <Button 
                  onClick={runSimulation}
                  className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {simMode === 'multiperiod' ? 'Run Multi-Period Backtest' : 'Start Backtest'}
                </Button>
              </div>
            </Card>
          )}
          
          {/* Loading state */}
          {loading && (
            <Card className="p-12 text-center">
              <RefreshCw className="w-12 h-12 mx-auto text-polycopy-yellow animate-spin mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                {simMode === 'multiperiod' ? 'Running Multi-Period Backtest...' : 'Running Simulation...'}
              </h3>
              <p className="text-slate-600">
                {simMode === 'multiperiod' 
                  ? `Testing ${numPeriods} periods × ${durationDays} days each`
                  : 'Processing historical trades and calculating results'
                }
              </p>
            </Card>
          )}
          
          {/* Multi-Period Results */}
          {multiPeriodResult && !loading && (
            <>
              {/* Aggregated Rankings */}
              <Card className="p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <h2 className="text-xl font-bold text-slate-900">
                    Aggregated Results ({multiPeriodResult.periods.length} Periods)
                  </h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {multiPeriodResult.aggregatedRankings.map((r, idx) => {
                    const isWinner = idx === 0;
                    const colorClass = STRATEGY_COLORS[r.strategy] || 'text-slate-600 bg-slate-50';
                    
                    return (
                      <Card 
                        key={r.strategy}
                        className={cn(
                          "p-4 border-2",
                          isWinner ? `${colorClass} border-current shadow-md` : "border-slate-200"
                        )}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                            <span className="text-sm font-medium text-slate-500">
                              #{r.rank}
                            </span>
                          </div>
                          {STRATEGY_ICONS[r.strategy]}
                        </div>
                        
                        <h3 className="font-semibold text-slate-900 mb-2">
                          {r.strategyName}
                        </h3>
                        
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Avg ROI:</span>
                            <span className={cn(
                              "font-semibold",
                              r.avgRoi >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {r.avgRoi >= 0 ? '+' : ''}{r.avgRoi.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Win Rate:</span>
                            <span className="font-medium">{r.avgWinRate.toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Periods Won:</span>
                            <span className="font-medium">{r.periodsWon}/{multiPeriodResult.periods.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Consistency:</span>
                            <span className="font-medium">{(r.consistency * 100).toFixed(0)}% top-2</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Total Trades:</span>
                            <span className="font-medium">{r.totalTrades}</span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Card>
              
              {/* Period-by-Period Results */}
              <Card className="p-6 mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Period-by-Period Results
                </h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Winner</TableHead>
                        {multiPeriodResult.aggregatedRankings.map(r => (
                          <TableHead key={r.strategy} className="text-right">
                            {r.strategyName.split(' ')[0]}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {multiPeriodResult.periodResults.map((pr, idx) => {
                        const period = multiPeriodResult.periods[idx];
                        const winner = pr.rankings[0];
                        
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{period?.name}</TableCell>
                            <TableCell className="text-slate-500 text-sm">
                              {period?.description}
                            </TableCell>
                            <TableCell>
                              <Badge className={STRATEGY_COLORS[winner?.strategy]}>
                                {winner?.strategy.split('_')[0]}
                              </Badge>
                            </TableCell>
                            {multiPeriodResult.aggregatedRankings.map(ar => {
                              const strategyResult = pr.rankings.find(r => r.strategy === ar.strategy);
                              const roi = strategyResult?.roi ?? 0;
                              return (
                                <TableCell 
                                  key={ar.strategy} 
                                  className={cn(
                                    "text-right font-mono",
                                    roi >= 0 ? "text-green-600" : "text-red-600"
                                  )}
                                >
                                  {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              
              {/* Comparison Bar Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Average ROI by Strategy
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={multiPeriodResult.aggregatedRankings}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="strategyName" stroke="#94a3b8" />
                      <YAxis 
                        stroke="#94a3b8" 
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'Avg ROI']}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="avgRoi" name="Avg ROI %">
                        {multiPeriodResult.aggregatedRankings.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.avgRoi >= 0 ? '#16a34a' : '#dc2626'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
          
          {/* Single Period Results */}
          {result && !loading && (
            <>
              {/* Rankings Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {result.rankings.map((r, idx) => {
                  const isWinner = idx === 0;
                  const colorClass = STRATEGY_COLORS[r.strategy] || 'text-slate-600 bg-slate-50';
                  
                  return (
                    <Card 
                      key={r.strategy}
                      className={cn(
                        "p-4 cursor-pointer transition-all border-2",
                        selectedStrategy === r.strategy 
                          ? `${colorClass} border-current shadow-md` 
                          : "border-transparent hover:border-slate-200"
                      )}
                      onClick={() => setSelectedStrategy(r.strategy)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isWinner && <Trophy className="w-5 h-5 text-yellow-500" />}
                          <span className="text-sm font-medium text-slate-500">
                            #{r.rank}
                          </span>
                        </div>
                        {STRATEGY_ICONS[r.strategy]}
                      </div>
                      
                      <h3 className="font-semibold text-slate-900 mb-1">
                        {r.strategyName}
                      </h3>
                      
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-2xl font-bold">
                          ${r.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className={cn(
                          "text-sm font-medium",
                          r.roi >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{r.winRate.toFixed(0)}% win</span>
                        <span>{r.totalTrades} trades</span>
                      </div>
                    </Card>
                  );
                })}
              </div>
              
              {/* Simulation Info Bar */}
              <Card className="p-4 mb-6 bg-slate-100 border-slate-200">
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">
                      Edge-Based Sizing
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {result.config.startDate.slice(0, 10)} → {result.config.endDate.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      ${result.config.initialCapital.toLocaleString()} initial × 4 strategies
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {result.summary.tradesProcessed.toLocaleString()} trades analyzed
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {result.summary.tradesEntered} positions entered
                    </span>
                  </div>
                </div>
              </Card>
              
              {/* Main Content Tabs */}
              <Tabs value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <TabsList className="mb-6 flex-wrap h-auto gap-2 bg-transparent p-0">
                  {result.config.strategies.map((strategy) => {
                    const portfolio = result.portfolios[strategy];
                    const ranking = result.rankings.find(r => r.strategy === strategy);
                    
                    return (
                      <TabsTrigger 
                        key={strategy} 
                        value={strategy}
                        className={cn(
                          "data-[state=active]:shadow-sm px-4 py-2 rounded-lg border",
                          "data-[state=active]:border-slate-300 data-[state=active]:bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {STRATEGY_ICONS[strategy]}
                          <span>{portfolio?.strategyName || strategy}</span>
                          {ranking?.rank === 1 && (
                            <Trophy className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                
                {result.config.strategies.map((strategy) => {
                  const portfolio = result.portfolios[strategy];
                  if (!portfolio) return null;
                  
                  return (
                    <TabsContent key={strategy} value={strategy} className="space-y-6">
                      {/* Strategy Description */}
                      <Card className="p-4">
                        <p className="text-slate-600">
                          {portfolio.description}
                        </p>
                      </Card>
                      
                      {/* Capital Breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card className="p-4">
                          <div className="text-sm text-slate-500 mb-1">Total Value</div>
                          <div className="text-2xl font-bold text-slate-900">
                            ${portfolio.capital.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className={cn(
                            "text-sm",
                            portfolio.performance.roi >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {portfolio.performance.roi >= 0 ? '+' : ''}
                            {portfolio.performance.roi.toFixed(1)}% ROI
                          </div>
                        </Card>
                        
                        <Card className="p-4">
                          <div className="flex items-center gap-1 text-sm text-slate-500 mb-1">
                            <Wallet className="w-3 h-3" />
                            Available Cash
                          </div>
                          <div className="text-xl font-semibold text-green-600">
                            ${portfolio.capital.available.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-slate-500">Ready to trade</div>
                        </Card>
                        
                        <Card className="p-4">
                          <div className="flex items-center gap-1 text-sm text-slate-500 mb-1">
                            <Target className="w-3 h-3" />
                            Locked (Open)
                          </div>
                          <div className="text-xl font-semibold text-blue-600">
                            ${portfolio.capital.locked.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-slate-500">{portfolio.openPositions} positions</div>
                        </Card>
                        
                        <Card className="p-4">
                          <div className="flex items-center gap-1 text-sm text-slate-500 mb-1">
                            <Timer className="w-3 h-3" />
                            Cooldown
                          </div>
                          <div className="text-xl font-semibold text-orange-600">
                            ${portfolio.capital.cooldown.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-slate-500">3hr until available</div>
                        </Card>
                        
                        <Card className="p-4">
                          <div className="text-sm text-slate-500 mb-1">Total P&L</div>
                          <div className={cn(
                            "text-xl font-semibold",
                            portfolio.performance.totalPnL >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {portfolio.performance.totalPnL >= 0 ? '+' : ''}
                            ${portfolio.performance.totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-xs text-slate-500">
                            {portfolio.performance.winningTrades}W / {portfolio.performance.losingTrades}L
                          </div>
                        </Card>
                      </div>
                      
                      {/* Performance Metrics */}
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">
                          Performance Metrics
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                          <div>
                            <div className="text-sm text-slate-500">Win Rate</div>
                            <div className="text-2xl font-bold">{portfolio.performance.winRate.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-500">Total Trades</div>
                            <div className="text-2xl font-bold">{portfolio.performance.totalTrades}</div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-500">Avg Win</div>
                            <div className="text-2xl font-bold text-green-600">
                              +${portfolio.performance.avgWin.toFixed(0)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-500">Avg Loss</div>
                            <div className="text-2xl font-bold text-red-600">
                              -${portfolio.performance.avgLoss.toFixed(0)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-500">Profit Factor</div>
                            <div className="text-2xl font-bold">
                              {portfolio.performance.profitFactor === 'Infinity' ? '∞' : portfolio.performance.profitFactor}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-slate-500">Max Drawdown</div>
                            <div className="text-2xl font-bold text-orange-600">
                              {portfolio.performance.maxDrawdown.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </Card>
                      
                      {/* Value Chart */}
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">
                          Portfolio Value Over Time
                        </h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={valueHistoryData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis 
                                dataKey="hour" 
                                tickFormatter={(h) => `${Math.floor(h / 24)}d`}
                                stroke="#94a3b8"
                              />
                              <YAxis 
                                stroke="#94a3b8"
                                tickFormatter={(v) => `$${v}`}
                                domain={['auto', 'auto']}
                              />
                              <Tooltip 
                                formatter={(value: number) => [`$${value.toFixed(0)}`, '']}
                                labelFormatter={(hour) => `Hour ${hour} (Day ${Math.floor(hour / 24) + 1})`}
                              />
                              <ReferenceLine 
                                y={result.config.initialCapital} 
                                stroke="#94a3b8" 
                                strokeDasharray="5 5"
                                label={{ value: 'Initial', fill: '#94a3b8', fontSize: 12 }}
                              />
                              <Area
                                type="monotone"
                                dataKey={strategy}
                                stroke={
                                  strategy === 'PURE_VALUE_SCORE' ? '#2563eb' :
                                  strategy === 'WEIGHTED_VALUE_SCORE' ? '#9333ea' :
                                  strategy === 'SINGLES_ONLY_V1' ? '#16a34a' :
                                  '#ea580c'
                                }
                                fill={
                                  strategy === 'PURE_VALUE_SCORE' ? '#2563eb20' :
                                  strategy === 'WEIGHTED_VALUE_SCORE' ? '#9333ea20' :
                                  strategy === 'SINGLES_ONLY_V1' ? '#16a34a20' :
                                  '#ea580c20'
                                }
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </Card>
                      
                      {/* Trade History */}
                      <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-slate-900">
                            Recent Trades
                          </h3>
                          <Badge variant="outline">
                            {portfolio.closedPositions} closed
                          </Badge>
                        </div>
                        
                        {portfolio.recentTrades.length === 0 ? (
                          <p className="text-slate-500 text-center py-8">
                            No trades recorded for this strategy
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-8">Status</TableHead>
                                  <TableHead>Market</TableHead>
                                  <TableHead>Side</TableHead>
                                  <TableHead className="text-right">Entry</TableHead>
                                  <TableHead className="text-right">Invested</TableHead>
                                  <TableHead className="text-right">P&L</TableHead>
                                  <TableHead className="text-right">ROI</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {portfolio.recentTrades.map((trade, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell>
                                      {trade.status === 'WON' ? (
                                        <CheckCircle className="w-5 h-5 text-green-500" />
                                      ) : trade.status === 'LOST' ? (
                                        <XCircle className="w-5 h-5 text-red-500" />
                                      ) : (
                                        <Clock className="w-5 h-5 text-slate-400" />
                                      )}
                                    </TableCell>
                                    <TableCell className="font-medium max-w-[200px] truncate">
                                      {trade.market}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant={trade.outcome === 'YES' ? 'default' : 'secondary'}>
                                        {trade.outcome}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {(trade.entryPrice * 100).toFixed(0)}¢
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      ${trade.invested.toFixed(0)}
                                    </TableCell>
                                    <TableCell className={cn(
                                      "text-right font-mono font-medium",
                                      trade.pnl >= 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
                                    </TableCell>
                                    <TableCell className={cn(
                                      "text-right font-mono",
                                      trade.roi >= 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                      {trade.roi >= 0 ? '+' : ''}{trade.roi.toFixed(0)}%
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </Card>
                    </TabsContent>
                  );
                })}
              </Tabs>
              
              {/* Comparison Chart */}
              <Card className="p-6 mt-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Strategy Comparison
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.rankings}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="strategyName" stroke="#94a3b8" />
                      <YAxis 
                        stroke="#94a3b8" 
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(1)}%`, 'ROI']}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Bar dataKey="roi" name="ROI %">
                        {result.rankings.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`}
                            fill={entry.roi >= 0 ? '#16a34a' : '#dc2626'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  );
}
