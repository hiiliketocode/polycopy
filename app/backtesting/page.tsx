'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/polycopy/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Play,
  Clock,
  BarChart3,
  Target,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  RefreshCw,
  FileText,
  Calendar,
  DollarSign,
  Percent,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Square,
  StopCircle,
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
} from 'recharts';

// Types
interface BacktestRun {
  run_id: string;
  run_name: string;
  created_at: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  strategy_type: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  total_trades: number;
  winning_trades: number;
  total_return_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  final_capital: number;
  description: string;
}

interface BacktestConfig {
  strategy_type: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  slippage_pct: number;
  fill_rate_pct: number; // Percentage of trades that execute (0-1)
  min_win_rate: number;
  min_resolved_trades: number;
  min_edge_pct: number;
  max_trades_per_day: number;
  description: string;
  // Trade selection & sizing
  selection_method: 'CHRONOLOGICAL' | 'RANDOM' | 'THRESHOLD';
  sizing_method: 'FIXED' | 'KELLY' | 'PROPORTIONAL' | 'CONVICTION' | 'MODEL';
  daily_budget_pct: number;
  // Trader basket selection
  trader_selection: 'ALL' | 'TOP_BY_WINRATE' | 'TOP_BY_PROFIT' | 'TOP_BY_VOLUME' | 'SPECIFIC_WALLETS';
  trader_count: number;
  trader_min_trades: number;
  specific_wallets: string[];
  // Trade filters
  price_min: number; // Minimum entry price (0-1)
  price_max: number; // Maximum entry price (0-1)
  confidence_levels: ('LOW' | 'MEDIUM' | 'HIGH')[]; // Filter by stat confidence
  // Trade size filter
  trade_size_min: number; // Minimum trade size in USD
  trade_size_max: number; // Maximum trade size in USD (0 = no max)
  // Conviction filter (from enriched trades)
  use_conviction: boolean; // Whether to use conviction data
  min_conviction_z: number; // Minimum conviction z-score
  // Market filters
  market_types: string[]; // SPORTS, CRYPTO, POLITICS, etc.
  bet_structures: string[]; // STANDARD, YES_NO, OVER_UNDER, SPREAD
  // ML Model filter (uses trained model predictions)
  use_model_score: boolean; // Whether to filter by model prediction
  min_model_score: number; // Minimum predicted win probability (0-1)
}

interface EquityPoint {
  date: string;
  capital: number;
  pnl: number;
}

interface ExecutedTrade {
  date: string;
  wallet: string;
  condition_id: string;
  entry_price: number;
  effective_price: number;
  win_rate: number;
  edge: number;
  position_size: number;
  outcome: string;
  pnl: number;
  capital_after: number;
}

// Strategy options
const STRATEGIES = [
  { value: 'FOLLOW_WINNERS', label: 'Follow Winners', description: 'Copy trades from high win-rate traders' },
  { value: 'PURE_VALUE_SCORE', label: 'Pure Value Score', description: 'Trade based on model value score' },
  { value: 'WEIGHTED_EDGE', label: 'Weighted Edge', description: 'Combine win rate with price edge' },
];

// Selection method options (realistic - decidable at trade time)
const SELECTION_METHODS = [
  { value: 'THRESHOLD', label: 'Edge Threshold', description: 'Only copy trades where (win rate - price) >= threshold' },
  { value: 'CHRONOLOGICAL', label: 'First Come First Served', description: 'Copy trades as they appear, up to daily limit' },
  { value: 'RANDOM', label: 'Random Sample', description: 'Random selection (useful as baseline comparison)' },
];

// Position sizing options  
const SIZING_METHODS = [
  { value: 'FIXED', label: 'Equal Size', description: 'Same $ amount for every trade (simplest, most predictable)' },
  { value: 'KELLY', label: 'Kelly Criterion', description: 'Bet more on higher edge trades (25% Kelly for safety)' },
  { value: 'PROPORTIONAL', label: 'Proportional to Edge', description: 'Higher edge = bigger bet, scaled to daily budget' },
  { value: 'CONVICTION', label: 'By Conviction', description: 'Size based on trader conviction z-score (requires conviction filter)' },
  { value: 'MODEL', label: 'By Model Score', description: 'Size based on ML model win probability (requires model filter)' },
];

// Trader basket selection options
const TRADER_SELECTIONS = [
  { value: 'ALL', label: 'All Qualifying Traders', description: 'No trader filtering' },
  { value: 'TOP_BY_WINRATE', label: 'Top N by Win Rate', description: 'Best historical win rate' },
  { value: 'TOP_BY_PROFIT', label: 'Top N by Profit', description: 'Most profitable traders' },
  { value: 'TOP_BY_VOLUME', label: 'Top N by Volume', description: 'Most active traders' },
  { value: 'SPECIFIC_WALLETS', label: 'Specific Wallets', description: 'Custom wallet list' },
];

// Confidence level options (based on stat_confidence in data)
const CONFIDENCE_LEVELS = [
  { value: 'HIGH', label: 'High', description: '100+ resolved trades' },
  { value: 'MEDIUM', label: 'Medium', description: '20-99 resolved trades' },
  { value: 'LOW', label: 'Low', description: '<20 resolved trades' },
];

// Market type options (from markets table)
const MARKET_TYPES = [
  { value: 'SPORTS', label: 'Sports' },
  { value: 'CRYPTO', label: 'Crypto' },
  { value: 'POLITICS', label: 'Politics' },
  { value: 'ESPORTS', label: 'Esports' },
  { value: 'WEATHER', label: 'Weather' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'ENTERTAINMENT', label: 'Entertainment' },
];

// Bet structure options (from markets table)
const BET_STRUCTURES = [
  { value: 'STANDARD', label: 'Standard', description: 'Basic binary outcome' },
  { value: 'YES_NO', label: 'Yes/No', description: 'Explicit yes/no format' },
  { value: 'OVER_UNDER', label: 'Over/Under', description: 'Above or below a threshold' },
  { value: 'SPREAD', label: 'Spread', description: 'Point spread betting' },
];

// Price band presets
const PRICE_PRESETS = [
  { label: 'Any Price', min: 0, max: 1 },
  { label: 'Contrarian (10-40%)', min: 0.10, max: 0.40 },
  { label: 'Mid-Range (30-70%)', min: 0.30, max: 0.70 },
  { label: 'Favorites (60-90%)', min: 0.60, max: 0.90 },
  { label: 'Longshots (<25%)', min: 0, max: 0.25 },
  { label: 'Heavy Favorites (>75%)', min: 0.75, max: 1 },
];

// Helper to safely format dates
function formatDate(dateValue: any): string {
  if (!dateValue) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
  } catch {
    return '-';
  }
}

function formatDateShort(dateValue: any): string {
  if (!dateValue) return '-';
  // If it's already in YYYY-MM-DD format, return as-is
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return String(dateValue).slice(0, 10);
    return date.toISOString().slice(0, 10);
  } catch {
    return String(dateValue).slice(0, 10);
  }
}

// Format currency with proper 2 decimal places
function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// Default config
const DEFAULT_CONFIG: BacktestConfig = {
  strategy_type: 'FOLLOW_WINNERS',
  start_date: '2025-01-01',
  end_date: '2025-01-31',
  initial_capital: 1000,
  slippage_pct: 0.04,
  fill_rate_pct: 0.85,
  min_win_rate: 0.55,
  min_resolved_trades: 30,
  min_edge_pct: 0.05,
  max_trades_per_day: 10,
  description: '',
  // Trade selection & sizing
  selection_method: 'THRESHOLD',
  sizing_method: 'KELLY',
  daily_budget_pct: 0.10,
  // Trader basket selection
  trader_selection: 'TOP_BY_WINRATE',
  trader_count: 50,
  trader_min_trades: 50,
  specific_wallets: [],
  // Trade filters
  price_min: 0,
  price_max: 1,
  confidence_levels: ['HIGH', 'MEDIUM'],
  // Trade size filter (0 = no filter)
  trade_size_min: 0,
  trade_size_max: 0, // 0 means no max
  // Conviction filter
  use_conviction: false,
  min_conviction_z: 0,
  // Model score filter
  use_model_score: false,
  min_model_score: 0.5,
  // Market filters (empty = all markets)
  market_types: [],
  bet_structures: [],
};

export default function BacktestingPage() {
  const [activeTab, setActiveTab] = useState('setup');
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<BacktestRun | null>(null);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [executedTrades, setExecutedTrades] = useState<ExecutedTrade[]>([]);

  // Fetch backtest runs on mount
  useEffect(() => {
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/backtest/list');
      if (response.ok) {
        const data = await response.json();
        setRuns(data.runs || []);
      }
    } catch (error) {
      console.error('Error fetching runs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const startBacktest = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsRunning(true);
    
    try {
      const response = await fetch('/api/backtest/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        // Store equity curve and trades
        if (data.equity_curve) setEquityCurve(data.equity_curve);
        if (data.trades) setExecutedTrades(data.trades);
        // Switch to results tab and refresh
        setActiveTab('results');
        fetchRuns();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Backtest cancelled by user');
        fetchRuns();
      } else {
        console.error('Error starting backtest:', error);
        alert('Failed to start backtest');
      }
    } finally {
      setIsRunning(false);
      setAbortController(null);
    }
  };
  
  const cancelBacktest = () => {
    if (abortController) {
      abortController.abort();
    }
    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Backtesting Platform</h1>
          <p className="text-gray-400">
            Test trading strategies on historical data with point-in-time accuracy
          </p>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-[#1a1a1a] border border-gray-800">
            <TabsTrigger value="setup" className="data-[state=active]:bg-purple-600">
              <Play className="w-4 h-4 mr-2" />
              New Test
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-purple-600">
              <BarChart3 className="w-4 h-4 mr-2" />
              Results
            </TabsTrigger>
            <TabsTrigger value="trades" className="data-[state=active]:bg-purple-600">
              <Activity className="w-4 h-4 mr-2" />
              Trades
            </TabsTrigger>
            <TabsTrigger value="archive" className="data-[state=active]:bg-purple-600">
              <FileText className="w-4 h-4 mr-2" />
              Archive
            </TabsTrigger>
            <TabsTrigger value="compare" className="data-[state=active]:bg-purple-600">
              <Target className="w-4 h-4 mr-2" />
              Compare
            </TabsTrigger>
          </TabsList>

          {/* Setup Tab */}
          <TabsContent value="setup">
            <SetupTab 
              config={config} 
              setConfig={setConfig} 
              onStart={startBacktest}
              onCancel={cancelBacktest}
              isRunning={isRunning}
            />
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <ResultsTab 
              runs={runs} 
              isLoading={isLoading}
              onRefresh={fetchRuns}
              selectedRun={selectedRun}
              setSelectedRun={setSelectedRun}
              equityCurve={equityCurve}
            />
          </TabsContent>

          {/* Trades Tab */}
          <TabsContent value="trades">
            <TradesTab trades={executedTrades} />
          </TabsContent>

          {/* Archive Tab */}
          <TabsContent value="archive">
            <ArchiveTab 
              runs={runs}
              isLoading={isLoading}
              onRefresh={fetchRuns}
              onSelectRun={(run) => {
                setSelectedRun(run);
                setActiveTab('results');
              }}
            />
          </TabsContent>

          {/* Compare Tab */}
          <TabsContent value="compare">
            <CompareTab runs={runs.filter(r => r.status === 'completed')} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ============================================================================
// Setup Tab Component - Restructured for clarity
// ============================================================================
function SetupTab({ 
  config, 
  setConfig, 
  onStart, 
  onCancel,
  isRunning 
}: { 
  config: BacktestConfig;
  setConfig: (c: BacktestConfig) => void;
  onStart: () => void;
  onCancel: () => void;
  isRunning: boolean;
}) {
  // Toggle helpers for multi-select
  const toggleConfidence = (level: 'LOW' | 'MEDIUM' | 'HIGH') => {
    const current = config.confidence_levels;
    if (current.includes(level)) {
      setConfig({ ...config, confidence_levels: current.filter(l => l !== level) });
    } else {
      setConfig({ ...config, confidence_levels: [...current, level] });
    }
  };

  const toggleMarketType = (type: string) => {
    const current = config.market_types;
    if (current.includes(type)) {
      setConfig({ ...config, market_types: current.filter(t => t !== type) });
    } else {
      setConfig({ ...config, market_types: [...current, type] });
    }
  };

  const toggleBetStructure = (structure: string) => {
    const current = config.bet_structures;
    if (current.includes(structure)) {
      setConfig({ ...config, bet_structures: current.filter(s => s !== structure) });
    } else {
      setConfig({ ...config, bet_structures: [...current, structure] });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Main Configuration - Takes up 3 columns */}
      <div className="lg:col-span-3 space-y-6">
        
        {/* SECTION 1: Time Period & Capital */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-400" />
              <CardTitle className="text-white text-lg">Time Period & Capital</CardTitle>
            </div>
            <CardDescription>When to test and with how much</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Start Date</Label>
                <Input
                  type="date"
                  value={config.start_date}
                  onChange={(e) => setConfig({ ...config, start_date: e.target.value })}
                  className="bg-[#0d0d0d] border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">End Date</Label>
                <Input
                  type="date"
                  value={config.end_date}
                  onChange={(e) => setConfig({ ...config, end_date: e.target.value })}
                  className="bg-[#0d0d0d] border-gray-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Starting Capital</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="number"
                    value={config.initial_capital}
                    onChange={(e) => setConfig({ ...config, initial_capital: Number(e.target.value) })}
                    className="bg-[#0d0d0d] border-gray-700 text-white pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Slippage</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    value={(config.slippage_pct * 100).toFixed(1)}
                    onChange={(e) => setConfig({ ...config, slippage_pct: Number(e.target.value) / 100 })}
                    className="bg-[#0d0d0d] border-gray-700 text-white pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: Trader Selection */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              <CardTitle className="text-white text-lg">Trader Selection</CardTitle>
            </div>
            <CardDescription>Which traders to copy (using data available at backtest start date)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Selection Method</Label>
                <Select
                  value={config.trader_selection}
                  onValueChange={(v: any) => setConfig({ ...config, trader_selection: v })}
                >
                  <SelectTrigger className="bg-[#0d0d0d] border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a1a] border-gray-700">
                    {TRADER_SELECTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="text-white">
                        <span className="font-medium">{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-gray-500 text-xs">
                  {TRADER_SELECTIONS.find(s => s.value === config.trader_selection)?.description}
                </p>
              </div>
              {config.trader_selection !== 'ALL' && config.trader_selection !== 'SPECIFIC_WALLETS' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">Number of Traders</Label>
                    <Input
                      type="number"
                      value={config.trader_count}
                      onChange={(e) => setConfig({ ...config, trader_count: Number(e.target.value) })}
                      className="bg-[#0d0d0d] border-gray-700 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">Min Trades to Qualify</Label>
                    <Input
                      type="number"
                      value={config.trader_min_trades}
                      onChange={(e) => setConfig({ ...config, trader_min_trades: Number(e.target.value) })}
                      className="bg-[#0d0d0d] border-gray-700 text-white"
                    />
                  </div>
                </>
              )}
              {config.trader_selection === 'SPECIFIC_WALLETS' && (
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-gray-300 text-sm">Wallet Addresses</Label>
                  <Textarea
                    placeholder="0x123...abc&#10;0x456...def"
                    value={config.specific_wallets.join('\n')}
                    onChange={(e) => setConfig({ 
                      ...config, 
                      specific_wallets: e.target.value.split('\n').map(w => w.trim()).filter(Boolean)
                    })}
                    className="bg-[#0d0d0d] border-gray-700 text-white min-h-[80px] font-mono text-xs"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3: Trade Filters */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-green-400" />
              <CardTitle className="text-white text-lg">Trade Filters</CardTitle>
            </div>
            <CardDescription>Criteria for which trades to copy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Row 1: Edge, Win Rate, Trader Experience */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Minimum Edge</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1"
                    value={(config.min_edge_pct * 100).toFixed(0)}
                    onChange={(e) => setConfig({ ...config, min_edge_pct: Number(e.target.value) / 100 })}
                    className="bg-[#0d0d0d] border-gray-700 text-white pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                </div>
                <p className="text-gray-500 text-xs">Edge = Trader Win Rate - Market Price</p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Min Trader Win Rate</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="5"
                    value={(config.min_win_rate * 100).toFixed(0)}
                    onChange={(e) => setConfig({ ...config, min_win_rate: Number(e.target.value) / 100 })}
                    className="bg-[#0d0d0d] border-gray-700 text-white pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Min Trader History</Label>
                <Input
                  type="number"
                  value={config.min_resolved_trades}
                  onChange={(e) => setConfig({ ...config, min_resolved_trades: Number(e.target.value) })}
                  className="bg-[#0d0d0d] border-gray-700 text-white"
                  placeholder="Resolved trades"
                />
              </div>
            </div>

            {/* Row 2: Price Band */}
            <div className="space-y-3">
              <Label className="text-gray-300 text-sm">Price Band (Entry Price Range)</Label>
              <div className="flex flex-wrap gap-2">
                {PRICE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700 text-sm",
                      config.price_min === preset.min && config.price_max === preset.max
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => setConfig({ ...config, price_min: preset.min, price_max: preset.max })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  step="5"
                  value={(config.price_min * 100).toFixed(0)}
                  onChange={(e) => setConfig({ ...config, price_min: Number(e.target.value) / 100 })}
                  className="bg-[#0d0d0d] border-gray-700 text-white w-24"
                />
                <span className="text-gray-400">% to</span>
                <Input
                  type="number"
                  step="5"
                  value={(config.price_max * 100).toFixed(0)}
                  onChange={(e) => setConfig({ ...config, price_max: Number(e.target.value) / 100 })}
                  className="bg-[#0d0d0d] border-gray-700 text-white w-24"
                />
                <span className="text-gray-400">%</span>
              </div>
              <p className="text-gray-500 text-xs">
                Lower prices = higher payout but lower win rate. Higher prices = safer but smaller returns.
              </p>
            </div>

            {/* Row 3: Confidence Level */}
            <div className="space-y-3">
              <Label className="text-gray-300 text-sm">Data Confidence Level</Label>
              <div className="flex flex-wrap gap-2">
                {CONFIDENCE_LEVELS.map((level) => (
                  <Button
                    key={level.value}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700",
                      config.confidence_levels.includes(level.value as any)
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => toggleConfidence(level.value as any)}
                  >
                    {level.label}
                    <span className="ml-1 text-xs opacity-70">({level.description})</span>
                  </Button>
                ))}
              </div>
              <p className="text-gray-500 text-xs">
                Higher confidence = more reliable trader stats but fewer trades. Recommend excluding LOW for production.
              </p>
            </div>

            {/* Row 4: Trade Size */}
            <div className="space-y-3 pt-4 border-t border-gray-800">
              <Label className="text-gray-300 text-sm">Original Trade Size (USD)</Label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="number"
                    placeholder="Min"
                    value={config.trade_size_min || ''}
                    onChange={(e) => setConfig({ ...config, trade_size_min: Number(e.target.value) || 0 })}
                    className="bg-[#0d0d0d] border-gray-700 text-white w-28 pl-9"
                  />
                </div>
                <span className="text-gray-400">to</span>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    type="number"
                    placeholder="Max (0=any)"
                    value={config.trade_size_max || ''}
                    onChange={(e) => setConfig({ ...config, trade_size_max: Number(e.target.value) || 0 })}
                    className="bg-[#0d0d0d] border-gray-700 text-white w-32 pl-9"
                  />
                </div>
                <div className="flex gap-2 ml-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700 text-xs",
                      config.trade_size_min === 10 && config.trade_size_max === 0
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => setConfig({ ...config, trade_size_min: 10, trade_size_max: 0 })}
                  >
                    $10+
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700 text-xs",
                      config.trade_size_min === 50 && config.trade_size_max === 0
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => setConfig({ ...config, trade_size_min: 50, trade_size_max: 0 })}
                  >
                    $50+
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700 text-xs",
                      config.trade_size_min === 100 && config.trade_size_max === 0
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => setConfig({ ...config, trade_size_min: 100, trade_size_max: 0 })}
                  >
                    $100+
                  </Button>
                </div>
              </div>
              <p className="text-gray-500 text-xs">
                Filter by the original trader's position size. Larger trades may indicate higher conviction.
              </p>
            </div>

            {/* Row 5: Conviction (from enriched data) */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="use_conviction"
                  checked={config.use_conviction}
                  onChange={(e) => setConfig({ ...config, use_conviction: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-700 bg-[#0d0d0d] text-purple-600 focus:ring-purple-500"
                />
                <Label htmlFor="use_conviction" className="text-gray-300 text-sm cursor-pointer">
                  Use Conviction Score Filter
                </Label>
                <Badge variant="outline" className="text-xs border-yellow-600 text-yellow-400">
                  Model Feature
                </Badge>
              </div>
              {config.use_conviction && (
                <div className="ml-7 space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-gray-400 text-sm w-32">Min Conviction Z:</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={config.min_conviction_z}
                      onChange={(e) => setConfig({ ...config, min_conviction_z: Number(e.target.value) })}
                      className="bg-[#0d0d0d] border-gray-700 text-white w-24"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_conviction_z === 0 ? "bg-purple-600 border-purple-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_conviction_z: 0 })}
                      >
                        Normal (0)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_conviction_z === 0.5 ? "bg-purple-600 border-purple-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_conviction_z: 0.5 })}
                      >
                        High (0.5)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_conviction_z === 1.0 ? "bg-purple-600 border-purple-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_conviction_z: 1.0 })}
                      >
                        Very High (1.0)
                      </Button>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs">
                    Conviction Z-score measures how large this trade is relative to the trader's typical bet size.
                    Higher = trader is betting more than usual = potentially stronger conviction.
                  </p>
                </div>
              )}
            </div>

            {/* Row 6: ML Model Score Filter */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="use_model_score"
                  checked={config.use_model_score}
                  onChange={(e) => setConfig({ ...config, use_model_score: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-700 bg-[#0d0d0d] text-green-600 focus:ring-green-500"
                />
                <Label htmlFor="use_model_score" className="text-gray-300 text-sm cursor-pointer">
                  Use ML Model Score Filter
                </Label>
                <Badge variant="outline" className="text-xs border-green-600 text-green-400">
                  AI Model
                </Badge>
              </div>
              {config.use_model_score && (
                <div className="ml-7 space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-gray-400 text-sm w-32">Min Win Prob:</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      value={config.min_model_score}
                      onChange={(e) => setConfig({ ...config, min_model_score: Number(e.target.value) })}
                      className="bg-[#0d0d0d] border-gray-700 text-white w-24"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_model_score === 0.5 ? "bg-green-600 border-green-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_model_score: 0.5 })}
                      >
                        50%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_model_score === 0.6 ? "bg-green-600 border-green-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_model_score: 0.6 })}
                      >
                        60%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_model_score === 0.7 ? "bg-green-600 border-green-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_model_score: 0.7 })}
                      >
                        70%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "border-gray-700 text-xs",
                          config.min_model_score === 0.8 ? "bg-green-600 border-green-500 text-white" : "bg-[#0d0d0d] text-gray-300"
                        )}
                        onClick={() => setConfig({ ...config, min_model_score: 0.8 })}
                      >
                        80%
                      </Button>
                    </div>
                  </div>
                  <p className="text-gray-500 text-xs">
                    ML model predicted win probability (0-1). Model trained on clean point-in-time data.
                    Holdout test: 75.8% accuracy, 0.86 AUC. Higher thresholds = fewer trades but higher quality.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: Market Filters */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-yellow-400" />
              <CardTitle className="text-white text-lg">Market Filters</CardTitle>
            </div>
            <CardDescription>Filter by market category (leave empty for all)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Market Types */}
            <div className="space-y-3">
              <Label className="text-gray-300 text-sm">Market Categories</Label>
              <div className="flex flex-wrap gap-2">
                {MARKET_TYPES.map((type) => (
                  <Button
                    key={type.value}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700",
                      config.market_types.includes(type.value)
                        ? "bg-yellow-600 border-yellow-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => toggleMarketType(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
              <p className="text-gray-500 text-xs">
                {config.market_types.length === 0 
                  ? "All market types included" 
                  : `Filtering to: ${config.market_types.join(', ')}`}
              </p>
            </div>

            {/* Bet Structures */}
            <div className="space-y-3">
              <Label className="text-gray-300 text-sm">Bet Structure</Label>
              <div className="flex flex-wrap gap-2">
                {BET_STRUCTURES.map((structure) => (
                  <Button
                    key={structure.value}
                    variant="outline"
                    size="sm"
                    className={cn(
                      "border-gray-700",
                      config.bet_structures.includes(structure.value)
                        ? "bg-yellow-600 border-yellow-500 text-white"
                        : "bg-[#0d0d0d] text-gray-300 hover:bg-gray-800"
                    )}
                    onClick={() => toggleBetStructure(structure.value)}
                  >
                    {structure.label}
                  </Button>
                ))}
              </div>
              <p className="text-gray-500 text-xs">
                {config.bet_structures.length === 0 
                  ? "All bet structures included" 
                  : `Filtering to: ${config.bet_structures.join(', ')}`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: Position Sizing */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <CardTitle className="text-white text-lg">Position Sizing</CardTitle>
            </div>
            <CardDescription>How to size each trade</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Trade Selection</Label>
                  <Select
                    value={config.selection_method}
                    onValueChange={(v: any) => setConfig({ ...config, selection_method: v })}
                  >
                    <SelectTrigger className="bg-[#0d0d0d] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-gray-700">
                      {SELECTION_METHODS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-white">
                          <span className="font-medium">{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-gray-500 text-xs">
                    {SELECTION_METHODS.find(s => s.value === config.selection_method)?.description}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Bet Sizing Method</Label>
                  <Select
                    value={config.sizing_method}
                    onValueChange={(v: any) => setConfig({ ...config, sizing_method: v })}
                  >
                    <SelectTrigger className="bg-[#0d0d0d] border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a1a1a] border-gray-700">
                      {SIZING_METHODS.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-white">
                          <span className="font-medium">{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-gray-500 text-xs">
                    {SIZING_METHODS.find(s => s.value === config.sizing_method)?.description}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">Daily Budget</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="5"
                        value={(config.daily_budget_pct * 100).toFixed(0)}
                        onChange={(e) => setConfig({ ...config, daily_budget_pct: Number(e.target.value) / 100 })}
                        className="bg-[#0d0d0d] border-gray-700 text-white pr-8"
                      />
                      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-300 text-sm">Max Trades/Day</Label>
                    <Input
                      type="number"
                      value={config.max_trades_per_day}
                      onChange={(e) => setConfig({ ...config, max_trades_per_day: Number(e.target.value) })}
                      className="bg-[#0d0d0d] border-gray-700 text-white"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">Fill Rate</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="5"
                      value={(config.fill_rate_pct * 100).toFixed(0)}
                      onChange={(e) => setConfig({ ...config, fill_rate_pct: Number(e.target.value) / 100 })}
                      className="bg-[#0d0d0d] border-gray-700 text-white pr-8"
                    />
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-gray-500 text-xs">
                    Simulates real-world: not all trades will execute (default 85%)
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description */}
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="What hypothesis are you testing? e.g., 'Testing if contrarian strategy (low prices) with high-confidence traders outperforms...'"
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              className="bg-[#0d0d0d] border-gray-700 text-white min-h-[80px]"
            />
          </CardContent>
        </Card>
      </div>

      {/* Summary Panel - Fixed sidebar */}
      <div className="lg:col-span-1">
        <div className="sticky top-6 space-y-6">
          {/* Run Card */}
          <Card className="bg-[#1a1a1a] border-gray-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-white">Run Backtest</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Period</span>
                  <span className="text-white text-xs">{config.start_date} → {config.end_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Capital</span>
                  <span className="text-white">${config.initial_capital.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Traders</span>
                  <span className="text-white">
                    {config.trader_selection === 'ALL' ? 'All' : 
                     config.trader_selection === 'SPECIFIC_WALLETS' ? `${config.specific_wallets.length}` :
                     `Top ${config.trader_count}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Min Edge</span>
                  <span className="text-white">{(config.min_edge_pct * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Price Range</span>
                  <span className="text-white">
                    {(config.price_min * 100).toFixed(0)}-{(config.price_max * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Sizing</span>
                  <span className="text-white">{config.sizing_method}</span>
                </div>
                {config.trade_size_min > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Trade Size</span>
                    <span className="text-white">${config.trade_size_min}+</span>
                  </div>
                )}
                {config.use_conviction && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Conviction</span>
                    <span className="text-yellow-400">z &gt; {config.min_conviction_z}</span>
                  </div>
                )}
                {config.use_model_score && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Model Score</span>
                    <span className="text-green-400">&gt; {(config.min_model_score * 100).toFixed(0)}%</span>
                  </div>
                )}
                {config.market_types.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Markets</span>
                    <span className="text-white text-xs">{config.market_types.length} selected</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-gray-800 space-y-2">
                {isRunning ? (
                  <>
                    <Button disabled className="w-full bg-purple-600/50">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </Button>
                    <Button
                      onClick={onCancel}
                      variant="outline"
                      className="w-full border-red-700 text-red-400 hover:bg-red-900/20"
                    >
                      <StopCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={onStart}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Backtest
                  </Button>
                )}
              </div>

              <p className="text-xs text-gray-500 text-center">
                Point-in-time data • No look-ahead bias
              </p>
            </CardContent>
          </Card>

          {/* Quick Reference Card */}
          <Card className="bg-[#1a1a1a] border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">Quick Reference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <p className="text-purple-400 font-medium">Edge = Win Rate - Price</p>
                <p className="text-gray-500">Higher edge = bigger mispricing opportunity</p>
              </div>
              <div>
                <p className="text-blue-400 font-medium">Low Price = High Payout</p>
                <p className="text-gray-500">15% price → 6.7x return when you win</p>
              </div>
              <div>
                <p className="text-green-400 font-medium">Kelly = Smart Sizing</p>
                <p className="text-gray-500">Bet more on higher edge trades</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Results Tab Component
// ============================================================================
function ResultsTab({ 
  runs, 
  isLoading, 
  onRefresh,
  selectedRun,
  setSelectedRun,
  equityCurve 
}: {
  runs: BacktestRun[];
  isLoading: boolean;
  onRefresh: () => void;
  selectedRun: BacktestRun | null;
  setSelectedRun: (run: BacktestRun | null) => void;
  equityCurve: EquityPoint[];
}) {
  const recentRuns = runs.slice(0, 5);
  const displayRun = selectedRun || recentRuns[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!displayRun) {
    return (
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <BarChart3 className="w-12 h-12 text-gray-600 mb-4" />
          <p className="text-gray-400 mb-4">No backtests yet</p>
          <Button variant="outline" className="border-gray-700 text-gray-300">
            Create your first backtest
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Equity Curve Chart */}
      {equityCurve.length > 0 && (
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Equity Curve</CardTitle>
            <CardDescription>Portfolio value over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#666"
                    tick={{ fill: '#888', fontSize: 11 }}
                    tickFormatter={(val) => val.slice(5)} // Show MM-DD
                  />
                  <YAxis 
                    stroke="#666"
                    tick={{ fill: '#888', fontSize: 11 }}
                    tickFormatter={(val) => `$${val.toLocaleString()}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a1a1a', 
                      border: '1px solid #333',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#888' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Capital']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="capital" 
                    stroke="#8b5cf6" 
                    fillOpacity={1} 
                    fill="url(#colorCapital)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Return"
          value={`${displayRun.total_return_pct >= 0 ? '+' : ''}${displayRun.total_return_pct?.toFixed(1)}%`}
          icon={displayRun.total_return_pct >= 0 ? TrendingUp : TrendingDown}
          color={displayRun.total_return_pct >= 0 ? 'green' : 'red'}
        />
        <MetricCard
          title="Win Rate"
          value={displayRun.total_trades > 0 
            ? `${((displayRun.winning_trades / displayRun.total_trades) * 100).toFixed(1)}%`
            : 'N/A'
          }
          icon={Target}
          color="blue"
        />
        <MetricCard
          title="Sharpe Ratio"
          value={displayRun.sharpe_ratio?.toFixed(2) || 'N/A'}
          icon={Activity}
          color={displayRun.sharpe_ratio > 1 ? 'green' : displayRun.sharpe_ratio > 0 ? 'yellow' : 'red'}
        />
        <MetricCard
          title="Max Drawdown"
          value={`${displayRun.max_drawdown_pct?.toFixed(1)}%`}
          icon={ArrowDownRight}
          color={displayRun.max_drawdown_pct < 20 ? 'green' : displayRun.max_drawdown_pct < 40 ? 'yellow' : 'red'}
        />
      </div>

      {/* Main Results Card */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">{displayRun.run_name || displayRun.run_id}</CardTitle>
            <CardDescription>
              {displayRun.strategy_type} • {formatDateShort(displayRun.start_date)} to {formatDateShort(displayRun.end_date)}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={displayRun.status === 'completed' ? 'default' : 'secondary'}>
              {displayRun.status}
            </Badge>
            <Button variant="ghost" size="icon" onClick={onRefresh}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Stats */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Performance Summary</h4>
              <div className="space-y-2">
                <StatRow label="Initial Capital" value={formatCurrency(displayRun.initial_capital)} />
                <StatRow label="Final Capital" value={formatCurrency(displayRun.final_capital)} />
                <StatRow label="Total Trades" value={displayRun.total_trades?.toString()} />
                <StatRow label="Winners" value={displayRun.winning_trades?.toString()} />
                <StatRow label="Losers" value={(displayRun.total_trades - displayRun.winning_trades)?.toString()} />
              </div>
            </div>

            {/* Right: Description */}
            <div className="space-y-4">
              <h4 className="text-white font-medium">Test Details</h4>
              <p className="text-gray-400 text-sm">
                {displayRun.description || 'No description provided'}
              </p>
              <div className="pt-4">
                <Button variant="outline" className="border-gray-700 text-gray-300 mr-2">
                  <Download className="w-4 h-4 mr-2" />
                  Export Results
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Runs List */}
      {recentRuns.length > 1 && (
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">Recent Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <div
                  key={run.run_id}
                  onClick={() => setSelectedRun(run)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
                    selectedRun?.run_id === run.run_id 
                      ? "bg-purple-900/30 border border-purple-700" 
                      : "bg-[#0d0d0d] hover:bg-[#252525]"
                  )}
                >
                  <div>
                    <div className="text-white font-medium">{run.strategy_type}</div>
                    <div className="text-gray-500 text-sm">{formatDateShort(run.start_date)} → {formatDateShort(run.end_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      "font-medium",
                      run.total_return_pct >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {run.total_return_pct >= 0 ? '+' : ''}{run.total_return_pct?.toFixed(1)}%
                    </div>
                    <div className="text-gray-500 text-sm">{run.total_trades} trades</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Archive Tab Component  
// ============================================================================
function ArchiveTab({ 
  runs, 
  isLoading, 
  onRefresh,
  onSelectRun 
}: {
  runs: BacktestRun[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectRun: (run: BacktestRun) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <Card className="bg-[#1a1a1a] border-gray-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white">Backtest Archive</CardTitle>
          <CardDescription>{runs.length} tests recorded</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-800">
              <TableHead className="text-gray-400">Date</TableHead>
              <TableHead className="text-gray-400">Strategy</TableHead>
              <TableHead className="text-gray-400">Period</TableHead>
              <TableHead className="text-gray-400">Trades</TableHead>
              <TableHead className="text-gray-400">Return</TableHead>
              <TableHead className="text-gray-400">Sharpe</TableHead>
              <TableHead className="text-gray-400">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow 
                key={run.run_id} 
                className="border-gray-800 cursor-pointer hover:bg-[#252525]"
                onClick={() => onSelectRun(run)}
              >
                <TableCell className="text-gray-300">
                  {formatDate(run.created_at)}
                </TableCell>
                <TableCell className="text-white font-medium">{run.strategy_type}</TableCell>
                <TableCell className="text-gray-400">
                  {formatDateShort(run.start_date)} → {formatDateShort(run.end_date)}
                </TableCell>
                <TableCell className="text-gray-300">{run.total_trades || '-'}</TableCell>
                <TableCell className={cn(
                  "font-medium",
                  run.total_return_pct >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {run.total_return_pct ? `${run.total_return_pct >= 0 ? '+' : ''}${run.total_return_pct.toFixed(1)}%` : '-'}
                </TableCell>
                <TableCell className="text-gray-300">
                  {run.sharpe_ratio?.toFixed(2) || '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={run.status === 'completed' ? 'default' : 'secondary'}>
                    {run.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Compare Tab Component
// ============================================================================
function CompareTab({ runs }: { runs: BacktestRun[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelection = (runId: string) => {
    if (selected.includes(runId)) {
      setSelected(selected.filter(id => id !== runId));
    } else if (selected.length < 3) {
      setSelected([...selected, runId]);
    }
  };

  const selectedRuns = runs.filter(r => selected.includes(r.run_id));

  return (
    <div className="space-y-6">
      {/* Selection */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <CardTitle className="text-white">Select Tests to Compare</CardTitle>
          <CardDescription>Choose up to 3 completed backtests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runs.map((run) => (
              <div
                key={run.run_id}
                onClick={() => toggleSelection(run.run_id)}
                className={cn(
                  "p-3 rounded-lg cursor-pointer border transition-colors",
                  selected.includes(run.run_id)
                    ? "bg-purple-900/30 border-purple-600"
                    : "bg-[#0d0d0d] border-gray-800 hover:border-gray-700"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{run.strategy_type}</span>
                  {selected.includes(run.run_id) && (
                    <CheckCircle className="w-4 h-4 text-purple-500" />
                  )}
                </div>
                <div className="text-gray-500 text-sm">{formatDateShort(run.start_date)} → {formatDateShort(run.end_date)}</div>
                <div className={cn(
                  "text-sm mt-1",
                  run.total_return_pct >= 0 ? "text-green-400" : "text-red-400"
                )}>
                  {run.total_return_pct >= 0 ? '+' : ''}{run.total_return_pct?.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      {selectedRuns.length >= 2 && (
        <Card className="bg-[#1a1a1a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Metric</TableHead>
                  {selectedRuns.map((run) => (
                    <TableHead key={run.run_id} className="text-gray-400">
                      {run.strategy_type}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <CompareRow label="Total Return" values={selectedRuns.map(r => `${r.total_return_pct?.toFixed(1)}%`)} />
                <CompareRow label="Win Rate" values={selectedRuns.map(r => 
                  r.total_trades > 0 ? `${((r.winning_trades / r.total_trades) * 100).toFixed(1)}%` : '-'
                )} />
                <CompareRow label="Sharpe Ratio" values={selectedRuns.map(r => r.sharpe_ratio?.toFixed(2) || '-')} />
                <CompareRow label="Max Drawdown" values={selectedRuns.map(r => `${r.max_drawdown_pct?.toFixed(1)}%`)} />
                <CompareRow label="Total Trades" values={selectedRuns.map(r => r.total_trades?.toString() || '-')} />
                <CompareRow label="Final Capital" values={selectedRuns.map(r => formatCurrency(r.final_capital))} />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Trades Tab Component
// ============================================================================
function TradesTab({ trades }: { trades: ExecutedTrade[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const totalPages = Math.ceil(trades.length / pageSize);
  const paginatedTrades = trades.slice(page * pageSize, (page + 1) * pageSize);

  if (trades.length === 0) {
    return (
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardContent className="flex flex-col items-center justify-center py-20">
          <Activity className="w-12 h-12 text-gray-600 mb-4" />
          <p className="text-gray-400 mb-4">No trades to display</p>
          <p className="text-gray-500 text-sm">Run a backtest to see individual trades</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate summary stats
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgPnL = totalPnL / trades.length;
  const winners = trades.filter(t => t.outcome === 'WON').length;
  const avgWinnerPnL = trades.filter(t => t.outcome === 'WON').reduce((sum, t) => sum + t.pnl, 0) / winners || 0;
  const avgLoserPnL = trades.filter(t => t.outcome === 'LOST').reduce((sum, t) => sum + t.pnl, 0) / (trades.length - winners) || 0;

  return (
    <div className="space-y-6">
      {/* Trade Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-[#1a1a1a] border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Trades</p>
          <p className="text-white text-xl font-bold">{trades.length.toLocaleString()}</p>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total P&L</p>
          <p className={cn("text-xl font-bold", totalPnL >= 0 ? "text-green-400" : "text-red-400")}>
            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
          </p>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Avg P&L / Trade</p>
          <p className={cn("text-xl font-bold", avgPnL >= 0 ? "text-green-400" : "text-red-400")}>
            {avgPnL >= 0 ? '+' : ''}{formatCurrency(avgPnL)}
          </p>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Avg Winner</p>
          <p className="text-green-400 text-xl font-bold">+{formatCurrency(avgWinnerPnL)}</p>
        </Card>
        <Card className="bg-[#1a1a1a] border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Avg Loser</p>
          <p className="text-red-400 text-xl font-bold">{formatCurrency(avgLoserPnL)}</p>
        </Card>
      </div>

      {/* Trades Table */}
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">Trade Log</CardTitle>
            <CardDescription>
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, trades.length)} of {trades.length.toLocaleString()} trades
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="border-gray-700"
            >
              Previous
            </Button>
            <span className="text-gray-400 text-sm px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="border-gray-700"
            >
              Next
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Date</TableHead>
                  <TableHead className="text-gray-400">Wallet</TableHead>
                  <TableHead className="text-gray-400 text-right">Price</TableHead>
                  <TableHead className="text-gray-400 text-right">Win Rate</TableHead>
                  <TableHead className="text-gray-400 text-right">Edge</TableHead>
                  <TableHead className="text-gray-400 text-right">Size</TableHead>
                  <TableHead className="text-gray-400">Outcome</TableHead>
                  <TableHead className="text-gray-400 text-right">P&L</TableHead>
                  <TableHead className="text-gray-400 text-right">Capital After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTrades.map((trade, idx) => (
                  <TableRow key={`${trade.date}-${idx}`} className="border-gray-800">
                    <TableCell className="text-gray-300 font-mono text-sm">{trade.date}</TableCell>
                    <TableCell className="text-gray-400 font-mono text-xs">
                      {trade.wallet.slice(0, 6)}...{trade.wallet.slice(-4)}
                    </TableCell>
                    <TableCell className="text-gray-300 text-right">
                      {(trade.entry_price * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-gray-300 text-right">
                      {(trade.win_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className={cn(
                      "text-right",
                      trade.edge >= 0.1 ? "text-green-400" : trade.edge >= 0.05 ? "text-yellow-400" : "text-gray-300"
                    )}>
                      {(trade.edge * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-gray-300 text-right">
                      ${trade.position_size.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade.outcome === 'WON' ? 'default' : 'destructive'}>
                        {trade.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-medium",
                      trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                    </TableCell>
                    <TableCell className="text-gray-300 text-right">
                      {formatCurrency(trade.capital_after)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================
function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string; 
  icon: React.ElementType;
  color: 'green' | 'red' | 'blue' | 'yellow';
}) {
  const colorClasses = {
    green: 'text-green-400 bg-green-400/10',
    red: 'text-red-400 bg-red-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
  };

  return (
    <Card className="bg-[#1a1a1a] border-gray-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">{title}</p>
            <p className={cn("text-2xl font-bold mt-1", colorClasses[color].split(' ')[0])}>
              {value}
            </p>
          </div>
          <div className={cn("p-3 rounded-full", colorClasses[color])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

function CompareRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow className="border-gray-800">
      <TableCell className="text-gray-400">{label}</TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className="text-white">{v}</TableCell>
      ))}
    </TableRow>
  );
}
