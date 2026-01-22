type DomeMarket = Record<string, any>;

const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1';

const toIsoFromUnix = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds)) return null;
  return new Date((seconds as number) * 1000).toISOString();
};

const toIsoFromGameStart = (raw: string | null | undefined) => {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const withZone = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export const mapDomeMarketToRow = (market: DomeMarket) => {
  const startIso = toIsoFromUnix(market?.start_time);
  const endIso = toIsoFromUnix(market?.end_time);
  const completedIso = toIsoFromUnix(market?.completed_time);
  const closeIso = toIsoFromUnix(market?.close_time);
  const gameStartIso = toIsoFromGameStart(market?.game_start_time);

  return {
    condition_id: market?.condition_id ?? null,
    market_slug: market?.market_slug ?? null,
    event_slug: market?.event_slug ?? null,
    title: market?.title ?? null,
    start_time_unix: Number.isFinite(market?.start_time) ? market.start_time : null,
    end_time_unix: Number.isFinite(market?.end_time) ? market.end_time : null,
    completed_time_unix: Number.isFinite(market?.completed_time) ? market.completed_time : null,
    close_time_unix: Number.isFinite(market?.close_time) ? market.close_time : null,
    game_start_time_raw: market?.game_start_time ?? null,
    start_time: startIso,
    end_time: endIso,
    completed_time: completedIso,
    close_time: closeIso,
    game_start_time: gameStartIso,
    tags: market?.tags ?? null,
    volume_1_week: market?.volume_1_week ?? null,
    volume_1_month: market?.volume_1_month ?? null,
    volume_1_year: market?.volume_1_year ?? null,
    volume_total: market?.volume_total ?? null,
    resolution_source: market?.resolution_source ?? null,
    image: market?.image ?? null,
    description: market?.description ?? null,
    negative_risk_id: market?.negative_risk_id ?? null,
    side_a: market?.side_a ?? null,
    side_b: market?.side_b ?? null,
    winning_side: market?.winning_side ?? null,
    status: market?.status ?? null,
    extra_fields: market?.extra_fields ?? null,
    raw_dome: market ?? {},
    updated_at: new Date().toISOString(),
  };
};

export const pickMarketStartTime = (row: Record<string, any> | null | undefined) =>
  row?.game_start_time || row?.start_time || null;

export const pickMarketEndTime = (row: Record<string, any> | null | undefined) =>
  row?.end_time || row?.close_time || row?.completed_time || null;

export const fetchDomeMarketsByConditionIds = async (
  conditionIds: string[],
  options?: { apiKey?: string | null }
) => {
  if (!conditionIds.length) return [];
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`);
  conditionIds.forEach((id) => url.searchParams.append('condition_id', id));
  url.searchParams.set('limit', String(Math.min(100, conditionIds.length)));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options?.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const res = await fetch(url.toString(), { headers, cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Dome request failed (${res.status}): ${body || res.statusText}`);
  }
  const json = await res.json();
  return Array.isArray(json?.markets) ? json.markets : [];
};
