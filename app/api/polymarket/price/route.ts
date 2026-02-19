// Proxy API for fetching Polymarket prices (single source of truth for live pricing).
// Returns MARKET price (CLOB/Gamma order book / token price), not execution price — execution price comes from the CLOB order/fill response when you place an order.
//
// Live pricing flow (do not bypass; all UIs should use this endpoint or DB written by it):
// 1. DB-first: if markets.outcome_prices + last_price_updated_at within caller's maxAgeMs (tier), return that.
// 2. Else: fetch Gamma; if Gamma has placeholder (e.g. all 0.5), try CLOB and use CLOB if real.
// 3. Return chosen prices; write back to markets via updateMarketsPriceCache so next request can use DB.
// 4. In-memory cache (short TTL) reduces duplicate Gamma/CLOB calls; DB is the durable cache.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchGammaMarketsByConditionIds,
  mapGammaMarketToRow,
  enrichRowWithEvent,
  fetchGammaEvent,
  resolveGameStartTime,
  pickMarketEndTime,
  pickMarketStartTime,
} from '@/lib/markets/gamma';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ── Freshness tiers (contextual per use case) ──
// Callers pass tier= or maxAgeMs=; DB and in-memory cache use this to decide "fresh enough".
// See docs/PRICE_FRESHNESS_TIERS.md for every caller and tier.
export const PRICE_FRESHNESS_TIERS_MS: Record<string, number> = {
  T1: 30_000,       // Execution: trade-execute, LT/FT when placing orders, bots when trading (market price for sizing)
  T2a: 250,         // Feed (live): feed table + cards; 250ms so display feels real-time
  T2b: 15_000,      // Portfolio / profile / trader / discover
  T3: 120_000,      // Dashboard: portfolio stats, FT list, FT wallet [id], trader my-stats
  T4: 600_000,      // Background: crons, analytics (10 min)
};
const DEFAULT_FRESHNESS_MS = PRICE_FRESHNESS_TIERS_MS.T2b; // 15s when caller doesn't specify

// ── In-memory price cache ──
// Keyed by conditionId. TTL respects caller's maxAgeMs so feed (250ms) gets fresher data than dashboard (2min).
const PRICE_CACHE_TTL_MS = 3_000; // upper bound when caller asks for very fresh
const MAX_CACHE_SIZE = 2000;

type CachedPrice = { response: any; cachedAt: number };
const priceCache = new Map<string, CachedPrice>();

// Request coalescing: if another request for the same conditionId is in-flight,
// await the same promise instead of making a duplicate API call.
const inFlightRequests = new Map<string, Promise<Response>>();

function getCachedPrice(key: string, maxAgeMs?: number): any | null {
  const entry = priceCache.get(key);
  if (!entry) return null;
  const ttl = maxAgeMs != null ? Math.min(PRICE_CACHE_TTL_MS, maxAgeMs) : PRICE_CACHE_TTL_MS;
  if (Date.now() - entry.cachedAt > ttl) {
    priceCache.delete(key);
    return null;
  }
  return entry.response;
}

function setCachedPrice(key: string, response: any): void {
  if (priceCache.size >= MAX_CACHE_SIZE) {
    const oldest = priceCache.keys().next().value;
    if (oldest) priceCache.delete(oldest);
  }
  priceCache.set(key, { response, cachedAt: Date.now() });
}

// Fire-and-forget: write prices to markets.outcome_prices for crons/snapshots
function updateMarketsPriceCache(
  conditionId: string,
  outcomePrices: any,
  outcomes: any,
  closed?: boolean,
  resolved?: boolean,
) {
  if (!supabaseAdmin || !conditionId) return;
  const now = new Date().toISOString();
  const pricePayload: Record<string, any> = {
    outcome_prices: { outcomes, outcomePrices },
    last_price_updated_at: now,
    last_requested_at: now,
  };
  if (typeof closed === 'boolean') pricePayload.closed = closed;
  if (typeof resolved === 'boolean' && resolved) {
    pricePayload.resolved_outcome = 'resolved';
  }
  void supabaseAdmin
    .from('markets')
    .update(pricePayload)
    .eq('condition_id', conditionId)
    .then(({ error }) => {
      if (error) console.warn('[Price API] Side-effect DB write failed:', error.message);
    });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conditionId = searchParams.get('conditionId');
  const slug = searchParams.get('slug');
  const eventSlug = searchParams.get('eventSlug');
  const title = searchParams.get('title');
  const tierParam = searchParams.get('tier');
  const maxAgeParam = searchParams.get('maxAgeMs');
  const maxAgeMs =
    maxAgeParam != null && /^\d+$/.test(maxAgeParam)
      ? Math.min(Number(maxAgeParam), PRICE_CACHE_TTL_MS * 2)
      : tierParam && PRICE_FRESHNESS_TIERS_MS[tierParam] != null
        ? PRICE_FRESHNESS_TIERS_MS[tierParam]
        : DEFAULT_FRESHNESS_MS;

  // ── Fast path: return from in-memory cache if fresh for this tier ──
  const cacheKey = conditionId || slug || title || '';
  if (cacheKey) {
    const cached = getCachedPrice(cacheKey, maxAgeMs);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Request coalescing: if another request for this market is in-flight, await it
    const pending = inFlightRequests.get(cacheKey);
    if (pending) {
      try {
        const result = await pending;
        const body = await result.clone().json();
        return NextResponse.json(body);
      } catch {
        // If the pending request failed, fall through to fetch fresh
      }
    }
  }

  // DB-first: if we have outcome_prices in markets table fresh within maxAgeMs, use them
  if (conditionId) {
    const freshResponse = await tryFreshPriceFromDb(maxAgeMs);
    if (freshResponse) return freshResponse;
  }

  const normalizeEndDate = (value: any) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  };

  const pickFirstString = (...values: Array<string | null | undefined>) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value;
    }
    return null;
  };

  const CRYPTO_SYMBOLS = [
    { symbol: 'BTC', tokens: ['bitcoin', 'btc'] },
    { symbol: 'ETH', tokens: ['ethereum', 'eth'] },
    { symbol: 'SOL', tokens: ['solana', 'sol'] },
    { symbol: 'DOGE', tokens: ['dogecoin', 'doge'] },
    { symbol: 'ADA', tokens: ['cardano', 'ada'] },
    { symbol: 'XRP', tokens: ['ripple', 'xrp'] },
    { symbol: 'BNB', tokens: ['binance', 'bnb'] },
    { symbol: 'MATIC', tokens: ['polygon', 'matic'] },
    { symbol: 'AVAX', tokens: ['avalanche', 'avax'] },
    { symbol: 'LTC', tokens: ['litecoin', 'ltc'] },
    { symbol: 'DOT', tokens: ['polkadot', 'dot'] },
    { symbol: 'LINK', tokens: ['chainlink', 'link'] },
    { symbol: 'UNI', tokens: ['uniswap', 'uni'] },
    { symbol: 'ATOM', tokens: ['cosmos', 'atom'] },
    { symbol: 'ARB', tokens: ['arbitrum', 'arb'] },
    { symbol: 'OP', tokens: ['optimism', 'op'] },
    { symbol: 'NEAR', tokens: ['near'] },
    { symbol: 'SUI', tokens: ['sui'] },
    { symbol: 'APT', tokens: ['aptos', 'apt'] },
    { symbol: 'ALGO', tokens: ['algorand', 'algo'] },
    { symbol: 'FTM', tokens: ['fantom', 'ftm'] },
    { symbol: 'TRX', tokens: ['tron', 'trx'] },
  ];

  const buildTokenRegex = (token: string) =>
    new RegExp(`(^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');

  const detectCryptoSymbol = (value?: string | null) => {
    if (!value) return null;
    const lower = value.toLowerCase();
    for (const entry of CRYPTO_SYMBOLS) {
      if (entry.tokens.some((token) => buildTokenRegex(token).test(lower))) {
        return entry.symbol;
      }
    }
    return null;
  };

  const fetchCryptoSpotPrice = async (symbol: string) => {
    try {
      const response = await fetch(
        `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`,
        { cache: 'no-store' }
      );
      if (!response.ok) return null;
      const data = await response.json();
      const amount = Number(data?.data?.amount);
      return Number.isFinite(amount) ? amount : null;
    } catch {
      return null;
    }
  };

  const loadCachedMarket = async (includePrices = false) => {
    if (!supabaseAdmin || !conditionId) return null;
    const columns = [
      'condition_id',
      'market_slug',
      'event_slug',
      'title',
      'start_time',
      'end_time',
      'close_time',
      'completed_time',
      'game_start_time',
      'status',
      'winning_side',
      'image',
      'description',
      'tags',
      'espn_url',
      'espn_game_id',
      'espn_last_checked',
    ];
    if (includePrices) {
      columns.push('outcome_prices', 'last_price_updated_at', 'closed');
    }
    const { data, error } = await supabaseAdmin
      .from('markets')
      .select(columns.join(','))
      .eq('condition_id', conditionId)
      .maybeSingle();
    if (error) {
      console.warn('[Price API] Failed to read market cache:', error.message || error);
      return null;
    }
    return data ?? null;
  };

  /** If we have outcome_prices in DB updated within maxAgeMs, return them (no Gamma/CLOB). */
  const tryFreshPriceFromDb = async (maxAgeMs: number): Promise<Response | null> => {
    if (!conditionId || !conditionId.startsWith('0x')) return null;
    const row = await loadCachedMarket(true) as any;
    const op = row?.outcome_prices;
    if (!op || typeof op !== 'object') return null;
    let outcomes: string[] | null = op.outcomes ?? op.labels ?? op.choices ?? null;
    let outcomePrices: number[] | null = Array.isArray(op.outcomePrices) ? op.outcomePrices : Array.isArray(op.prices) ? op.prices : Array.isArray(op.probabilities) ? op.probabilities : null;
    if ((!outcomes || !Array.isArray(outcomes)) && op && typeof op === 'object' && !Array.isArray(op)) {
      const keys = Object.keys(op).filter((k) => !['outcomes', 'outcomePrices', 'prices', 'labels', 'choices', 'probabilities'].includes(k));
      if (keys.length > 0) {
        const vals = keys.map((k) => Number((op as Record<string, unknown>)[k]));
        if (vals.every((n) => Number.isFinite(n))) {
          outcomes = keys;
          outcomePrices = vals;
        }
      }
    }
    if (!Array.isArray(outcomes) || !Array.isArray(outcomePrices) || outcomes.length === 0) return null;
    const last = row.last_price_updated_at ? new Date(row.last_price_updated_at).getTime() : 0;
    if (Number.isNaN(last) || Date.now() - last > maxAgeMs) return null;
    const closed = row.closed === true;
    const marketPayload = {
      conditionId,
      outcomes,
      outcomePrices: outcomePrices.map((p: any) => Number(p)),
      closed,
      resolved: closed,
      question: row.title,
      title: row.title,
      slug: row.market_slug,
      icon: row.image,
      image: row.image,
    };
    const response = { success: true, market: marketPayload };
    setCachedPrice(cacheKey, response);
    return NextResponse.json(response);
  };

  const ensureCachedMarket = async () => {
    const cached = await loadCachedMarket();
    if (cached || !conditionId || !supabaseAdmin) return cached;
    try {
      const markets = await fetchGammaMarketsByConditionIds([conditionId]);
      const market = markets[0];
      if (!market) return null;
      const row = mapGammaMarketToRow(market);
      if (!row.condition_id) return null;
      if (market.slug) {
        const event = await fetchGammaEvent(market.slug);
        if (event) enrichRowWithEvent(row, event);
      }
      const gameStart = await resolveGameStartTime(
        row.title,
        row.tags,
        row.condition_id,
        row.market_slug,
        row.end_time,
      );
      if (gameStart) {
        row.game_start_time = gameStart;
      }
      const { error } = await supabaseAdmin
        .from('markets')
        .upsert(row, { onConflict: 'condition_id' });
      if (error) {
        console.warn('[Price API] Failed to upsert market cache:', error.message || error);
        return null;
      }
      return await loadCachedMarket();
    } catch (error) {
      console.warn('[Price API] Failed to fetch Gamma market:', error);
      return null;
    }
  };

  const extractTeamsFromTitle = (value?: string | null) => {
    if (!value) return null;
    let workingTitle = value.trim();
    if (workingTitle.includes(':')) {
      const afterColon = workingTitle.split(':').slice(1).join(':').trim();
      if (/\b(vs\.?|v\.?|@|versus|at)\b/i.test(afterColon)) {
        workingTitle = afterColon;
      }
    }
    const cleaned = workingTitle
      .replace(/\s*\([-+]?\d+\.?\d*\)/g, '')
      .replace(/\s*(?:O\/U|Over\/Under|Over|Under)\s*\d+\.?\d*/gi, '')
      .replace(/\s*-\s*.*$/, '')
      .replace(/\s*\|\s*.*$/, '')
      .replace(/\s*:\s*.*$/, '')
      .trim();
    const match = cleaned.match(/(.+?)\s+(?:vs\.?|v\.?|@|versus|at)\s+(.+?)(?:\s|$)/i);
    if (!match) return null;
    return {
      homeTeam: match[1].trim(),
      awayTeam: match[2].trim(),
    };
  };

  const parseScoreLine = (value?: string | null) => {
    if (!value || typeof value !== 'string') return null;
    const matches = Array.from(value.matchAll(/(\d+)\s*-\s*(\d+)/g));
    if (matches.length === 0) return null;
    let chosen = matches[matches.length - 1];
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const home = Number.parseInt(matches[i][1], 10);
      const away = Number.parseInt(matches[i][2], 10);
      if (home !== 0 || away !== 0) {
        chosen = matches[i];
        break;
      }
    }
    return {
      home: Number.parseInt(chosen[1], 10),
      away: Number.parseInt(chosen[2], 10),
    };
  };

  const normalizeTagValue = (tag: any) => {
    if (!tag) return [];
    if (typeof tag === 'string') {
      return tag
        .split(/[|,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    if (typeof tag === 'number' || typeof tag === 'boolean') return [String(tag)];
    if (typeof tag === 'object') {
      const candidate =
        tag?.name ?? tag?.label ?? tag?.value ?? tag?.slug ?? tag?.title ?? null;
      if (typeof candidate === 'string') {
        return candidate
          .split(/[|,]/)
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
    }
    return [];
  };

  const normalizeTags = (tags: any) => {
    if (!tags) return [];
    if (Array.isArray(tags)) {
      return tags.flatMap((tag) => normalizeTagValue(tag));
    }
    return normalizeTagValue(tags);
  };

  const hasSportsTag = (tags: any) => {
    const normalizedTags = normalizeTags(tags)
      .map((tag) => String(tag).toLowerCase())
      .filter(Boolean);
    if (normalizedTags.length === 0) return false;
    return normalizedTags.some((normalized) => {
      return (
        normalized.includes('sports') ||
        normalized.includes('esport') ||
        normalized.includes('soccer') ||
        normalized.includes('football') ||
        normalized.includes('basketball') ||
        normalized.includes('baseball') ||
        normalized.includes('hockey') ||
        normalized.includes('tennis') ||
        normalized.includes('golf')
      );
    });
  };

  const ESPORTS_WIKI_MAP = [
    { wiki: 'counterstrike', tokens: ['cs2', 'cs:go', 'csgo', 'counter-strike', 'counter strike'] },
    { wiki: 'dota2', tokens: ['dota2', 'dota'] },
    { wiki: 'leagueoflegends', tokens: ['league of legends', 'lol'] },
    { wiki: 'valorant', tokens: ['valorant'] },
    { wiki: 'overwatch', tokens: ['overwatch'] },
    { wiki: 'rocketleague', tokens: ['rocket league'] },
    { wiki: 'fortnite', tokens: ['fortnite'] },
    { wiki: 'pubg', tokens: ['pubg'] },
    { wiki: 'callofduty', tokens: ['call of duty', 'cod'] },
  ];

  const pickEsportsWiki = (value: string) => {
    const lower = value.toLowerCase();
    for (const entry of ESPORTS_WIKI_MAP) {
      if (entry.tokens.some((token) => buildTokenRegex(token).test(lower))) {
        return entry.wiki;
      }
    }
    return 'esports';
  };

  const resolveEsportsPageUrl = async (query: string, wiki: string) => {
    if (!query) return null;
    const base = `https://liquipedia.net/${wiki}`;
    try {
      const apiUrl = `${base}/api.php?action=query&list=search&format=json&utf8=1&srlimit=1&srsearch=${encodeURIComponent(
        query
      )}`;
      const response = await fetch(apiUrl, { cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();
      const title = data?.query?.search?.[0]?.title;
      if (!title || typeof title !== 'string') return null;
      const slug = encodeURIComponent(title.replace(/ /g, '_'));
      return `${base}/${slug}`;
    } catch {
      return null;
    }
  };

  try {
    const cachedMarket = await ensureCachedMarket();
    // Type guard: ensure cachedMarket is a market object, not an error
    const market = cachedMarket && typeof cachedMarket === 'object' && !('code' in cachedMarket) && !('message' in cachedMarket) 
      ? cachedMarket as Record<string, any>
      : null;
    const cachedStartTime = pickMarketStartTime(cachedMarket);
    const cachedEndTime = pickMarketEndTime(cachedMarket);
    
    // Debug: Log if game_start_time exists but cachedStartTime is null
    if (market?.game_start_time && !cachedStartTime) {
      console.warn('[Price API] game_start_time exists in DB but pickMarketStartTime returned null:', {
        conditionId,
        game_start_time: market.game_start_time,
        gameStartTime: market.gameStartTime,
      });
    }
    const cachedEventStatus = market?.status || null;
    const cachedMarketAvatar = market?.image || null;
    let cachedEspnUrl = market?.espn_url || null;
    const cachedMarketSlug = market?.market_slug || null;
    const cachedEventSlug = market?.event_slug || null;
    const cachedDescription = market?.description || null;
    const cachedTags = market?.tags || null;
    const cachedTitle = market?.title || null;
    const cachedConditionId = market?.condition_id || null;

    if (!cachedEspnUrl && cachedEventSlug && supabaseAdmin) {
      try {
        const { data: eventMarket } = await supabaseAdmin
          .from('markets')
          .select('espn_url')
          .eq('event_slug', cachedEventSlug)
          .not('espn_url', 'is', null)
          .order('espn_last_checked', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (eventMarket?.espn_url) {
          cachedEspnUrl = eventMarket.espn_url;
          if (cachedConditionId) {
            await supabaseAdmin
              .from('markets')
              .update({
                espn_url: cachedEspnUrl,
                espn_last_checked: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('condition_id', cachedConditionId);
          }
        }
      } catch (error) {
        console.warn('[Price API] Failed to load event ESPN URL:', error);
      }
    }

    const looksLikeEsports = () => {
      const tagString = Array.isArray(cachedTags) ? cachedTags.join(' ') : String(cachedTags || '');
      const haystack = [
        cachedEventSlug,
        cachedMarketSlug,
        cachedTitle,
        title,
        tagString,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return Boolean(
        haystack.match(
          /\b(esports|e-sports|cs2|cs:go|counter-?strike|dota|dota2|league of legends|valorant|overwatch|rocket league|call of duty|cod|pubg|fortnite)\b/
        )
      );
    };

    const esportsFallbackUrl = (() => {
      if (!looksLikeEsports()) return null;
      const query =
        cachedTitle || cachedEventSlug || cachedMarketSlug || title || 'esports match';
      return query;
    })();

    const resolvedEsportsUrl =
      !cachedEspnUrl && esportsFallbackUrl
        ? await resolveEsportsPageUrl(
            esportsFallbackUrl,
            pickEsportsWiki(
              [
                cachedEventSlug,
                cachedMarketSlug,
                cachedTitle,
                title,
                Array.isArray(cachedTags) ? cachedTags.join(' ') : String(cachedTags || ''),
              ]
                .filter(Boolean)
                .join(' ')
            )
          )
        : null;

    const searchFallbackUrl =
      esportsFallbackUrl
        ? `https://liquipedia.net/esports/index.php?search=${encodeURIComponent(
            esportsFallbackUrl
          )}`
        : null;

    const resolvedGameUrl =
      cachedEspnUrl || resolvedEsportsUrl || searchFallbackUrl || null;
    const cryptoSymbol =
      detectCryptoSymbol(cachedEventSlug) ||
      detectCryptoSymbol(cachedMarketSlug) ||
      detectCryptoSymbol(cachedTitle) ||
      detectCryptoSymbol(title) ||
      null;
    const cryptoPriceUsd = cryptoSymbol ? await fetchCryptoSpotPrice(cryptoSymbol) : null;

    // Try 1: Gamma API by condition_id (primary)
    if (conditionId && conditionId.startsWith('0x')) {
      try {
        const gammaRes = await fetch(
          `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
          { cache: 'no-store' }
        );
        if (gammaRes.ok) {
          const gammaData = await gammaRes.json();
          const gammaMarket = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null;
          if (gammaMarket) {
            let pricesRaw = gammaMarket.outcomePrices ?? gammaMarket.outcome_prices ?? gammaMarket.prices;
            let outcomes = gammaMarket.outcomes;
            if (typeof pricesRaw === 'string') { try { pricesRaw = JSON.parse(pricesRaw); } catch { pricesRaw = null; } }
            if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; } }
            let prices = Array.isArray(pricesRaw) ? pricesRaw.map((p: any) => Number(p)) : null;
            const isPlaceholderPrices = prices && prices.length > 0 && prices.every((p: number) => p === 0.5);
            if (isPlaceholderPrices && conditionId) {
              try {
                const clobRes = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, { cache: 'no-store' });
                if (clobRes.ok) {
                  const clob = await clobRes.json();
                  if (Array.isArray(clob?.tokens) && clob.tokens.length > 0) {
                    const clobPrices = clob.tokens.map((t: any) => {
                      const p = t?.price;
                      return typeof p === 'number' ? p : (typeof p === 'string' ? parseFloat(p) : NaN);
                    });
                    if (clobPrices.some((p: number) => Number.isFinite(p) && p > 0.01 && p < 0.99)) {
                      prices = clobPrices;
                    }
                  }
                }
              } catch {
                /* keep Gamma placeholder if CLOB fails */
              }
            }
            if (outcomes && Array.isArray(outcomes) && prices && Array.isArray(prices)) {
              const endDateIso = cachedEndTime
                ? normalizeEndDate(cachedEndTime)
                : normalizeEndDate(gammaMarket.end_date_iso || gammaMarket.end_date || gammaMarket.endDate || null);
              const event = Array.isArray(gammaMarket?.events) && gammaMarket.events.length > 0 ? gammaMarket.events[0] : null;
              const marketAvatarUrl = pickFirstString(
                gammaMarket.icon,
                gammaMarket.image,
                event?.icon,
                event?.image,
                cachedMarketAvatar
              );

              const resolved =
                typeof gammaMarket.resolved === 'boolean'
                  ? gammaMarket.resolved
                  : typeof gammaMarket.is_resolved === 'boolean'
                    ? gammaMarket.is_resolved
                    : undefined;

              let gameStartTime = cachedStartTime || null;
              let eventStatus = cachedEventStatus || null;
              let score = null;
              let homeTeam = null;
              let awayTeam = null;
              if (event) {
                if (!eventStatus) {
                  if (event.live) eventStatus = 'live';
                  else if (event.ended) eventStatus = 'final';
                }
                if (event.score && (event.live || event.ended)) {
                  const parsedScore = parseScoreLine(event.score);
                  score = parsedScore ? parsedScore : event.score;
                }
                if (event.title) {
                  const teams = extractTeamsFromTitle(event.title);
                  if (teams) { homeTeam = teams.homeTeam; awayTeam = teams.awayTeam; }
                }
              }

              const responseBody = {
                success: true,
                market: {
                  question: gammaMarket.question,
                  conditionId: gammaMarket.conditionId || conditionId,
                  slug: gammaMarket.slug,
                  eventSlug: gammaMarket.event_slug || event?.slug || cachedEventSlug,
                  closed: gammaMarket.closed,
                  resolved,
                  outcomePrices: prices,
                  outcomes: outcomes,
                  endDateIso,
                  gameStartTime,
                  marketAvatarUrl,
                  eventStatus,
                  score,
                  homeTeam,
                  awayTeam,
                  espnUrl: resolvedGameUrl,
                  cryptoSymbol,
                  cryptoPriceUsd,
                }
              };

              if (cacheKey) setCachedPrice(cacheKey, responseBody);
              updateMarketsPriceCache(conditionId, prices, outcomes, gammaMarket.closed, resolved);
              return NextResponse.json(responseBody);
            }
          }
        }
      } catch (err) {
        console.warn('[Price API] Gamma by condition_id failed, trying CLOB fallback:', err);
      }
    }

    // Try 2: CLOB API fallback (only when Gamma fails)
    if (conditionId && conditionId.startsWith('0x')) {
      console.log(`[Price API] CLOB fallback for conditionId: ${conditionId}`);
      const response = await fetch(
        `https://clob.polymarket.com/markets/${conditionId}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const market = await response.json();
        
        if (market.tokens && Array.isArray(market.tokens)) {
          const outcomes = market.tokens.map((t: any) => t.outcome);
          const prices = market.tokens.map((t: any) => t.price.toString());
          
          // Market prices are public data - safe to log summary
          console.log(`[Price API] Fetched ${prices?.length || 0} prices for ${outcomes?.length || 0} outcomes`);
          
          const resolved =
            typeof market.resolved === 'boolean'
              ? market.resolved
              : typeof market.is_resolved === 'boolean'
                ? market.is_resolved
                : typeof market.isResolved === 'boolean'
                  ? market.isResolved
                  : undefined;
          
          // Use end_time (actual resolution date) for the "Resolves" badge
          // end_time = when market resolves, close_time = when betting stops (may be earlier)
          let endDateIso = cachedEndTime 
            ? normalizeEndDate(cachedEndTime)
            : normalizeEndDate(market.end_date_iso || market.end_date || market.endDate || market.close_date_iso || market.close_date || market.closeDate || null);
          let marketAvatarUrl = pickFirstString(market.icon, market.image, cachedMarketAvatar);

          if (!endDateIso || !marketAvatarUrl) {
            try {
              const gammaResponse = await fetch(
                `https://gamma-api.polymarket.com/markets?condition_id=${conditionId}`,
                { cache: 'no-store' }
              );
              if (gammaResponse.ok) {
                const gammaData = await gammaResponse.json();
                const gammaMarket = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null;
                const gammaEvent =
                  gammaMarket && Array.isArray(gammaMarket.events) && gammaMarket.events.length > 0
                    ? gammaMarket.events[0]
                    : null;
                if (gammaMarket) {
                  if (!endDateIso) {
                    endDateIso = normalizeEndDate(
                      gammaMarket.end_date_iso ||
                        gammaMarket.end_date ||
                        gammaMarket.endDate ||
                        gammaMarket.close_time ||
                        null
                    );
                  }
                  if (!marketAvatarUrl) {
                    marketAvatarUrl = pickFirstString(
                      marketAvatarUrl,
                      gammaMarket?.icon,
                      gammaMarket?.image,
                      gammaMarket?.twitterCardImage,
                      gammaMarket?.twitter_card_image,
                      gammaEvent?.icon,
                      gammaEvent?.image
                    );
                  }
                }
              }
            } catch (error) {
              console.warn('[Price API] Gamma end date fallback failed:', error);
            }
          }

          let score = market.score || market.live_score || null;
          let homeTeam = market.home_team || null;
          let awayTeam = market.away_team || null;
          let eventStatus = market.event_status || market.status || cachedEventStatus || null;
          // ONLY use game_start_time from markets table (cachedStartTime), no fallbacks
          // cachedStartTime comes from pickMarketStartTime which uses game_start_time from DB
          let gameStartTime = cachedStartTime || null;

          const resolvedMarketSlug = market.market_slug || cachedMarketSlug || slug || null;
          const resolvedEventSlug = cachedEventSlug || eventSlug || null;
          const resolvedDescription = market.description || cachedDescription || null;
          const resolvedTags = market.tags ?? cachedTags ?? null;

          const shouldFetchGammaEvent =
            Boolean(resolvedMarketSlug) &&
            (hasSportsTag(resolvedTags) || Boolean(gameStartTime)) &&
            (!score || !homeTeam || !awayTeam || !eventStatus);
          const shouldFetchGammaMarket =
            Boolean(resolvedMarketSlug) && (shouldFetchGammaEvent || !marketAvatarUrl);

          if (shouldFetchGammaMarket) {
            try {
              const gammaResponse = await fetch(
                `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(resolvedMarketSlug)}`,
                { cache: 'no-store' }
              );
              if (gammaResponse.ok) {
                const gammaData = await gammaResponse.json();
                const gammaMarket = Array.isArray(gammaData) && gammaData.length > 0 ? gammaData[0] : null;
                const event =
                  gammaMarket && Array.isArray(gammaMarket.events) && gammaMarket.events.length > 0
                    ? gammaMarket.events[0]
                    : null;

                marketAvatarUrl = pickFirstString(
                  marketAvatarUrl,
                  gammaMarket?.icon,
                  gammaMarket?.image,
                  gammaMarket?.twitterCardImage,
                  gammaMarket?.twitter_card_image,
                  event?.icon,
                  event?.image
                );

                // Don't override gameStartTime from database with Gamma API data
                // Only use game_start_time from markets table

                if (!endDateIso) {
                  endDateIso = normalizeEndDate(event?.endDate || null);
                }

                if (!eventStatus && event) {
                  if (event.live) eventStatus = 'live';
                  else if (event.ended) eventStatus = 'final';
                }

                if ((!homeTeam || !awayTeam) && event?.title) {
                  const teams = extractTeamsFromTitle(event.title);
                  if (teams) {
                    homeTeam = teams.homeTeam;
                    awayTeam = teams.awayTeam;
                  }
                }

                if (!score && event?.score && (event.live || event.ended)) {
                  const parsedScore = parseScoreLine(event.score);
                  score = parsedScore ? parsedScore : event.score;
                }
              }
            } catch (error) {
              console.warn('[Price API] Gamma event fallback failed:', error);
            }
          }

          if ((!marketAvatarUrl || !gameStartTime || !endDateIso || !eventStatus || !score) && (resolvedEventSlug || slug)) {
            try {
              const gammaEventResponse = await fetch(
                `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(resolvedEventSlug || slug || '')}`,
                { cache: 'no-store' }
              );
              if (gammaEventResponse.ok) {
                const gammaEventData = await gammaEventResponse.json();
                const gammaEvent = Array.isArray(gammaEventData)
                  ? gammaEventData[0]
                  : gammaEventData?.results?.[0];
                if (gammaEvent) {
                  if (!marketAvatarUrl) {
                    marketAvatarUrl = pickFirstString(
                      marketAvatarUrl,
                      gammaEvent?.icon,
                      gammaEvent?.image
                    );
                  }
                  // Don't override gameStartTime from database with Gamma API data
                  // Only use game_start_time from markets table
                  if (!endDateIso) {
                    endDateIso = normalizeEndDate(gammaEvent?.endDate || null);
                  }
                  if (!eventStatus) {
                    if (gammaEvent?.live) eventStatus = 'live';
                    else if (gammaEvent?.ended) eventStatus = 'final';
                  }
                  if (!score && gammaEvent?.score && (gammaEvent?.live || gammaEvent?.ended)) {
                    const parsedScore = parseScoreLine(gammaEvent.score);
                    score = parsedScore ? parsedScore : gammaEvent.score;
                  }
                }
              }
            } catch (error) {
              console.warn('[Price API] Gamma event slug fallback failed:', error);
            }
          }

          const clobResponseBody = {
            success: true,
            market: {
              question: market.question,
              conditionId: market.condition_id,
              slug: resolvedMarketSlug,
              eventSlug: resolvedEventSlug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              description: resolvedDescription,
              tags: resolvedTags,
              category: market.category,
              endDateIso,
              gameStartTime,
              enableOrderBook: market.enable_order_book || false,
              eventStatus,
              score,
              homeTeam,
              awayTeam,
              marketAvatarUrl,
              espnUrl: resolvedGameUrl,
              cryptoSymbol,
              cryptoPriceUsd,
            }
          };

          if (cacheKey) setCachedPrice(cacheKey, clobResponseBody);
          updateMarketsPriceCache(conditionId, prices, outcomes, market.closed, resolved);
          return NextResponse.json(clobResponseBody);
        }
      } else {
        console.log(`[Price API] CLOB fallback returned ${response.status}`);
      }
    }

    // Try 3: Gamma API by slug (for markets without condition_id)
    if (slug && !slug.startsWith('0x')) {
      console.log(`[Price API] Gamma search by slug: ${slug}`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const market = data[0];
          console.log(`[Price API] Gamma found: ${market.question}`);
          
          let prices = market.outcomePrices;
          let outcomes = market.outcomes;
          
          if (typeof prices === 'string') {
            try { prices = JSON.parse(prices); } catch { prices = null; }
          }
          if (typeof outcomes === 'string') {
            try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
          }

          const resolved =
            typeof market.resolved === 'boolean'
              ? market.resolved
              : typeof market.is_resolved === 'boolean'
                ? market.is_resolved
                : typeof market.isResolved === 'boolean'
                  ? market.isResolved
                  : undefined;

          // Use end_time (actual resolution date) for the "Resolves" badge
          // end_time = when market resolves, close_time = when betting stops (may be earlier)
          const endDateIso = cachedEndTime
            ? normalizeEndDate(cachedEndTime)
            : normalizeEndDate(
                market.end_date_iso || market.end_date || market.endDate || 
                market.close_date_iso || market.close_date || market.closeDate || market.close_time || null
              );
          const resolvedEndDateIso = endDateIso;
          const event =
            Array.isArray(market?.events) && market.events.length > 0 ? market.events[0] : null;
          const marketAvatarUrl = pickFirstString(
            market.icon,
            market.image,
            market.twitterCardImage,
            market.twitter_card_image,
            event?.icon,
            event?.image,
            cachedMarketAvatar
          );
          // ONLY use game_start_time from markets table, no fallbacks
          // Supabase converts snake_case to camelCase, so check both
          const gameStartTime = market?.game_start_time || market?.gameStartTime || null;
          const resolvedEventSlug =
            cachedEventSlug || event?.slug || market?.event_slug || market?.eventSlug || null;
          const resolvedTags = market.tags ?? event?.tags ?? cachedTags ?? null;

          return NextResponse.json({
            success: true,
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              eventSlug: resolvedEventSlug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              tags: resolvedTags,
              endDateIso: resolvedEndDateIso,
              gameStartTime,
              marketAvatarUrl,
              eventStatus: cachedEventStatus,
              espnUrl: resolvedGameUrl,
              cryptoSymbol,
              cryptoPriceUsd,
            }
          });
        }
      }
    }

    // Try 4: Gamma API title search in open markets
    if (title) {
      console.log(`[Price API] Gamma title search: ${title.substring(0, 30)}...`);
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets?closed=false&limit=100`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const data = await response.json();
        const titleLower = title.toLowerCase();
        
        // Try exact match first
        let match = data.find((m: any) => 
          m.question?.toLowerCase() === titleLower
        );
        
        // Then partial match
        if (!match && titleLower.length > 10) {
          match = data.find((m: any) => 
            m.question?.toLowerCase().includes(titleLower.substring(0, 20))
          );
        }
        
        if (match) {
          console.log(`[Price API] Gamma title found: ${match.question}`);
          
          let prices = match.outcomePrices;
          let outcomes = match.outcomes;
          
          if (typeof prices === 'string') {
            try { prices = JSON.parse(prices); } catch { prices = null; }
          }
          if (typeof outcomes === 'string') {
            try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
          }

          const resolved =
            typeof match.resolved === 'boolean'
              ? match.resolved
              : typeof match.is_resolved === 'boolean'
                ? match.is_resolved
                : typeof match.isResolved === 'boolean'
                  ? match.isResolved
                  : undefined;

          // Use end_time (actual resolution date) for the "Resolves" badge
          // end_time = when market resolves, close_time = when betting stops (may be earlier)
          const endDateIso = cachedEndTime
            ? normalizeEndDate(cachedEndTime)
            : normalizeEndDate(
                match.end_date_iso || match.end_date || match.endDate || 
                match.close_date_iso || match.close_date || match.closeDate || match.close_time || null
              );
          const resolvedEndDateIso = endDateIso;
          const event =
            Array.isArray(match?.events) && match.events.length > 0 ? match.events[0] : null;
          const marketAvatarUrl = pickFirstString(
            match.icon,
            match.image,
            match.twitterCardImage,
            match.twitter_card_image,
            event?.icon,
            event?.image,
            cachedMarketAvatar
          );
          // ONLY use game_start_time from markets table (cachedStartTime from ensureCachedMarket)
          // Don't use match data from Gamma API - use DB data
          const gameStartTime = cachedStartTime || null;
          const resolvedEventSlug =
            cachedEventSlug || event?.slug || match?.event_slug || match?.eventSlug || null;
          // Use tags from markets table (cachedTags), fallback to match if needed
          const resolvedTags = cachedTags ?? match.tags ?? event?.tags ?? null;
          
          // Get completed_time from markets table (cached market)
          const completedTime = market?.completed_time 
            ? (typeof market.completed_time === 'string' 
                ? market.completed_time 
                : new Date(market.completed_time).toISOString())
            : null;
          
          // If we found a market via Gamma API but it's not in our DB, sync it
          if (match.conditionId && match.conditionId.startsWith('0x') && supabaseAdmin && !market) {
            try {
              const gammaMarkets = await fetchGammaMarketsByConditionIds([match.conditionId]);
              if (gammaMarkets.length > 0) {
                const gammaMarket = gammaMarkets[0];
                const row = mapGammaMarketToRow(gammaMarket);
                if (row.condition_id) {
                  if (gammaMarket.slug) {
                    const ev = await fetchGammaEvent(gammaMarket.slug);
                    if (ev) enrichRowWithEvent(row, ev);
                  }
                  const gst = await resolveGameStartTime(
                    row.title,
                    row.tags,
                    row.condition_id,
                    row.market_slug,
                    row.end_time,
                  );
                  if (gst) row.game_start_time = gst;
                  await supabaseAdmin
                    .from('markets')
                    .upsert(row, { onConflict: 'condition_id' });
                  const reloaded = await loadCachedMarket();
                  if (reloaded) {
                    const reloadedMarket = reloaded as Record<string, any>;
                    const reloadedStartTime = pickMarketStartTime(reloadedMarket);
                    const reloadedCompletedTime = reloadedMarket.completed_time 
                      ? (typeof reloadedMarket.completed_time === 'string' 
                          ? reloadedMarket.completed_time 
                          : new Date(reloadedMarket.completed_time).toISOString())
                      : null;
                    return NextResponse.json({
                      success: true,
                      market: {
                        question: match.question,
                        conditionId: match.conditionId,
                        slug: match.slug,
                        eventSlug: resolvedEventSlug,
                        closed: match.closed,
                        resolved,
                        outcomePrices: prices,
                        outcomes: outcomes,
                        tags: reloadedMarket.tags ?? resolvedTags,
                        endDateIso: resolvedEndDateIso,
                        completedTime: reloadedCompletedTime,
                        gameStartTime: reloadedStartTime,
                        marketAvatarUrl,
                        eventStatus: cachedEventStatus,
                        espnUrl: resolvedGameUrl,
                        cryptoSymbol,
                        cryptoPriceUsd,
                      }
                    });
                  }
                }
              }
            } catch (error) {
              console.warn('[Price API] Failed to sync market from Gamma:', error);
            }
          }

          return NextResponse.json({
            success: true,
            market: {
              question: match.question,
              conditionId: match.conditionId,
              slug: match.slug,
              eventSlug: resolvedEventSlug,
              closed: match.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              tags: resolvedTags,
              endDateIso: resolvedEndDateIso,
              completedTime,
              gameStartTime,
              marketAvatarUrl,
              eventStatus: cachedEventStatus,
              espnUrl: resolvedGameUrl,
              cryptoSymbol,
              cryptoPriceUsd,
            }
          });
        }
      }
    }

    console.log(`[Price API] Market not found for conditionId=${conditionId}, slug=${slug}, title=${title?.substring(0, 30)}`);
    return NextResponse.json({
      success: false,
      error: 'Market not found'
    });

  } catch (error: any) {
    console.error('[Price API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch price' },
      { status: 500 }
    );
  }
}
