'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Activity,
  Clock,
  Target,
  ArrowRight,
  Play,
  Pause,
  Plus,
  CheckCircle2,
  Calendar,
  Timer,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Settings2,
  BarChart3
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SortField = 'name' | 'started' | 'balance' | 'pnl' | 'pnl_pct' | 'taken' | 'pct_made' | 'avg_trade_size' | 'open' | 'won' | 'lost' | 'win_rate' | 'cash' | 'realized' | 'unrealized' | 'max_drawdown' | 'sharpe';
type CompareSortField = 'name' | 'pnl' | 'started' | 'use_model' | 'model_threshold' | 'price_min' | 'price_max' | 'min_edge' | 'allocation' | 'bet_size' | 'min_bet' | 'max_bet' | 'kelly' | 'min_trades' | 'min_conviction';
type SortDir = 'asc' | 'desc';

interface ExtendedFilters {
  target_trader?: string;
  target_trader_name?: string;
  hypothesis?: string;
  [key: string]: any;
}

interface FTWallet {
  wallet_id: string;
  config_id: string;
  display_name: string;
  description: string;
  detailed_description?: string;
  starting_balance: number;
  current_balance: number;
  cash_available: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_pnl: number;
  total_trades: number;
  trades_seen: number;
  trades_skipped: number;
  open_positions: number;
  won: number;
  lost: number;
  win_rate: number | null;
  max_drawdown_usd?: number;
  max_drawdown_pct?: number;
  sharpe_ratio?: number | null;
  open_exposure: number;
  avg_trade_size: number;
  avg_entry_price: number | null;
  first_trade: { value: string } | null;
  last_trade: { value: string } | null;
  model_threshold: number;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  is_active: boolean;
  bet_size: number;
  bet_allocation_weight: number;
  allocation_method?: string;
  kelly_fraction?: number;
  min_bet?: number;
  max_bet?: number;
  min_trader_resolved_count?: number;
  min_conviction?: number;
  market_categories?: string[] | null;
  wr_source?: string | null;  // 'GLOBAL' | 'PROFILE' - Profile = niche/structure/bracket WR
  start_date: { value: string };
  end_date: { value: string };
  last_sync_time: { value: string } | null;
  hours_remaining: number;
  test_status: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
}

// Helper to parse extended filters from wallet
function getExtendedFilters(wallet: FTWallet): ExtendedFilters {
  if (!wallet.detailed_description) return {};
  try {
    return JSON.parse(wallet.detailed_description);
  } catch {
    return {};
  }
}

interface Totals {
  total_balance: number;
  total_cash_available: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  total_pnl: number;
  total_trades: number;
  total_trades_seen: number;
  total_trades_skipped: number;
  open_positions: number;
  total_won: number;
  total_lost: number;
}

export default function ForwardTestWalletsPage() {
  const [wallets, setWallets] = useState<FTWallet[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [autoSyncActive, setAutoSyncActive] = useState(true);
  const [lastAutoSync, setLastAutoSync] = useState<Date | null>(null);
  const [sortField, setSortField] = useState<SortField>('pnl_pct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeTab, setActiveTab] = useState<'performance' | 'compare' | 'live'>('performance');
  const [compareSortField, setCompareSortField] = useState<CompareSortField>('pnl');
  const [compareSortDir, setCompareSortDir] = useState<SortDir>('desc');
  const [ltStrategyFtIds, setLtStrategyFtIds] = useState<Set<string>>(new Set());
  const [ltStrategies, setLtStrategies] = useState<Array<{
    strategy_id: string; ft_wallet_id: string; display_name: string; is_active: boolean; is_paused: boolean; initial_capital: number; starting_capital?: number;
    lt_risk_state?: unknown; created_at?: string; available_cash?: number; locked_capital?: number; cooldown_capital?: number;
    lt_stats?: { total_trades: number; open_positions: number; won: number; lost: number; win_rate: number | null;
      realized_pnl: number; unrealized_pnl: number; total_pnl: number; current_balance: number; cash_available: number;
      avg_trade_size: number; first_trade: string | null; last_trade: string | null;
      attempts: number; filled: number; failed: number; pending: number; fill_rate_pct: number | null; avg_slippage_pct: number | null; };
  }>>([]);
  const [myPolymarketWallet, setMyPolymarketWallet] = useState<string | null>(null);
  const [ltFilter, setLtFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [createLtWalletId, setCreateLtWalletId] = useState('');
  const [createLtCapital, setCreateLtCapital] = useState('1000');
  const [creatingLt, setCreatingLt] = useState(false);
  const [ltError, setLtError] = useState<string | null>(null);
  const [showLtInTable, setShowLtInTable] = useState(true);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // Convert LT strategies to FTWallet-compatible objects so they render in the same table
  const ltWallets: FTWallet[] = useMemo(() => ltStrategies.map((s) => {
    const st = s.lt_stats;
    return {
      wallet_id: s.strategy_id,
      config_id: s.strategy_id,
      display_name: s.display_name,
      description: `Live trading → mirrors ${s.ft_wallet_id}`,
      starting_balance: s.initial_capital || s.starting_capital || 0,
      current_balance: st?.current_balance ?? (Number(s.available_cash || 0) + Number(s.locked_capital || 0) + Number(s.cooldown_capital || 0)) || s.initial_capital || 0,
      cash_available: st?.cash_available ?? Number(s.available_cash || 0) || s.initial_capital || 0,
      realized_pnl: st?.realized_pnl ?? 0,
      unrealized_pnl: st?.unrealized_pnl ?? 0,
      total_pnl: st?.total_pnl ?? 0,
      total_trades: st?.total_trades ?? 0,
      trades_seen: st?.attempts ?? 0,
      trades_skipped: (st?.failed ?? 0) + (st?.pending ?? 0),
      open_positions: st?.open_positions ?? 0,
      won: st?.won ?? 0,
      lost: st?.lost ?? 0,
      win_rate: st?.win_rate ?? null,
      open_exposure: 0,
      avg_trade_size: st?.avg_trade_size ?? 0,
      avg_entry_price: null,
      first_trade: st?.first_trade ? { value: st.first_trade } : null,
      last_trade: st?.last_trade ? { value: st.last_trade } : null,
      model_threshold: 0,
      price_min: 0,
      price_max: 1,
      min_edge: 0,
      use_model: false,
      is_active: s.is_active,
      bet_size: 0,
      bet_allocation_weight: 0,
      start_date: { value: s.created_at || new Date().toISOString() },
      end_date: { value: '' },
      last_sync_time: null,
      hours_remaining: 0,
      test_status: s.is_active ? 'ACTIVE' as const : 'ENDED' as const,
      // Tag as live so we can style it differently
      _isLive: true,
    } as FTWallet & { _isLive?: boolean };
  }), [ltStrategies]);

  const sortedWallets = useMemo(() => {
    const walletsToSort = showLtInTable ? [...wallets, ...ltWallets] : wallets;
    return [...walletsToSort].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      const aReturnPct = a.starting_balance > 0 
        ? ((a.current_balance - a.starting_balance) / a.starting_balance) * 100 : 0;
      const bReturnPct = b.starting_balance > 0 
        ? ((b.current_balance - b.starting_balance) / b.starting_balance) * 100 : 0;
      
      const aWinRate = (a.won + a.lost) > 0 ? a.won / (a.won + a.lost) : 0;
      const bWinRate = (b.won + b.lost) > 0 ? b.won / (b.won + b.lost) : 0;

      switch (sortField) {
        case 'name': aVal = a.display_name; bVal = b.display_name; break;
        case 'started': aVal = new Date(a.start_date?.value || 0).getTime(); bVal = new Date(b.start_date?.value || 0).getTime(); break;
        case 'balance': aVal = a.current_balance; bVal = b.current_balance; break;
        case 'pnl': aVal = a.total_pnl; bVal = b.total_pnl; break;
        case 'pnl_pct': aVal = aReturnPct; bVal = bReturnPct; break;
        case 'taken': aVal = a.total_trades; bVal = b.total_trades; break;
        case 'pct_made': {
          const aEval = (a.trades_seen || 0) || 1;
          const bEval = (b.trades_seen || 0) || 1;
          aVal = a.total_trades / aEval;
          bVal = b.total_trades / bEval;
          break;
        }
        case 'avg_trade_size': aVal = a.avg_trade_size ?? 0; bVal = b.avg_trade_size ?? 0; break;
        case 'open': aVal = a.open_positions; bVal = b.open_positions; break;
        case 'won': aVal = a.won; bVal = b.won; break;
        case 'lost': aVal = a.lost; bVal = b.lost; break;
        case 'win_rate': aVal = aWinRate; bVal = bWinRate; break;
        case 'cash': aVal = a.cash_available; bVal = b.cash_available; break;
        case 'realized': aVal = a.realized_pnl; bVal = b.realized_pnl; break;
        case 'unrealized': aVal = a.unrealized_pnl; bVal = b.unrealized_pnl; break;
        case 'max_drawdown': aVal = a.max_drawdown_pct ?? 0; bVal = b.max_drawdown_pct ?? 0; break;
        case 'sharpe': aVal = a.sharpe_ratio ?? -Infinity; bVal = b.sharpe_ratio ?? -Infinity; break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [wallets, sortField, sortDir]);

  const handleCompareSort = (field: CompareSortField) => {
    if (compareSortField === field) {
      setCompareSortDir(compareSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setCompareSortField(field);
      setCompareSortDir('desc');
    }
  };

  const sortedCompareWallets = useMemo(() => {
    return [...wallets].sort((a, b) => {
      let aVal: number | string = '';
      let bVal: number | string = '';
      switch (compareSortField) {
        case 'name': aVal = a.display_name; bVal = b.display_name; break;
        case 'pnl': aVal = a.total_pnl ?? 0; bVal = b.total_pnl ?? 0; break;
        case 'started': aVal = new Date(a.start_date?.value || 0).getTime(); bVal = new Date(b.start_date?.value || 0).getTime(); break;
        case 'use_model': aVal = a.use_model ? '1' : '0'; bVal = b.use_model ? '1' : '0'; break;
        case 'model_threshold': aVal = a.model_threshold ?? 0; bVal = b.model_threshold ?? 0; break;
        case 'price_min': aVal = a.price_min ?? 0; bVal = b.price_min ?? 0; break;
        case 'price_max': aVal = a.price_max ?? 1; bVal = b.price_max ?? 1; break;
        case 'min_edge': aVal = a.min_edge ?? 0; bVal = b.min_edge ?? 0; break;
        case 'allocation': aVal = a.allocation_method || 'FIXED'; bVal = b.allocation_method || 'FIXED'; break;
        case 'bet_size': aVal = a.bet_size ?? 0; bVal = b.bet_size ?? 0; break;
        case 'min_bet': aVal = a.min_bet ?? 0; bVal = b.min_bet ?? 0; break;
        case 'max_bet': aVal = a.max_bet ?? 10; bVal = b.max_bet ?? 10; break;
        case 'kelly': aVal = (a.kelly_fraction ?? 0.25) * 100; bVal = (b.kelly_fraction ?? 0.25) * 100; break;
        case 'min_trades': aVal = a.min_trader_resolved_count ?? 30; bVal = b.min_trader_resolved_count ?? 30; break;
        case 'min_conviction': aVal = a.min_conviction ?? 0; bVal = b.min_conviction ?? 0; break;
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return compareSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return compareSortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [wallets, compareSortField, compareSortDir]);

  const fetchWallets = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/ft/wallets', { cache: 'no-store' });
      const data = await res.json();
      
      if (data.success) {
        setWallets(data.wallets || []);
        setTotals(data.totals || null);
        setLastSync(data.fetched_at);
      } else if (!silent) {
        setError(data.error || 'Failed to fetch wallets');
      }
    } catch (err) {
      if (!silent) setError('Failed to fetch wallets');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchLtStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/lt/strategies', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.strategies) {
        const list = data.strategies as Array<{ ft_wallet_id: string; strategy_id: string; display_name: string; is_active: boolean; is_paused: boolean; initial_capital: number; starting_capital?: number; lt_risk_state?: unknown; available_cash?: number; locked_capital?: number; cooldown_capital?: number; created_at?: string; lt_stats?: any }>;
        setLtStrategyFtIds(new Set(list.map((s) => s.ft_wallet_id)));
        setLtStrategies(list);
        if (data.my_polymarket_wallet != null) setMyPolymarketWallet(data.my_polymarket_wallet);
      } else {
        setLtStrategyFtIds(new Set());
        setLtStrategies([]);
      }
    } catch {
      setLtStrategyFtIds(new Set());
      setLtStrategies([]);
    }
  }, []);

  const handleCreateLt = useCallback(async () => {
    if (!createLtWalletId) {
      setLtError('Select an FT wallet to mirror');
      return;
    }
    if (!myPolymarketWallet) {
      setLtError('Connect a Polymarket wallet in Portfolio or Profile first.');
      return;
    }
    setCreatingLt(true);
    setLtError(null);
    try {
      const res = await fetch('/api/lt/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ft_wallet_id: createLtWalletId,
          initial_capital: parseFloat(createLtCapital) || 1000,
          display_name: `Live: ${wallets.find((w) => w.wallet_id === createLtWalletId)?.display_name || createLtWalletId}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setCreateLtWalletId('');
      setCreateLtCapital('1000');
      await fetchLtStrategies();
    } catch (e: unknown) {
      setLtError(e instanceof Error ? e.message : 'Failed to create strategy');
    } finally {
      setCreatingLt(false);
    }
  }, [createLtWalletId, createLtCapital, myPolymarketWallet, wallets, fetchLtStrategies]);

  const syncNewTrades = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/ft/sync', { method: 'POST', cache: 'no-store' });
      const data = await res.json();
      
      if (data.success) {
        await fetchWallets();
      } else {
        setError(data.error || 'Failed to sync trades');
      }
    } catch (err) {
      setError('Failed to sync trades');
    } finally {
      setSyncing(false);
    }
  };

  const resolvePositions = async () => {
    try {
      setResolving(true);
      const res = await fetch('/api/ft/resolve', { method: 'POST', cache: 'no-store' });
      const data = await res.json();
      
      if (data.success) {
        await fetchWallets();
      } else {
        setError(data.error || 'Failed to resolve positions');
      }
    } catch (err) {
      setError('Failed to resolve positions');
    } finally {
      setResolving(false);
    }
  };

  // Auto-sync every 30 seconds
  useEffect(() => {
    fetchWallets();
    fetchLtStrategies(); // Load LT data on mount
    
    const autoSync = async () => {
      if (syncing || resolving || !autoSyncActive) return; // Don't overlap
      
      try {
        // Sync new trades
        await fetch('/api/ft/sync', { method: 'POST', cache: 'no-store' });
        // Check resolutions
        await fetch('/api/ft/resolve', { method: 'POST', cache: 'no-store' });
        // Enrich orders with ML scores
        await fetch('/api/ft/enrich-ml', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 30 }) 
        });
        // Refresh display silently (no loading flash)
        await fetchWallets(true);
        setLastAutoSync(new Date());
      } catch (err) {
        console.error('[ft] Auto-sync error:', err);
      }
    };
    
    // Poll every 15 seconds
    const interval = setInterval(autoSync, 30000);
    
    return () => clearInterval(interval);
  }, [fetchWallets, syncing, resolving, autoSyncActive]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPnl = (value: number) => {
    const formatted = formatCurrency(Math.abs(value));
    return value >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const formatTime = (timestamp: { value: string } | null) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp.value).toLocaleString();
  };

  const formatStarted = (startDate: { value: string } | null) => {
    if (!startDate?.value) return '-';
    return new Date(startDate.value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeRunning = (startDate: { value: string } | null, status?: string) => {
    if (!startDate?.value) return '-';
    const start = new Date(startDate.value).getTime();
    const now = Date.now();
    if (start > now && status === 'SCHEDULED') return '-';
    const ms = Math.max(0, now - start);
    if (ms < 60000) return '<1m';
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (ms < 86400000) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0 && m > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${d}d ${h}h`;
    if (m > 0) return `${d}d ${m}m`;
    return `${d}d`;
  };

  // Sort header component
  const SortHeader = ({ 
    field, 
    label, 
    sortField: currentField, 
    sortDir: currentDir, 
    onSort, 
    align = 'left' 
  }: { 
    field: SortField; 
    label: string; 
    sortField: SortField; 
    sortDir: SortDir; 
    onSort: (field: SortField) => void;
    align?: 'left' | 'right';
  }) => (
    <th 
      className={`px-3 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        {currentField === field ? (
          currentDir === 'desc' ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );

  const CompareSortHeader = ({ 
    field, 
    label, 
    sortField: currentField, 
    sortDir: currentDir, 
    onSort, 
    align = 'left' 
  }: { 
    field: CompareSortField; 
    label: string; 
    sortField: CompareSortField; 
    sortDir: SortDir; 
    onSort: (field: CompareSortField) => void;
    align?: 'left' | 'right';
  }) => (
    <th 
      className={`px-3 py-3 font-medium text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(field)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{label}</span>
        {currentField === field ? (
          currentDir === 'desc' ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Wallet className="h-8 w-8" />
            {showLtInTable ? 'All Trading Strategies' : 'Forward Test Wallets'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {showLtInTable 
              ? 'Forward Testing (paper) and Live Trading (real) strategies' 
              : 'Live paper trading portfolios tracking strategy performance'}
          </p>
          <div className="flex items-center gap-4 mt-2">
            {lastSync && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(lastSync).toLocaleString()}
              </p>
            )}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${autoSyncActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className="text-xs text-muted-foreground">
                {autoSyncActive ? 'Auto-sync every 30s' : 'Auto-sync paused'}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={() => setAutoSyncActive(!autoSyncActive)}
              >
                {autoSyncActive ? 'Pause' : 'Resume'}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant={showLtInTable ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowLtInTable(!showLtInTable)}
              className="h-7 text-xs"
            >
              {showLtInTable ? '✓ Show Live Trading' : 'Show Live Trading'}
            </Button>
            <Link href="/lt/logs">
              <Button variant="outline" size="sm" className="h-7 text-xs border-[#FDB022] text-[#FDB022]">
                <Activity className="h-3 w-3 mr-1" />
                Live Logs
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncNewTrades} disabled={syncing}>
            <Play className={`mr-2 h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync New Trades'}
          </Button>
          <Button variant="outline" onClick={resolvePositions} disabled={resolving}>
            <CheckCircle2 className={`mr-2 h-4 w-4 ${resolving ? 'animate-pulse' : ''}`} />
            {resolving ? 'Resolving...' : 'Check Resolutions'}
          </Button>
          <Button onClick={() => fetchWallets()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg mb-6">
          {error}
          <Button variant="ghost" size="sm" className="ml-4" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Portfolio Totals */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{formatCurrency(totals.total_balance)}</div>
              <div className="text-xs text-muted-foreground">
                Cash: {formatCurrency(totals.total_cash_available)}
              </div>
              <p className="text-xs text-muted-foreground mt-1" title="Resolved trades have a 3-hour cool-off before proceeds are added to available cash">Total Balance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={`text-2xl font-bold ${totals.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPnl(totals.total_pnl)}
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className={totals.total_realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                  R: {formatPnl(totals.total_realized_pnl)}
                </span>
                <span className={totals.total_unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                  U: {formatPnl(totals.total_unrealized_pnl)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total P&L</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{totals.total_trades.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {totals.total_won + totals.total_lost} resolved
                {(totals.total_won + totals.total_lost) > 0 && (
                  <span className="ml-1">
                    ({((totals.total_won / (totals.total_won + totals.total_lost)) * 100).toFixed(0)}% WR)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Trades Taken</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-500">
                {(totals.total_trades_skipped - (wallets.find(w => w.wallet_id === 'T0_CONTROL')?.trades_skipped || 0)).toLocaleString()}*
              </div>
              <div className="text-xs text-muted-foreground">
                *not including T0
              </div>
              <p className="text-xs text-muted-foreground mt-1">Trades Skipped</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{totals.open_positions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Open Positions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 text-2xl font-bold">
                <span className="text-green-600">{totals.total_won}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-red-600">{totals.total_lost}</span>
              </div>
              <p className="text-xs text-muted-foreground">Won / Lost</p>
            </CardContent>
          </Card>
        </div>
      )}

      {totals && wallets.length > 0 && (
        <p className="text-xs text-muted-foreground mb-4">
          Summary above is across all {wallets.length} strategies. The table below shows every strategy; scroll to see all rows. The table footer row matches the summary totals.
        </p>
      )}

      {/* Tabs: Performance | Compare Strategies | Live */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'performance' | 'compare' | 'live')}>
        <TabsList className="mb-4">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Compare Strategies
          </TabsTrigger>
          <TabsTrigger value="live" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="mt-0">
      {/* Wallets Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <SortHeader field="name" label="Strategy" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="started" label="Started" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap text-left min-w-[70px]">Running</th>
                  <SortHeader field="balance" label="Balance" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="pnl" label="P&L" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="pnl_pct" label="Return" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="realized" label="Realized" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="unrealized" label="Unrealized" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="taken" label="Taken" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="avg_trade_size" label="Avg Size" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="pct_made" label="% Made" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="open" label="Open" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="won" label="Won" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="lost" label="Lost" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="win_rate" label="WR%" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="max_drawdown" label="Max DD" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="sharpe" label="Sharpe" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortHeader field="cash" label="Cash" sortField={sortField} sortDir={sortDir} onSort={handleSort} align="right" />
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap text-left">Live</th>
                  <th className="px-3 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedWallets.map((wallet) => {
                  const returnPct = wallet.starting_balance > 0 
                    ? ((wallet.current_balance - wallet.starting_balance) / wallet.starting_balance) * 100
                    : 0;
                  const winRate = (wallet.won + wallet.lost) > 0 
                    ? (wallet.won / (wallet.won + wallet.lost)) * 100 
                    : 0;
                  const isLive = (wallet as FTWallet & { _isLive?: boolean })._isLive === true;
                  const detailHref = isLive ? `/lt/${wallet.wallet_id}` : `/ft/${wallet.wallet_id}`;
                  
                  return (
                    <tr 
                      key={wallet.wallet_id} 
                      className={`border-b hover:bg-muted/30 transition-colors ${isLive ? 'bg-emerald-50/50' : ''}`}
                    >
                      {/* Strategy Name */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {wallet.total_pnl >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600 flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-medium flex items-center gap-1.5">
                              <Link href={detailHref} className="hover:underline">{wallet.display_name}</Link>
                              {isLive && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] py-0 px-1.5">LIVE</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={wallet.description}>
                              {wallet.description}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Started */}
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap" title={wallet.start_date?.value}>
                        {formatStarted(wallet.start_date)}
                      </td>

                      {/* Time Running */}
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        {formatTimeRunning(wallet.start_date)}
                      </td>

                      {/* Balance */}
                      <td className="px-3 py-3 text-right font-medium">
                        {formatCurrency(wallet.current_balance)}
                      </td>

                      {/* Total P&L */}
                      <td className={`px-3 py-3 text-right font-medium ${wallet.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPnl(wallet.total_pnl)}
                      </td>

                      {/* Return % */}
                      <td className={`px-3 py-3 text-right font-medium ${returnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                      </td>

                      {/* Realized */}
                      <td className={`px-3 py-3 text-right ${wallet.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPnl(wallet.realized_pnl)}
                      </td>

                      {/* Unrealized */}
                      <td className={`px-3 py-3 text-right ${wallet.unrealized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPnl(wallet.unrealized_pnl)}
                      </td>

                      {/* Taken */}
                      <td className="px-3 py-3 text-right">
                        {wallet.total_trades}
                      </td>

                      {/* Avg trade size */}
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.avg_trade_size != null && wallet.avg_trade_size > 0
                          ? formatCurrency(wallet.avg_trade_size)
                          : '-'}
                      </td>

                      {/* % Made: of trades evaluated, % we took. Capped at 100 (evaluated can lag historical taken). */}
                      <td className="px-3 py-3 text-right text-muted-foreground" title="Of trades evaluated this run, % we took. Can exceed 100% if evaluated counter started after some trades were taken.">
                        {(() => {
                          const evaluated = wallet.trades_seen || 0;
                          if (evaluated === 0) return '-';
                          const pct = Math.min(100, (wallet.total_trades / evaluated) * 100);
                          return `${pct.toFixed(1)}%`;
                        })()}
                      </td>

                      {/* Open */}
                      <td className="px-3 py-3 text-right text-blue-600 font-medium">
                        {wallet.open_positions}
                      </td>

                      {/* Won */}
                      <td className="px-3 py-3 text-right text-green-600">
                        {wallet.won}
                      </td>

                      {/* Lost */}
                      <td className="px-3 py-3 text-right text-red-600">
                        {wallet.lost}
                      </td>

                      {/* Win Rate */}
                      <td className="px-3 py-3 text-right">
                        {(wallet.won + wallet.lost) > 0 ? `${winRate.toFixed(0)}%` : '-'}
                      </td>

                      {/* Max Drawdown */}
                      <td className="px-3 py-3 text-right text-muted-foreground" title={wallet.max_drawdown_usd != null ? `$${wallet.max_drawdown_usd.toFixed(2)}` : undefined}>
                        {wallet.max_drawdown_pct != null && (wallet.won + wallet.lost) >= 1
                          ? `${wallet.max_drawdown_pct.toFixed(1)}%`
                          : '-'}
                      </td>

                      {/* Sharpe Ratio */}
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.sharpe_ratio != null ? wallet.sharpe_ratio.toFixed(2) : '-'}
                      </td>

                      {/* Cash */}
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {formatCurrency(wallet.cash_available)}
                      </td>

                      {/* Live */}
                      <td className="px-3 py-3">
                        {ltStrategyFtIds.has(wallet.wallet_id) ? (
                          <Link href={`/lt/LT_${wallet.wallet_id}`}>
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 cursor-pointer">
                              Live
                            </Badge>
                          </Link>
                        ) : (
                          <Link href={`/lt?createFrom=${wallet.wallet_id}`}>
                            <span className="text-xs text-[#FDB022] hover:underline cursor-pointer">Create Live</span>
                          </Link>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-right">
                        <Link href={detailHref}>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/30 border-t-2 font-medium">
                <tr>
                  <td className="px-3 py-3 text-muted-foreground" colSpan={4}>
                    Table total ({sortedWallets.length} strategies)
                  </td>
                  <td className="px-3 py-3 text-right">{formatCurrency(sortedWallets.reduce((s, w) => s + w.current_balance, 0))}</td>
                  <td className="px-3 py-3 text-right">{formatPnl(sortedWallets.reduce((s, w) => s + w.total_pnl, 0))}</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">{formatPnl(sortedWallets.reduce((s, w) => s + (w.realized_pnl || 0), 0))}</td>
                  <td className="px-3 py-3 text-right">{formatPnl(sortedWallets.reduce((s, w) => s + (w.unrealized_pnl || 0), 0))}</td>
                  <td className="px-3 py-3 text-right">{sortedWallets.reduce((s, w) => s + w.total_trades, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">{sortedWallets.reduce((s, w) => s + w.open_positions, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right text-green-600">{sortedWallets.reduce((s, w) => s + w.won, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right text-red-600">{sortedWallets.reduce((s, w) => s + w.lost, 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const tw = sortedWallets.reduce((s, w) => s + w.won, 0);
                      const tl = sortedWallets.reduce((s, w) => s + w.lost, 0);
                      return (tw + tl) > 0 ? `${((tw / (tw + tl)) * 100).toFixed(0)}%` : '—';
                    })()}
                  </td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="compare" className="mt-0">
      {/* Strategy Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Strategy Settings Comparison</CardTitle>
          <CardDescription>
            Key configuration for each strategy. P&L shown as cash value. Click column headers to sort. See docs/FORWARD_TESTING_ANALYSIS_GUIDE.md for comparison prompts.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <CompareSortHeader field="name" label="Strategy" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} />
                  <CompareSortHeader field="pnl" label="P&L" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="started" label="Started" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} />
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap text-left min-w-[70px]">Running</th>
                  <CompareSortHeader field="use_model" label="Model" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="model_threshold" label="Model Min" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="price_min" label="Price Min" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="price_max" label="Price Max" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="min_edge" label="Min Edge" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="allocation" label="Allocation" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} />
                  <CompareSortHeader field="bet_size" label="Bet Size" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="min_bet" label="Min Bet" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="max_bet" label="Max Bet" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="kelly" label="Kelly %" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="min_trades" label="Min Trades" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <CompareSortHeader field="min_conviction" label="Min Conv" sortField={compareSortField} sortDir={compareSortDir} onSort={handleCompareSort} align="right" />
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Profile vs Global</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Target / Categories</th>
                  <th className="px-3 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedCompareWallets.map((wallet) => {
                  const ext = getExtendedFilters(wallet);
                  const targetStr = ext.target_trader_name || (ext.target_trader ? `${(ext.target_trader as string).slice(0, 8)}...` : null) 
                    || (ext.target_traders?.length ? `${(ext.target_traders as string[]).length} traders` : null);
                  const cats = ext.market_categories || wallet.market_categories;
                  const catsStr = Array.isArray(cats) && cats.length ? cats.slice(0, 2).join(', ') + (cats.length > 2 ? '…' : '') : null;
                  return (
                    <tr key={wallet.wallet_id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3">
                        <Link href={`/ft/${wallet.wallet_id}`} className="font-medium hover:underline">
                          {wallet.display_name}
                        </Link>
                      </td>
                      <td className={`px-3 py-3 text-right font-medium ${(wallet.total_pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPnl(wallet.total_pnl ?? 0)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap" title={wallet.start_date?.value}>
                        {formatStarted(wallet.start_date)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                        {formatTimeRunning(wallet.start_date, wallet.test_status)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{wallet.use_model ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.model_threshold != null ? `${(wallet.model_threshold * 100).toFixed(0)}%` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.price_min != null ? `${(wallet.price_min * 100).toFixed(0)}¢` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.price_max != null ? `${(wallet.price_max * 100).toFixed(0)}¢` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.min_edge != null ? `${(wallet.min_edge * 100).toFixed(0)}%` : '-'}
                      </td>
                      <td className="px-3 py-3">{wallet.allocation_method || 'FIXED'}</td>
                      <td className="px-3 py-3 text-right">{formatCurrency(wallet.bet_size ?? 0)}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.min_bet != null ? formatCurrency(wallet.min_bet) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.max_bet != null ? formatCurrency(wallet.max_bet) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.kelly_fraction != null ? `${(wallet.kelly_fraction * 100).toFixed(0)}%` : '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.min_trader_resolved_count ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground">
                        {wallet.min_conviction != null && wallet.min_conviction > 0 ? `${wallet.min_conviction}x` : '-'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {wallet.wr_source === 'PROFILE' ? (
                          <Badge variant="secondary" className="text-xs">Profile</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">Global</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground max-w-[120px] truncate" title={[targetStr, catsStr].filter(Boolean).join(' | ') || undefined}>
                        {[targetStr, catsStr].filter(Boolean).join(' • ') || '-'}
                      </td>
                      <td className="px-3 py-3">
                        {ltStrategyFtIds.has(wallet.wallet_id) ? (
                          <Link href={`/lt/LT_${wallet.wallet_id}`}>
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 cursor-pointer">
                              Live
                            </Badge>
                          </Link>
                        ) : (
                          <Link href={`/lt?createFrom=${wallet.wallet_id}`}>
                            <span className="text-xs text-[#FDB022] hover:underline cursor-pointer">Create Live</span>
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link href={`/ft/${wallet.wallet_id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="live" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Live trading
              </CardTitle>
              <CardDescription>
                Create and manage live strategies that mirror your Forward Test wallets. Trades run on your connected Polymarket account and appear in your Orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {ltError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
                  <span>{ltError}</span>
                  <Button variant="ghost" size="sm" onClick={() => setLtError(null)}>Dismiss</Button>
                </div>
              )}
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">FT wallet to mirror</label>
                  <select
                    value={createLtWalletId}
                    onChange={(e) => setCreateLtWalletId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[200px]"
                  >
                    <option value="">Select…</option>
                    {wallets.map((w) => (
                      <option key={w.wallet_id} value={w.wallet_id}>{w.display_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Starting capital ($)</label>
                  <input
                    type="number"
                    value={createLtCapital}
                    onChange={(e) => setCreateLtCapital(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm w-28"
                    min={1}
                    step={100}
                  />
                </div>
                <Button
                  onClick={handleCreateLt}
                  disabled={creatingLt || !createLtWalletId || !myPolymarketWallet}
                  className="bg-[#FDB022] text-slate-900 hover:bg-[#FDB022]/90"
                >
                  {creatingLt ? 'Creating…' : 'Create live strategy'}
                </Button>
              </div>
              {!myPolymarketWallet && (
                <p className="text-sm text-muted-foreground">
                  Connect a Polymarket wallet in <Link href="/portfolio" className="text-primary underline">Portfolio</Link> or <Link href="/profile" className="text-primary underline">Profile</Link> to create a live strategy.
                </p>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Your live strategies</span>
                  <div className="flex gap-1">
                    {(['all', 'active', 'paused'] as const).map((f) => (
                      <Button
                        key={f}
                        variant={ltFilter === f ? 'secondary' : 'ghost'}
                        size="sm"
                        className="capitalize"
                        onClick={() => setLtFilter(f)}
                      >
                        {f}
                      </Button>
                    ))}
                  </div>
                </div>
                {ltStrategies.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No live strategies yet. Create one above or go to <Link href="/lt" className="text-primary underline">Live Trading</Link> for more options.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ltStrategies
                      .filter((s) => {
                        if (ltFilter === 'all') return true;
                        const isPaused = s.is_paused || (Array.isArray(s.lt_risk_state) && (s.lt_risk_state[0] as { is_paused?: boolean })?.is_paused);
                        if (ltFilter === 'paused') return isPaused;
                        return !isPaused && s.is_active;
                      })
                      .map((s) => {
                        const risk = Array.isArray(s.lt_risk_state) && s.lt_risk_state[0] ? (s.lt_risk_state[0] as { current_equity?: number }) : null;
                        const isPaused = s.is_paused || (risk as { is_paused?: boolean } | null)?.is_paused;
                        return (
                          <li
                            key={s.strategy_id}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border bg-card text-card-foreground"
                          >
                            <div className="flex items-center gap-2">
                              <Link href={`/lt/${s.strategy_id}`} className="font-medium hover:underline">
                                {s.display_name}
                              </Link>
                              {s.is_active && !isPaused && (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">Active</Badge>
                              )}
                              {isPaused && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-700">Paused</Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                Capital: ${risk?.current_equity ?? s.initial_capital ?? s.starting_capital ?? 0}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isPaused ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await fetch(`/api/lt/strategies/${encodeURIComponent(s.strategy_id)}/resume`, { method: 'POST' });
                                      await fetchLtStrategies();
                                    } catch {
                                      setLtError('Failed to resume');
                                    }
                                  }}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  Resume
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await fetch(`/api/lt/strategies/${encodeURIComponent(s.strategy_id)}/pause`, { method: 'POST' });
                                      await fetchLtStrategies();
                                    } catch {
                                      setLtError('Failed to pause');
                                    }
                                  }}
                                >
                                  <Pause className="h-4 w-4 mr-1" />
                                  Pause
                                </Button>
                              )}
                              <Link href={`/lt/${s.strategy_id}`}>
                                <Button size="sm" variant="ghost">View trades & settings</Button>
                              </Link>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            How Forward Testing Works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm space-y-2 text-muted-foreground">
            <p>
              <strong>True Forward Testing:</strong> Only captures NEW trades that come in from the Polymarket API after the test starts. 
              No historical data - only real-time predictions.
            </p>
            <p>
              <strong>Sync New Trades:</strong> Scans for trades placed <em>after</em> the last sync and <em>before</em> the market ends.
              Only from experienced traders (30+ resolved trades) with matching criteria.
            </p>
            <p>
              <strong>Check Resolutions:</strong> Updates positions when markets resolve, calculating actual P&L.
            </p>
            <p>
              <strong>Cash availability:</strong> Resolved trades have a 3-hour cool-off before proceeds are added to available cash balance.
            </p>
            <p>
              <strong>Test Duration:</strong> Each test runs for a set period (default 4 days). Click on a wallet to see detailed strategy settings and extend if needed.
            </p>
            <p className="pt-2">
              These are paper trading portfolios - no real money is at risk. They validate strategy performance in real-time.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
