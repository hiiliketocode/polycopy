type GammaMarket = Record<string, any>;

const GAMMA_BASE_URL = 'https://gamma-api.polymarket.com';

const toIso = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toUnixSeconds = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

function parseJsonField(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val ?? null;
}

function deriveStatus(m: GammaMarket): string {
  if (m.resolvedBy) return 'resolved';
  if (m.closed) return 'closed';
  if (m.active) return 'active';
  return 'unknown';
}

function deriveWinningSide(m: GammaMarket): string | null {
  if (!m.resolvedBy) return null;
  const prices = parseJsonField(m.outcomePrices);
  const outcomes = parseJsonField(m.outcomes);
  if (!Array.isArray(prices) || !Array.isArray(outcomes)) return null;
  const numPrices = prices.map(Number);
  const winIdx = numPrices.indexOf(1);
  if (winIdx >= 0 && winIdx < outcomes.length) return outcomes[winIdx];
  const maxIdx = numPrices.reduce((best, p, i) => (p > numPrices[best] ? i : best), 0);
  return numPrices[maxIdx] > 0.99 && maxIdx < outcomes.length ? outcomes[maxIdx] : null;
}

/**
 * Maps a Gamma API market response to the same row shape as mapDomeMarketToRow,
 * so it can be upserted into the `markets` table with the existing schema.
 */
export const mapGammaMarketToRow = (market: GammaMarket) => {
  const startIso = toIso(market?.startDate);
  const endIso = toIso(market?.endDate);
  const closedTimeIso = toIso(market?.closedTime);
  const outcomes = parseJsonField(market?.outcomes);

  return {
    condition_id: market?.conditionId ?? null,
    market_slug: market?.slug ?? null,
    event_slug: null as string | null,
    title: market?.question ?? null,
    start_time_unix: toUnixSeconds(market?.startDate),
    end_time_unix: toUnixSeconds(market?.endDate),
    completed_time_unix: market?.closedTime ? toUnixSeconds(market.closedTime) : null,
    close_time_unix: market?.closedTime ? toUnixSeconds(market.closedTime) : null,
    game_start_time_raw: null as string | null,
    start_time: startIso,
    end_time: endIso,
    completed_time: closedTimeIso,
    close_time: closedTimeIso,
    game_start_time: null as string | null,
    tags: null as unknown,
    volume_1_week: market?.volume1wk != null ? Number(market.volume1wk) : null,
    volume_1_month: market?.volume1mo != null ? Number(market.volume1mo) : null,
    volume_1_year: market?.volume1yr != null ? Number(market.volume1yr) : null,
    volume_total: market?.volume != null ? Number(market.volume) : null,
    resolution_source: market?.resolutionSource ?? null,
    image: market?.image ?? null,
    description: market?.description ?? null,
    negative_risk_id: market?.negRisk ? (market.clobTokenIds ?? null) : null,
    side_a: Array.isArray(outcomes) && outcomes.length >= 1 ? outcomes[0] : null,
    side_b: Array.isArray(outcomes) && outcomes.length >= 2 ? outcomes[1] : null,
    winning_side: deriveWinningSide(market),
    status: deriveStatus(market),
    extra_fields: null as unknown,
    raw_dome: market ?? {},
    updated_at: new Date().toISOString(),
  };
};

/**
 * Enrich a market row with event-level data (tags, event_slug, image).
 * Call after mapGammaMarketToRow if event data is available.
 */
export const enrichRowWithEvent = (
  row: ReturnType<typeof mapGammaMarketToRow>,
  event: Record<string, any>
) => {
  if (event.slug) row.event_slug = event.slug;
  if (event.tags && !row.tags) row.tags = event.tags;
  if (event.image && !row.image) row.image = event.image;
  return row;
};

/**
 * Fetch markets from the free Gamma API by condition IDs.
 * Drop-in replacement for fetchDomeMarketsByConditionIds.
 */
export const fetchGammaMarketsByConditionIds = async (
  conditionIds: string[]
): Promise<GammaMarket[]> => {
  if (!conditionIds.length) return [];

  const results: GammaMarket[] = [];

  for (const id of conditionIds) {
    const url = `${GAMMA_BASE_URL}/markets?condition_id=${encodeURIComponent(id)}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = await res.json();
      const markets = Array.isArray(data) ? data : [];
      if (markets.length > 0) results.push(markets[0]);
    } catch {
      continue;
    }
  }

  return results;
};

/**
 * Fetch event data for a market slug to get tags, event_slug, etc.
 */
export const fetchGammaEvent = async (
  slug: string
): Promise<Record<string, any> | null> => {
  try {
    const res = await fetch(
      `${GAMMA_BASE_URL}/events?slug=${encodeURIComponent(slug)}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
};

/**
 * Resolve game_start_time for a sports market using the ESPN engine.
 * Returns an ISO timestamp or null if the market isn't sports or no match found.
 * Designed to be called after caching a new market to populate game_start_time.
 */
export const resolveGameStartTime = async (
  title: string | null,
  tags: unknown,
  conditionId: string | null,
  slug: string | null,
  endDate: string | null,
): Promise<string | null> => {
  if (!title) return null;

  try {
    const { getESPNScoreForTrade } = await import('@/lib/espn/scores');

    const trade = {
      id: conditionId ?? 'tmp',
      trader: { wallet: '', displayName: '' },
      market: {
        conditionId: conditionId ?? undefined,
        title,
        slug: slug ?? '',
        tags,
      },
      trade: {
        side: 'BUY' as const,
        outcome: '',
        size: 0,
        price: 0,
        timestamp: Date.now(),
      },
    };

    const result = await getESPNScoreForTrade(trade);
    if (result?.startTime) {
      const parsed = new Date(result.startTime);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
  } catch {
    return null;
  }
};

export { pickMarketStartTime, pickMarketEndTime } from './dome';
