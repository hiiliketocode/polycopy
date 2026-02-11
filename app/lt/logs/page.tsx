'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Zap,
  TrendingUp,
  AlertCircle,
  Play,
  Pause
} from 'lucide-react';

interface LogEntry {
  id: string;
  timestamp: string;
  category: 'FT_SYNC' | 'LT_EXECUTE' | 'ORDER_PLACED' | 'ORDER_FILLED' | 'ORDER_REJECTED' | 'SYSTEM';
  status: 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';
  message: string;
  details?: any;
}

interface ActivityStats {
  last_ft_sync: string | null;
  last_lt_execute: string | null;
  orders_last_hour: number;
  fills_last_hour: number;
  execution_rate: number;
}

export default function LiveTradingLogsPage() {
  const searchParams = useSearchParams();
  const strategyFilter = searchParams.get('strategy') || null;
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const url = strategyFilter 
        ? `/api/lt/activity-logs?strategy=${encodeURIComponent(strategyFilter)}`
        : '/api/lt/activity-logs';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      
      if (res.ok) {
        setLogs(data.logs || []);
        setStats(data.stats || null);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (isAutoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 10000); // Refresh every 10 seconds
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isAutoRefresh]);

  const getCategoryIcon = (category: LogEntry['category']) => {
    switch (category) {
      case 'FT_SYNC':
        return <TrendingUp className="h-4 w-4" />;
      case 'LT_EXECUTE':
        return <Zap className="h-4 w-4" />;
      case 'ORDER_PLACED':
        return <Play className="h-4 w-4" />;
      case 'ORDER_FILLED':
        return <CheckCircle className="h-4 w-4" />;
      case 'ORDER_REJECTED':
        return <XCircle className="h-4 w-4" />;
      case 'SYSTEM':
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: LogEntry['category']) => {
    switch (category) {
      case 'FT_SYNC':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'LT_EXECUTE':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'ORDER_PLACED':
        return 'text-indigo-600 bg-indigo-50 border-indigo-200';
      case 'ORDER_FILLED':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'ORDER_REJECTED':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'SYSTEM':
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getStatusIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'ERROR':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'WARNING':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'INFO':
      default:
        return <Clock className="h-4 w-4 text-blue-600" />;
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="h-8 w-8 text-[#FDB022]" />
            <div>
              <h1 className="text-2xl font-bold">
                Live Trading Activity Logs
                {strategyFilter && (
                  <Badge variant="outline" className="ml-3 text-sm font-normal border-[#FDB022] text-[#FDB022]">
                    Filtered: {strategyFilter}
                  </Badge>
                )}
              </h1>
              <p className="text-slate-600 text-sm">
                Real-time execution monitoring - See trades being checked and executed
                {strategyFilter && ' (filtered to this strategy)'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={isAutoRefresh ? 'border-green-500 text-green-700' : ''}
            >
              {isAutoRefresh ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isAutoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Last FT Sync</div>
                <div className="text-2xl font-bold">
                  {stats.last_ft_sync ? formatTimestamp(stats.last_ft_sync) : 'Never'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Last LT Execute</div>
                <div className="text-2xl font-bold">
                  {stats.last_lt_execute ? formatTimestamp(stats.last_lt_execute) : 'Never'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Orders (Last Hour)</div>
                <div className="text-2xl font-bold">{stats.orders_last_hour}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Fills (Last Hour)</div>
                <div className="text-2xl font-bold text-green-600">{stats.fills_last_hour}</div>
                <div className="text-xs text-muted-foreground">
                  {stats.execution_rate}% fill rate
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Live Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Live Activity Feed
              {isAutoRefresh && (
                <Badge variant="outline" className="ml-2 border-green-500 text-green-700">
                  Live
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Real-time log of FT sync, LT execution, and order activity. Updates every 10 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No activity yet. Waiting for FT sync and LT execution...</p>
                <p className="text-sm mt-2">Cron runs every 2 minutes. Activity will appear here automatically.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${getCategoryColor(log.category)}`}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getCategoryIcon(log.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {log.category.replace('_', ' ')}
                        </Badge>
                        {getStatusIcon(log.status)}
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{log.message}</p>
                      {log.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Show details
                          </summary>
                          <pre className="mt-2 p-2 bg-white rounded text-xs overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* What to Look For */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">What to Look For</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Healthy Activity:</strong>
                <ul className="text-muted-foreground mt-1 space-y-1 ml-4">
                  <li>• FT_SYNC runs every 2 minutes</li>
                  <li>• LT_EXECUTE runs every 2 minutes</li>
                  <li>• ORDER_PLACED appears within 30 seconds of FT_SYNC</li>
                  <li>• ORDER_FILLED appears within 1-2 minutes of ORDER_PLACED</li>
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Warning Signs:</strong>
                <ul className="text-muted-foreground mt-1 space-y-1 ml-4">
                  <li>• No FT_SYNC logs for &gt;5 minutes (cron not running)</li>
                  <li>• Many ORDER_REJECTED (check rejection reasons)</li>
                  <li>• FT orders but no LT execution (strategies paused or filters too strict)</li>
                  <li>• ORDER_PLACED but no ORDER_FILLED (orders not filling - check order type)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
