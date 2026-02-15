'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  Zap,
  Shield,
  Target,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  BookOpen,
  Play,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Send,
  Rocket,
  Eye,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface AgentStatus {
  last_run: {
    run_id: string;
    status: string;
    started_at: string;
    market_regime: string | null;
    reflection: string | null;
    decisions_count: number;
    duration_ms: number | null;
  } | null;
  bots: {
    bot_id: string;
    role: string;
    hypothesis: string | null;
    config_changes: number;
    last_change: string | null;
  }[];
  total_runs: number;
  total_memories: number;
  total_hypotheses: number;
}

interface AgentRun {
  run_id: string;
  run_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  market_regime: string | null;
  analysis: string | null;
  patterns_found: unknown[];
  decisions: unknown[];
  actions_taken: unknown[];
  reflection: string | null;
  total_bots_analyzed: number;
  winning_bots: number;
  losing_bots: number;
  llm_tokens_used: number;
  error_message: string | null;
}

interface Memory {
  memory_id: string;
  memory_tier: string;
  memory_type: string;
  title: string;
  content: string;
  confidence: number;
  tags: string[];
  validated: boolean;
  validation_result: string | null;
  times_referenced: number;
  created_at: string;
}

interface ChatAttachment {
  mimeType: string;
  data: string; // base64
  preview?: string; // data URL for display
  name?: string;
}

interface ThinkingStep {
  agent: 'data' | 'memory' | 'supabase' | 'strategist' | 'executor';
  label: string;
  detail?: string;
  timestamp: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  thinking_steps?: ThinkingStep[];
}

// ============================================================================
// Helpers
// ============================================================================

function fileToBase64(file: File): Promise<{ mimeType: string; data: string; preview: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve({ mimeType: file.type, data: base64, preview: dataUrl, name: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// Component
// ============================================================================

export default function AlphaAgentCommandCenter() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [memoryFilter, setMemoryFilter] = useState<string>('all');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live run status
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, runsRes, memoriesRes] = await Promise.all([
        fetch('/api/alpha-agent/status'),
        fetch('/api/alpha-agent/runs?limit=15'),
        fetch('/api/alpha-agent/memories?limit=50'),
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        if (s.success) setStatus(s);
      }
      if (runsRes.ok) {
        const r = await runsRes.json();
        if (r.success) setRuns(r.runs || []);
      }
      if (memoriesRes.ok) {
        const m = await memoriesRes.json();
        if (m.success) setMemories(m.memories || []);
      }
    } catch (err) {
      console.error('Failed to fetch agent data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const triggerRun = async (dryRun: boolean = false) => {
    setRunning(true);
    try {
      const res = await fetch('/api/alpha-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runType: 'manual', dryRun }),
      });
      const data = await res.json();
      if (data.run_id) setLiveRunId(data.run_id);
      // Add system message to chat
      const msg = data.summary || data.error || 'Run completed';
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Agent Run ${dryRun ? '(Dry Run) ' : ''}Complete**\n\n${msg}`,
        timestamp: new Date().toISOString(),
      }]);
      await fetchData();
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Run error: ${err instanceof Error ? err.message : 'Unknown'}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setRunning(false);
    }
  };

  const triggerBootstrap = async () => {
    setBootstrapping(true);
    setChatMessages(prev => [...prev, {
      role: 'assistant',
      content: '**Initializing Alpha Agent...**\n\nAnalyzing all existing bot performance data, identifying winning patterns, and designing initial strategies for the 3 agent bots. This may take up to 60 seconds.',
      timestamp: new Date().toISOString(),
    }]);
    try {
      const res = await fetch('/api/alpha-agent/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        const strategies = (data.strategies || []).map((s: { bot_id: string; hypothesis: string; reasoning: string }) =>
          `**${s.bot_id}**: ${s.hypothesis}\n> ${s.reasoning}`
        ).join('\n\n');
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `${data.opening_message || 'Bootstrap complete!'}\n\n---\n\n**Initial Strategies:**\n\n${strategies}\n\n---\n\n**Fleet Analysis:**\n${data.fleet_analysis || ''}`,
          timestamp: new Date().toISOString(),
        }]);
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `Bootstrap failed: ${data.error}`,
          timestamp: new Date().toISOString(),
        }]);
      }
      await fetchData();
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Bootstrap error: ${err instanceof Error ? err.message : 'Unknown'}`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setBootstrapping(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const att = await fileToBase64(file);
          setPendingAttachments(prev => [...prev, att]);
        }
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB limit
      const att = await fileToBase64(file);
      setPendingAttachments(prev => [...prev, att]);
    }
    e.target.value = '';
  };

  const sendMessage = async () => {
    if ((!chatInput.trim() && pendingAttachments.length === 0) || chatLoading) return;
    const userMsg: ChatMsg = {
      role: 'user',
      content: chatInput.trim() || (pendingAttachments.length > 0 ? `[Sent ${pendingAttachments.length} file(s)]` : ''),
      timestamp: new Date().toISOString(),
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
    };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setPendingAttachments([]);
    setChatLoading(true);
    try {
      const allMsgs = [...chatMessages, userMsg];
      const res = await fetch('/api/alpha-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMsgs.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            attachments: m.attachments?.map(a => ({ mimeType: a.mimeType, data: a.data })),
          })),
        }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || data.error || 'No response',
        timestamp: new Date().toISOString(),
        thinking_steps: data.thinking_steps || undefined,
      }]);
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

  const botIcons: Record<string, typeof Brain> = { explorer: Zap, optimizer: Target, conservative: Shield };
  const botColors: Record<string, string> = { explorer: 'text-amber-500', optimizer: 'text-blue-500', conservative: 'text-emerald-500' };
  const isFirstRun = (status?.total_runs || 0) === 0;

  const tierColors: Record<string, string> = {
    short_term: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    mid_term: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    long_term: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const filteredMemories = memoryFilter === 'all'
    ? memories
    : memories.filter(m => m.memory_tier === memoryFilter || m.memory_type === memoryFilter);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Brain className="h-8 w-8 text-purple-500" />
            <h1 className="text-3xl font-bold">Alpha Agent</h1>
            {status?.last_run?.market_regime && (
              <Badge variant="secondary" className="capitalize">{status.last_run.market_regime} regime</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Command center for your autonomous AI trading strategist
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isFirstRun ? (
            <Button size="sm" onClick={triggerBootstrap} disabled={bootstrapping} className="bg-purple-600 hover:bg-purple-700">
              {bootstrapping ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Rocket className="h-4 w-4 mr-1" />}
              Launch Agent
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => triggerRun(true)} disabled={running}>
                <Eye className="h-4 w-4 mr-1" />
                Dry Run
              </Button>
              <Button size="sm" onClick={() => triggerRun(false)} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
                Run Cycle
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Runs</div>
            <div className="text-xl font-bold">{status?.total_runs || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Memories</div>
            <div className="text-xl font-bold">{status?.total_memories || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Hypotheses</div>
            <div className="text-xl font-bold">{status?.total_hypotheses || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Last Run</div>
            <div className="text-sm font-medium">
              {status?.last_run ? new Date(status.last_run.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Regime</div>
            <div className="text-xl font-bold capitalize">{status?.last_run?.market_regime || '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Bot Cards - Click to go to detail page */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {(status?.bots || []).map(bot => {
          const Icon = botIcons[bot.role] || Brain;
          const color = botColors[bot.role] || 'text-gray-500';
          return (
            <Link key={bot.bot_id} href={`/alpha-agent/${bot.bot_id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${color}`} />
                      <CardTitle className="text-base">{bot.bot_id.replace('ALPHA_', '')}</CardTitle>
                    </div>
                    <Badge variant="outline" className="capitalize text-xs">{bot.role}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-2 min-h-[40px]">
                    {bot.hypothesis ? (
                      <span className="flex items-start gap-1">
                        <Lightbulb className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                        <span className="line-clamp-2">{bot.hypothesis}</span>
                      </span>
                    ) : (
                      <span className="italic">No hypothesis yet</span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{bot.config_changes} changes</span>
                    <span>{bot.last_change ? `Last: ${new Date(bot.last_change).toLocaleDateString()}` : 'Never changed'}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {(!status?.bots || status.bots.length === 0) && (
          <Card className="col-span-3">
            <CardContent className="pt-6 text-center">
              <Brain className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-muted-foreground mb-3">Agent bots not initialized yet</p>
              <Button onClick={triggerBootstrap} disabled={bootstrapping} className="bg-purple-600 hover:bg-purple-700">
                {bootstrapping ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Rocket className="h-4 w-4 mr-1" />}
                Launch Agent
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Content: Chat + Tabs side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Central Chat */}
        <Card className="flex flex-col" style={{ minHeight: '500px', maxHeight: '700px' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-purple-500" />
              Command Center
            </CardTitle>
            <CardDescription>
              Talk to Alpha Agent about all 3 bots, strategies, performance, and decisions
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <Brain className="h-10 w-10 mx-auto mb-3 opacity-15" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {isFirstRun ? 'Launch the agent to get started, then chat here.' : 'Ask Alpha Agent anything about its strategies.'}
                  </p>
                  <div className="flex flex-col gap-2 max-w-xs mx-auto">
                    {(isFirstRun ? [
                      'Analyze the existing bot fleet for me',
                    ] : [
                      'How are the 3 bots performing?',
                      'What patterns have you discovered?',
                      'Explain your current hypotheses',
                      'What would you change right now?',
                      'Show me your best and worst trades',
                    ]).map(q => (
                      <Button key={q} variant="outline" size="sm" className="text-xs justify-start" onClick={() => setChatInput(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {/* Thinking steps (assistant only) */}
                  {msg.role === 'assistant' && msg.thinking_steps && msg.thinking_steps.length > 0 && (
                    <details className="w-full max-w-[90%] mb-1 group">
                      <summary className="text-[10px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground flex items-center gap-1">
                        <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                        {msg.thinking_steps.length} thinking steps
                      </summary>
                      <div className="mt-1 ml-1 border-l-2 border-purple-200 dark:border-purple-800 pl-2 space-y-0.5">
                        {msg.thinking_steps.map((s, si) => {
                          const icons: Record<string, string> = { data: '\u{1F4CA}', memory: '\u{1F9E0}', supabase: '\u{1F5C4}', strategist: '\u{1F916}', executor: '\u26A1' };
                          return (
                            <div key={si} className="text-[10px] text-muted-foreground/70 flex items-start gap-1">
                              <span className="shrink-0">{icons[s.agent] || '\u2022'}</span>
                              <span><span className="font-medium">{s.label}</span>{s.detail ? <span className="text-muted-foreground/50"> — {s.detail}</span> : null}</span>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                  {/* Message bubble */}
                  <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex gap-1.5 mb-1.5 flex-wrap">
                        {msg.attachments.map((att, ai) => (
                          att.preview && att.mimeType.startsWith('image/') ? (
                            <img key={ai} src={att.preview} alt={att.name || 'attachment'} className="max-w-[200px] max-h-[150px] rounded border object-cover" />
                          ) : (
                            <div key={ai} className="text-xs bg-black/10 rounded px-2 py-1">{att.name || 'file'}</div>
                          )
                        ))}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-primary-foreground/50' : 'text-muted-foreground/50'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {/* Attachment preview */}
            {pendingAttachments.length > 0 && (
              <div className="flex gap-2 pt-2 flex-wrap">
                {pendingAttachments.map((att, i) => (
                  <div key={i} className="relative group">
                    {att.preview && att.mimeType.startsWith('image/') ? (
                      <img src={att.preview} alt={att.name} className="h-16 w-16 rounded border object-cover" />
                    ) : (
                      <div className="h-16 px-3 rounded border flex items-center text-xs text-muted-foreground">{att.name}</div>
                    )}
                    <button onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">x</button>
                  </div>
                ))}
              </div>
            )}
            {/* Input row */}
            <div className="flex gap-2 pt-2 border-t">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf,.csv,.txt,.json" multiple onChange={handleFileSelect} />
              <button onClick={() => fileInputRef.current?.click()} className="shrink-0 rounded-md border px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Attach file">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                onPaste={handlePaste}
                placeholder="Talk to Alpha Agent... (paste images here)"
                className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={chatLoading}
              />
              <Button size="sm" onClick={sendMessage} disabled={chatLoading || (!chatInput.trim() && pendingAttachments.length === 0)} className="bg-purple-600 hover:bg-purple-700">
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Runs, Memory, Reflection tabs */}
        <div>
          <Tabs defaultValue="runs">
            <TabsList className="w-full">
              <TabsTrigger value="runs" className="flex-1">
                <Activity className="h-3.5 w-3.5 mr-1" />
                Runs
              </TabsTrigger>
              <TabsTrigger value="memory" className="flex-1">
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                Memory
              </TabsTrigger>
              <TabsTrigger value="reflection" className="flex-1">
                <Lightbulb className="h-3.5 w-3.5 mr-1" />
                Reflection
              </TabsTrigger>
            </TabsList>

            {/* RUNS */}
            <TabsContent value="runs" className="max-h-[580px] overflow-y-auto">
              {runs.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground text-sm py-8">
                    No runs yet. Launch the agent to begin.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {runs.map(run => {
                    const isExpanded = expandedRun === run.run_id;
                    const statusIcon = run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : '⟳';
                    const statusColor = run.status === 'completed' ? 'text-green-600' : run.status === 'failed' ? 'text-red-600' : 'text-yellow-600';
                    const patterns = Array.isArray(run.patterns_found) ? run.patterns_found : [];
                    const decisions = Array.isArray(run.decisions) ? run.decisions : [];

                    return (
                      <div key={run.run_id} className="border rounded-lg bg-card">
                        <button className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors" onClick={() => setExpandedRun(isExpanded ? null : run.run_id)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`font-medium ${statusColor}`}>{statusIcon}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                                {new Date(run.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                <Badge variant="outline" className="text-[10px]">{run.run_type}</Badge>
                                {run.market_regime && <Badge variant="secondary" className="text-[10px] capitalize">{run.market_regime}</Badge>}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {patterns.length} patterns · {decisions.length} decisions
                                {run.duration_ms ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ''}
                              </div>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </button>
                        {isExpanded && (
                          <div className="p-3 pt-0 border-t space-y-3 text-sm">
                            {run.analysis && (
                              <div className="bg-muted/30 rounded p-2 text-xs">
                                {(() => { try { const obs = JSON.parse(run.analysis); return Array.isArray(obs) ? obs.map((o: string, i: number) => <p key={i}>• {o}</p>) : run.analysis; } catch { return run.analysis; } })()}
                              </div>
                            )}
                            {decisions.length > 0 && decisions.map((d: unknown, i: number) => {
                              const dec = d as { bot_id?: string; reasoning?: string; confidence?: number };
                              return (
                                <div key={i} className="bg-muted/20 rounded p-2 text-xs">
                                  <Badge variant="secondary" className="text-[10px] mb-1">{dec.bot_id}</Badge>
                                  <p className="text-muted-foreground">{dec.reasoning}</p>
                                </div>
                              );
                            })}
                            {run.reflection && (
                              <div className="bg-muted/20 rounded p-2 text-xs whitespace-pre-wrap text-muted-foreground">
                                {run.reflection.substring(0, 500)}{run.reflection.length > 500 ? '...' : ''}
                              </div>
                            )}
                            {run.error_message && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 rounded p-2">{run.error_message}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* MEMORY */}
            <TabsContent value="memory" className="max-h-[580px] overflow-y-auto">
              <div className="flex gap-1 mb-3">
                {['all', 'long_term', 'mid_term', 'short_term'].map(f => (
                  <Button key={f} variant={memoryFilter === f ? 'default' : 'outline'} size="sm" onClick={() => setMemoryFilter(f)} className="text-xs px-2 py-1 h-7">
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </Button>
                ))}
              </div>
              {filteredMemories.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">No memories yet.</div>
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map(mem => (
                    <div key={mem.memory_id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Badge className={`${tierColors[mem.memory_tier] || ''} text-[10px]`} variant="secondary">
                          {mem.memory_tier.replace('_', ' ')}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{mem.memory_type.replace('_', ' ')}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">{(mem.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <h4 className="text-sm font-medium">{mem.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{mem.content}</p>
                      {mem.tags.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {mem.tags.slice(0, 5).map(tag => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* REFLECTION */}
            <TabsContent value="reflection" className="max-h-[580px] overflow-y-auto">
              {status?.last_run?.reflection ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Latest Self-Reflection</CardTitle>
                    <CardDescription className="text-xs">
                      {new Date(status.last_run.started_at).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {status.last_run.reflection}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center text-muted-foreground text-sm py-8">No reflections yet.</div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
