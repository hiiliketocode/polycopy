/**
 * Polymarket Trade Stream Worker
 *
 * Subscribes to real-time trades via Polymarket WebSocket (activity/trades).
 * Forwards trades from the target set returned by /api/ft/target-traders:
 * - Explicit targets: target_trader/target_traders from active FT wallets
 * - Leaderboard mode: when any FT has no target, includes traders table (leaderboard-synced)
 * sync-trade then evaluates each trade against each wallet's rules (edge, category, etc.).
 *
 * Circuit breaker: opens after N consecutive 5xx/timeouts, blocks sync-trade calls
 * for 60s, then allows one probe. Prevents runaway load on production.
 *
 * Deploy: Fly.io, Railway, or Render.
 * Run: npm start
 */

import { createServer } from 'http';
import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { config } from './config.js';

// Minimal HTTP server for Fly.io health checks (port 3000)
const PORT = 3000;
createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}).listen(PORT, () => console.log(`[worker] Health check listening on :${PORT}`));

let targetTraders = new Set<string>();
let lastTargetFetch = 0;
let inFlightSyncCalls = 0;
const MAX_IN_FLIGHT = 20;

// Heap monitoring — log every 60s so we can spot leaks before OOM
setInterval(() => {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  console.log(`[mem] heap=${heapUsedMB}/${heapTotalMB}MB (${pct}%) rss=${rssMB}MB inFlight=${inFlightSyncCalls}`);
  if (pct > 85) {
    console.warn(`[mem] WARNING: heap usage at ${pct}% — consider scaling memory`);
  }
}, 60_000);

// Circuit breaker state
type CircuitState = 'closed' | 'open' | 'half-open';
let circuitState: CircuitState = 'closed';
let circuitFailures = 0;
let circuitOpenedAt = 0;

function isCircuitOpen(): boolean {
  if (circuitState === 'closed') return false;
  if (circuitState === 'open') {
    const elapsed = (Date.now() - circuitOpenedAt) / 1000;
    if (elapsed >= config.circuitBreakerOpenSeconds) {
      circuitState = 'half-open';
      console.log('[circuit] Half-open: allowing one probe');
      return false;
    }
    return true;
  }
  return false; // half-open: allow one through
}

function recordSuccess(): void {
  if (circuitState === 'half-open') {
    circuitState = 'closed';
    circuitFailures = 0;
    console.log('[circuit] Closed: probe succeeded');
  } else if (circuitState === 'closed') {
    circuitFailures = 0;
  }
}

function recordFailure(): void {
  circuitFailures++;
  if (circuitState === 'half-open') {
    circuitState = 'open';
    circuitOpenedAt = Date.now();
    console.warn('[circuit] Open: probe failed');
    return;
  }
  if (circuitFailures >= config.circuitBreakerFailureThreshold) {
    circuitState = 'open';
    circuitOpenedAt = Date.now();
    console.warn(`[circuit] OPEN: ${circuitFailures} consecutive failures — pausing sync-trade for ${config.circuitBreakerOpenSeconds}s`);
  }
}

async function fetchTargetTraders(): Promise<Set<string>> {
  const url = `${config.apiBaseUrl}/api/ft/target-traders`;
  const headers: Record<string, string> = {};
  if (config.cronSecret) headers['Authorization'] = `Bearer ${config.cronSecret}`;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return targetTraders;
    const data = (await res.json()) as { traders?: string[] };
    const list = data.traders || [];
    targetTraders = new Set(list.map((t) => t.toLowerCase().trim()));
    lastTargetFetch = Date.now();
    const hasLeaderboard = (data as { has_leaderboard_wallets?: boolean }).has_leaderboard_wallets;
    if (targetTraders.size > 0) {
      console.log(`[worker] Loaded ${targetTraders.size} target traders${hasLeaderboard ? ' (incl. leaderboard)' : ''}`);
    } else {
      console.warn('[worker] Target traders empty — no trades will be forwarded. Check /api/ft/stream-status');
    }
  } catch (err) {
    console.error('[worker] Failed to fetch target traders:', err);
  }
  return targetTraders;
}

async function triggerLTExecute(): Promise<void> {
  const url = `${config.apiBaseUrl}/api/lt/execute`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.cronSecret) headers['Authorization'] = `Bearer ${config.cronSecret}`;

  try {
    const res = await fetch(url, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.total_executed !== undefined) {
      if (data.total_executed > 0) {
        console.log(`[lt-execute] Triggered: ${data.total_executed} order(s) placed`);
      }
    } else if (!res.ok) {
      console.error(`[lt-execute] ${res.status}:`, data?.error || data?.message);
    }
  } catch (err) {
    console.error('[lt-execute] Request failed:', err);
  }
}

async function ensureTargetTraders(): Promise<Set<string>> {
  const age = Date.now() - lastTargetFetch;
  if (age > config.traderCacheRefreshMinutes * 60 * 1000 || targetTraders.size === 0) {
    await fetchTargetTraders();
  }
  return targetTraders;
}

async function callSyncTrade(trade: Record<string, unknown>): Promise<void> {
  if (isCircuitOpen()) return;

  if (inFlightSyncCalls >= MAX_IN_FLIGHT) {
    console.warn(`[worker] Backpressure: ${inFlightSyncCalls} in-flight sync calls, dropping trade`);
    return;
  }
  inFlightSyncCalls++;

  try {
    const url = `${config.apiBaseUrl}/api/ft/sync-trade`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.cronSecret) {
      headers['Authorization'] = `Bearer ${config.cronSecret}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.circuitBreakerTimeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ trade }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json().catch(() => ({}));

      if (res.status >= 500 || res.status === 408) {
        recordFailure();
        console.error(`[sync-trade] ${res.status} ${res.statusText}:`, data?.error || data?.message);
        return;
      }

      recordSuccess();
      if (!res.ok) {
        console.error(`[sync-trade] ${res.status} ${res.statusText}:`, data?.error || data?.message);
        return;
      }
      const proxyWallet = String(trade.proxyWallet || trade.proxy_wallet || '').toLowerCase();
      const shortWallet = proxyWallet ? `${proxyWallet.slice(0, 10)}...` : '?';
      if (data?.inserted > 0) {
        console.log(`[sync-trade] Inserted ${data.inserted} ft_order(s) for trade ${trade.transactionHash || trade.id} (${shortWallet})`);
        void triggerLTExecute();
      } else {
        const msg = data?.message || 'did not qualify';
        console.log(`[worker] Forwarded trade from ${shortWallet} → ${msg}`);
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (isTimeout) {
        console.error('[sync-trade] Request timed out');
      } else {
        console.error('[sync-trade] Request failed:', err);
      }
      recordFailure();
    }
  } finally {
    inFlightSyncCalls--;
  }
}

function start(): void {
  console.log('[worker] Connecting to Polymarket WebSocket...');

  const client = new RealTimeDataClient({
    onMessage: (_client: unknown, message: { topic?: string; type?: string; payload?: object }) => {
      if (message.topic !== 'activity' || (message.type !== 'trades' && message.type !== 'orders_matched')) {
        return;
      }
      const payload = message.payload as Record<string, unknown> | undefined;
      if (!payload || typeof payload !== 'object') return;

      // Only BUY trades
      const side = String(payload.side || '').toUpperCase();
      if (side !== 'BUY') return;

      const conditionId = payload.conditionId || payload.condition_id;
      if (!conditionId) return;

      const proxyWallet = String(payload.proxyWallet || payload.proxy_wallet || '').toLowerCase();
      if (!proxyWallet) return;

      void (async () => {
        const traders = await ensureTargetTraders();
        if (traders.size === 0) {
          return; // Logged once at startup: "Loaded 0 target traders"
        }
        if (!traders.has(proxyWallet)) return;
        await callSyncTrade(payload);
      })();
    },
    onConnect: (c: { subscribe: (opts: { subscriptions: Array<{ topic: string; type: string }> }) => void }) => {
      console.log('[worker] Connected to Polymarket WebSocket');
      void ensureTargetTraders().then(() => {
        c.subscribe({
          subscriptions: [
            { topic: 'activity', type: 'trades' },
            { topic: 'activity', type: 'orders_matched' },
          ],
        });
      });
    },
    onStatusChange: (status: string) => {
      if (status === 'DISCONNECTED') {
        console.warn('[worker] WebSocket disconnected');
      }
    },
  });

  client.connect();
}

// Start
if (!config.apiBaseUrl) {
  console.error('[worker] API_BASE_URL or VERCEL_URL not set');
  process.exit(1);
}

start();
