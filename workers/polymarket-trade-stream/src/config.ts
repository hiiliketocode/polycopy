/**
 * Configuration for the Polymarket trade stream worker.
 * Uses env vars: API_BASE_URL, CRON_SECRET
 */

export const config = {
  /** Base URL of the PolyCopy API (e.g. https://your-app.vercel.app) */
  apiBaseUrl: process.env.API_BASE_URL
    ? process.env.API_BASE_URL.startsWith('http')
      ? process.env.API_BASE_URL
      : `https://${process.env.API_BASE_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000',

  /** Auth: Bearer token for CRON_SECRET when calling sync-trade */
  cronSecret: process.env.CRON_SECRET || '',

  /** Supabase credentials for direct DB writes (trades_public, follows) */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  /** Reconnect delay (ms) after WebSocket disconnect */
  reconnectDelayMs: 5000,

  /** Refresh target traders cache every N minutes */
  traderCacheRefreshMinutes: 5,

  /** Circuit breaker: open after this many consecutive 5xx/timeouts */
  circuitBreakerFailureThreshold: 5,

  /** Circuit breaker: stay open for this many seconds before half-open */
  circuitBreakerOpenSeconds: 60,

  /** Circuit breaker: request timeout (ms) — treat as failure */
  circuitBreakerTimeoutMs: 15_000,
};
