'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  RefreshCw,
  Brain,
  Zap,
  Shield,
  Target,
  Activity,
  BarChart3,
  ListOrdered,
  Briefcase,
  Clock,
  Info,
  MessageCircle,
  Send,
  Loader2,
  Lightbulb,
  BookOpen,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface BotSnapshot {
  wallet_id: string;
  config_id: string;
  strategy_name: string;
  description: string;
  is_active: boolean;
  is_agent_managed: boolean;
  model_threshold: number | null;
  price_min: number;
  price_max: number;
  min_edge: number;
  use_model: boolean;
  allocation_method: string;
  kelly_fraction: number;
  bet_size: number;
  min_bet: number;
  max_bet: number;
  min_trader_resolved_count: number;
  min_conviction: number;
  detailed_description: string | null;
  starting_balance: number;
  current_balance: number;
  total_pnl: number;
  roi_pct: number;
  total_trades: number;
  open_trades: number;
  resolved_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
  avg_edge: number;
  avg_model_probability: number | null;
  avg_conviction: number;
  avg_time_to_resolution_hours: number | null;
  recent_trades: number;
  recent_wins: number;
  recent_pnl: number;
  recent_win_rate: number;
}

interface Trade {
  order_id: string;
  wallet_id: string;
  market_title: string;
  condition_id: string;
  trader_address: string;
  entry_price: number;
  size: number;
  edge_pct: number;
  model_probability: number | null;
  conviction: number;
  trader_win_rate: number;
  outcome: string;
  pnl: number | null;
  order_time: string;
  resolved_time: string | null;
  time_to_resolution_hours: number | null;
}

interface AgentBotInfo {
  bot_id: string;
  bot_role: string;
  description: string;
  current_hypothesis: string | null;
  total_config_changes: number;
  last_config_change: string | null;
}

interface Decision {
  decision_id: string;
  decision_type: string;
  config_diff: Record<string, { from: unknown; to: unknown }>;
  reasoning: string;
  hypothesis: string | null;
  expected_outcome: string;
  confidence: number;
  outcome_evaluated: boolean;
  outcome_result: string | null;
  created_at: string;
}

interface MemoryDataTable {
  table_name: string;
  columns: { name: string }[];
  rows: Record<string, unknown>[];
}

interface Memory {
  memory_id: string;
  memory_tier: string;
  memory_type: string;
  title: string;
  content: string;
  evidence: {
    data_tables?: MemoryDataTable[];
    [key: string]: unknown;
  };
  confidence: number;
  tags: string[];
  created_at: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatPriceCents(p: number | null | undefined): string {
  const n = p ?? 0;
  if (n < 0.01) return '<1¢';
  return `${(n * 100).toFixed(0)}¢`;
}

function formatPnl(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}$${val.toFixed(2)}`;
}

function pnlColor(val: number): string {
  if (val > 0) return 'text-green-600';
  if (val < 0) return 'text-red-600';
  return 'text-muted-foreground';
}

const botIcons: Record<string, typeof Brain> = {
  explorer: Zap,
  optimizer: Target,
  conservative: Shield,
};

const botColors: Record<string, string> = {
  explorer: 'text-amber-500',
  optimizer: 'text-blue-500',
  conservative: 'text-emerald-500',
};

// ============================================================================
// Main Component
// ============================================================================

export default function AlphaAgentDetailPage() {
  const params = useParams();
  const botId = params.id as string;

  const [snapshot, setSnapshot] = useState<BotSnapshot | null>(null);
  const [botInfo, setBotInfo] = useState<AgentBotInfo | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('positions');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch bot performance via status API + trades
      const [statusRes, memoriesRes] = await Promise.all([
        fetch('/api/alpha-agent/status'),
        fetch(`/api/alpha-agent/memories?limit=20`),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const bot = statusData.bots?.find((b: AgentBotInfo) => b.bot_id === botId);
        if (bot) setBotInfo(bot);
      }

      if (memoriesRes.ok) {
        const memData = await memoriesRes.json();
        setMemories(memData.memories || []);
      }

      // Fetch FT wallet data for this bot (it's an FT wallet)
      const walletRes = await fetch(`/api/ft/wallets/${botId}`);
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        if (walletData.success) {
          const w = walletData.wallet;
          const stats = walletData.stats || {};
          const positions = walletData.open_positions || [];
          const resolvedTrades = walletData.recent_trades || [];

          setSnapshot({
            wallet_id: w.wallet_id,
            config_id: w.config_id,
            strategy_name: w.display_name || w.config_id,
            description: w.description || '',
            is_active: w.is_active,
            is_agent_managed: true,
            model_threshold: w.model_threshold,
            price_min: w.price_min,
            price_max: w.price_max,
            min_edge: w.min_edge,
            use_model: w.use_model,
            allocation_method: w.allocation_method || 'FIXED',
            kelly_fraction: w.kelly_fraction || 0.25,
            bet_size: w.bet_size,
            min_bet: w.min_bet || 0.5,
            max_bet: w.max_bet || 10,
            min_trader_resolved_count: w.min_trader_resolved_count || 30,
            min_conviction: w.min_conviction || 0,
            detailed_description: w.detailed_description,
            starting_balance: w.starting_balance,
            current_balance: w.current_balance || w.cash_available,
            total_pnl: stats.total_pnl || 0,
            roi_pct: stats.total_pnl && w.starting_balance ? (stats.total_pnl / w.starting_balance) * 100 : 0,
            total_trades: stats.total_trades || 0,
            open_trades: stats.open_positions || 0,
            resolved_trades: (stats.won || 0) + (stats.lost || 0),
            winning_trades: stats.won || 0,
            losing_trades: stats.lost || 0,
            win_rate: stats.win_rate || 0,
            avg_win: stats.avg_win || 0,
            avg_loss: stats.avg_loss || 0,
            profit_factor: stats.avg_loss && stats.avg_loss > 0 && stats.avg_win
              ? (stats.avg_win * (stats.won || 0)) / (Math.abs(stats.avg_loss) * (stats.lost || 0) || 1)
              : 0,
            avg_edge: 0,
            avg_model_probability: null,
            avg_conviction: 0,
            avg_time_to_resolution_hours: null,
            recent_trades: 0,
            recent_wins: 0,
            recent_pnl: 0,
            recent_win_rate: 0,
          });

          // Combine positions and trades
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allTrades: Trade[] = [
            ...positions.map((p: any) => ({
              order_id: p.order_id as string,
              wallet_id: botId,
              market_title: p.market_title as string,
              condition_id: '',
              trader_address: p.trader_address as string || '',
              entry_price: p.entry_price as number,
              size: p.size as number,
              edge_pct: p.edge_pct as number || 0,
              model_probability: p.model_probability as number || null,
              conviction: p.conviction as number || 0,
              trader_win_rate: p.trader_win_rate as number || 0,
              outcome: 'OPEN',
              pnl: p.unrealized_pnl as number || null,
              order_time: (p.order_time as { value?: string } | string)?.valueOf?.() ? String((p.order_time as { value?: string })?.value || p.order_time || '') : '',
              resolved_time: null,
              time_to_resolution_hours: null,
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...resolvedTrades.map((t: any) => ({
              order_id: t.order_id as string,
              wallet_id: botId,
              market_title: t.market_title as string,
              condition_id: '',
              trader_address: t.trader_address as string || '',
              entry_price: t.entry_price as number,
              size: t.size as number,
              edge_pct: t.edge_pct as number || 0,
              model_probability: t.model_probability as number || null,
              conviction: t.conviction as number || 0,
              trader_win_rate: t.trader_win_rate as number || 0,
              outcome: t.outcome as string,
              pnl: t.pnl as number || null,
              order_time: String((t.order_time as { value?: string })?.value || t.order_time || ''),
              resolved_time: ((t.resolved_time as { value?: string })?.value || t.resolved_time || null) as string | null,
              time_to_resolution_hours: null,
            })),
          ];
          setTrades(allTrades);
        }
      }

      // Fetch decisions for this bot
      const runsRes = await fetch('/api/alpha-agent/runs?limit=10');
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        // Extract decisions for this bot from runs
        const botDecisions: Decision[] = [];
        for (const run of (runsData.runs || [])) {
          const decs = Array.isArray(run.decisions) ? run.decisions : [];
          for (const d of decs) {
            if ((d as Record<string, unknown>).bot_id === botId) {
              botDecisions.push({
                decision_id: run.run_id,
                decision_type: 'modify_filters',
                config_diff: (d as Record<string, unknown>).changes as Record<string, { from: unknown; to: unknown }> || {},
                reasoning: (d as Record<string, unknown>).reasoning as string || '',
                hypothesis: (d as Record<string, unknown>).hypothesis as string || null,
                expected_outcome: (d as Record<string, unknown>).expected_outcome as string || '',
                confidence: (d as Record<string, unknown>).confidence as number || 0,
                outcome_evaluated: false,
                outcome_result: null,
                created_at: run.started_at,
              });
            }
          }
        }
        setDecisions(botDecisions);
      }
    } catch (err) {
      console.error('Failed to fetch bot data:', err);
    } finally {
      setLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMsg = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date().toISOString(),
    };

    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/alpha-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages, userMsg].map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          })),
          botId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toISOString(),
        }]);
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Error: ${data.error}`,
          timestamp: new Date().toISOString(),
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send'}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const role = botInfo?.bot_role || botId.replace('ALPHA_', '').toLowerCase();
  const Icon = botIcons[role] || Brain;
  const color = botColors[role] || 'text-purple-500';

  const openTrades = trades.filter(t => t.outcome === 'OPEN');
  const resolvedTrades = trades.filter(t => t.outcome === 'WON' || t.outcome === 'LOST');

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/alpha-agent">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3">
            <Icon className={`h-8 w-8 ${color}`} />
            <h1 className="text-3xl font-bold">{botId}</h1>
            <Badge variant={snapshot?.is_active ? 'default' : 'secondary'}>
              {snapshot?.is_active ? 'Active' : 'Paused'}
            </Badge>
            <Badge variant="outline" className="capitalize">{role}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{botInfo?.description || snapshot?.description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Hypothesis Banner */}
      {botInfo?.current_hypothesis && (
        <Card className="mb-6 border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-4 pb-4 flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Current Hypothesis</span>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">{botInfo.current_hypothesis}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards - matches LT/FT format */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-8">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-lg font-bold">${snapshot?.current_balance?.toFixed(2) || '0.00'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Total P&L</div>
            <div className={`text-lg font-bold ${pnlColor(snapshot?.total_pnl || 0)}`}>
              {formatPnl(snapshot?.total_pnl || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">ROI</div>
            <div className={`text-lg font-bold ${pnlColor(snapshot?.roi_pct || 0)}`}>
              {(snapshot?.roi_pct || 0).toFixed(2)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Trades</div>
            <div className="text-lg font-bold">{snapshot?.total_trades || 0}</div>
            <div className="text-xs text-muted-foreground">
              {snapshot?.open_trades || 0} open
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Win Rate</div>
            <div className="text-lg font-bold">{(snapshot?.win_rate || 0).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">
              {snapshot?.winning_trades || 0}W / {snapshot?.losing_trades || 0}L
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Profit Factor</div>
            <div className="text-lg font-bold">
              {snapshot?.profit_factor === Infinity ? '∞' : (snapshot?.profit_factor || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Avg Win</div>
            <div className="text-lg font-bold text-green-600">{formatPnl(snapshot?.avg_win || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Avg Loss</div>
            <div className="text-lg font-bold text-red-600">-${Math.abs(snapshot?.avg_loss || 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Config Card */}
      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            Entry Filters &amp; Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {snapshot?.use_model && (
              <Badge variant="secondary">ML ≥ {((snapshot.model_threshold || 0) * 100).toFixed(0)}%</Badge>
            )}
            <Badge variant="outline">Price: {formatPriceCents(snapshot?.price_min)} - {formatPriceCents(snapshot?.price_max)}</Badge>
            <Badge variant="outline">Edge ≥ {((snapshot?.min_edge || 0) * 100).toFixed(0)}%</Badge>
            <Badge variant="outline">Alloc: {snapshot?.allocation_method}</Badge>
            {snapshot?.allocation_method === 'KELLY' && (
              <Badge variant="outline">Kelly: {((snapshot?.kelly_fraction || 0.25) * 100).toFixed(0)}%</Badge>
            )}
            <Badge variant="outline">Bet: ${snapshot?.bet_size?.toFixed(2)} (${snapshot?.min_bet?.toFixed(2)}-${snapshot?.max_bet?.toFixed(2)})</Badge>
            <Badge variant="outline">Trader ≥ {snapshot?.min_trader_resolved_count} trades</Badge>
            {(snapshot?.min_conviction || 0) > 0 && (
              <Badge variant="outline">Conviction ≥ {snapshot?.min_conviction}x</Badge>
            )}
            <Badge variant="outline">Config Changes: {botInfo?.total_config_changes || 0}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="positions">
            <Briefcase className="h-4 w-4 mr-1" />
            Open ({openTrades.length})
          </TabsTrigger>
          <TabsTrigger value="resolved">
            <ListOrdered className="h-4 w-4 mr-1" />
            Resolved ({resolvedTrades.length})
          </TabsTrigger>
          <TabsTrigger value="decisions">
            <Activity className="h-4 w-4 mr-1" />
            Decisions ({decisions.length})
          </TabsTrigger>
          <TabsTrigger value="memory">
            <BookOpen className="h-4 w-4 mr-1" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="h-4 w-4 mr-1" />
            Chat
          </TabsTrigger>
        </TabsList>

        {/* ===== OPEN POSITIONS ===== */}
        <TabsContent value="positions">
          <Card>
            <CardHeader>
              <CardTitle>Open Positions</CardTitle>
            </CardHeader>
            <CardContent>
              {openTrades.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No open positions.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead className="text-right">ML</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">Trader WR</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openTrades.map(trade => (
                      <TableRow key={trade.order_id}>
                        <TableCell className="max-w-[250px] truncate text-sm">{trade.market_title}</TableCell>
                        <TableCell className="text-right">{formatPriceCents(trade.entry_price)}</TableCell>
                        <TableCell className="text-right">${trade.size?.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{(trade.edge_pct * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">
                          {trade.model_probability != null ? `${(trade.model_probability * 100).toFixed(0)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-right">{trade.conviction?.toFixed(1) || '—'}</TableCell>
                        <TableCell className="text-right">{(trade.trader_win_rate * 100).toFixed(0)}%</TableCell>
                        <TableCell className={`text-right font-medium ${pnlColor(trade.pnl || 0)}`}>
                          {trade.pnl != null ? formatPnl(trade.pnl) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== RESOLVED TRADES ===== */}
        <TabsContent value="resolved">
          <Card>
            <CardHeader>
              <CardTitle>Resolved Trades</CardTitle>
            </CardHeader>
            <CardContent>
              {resolvedTrades.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No resolved trades yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead className="text-center">Result</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead className="text-right">Edge</TableHead>
                      <TableHead className="text-right">ML</TableHead>
                      <TableHead className="text-right">TTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolvedTrades.map(trade => (
                      <TableRow key={trade.order_id}>
                        <TableCell className="max-w-[250px] truncate text-sm">{trade.market_title}</TableCell>
                        <TableCell className="text-right">{formatPriceCents(trade.entry_price)}</TableCell>
                        <TableCell className="text-right">${trade.size?.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={trade.outcome === 'WON' ? 'default' : 'destructive'} className="text-xs">
                            {trade.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${pnlColor(trade.pnl || 0)}`}>
                          {formatPnl(trade.pnl || 0)}
                        </TableCell>
                        <TableCell className="text-right">{(trade.edge_pct * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right">
                          {trade.model_probability != null ? `${(trade.model_probability * 100).toFixed(0)}%` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {trade.time_to_resolution_hours != null ? `${trade.time_to_resolution_hours.toFixed(1)}h` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== DECISIONS ===== */}
        <TabsContent value="decisions">
          <Card>
            <CardHeader>
              <CardTitle>Agent Decisions for {botId}</CardTitle>
              <CardDescription>Every strategy change with reasoning and outcome tracking</CardDescription>
            </CardHeader>
            <CardContent>
              {decisions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No decisions yet. Run the agent to generate decisions.</p>
              ) : (
                <div className="space-y-4">
                  {decisions.map((d, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{d.decision_type}</Badge>
                          <Badge variant="secondary">{(d.confidence * 100).toFixed(0)}% conf</Badge>
                          {d.outcome_evaluated && (
                            <Badge variant={d.outcome_result === 'improved' ? 'default' : d.outcome_result === 'degraded' ? 'destructive' : 'secondary'}>
                              {d.outcome_result || 'neutral'}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(d.created_at).toLocaleString()}
                        </span>
                      </div>
                      {d.hypothesis && (
                        <div className="text-sm mb-2">
                          <span className="font-medium">Hypothesis:</span> {d.hypothesis}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mb-2">{d.reasoning}</p>
                      <div className="text-sm">
                        <span className="font-medium">Expected:</span> {d.expected_outcome}
                      </div>
                      {d.config_diff && Object.keys(d.config_diff).length > 0 && (
                        <div className="mt-2 text-xs font-mono bg-muted/30 rounded p-2">
                          {Object.entries(d.config_diff).map(([key, val]) => (
                            <div key={key}>
                              {key}: {JSON.stringify(val)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== MEMORY ===== */}
        <TabsContent value="memory">
          <Card>
            <CardHeader>
              <CardTitle>Agent Memory</CardTitle>
              <CardDescription>Knowledge, patterns, and lessons learned by this bot</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {memories.slice(0, 20).map(mem => (
                  <div key={mem.memory_id} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">{mem.memory_tier.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-xs">{mem.memory_type.replace('_', ' ')}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {(mem.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <h4 className="text-sm font-medium">{mem.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{mem.content.substring(0, 300)}</p>
                    {/* Show structured data tables if present */}
                    {mem.evidence?.data_tables && Array.isArray(mem.evidence.data_tables) && (
                      <div className="mt-2 overflow-x-auto">
                        {(mem.evidence.data_tables as Array<{ table_name: string; columns: Array<{ name: string }>; rows: Array<Record<string, unknown>> }>).map((table, ti) => (
                          <div key={ti} className="text-xs">
                            <div className="font-medium text-muted-foreground mb-1">{table.table_name}</div>
                            <table className="w-full text-xs border">
                              <thead>
                                <tr>{table.columns.map((c, ci) => <th key={ci} className="border px-2 py-1 bg-muted/30">{c.name}</th>)}</tr>
                              </thead>
                              <tbody>
                                {table.rows.slice(0, 5).map((row, ri) => (
                                  <tr key={ri}>
                                    {table.columns.map((c, ci) => (
                                      <td key={ci} className="border px-2 py-1">{String(row[c.name] ?? '')}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}
                    {mem.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {mem.tags.map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== CHAT ===== */}
        <TabsContent value="chat">
          <Card className="flex flex-col" style={{ height: '600px' }}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Chat with {botId}
              </CardTitle>
              <CardDescription>
                Ask about performance, decisions, strategies, or anything about how this bot thinks.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                {chatMessages.length === 0 && (
                  <div className="text-center text-muted-foreground py-12">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Start a conversation with Alpha Agent</p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {[
                        'How are you performing?',
                        'Why did you make your last change?',
                        'What patterns have you found?',
                        'What should I know about the ML model?',
                        'What hypotheses are you testing?',
                      ].map(q => (
                        <Button
                          key={q}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setChatInput(q);
                          }}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2 pt-2 border-t">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Ask Alpha Agent anything..."
                  className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={chatLoading}
                />
                <Button size="sm" onClick={sendMessage} disabled={chatLoading || !chatInput.trim()}>
                  {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
