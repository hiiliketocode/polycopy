/**
 * Alpha Agent - Dome API Tool
 * 
 * Read-only access to the Dome API for live market data:
 * - Market lookup by condition_id, slug, or search
 * - Current prices and volumes
 * - Market metadata (start/end times, tags, resolution)
 * - Event groupings
 */

const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1';
const DOME_API_KEY = process.env.DOME_API_KEY || null;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (DOME_API_KEY) headers.Authorization = `Bearer ${DOME_API_KEY}`;
  return headers;
}

export interface DomeMarketResult {
  condition_id: string;
  title: string;
  market_slug: string;
  event_slug: string | null;
  status: string;
  start_time: number | null;
  end_time: number | null;
  game_start_time: string | null;
  tags: unknown;
  volume_total: number | null;
  side_a: unknown;
  side_b: unknown;
  winning_side: string | null;
  description: string | null;
}

/**
 * Look up markets by condition IDs
 */
export async function domeGetMarkets(conditionIds: string[]): Promise<{
  success: boolean;
  markets?: DomeMarketResult[];
  error?: string;
}> {
  if (conditionIds.length === 0) return { success: true, markets: [] };

  try {
    const url = new URL(`${DOME_BASE_URL}/polymarket/markets`);
    conditionIds.slice(0, 20).forEach(id => url.searchParams.append('condition_id', id));
    url.searchParams.set('limit', String(Math.min(100, conditionIds.length)));

    const res = await fetch(url.toString(), { headers: getHeaders(), cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Dome API ${res.status}: ${body.substring(0, 200)}` };
    }

    const json = await res.json();
    const markets = Array.isArray(json?.markets) ? json.markets : [];
    return { success: true, markets };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Search markets by keyword (uses Gamma API as Dome doesn't have text search)
 */
export async function domeSearchMarkets(query: string, limit: number = 10): Promise<{
  success: boolean;
  markets?: Record<string, unknown>[];
  error?: string;
}> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?closed=false&limit=${limit}&title_contains=${encodeURIComponent(query)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { success: false, error: `Gamma API ${res.status}` };

    const markets = await res.json();
    const results = (Array.isArray(markets) ? markets : []).map((m: Record<string, unknown>) => ({
      condition_id: m.conditionId || m.condition_id,
      title: m.question || m.title,
      slug: m.slug || m.market_slug,
      end_date: m.endDate || m.end_date,
      volume: m.volume,
      outcomes: m.outcomes,
      outcome_prices: m.outcomePrices,
      closed: m.closed,
    }));

    return { success: true, markets: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get current price for a specific market
 */
export async function domeGetPrice(conditionId: string): Promise<{
  success: boolean;
  price?: { outcomes: string[]; prices: number[]; volume: number | null };
  error?: string;
}> {
  try {
    const url = `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { success: false, error: `Gamma API ${res.status}` };

    const data = await res.json();
    const m = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!m) return { success: false, error: 'Market not found' };

    let outcomes = m.outcomes;
    let prices = m.outcomePrices;
    if (typeof outcomes === 'string') try { outcomes = JSON.parse(outcomes); } catch { outcomes = []; }
    if (typeof prices === 'string') try { prices = JSON.parse(prices); } catch { prices = []; }

    return {
      success: true,
      price: {
        outcomes: Array.isArray(outcomes) ? outcomes : [],
        prices: Array.isArray(prices) ? prices.map(Number) : [],
        volume: m.volume ? Number(m.volume) : null,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const DOME_API_DESCRIPTION = `### Dome/Gamma API (Live Market Data)
You can look up any Polymarket market in real-time:
- Search markets by keyword (e.g., "NBA Finals", "Bitcoin 100k")
- Get current prices and volumes for any market by condition_id
- Get market metadata (start/end times, tags, resolution status)
This lets you investigate specific markets your bots are trading.`;
