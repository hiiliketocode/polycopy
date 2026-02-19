/**
 * Polymarket Trade Stream Worker
 *
 * Subscribes to real-time trades via Polymarket WebSocket (activity/trades).
 *
 * Two responsibilities:
 * 1. FT execution: forwards BUY trades from target traders to /api/ft/sync-trade
 * 2. Feed ingestion: writes ALL trades from followed traders to trades_public (replaces hot worker)
 *
 * Circuit breaker: opens after N consecutive 5xx/timeouts, blocks sync-trade calls
 * for 60s, then allows one probe. Prevents runaway load on production.
 *
 * Deploy: Fly.io
 * Run: npm start
 */

import { createServer } from 'http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import { config } from './config.js';

// Minimal HTTP server for Fly.io health checks (port 3000)
const PORT = 3000;
createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}).listen(PORT, () => console.log(`[worker] Health check listening on :${PORT}`));

// --- Supabase client for trades_public writes + follows lookup ---
let supabaseClient: SupabaseClient | null = null;
if (config.supabaseUrl && config.supabaseServiceRoleKey) {
  supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log('[worker] Supabase client initialized for trades_public ingestion');
} else {
  console.warn('[worker] Supabase credentials missing — trades_public ingestion disabled');
}

// --- Target traders (FT execution) ---
let targetTraders = new Set<string>();
let lastTargetFetch = 0;

// --- Followed traders (feed ingestion) ---
let followedTraders = new Set<string>();
let lastFollowsFetch = 0;

// --- Backpressure ---
let inFlightSyncCalls = 0;
const MAX_IN_FLIGHT = 20;

// --- Trade write buffer ---
type TradeRow = {
  trade_id: string;
  trader_wallet: string;
  trader_id: string | null;
  transaction_hash: string | null;
  asset: string | null;
  condition_id: string;
  market_slug: string | null;
  event_slug: string | null;
  market_title: string | null;
  side: string | null;
  outcome: string | null;
  outcome_index: number | null;
  size: number | null;
  price: number | null;
  trade_timestamp: string;
  raw: unknown;
  ingested_at: string;
};

let tradeBuffer: TradeRow[] = [];
const BUFFER_FLUSH_INTERVAL_MS = 2000;
const BUFFER_MAX_SIZE = 50;

// Heap monitoring — log every 60s so we can spot leaks before OOM
setInterval(() => {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  console.log(`[mem] heap=${heapUsedMB}/${heapTotalMB}MB (${pct}%) rss=${rssMB}MB inFlight=${inFlightSyncCalls} buffer=${tradeBuffer.length} followed=${followedTraders.size}`);
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

// --- Followed traders management ---

async function fetchFollowedTraders(): Promise<void> {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('follows')
      .select('trader_wallet')
      .eq('active', true);
    if (error) {
      console.error('[worker] Failed to fetch followed traders:', error.message);
      return;
    }
    followedTraders = new Set((data || []).map((f: { trader_wallet: string }) => f.trader_wallet.toLowerCase()));
    lastFollowsFetch = Date.now();
    console.log(`[worker] Loaded ${followedTraders.size} followed traders for feed ingestion`);
  } catch (err) {
    console.error('[worker] Error fetching followed traders:', err);
  }
}

async function ensureFollowedTraders(): Promise<void> {
  const age = Date.now() - lastFollowsFetch;
  if (age > config.traderCacheRefreshMinutes * 60 * 1000 || followedTraders.size === 0) {
    await fetchFollowedTraders();
  }
}

// --- trades_public write buffer ---

function normalizeSide(side: string): string | null {
  const s = side.toUpperCase();
  return s === 'BUY' || s === 'SELL' ? s : null;
}

function normalizeOutcome(outcome: string): string | null {
  if (!outcome) return null;
  const o = outcome.toUpperCase();
  return o === 'YES' || o === 'NO' ? o : null;
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampMs(v: unknown): number {
  if (v === null || v === undefined) return Date.now();
  let n = Number(v);
  if (!Number.isFinite(n)) return Date.now();
  if (n < 1e12) n *= 1000; // seconds → ms
  return n;
}

function buildTradeRow(payload: Record<string, unknown>): TradeRow {
  const wallet = String(payload.proxyWallet || payload.proxy_wallet || '').toLowerCase();
  const tsMs = parseTimestampMs(payload.timestamp);
  const txHash = String(payload.transactionHash || payload.transaction_hash || '') || null;
  const tradeId = txHash || `${wallet}-${payload.asset || 'a'}-${payload.conditionId || payload.condition_id || 'c'}-${tsMs}`;

  return {
    trade_id: tradeId,
    trader_wallet: wallet,
    trader_id: null,
    transaction_hash: txHash,
    asset: String(payload.asset || '') || null,
    condition_id: String(payload.conditionId || payload.condition_id || ''),
    market_slug: String(payload.slug || payload.market_slug || '') || null,
    event_slug: String(payload.eventSlug || payload.event_slug || '') || null,
    market_title: String(payload.title || payload.market_title || '') || null,
    side: normalizeSide(String(payload.side || '')),
    outcome: normalizeOutcome(String(payload.outcome || '')),
    outcome_index: toFiniteNumber(payload.outcomeIndex ?? payload.outcome_index),
    size: toFiniteNumber(payload.size),
    price: toFiniteNumber(payload.price),
    trade_timestamp: new Date(tsMs).toISOString(),
    raw: payload,
    ingested_at: new Date().toISOString(),
  };
}

function queueTradeWrite(payload: Record<string, unknown>): void {
  if (!supabaseClient) return;
  const conditionId = payload.conditionId || payload.condition_id;
  if (!conditionId) return;
  tradeBuffer.push(buildTradeRow(payload));
  if (tradeBuffer.length >= BUFFER_MAX_SIZE) {
    void flushTradeBuffer();
  }
}

async function flushTradeBuffer(): Promise<void> {
  if (tradeBuffer.length === 0 || !supabaseClient) return;
  const batch = tradeBuffer.splice(0);
  try {
    const { error } = await supabaseClient
      .from('trades_public')
      .upsert(batch, { onConflict: 'trade_id', ignoreDuplicates: true });
    if (error) {
      console.error(`[trades_public] Upsert failed (${batch.length} rows):`, error.message);
    }
  } catch (err) {
    console.error('[trades_public] Flush error:', err);
  }
}

setInterval(() => void flushTradeBuffer(), BUFFER_FLUSH_INTERVAL_MS);

// --- Pending LT order tracking (for WebSocket fill detection) ---
type PendingLtOrder = { lt_order_id: string; strategy_id: string; user_id: string };
let pendingLtOrders = new Map<string, PendingLtOrder>();
let lastPendingFetch = 0;
const PENDING_REFRESH_MS = 60_000;

async function refreshPendingLtOrders(): Promise<void> {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('lt_orders')
      .select('lt_order_id, strategy_id, user_id, order_id')
      .in('status', ['PENDING', 'PARTIAL'])
      .not('order_id', 'is', null);
    if (error) {
      console.error('[worker] Failed to fetch pending LT orders:', error.message);
      return;
    }
    pendingLtOrders = new Map();
    for (const row of data || []) {
      if (row.order_id) {
        pendingLtOrders.set(row.order_id, {
          lt_order_id: row.lt_order_id,
          strategy_id: row.strategy_id,
          user_id: row.user_id,
        });
      }
    }
    lastPendingFetch = Date.now();
    if (pendingLtOrders.size > 0) {
      console.log(`[worker] Tracking ${pendingLtOrders.size} pending LT orders for fill detection`);
    }
  } catch (err) {
    console.error('[worker] Error refreshing pending LT orders:', err);
  }
}

async function ensurePendingLtOrders(): Promise<void> {
  if (Date.now() - lastPendingFetch > PENDING_REFRESH_MS) {
    await refreshPendingLtOrders();
  }
}

async function notifyWsFill(orderId: string): Promise<void> {
  try {
    const url = `${config.apiBaseUrl}/api/lt/ws-fill`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.cronSecret) headers['Authorization'] = `Bearer ${config.cronSecret}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ order_id: orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.updated) {
      console.log(`[ws-fill] Real-time fill: ${orderId} → ${data.new_status} (fill_rate=${data.fill_rate})`);
      pendingLtOrders.delete(orderId);
    }
  } catch (err) {
    console.error(`[ws-fill] Notification failed for ${orderId}:`, err);
  }
}

// --- Target traders management ---

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

      const conditionId = payload.conditionId || payload.condition_id;
      if (!conditionId) return;

      const proxyWallet = String(payload.proxyWallet || payload.proxy_wallet || '').toLowerCase();

      const side = String(payload.side || '').toUpperCase();

      void (async () => {
        // --- LT fill detection: check orders_matched for our pending orders ---
        if (message.type === 'orders_matched') {
          await ensurePendingLtOrders();
          if (pendingLtOrders.size > 0) {
            const matchedOrderIds: string[] = [];
            const takerOrderId = payload.takerOrderId || payload.taker_order_id;
            if (typeof takerOrderId === 'string' && pendingLtOrders.has(takerOrderId)) {
              matchedOrderIds.push(takerOrderId);
            }
            const makerOrderId = payload.makerOrderId || payload.maker_order_id;
            if (typeof makerOrderId === 'string' && pendingLtOrders.has(makerOrderId)) {
              matchedOrderIds.push(makerOrderId);
            }
            const makerOrders = payload.makerOrders || payload.maker_orders;
            if (Array.isArray(makerOrders)) {
              for (const mo of makerOrders) {
                const moId = (mo as any)?.orderId || (mo as any)?.order_id;
                if (typeof moId === 'string' && pendingLtOrders.has(moId)) {
                  matchedOrderIds.push(moId);
                }
              }
            }
            for (const oid of matchedOrderIds) {
              void notifyWsFill(oid);
            }
          }
        }

        // --- Feed + FT execution ---
        if (!proxyWallet) return;

        const traders = await ensureTargetTraders();
        await ensureFollowedTraders();

        const isTarget = traders.has(proxyWallet);
        const isFollowed = followedTraders.has(proxyWallet);
        if (!isTarget && !isFollowed) return;

        queueTradeWrite(payload);

        if (isTarget && side === 'BUY') {
          await callSyncTrade(payload);
        }
      })();
    },
    onConnect: (c: { subscribe: (opts: { subscriptions: Array<{ topic: string; type: string }> }) => void }) => {
      console.log('[worker] Connected to Polymarket WebSocket');
      void Promise.all([ensureTargetTraders(), ensureFollowedTraders(), refreshPendingLtOrders()]).then(() => {
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
