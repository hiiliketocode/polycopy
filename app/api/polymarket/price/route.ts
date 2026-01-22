// Proxy API for fetching Polymarket prices (bypasses CORS)
// Uses CLOB API for accurate real-time prices
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchDomeMarketsByConditionIds,
  mapDomeMarketToRow,
  pickMarketEndTime,
  pickMarketStartTime,
} from '@/lib/markets/dome';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOME_API_KEY = process.env.DOME_API_KEY || null;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conditionId = searchParams.get('conditionId');
  const slug = searchParams.get('slug');
  const eventSlug = searchParams.get('eventSlug');
  const title = searchParams.get('title');

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

  const loadCachedMarket = async () => {
    if (!supabaseAdmin || !conditionId) return null;
    const { data, error } = await supabaseAdmin
      .from('markets')
      .select(
        [
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
        ].join(',')
      )
      .eq('condition_id', conditionId)
      .maybeSingle();
    if (error) {
      console.warn('[Price API] Failed to read market cache:', error.message || error);
      return null;
    }
    return data ?? null;
  };

  const ensureCachedMarket = async () => {
    const cached = await loadCachedMarket();
    if (cached || !conditionId || !supabaseAdmin) return cached;
    try {
      const markets = await fetchDomeMarketsByConditionIds([conditionId], {
        apiKey: DOME_API_KEY,
      });
      const market = markets[0];
      if (!market) return null;
      const row = mapDomeMarketToRow(market);
      if (!row.condition_id) return null;
      const { error } = await supabaseAdmin
        .from('markets')
        .upsert(row, { onConflict: 'condition_id' });
      if (error) {
        console.warn('[Price API] Failed to upsert market cache:', error.message || error);
        return null;
      }
      return await loadCachedMarket();
    } catch (error) {
      console.warn('[Price API] Failed to fetch Dome market:', error);
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
    const cachedStartTime = pickMarketStartTime(cachedMarket);
    const cachedEndTime = pickMarketEndTime(cachedMarket);
    const cachedEventStatus = cachedMarket?.status || null;
    const cachedMarketAvatar = cachedMarket?.image || null;
    let cachedEspnUrl = cachedMarket?.espn_url || null;
    const cachedMarketSlug = cachedMarket?.market_slug || null;
    const cachedEventSlug = cachedMarket?.event_slug || null;
    const cachedDescription = cachedMarket?.description || null;
    const cachedTags = cachedMarket?.tags || null;
    const cachedTitle = cachedMarket?.title || null;
    const cachedConditionId = cachedMarket?.condition_id || null;

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

    // Try 1: CLOB API with condition_id (most accurate for real-time prices)
    if (conditionId && conditionId.startsWith('0x')) {
      console.log(`[Price API] CLOB search by conditionId: ${conditionId}`);
      const response = await fetch(
        `https://clob.polymarket.com/markets/${conditionId}`,
        { cache: 'no-store' }
      );
      
      if (response.ok) {
        const market = await response.json();
        console.log(`[Price API] CLOB found: ${market.question}`);
        
        // CLOB API returns tokens array with outcome and price
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
          
          let endDateIso =
            normalizeEndDate(market.end_date_iso || market.end_date || market.endDate || null);
          if (!endDateIso && cachedEndTime) {
            endDateIso = normalizeEndDate(cachedEndTime);
          }
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
          let gameStartTime =
            market.game_start_time || market.start_date_iso || market.event_start_date || null;
          if (!gameStartTime && cachedStartTime) {
            gameStartTime = cachedStartTime;
          }

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

                if (!gameStartTime) {
                  gameStartTime =
                    event?.startTime ||
                    event?.startDate ||
                    event?.eventDate ||
                    gammaMarket?.gameStartTime ||
                    null;
                }

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
                  if (!gameStartTime) {
                    gameStartTime =
                      gammaEvent?.startTime ||
                      gammaEvent?.startDate ||
                      gammaEvent?.eventDate ||
                      null;
                  }
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

          return NextResponse.json({
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
              // Sports/Event metadata
              description: resolvedDescription,
              tags: resolvedTags,
              category: market.category,
              endDateIso,
              gameStartTime,
              enableOrderBook: market.enable_order_book || false,
              // Additional sports metadata if available
              eventStatus,
              score,
              homeTeam,
              awayTeam,
              marketAvatarUrl,
              espnUrl: resolvedGameUrl,
              cryptoSymbol,
              cryptoPriceUsd,
            }
          });
        }
      } else {
        console.log(`[Price API] CLOB returned ${response.status}`);
      }
    }

    // Try 2: Gamma API by slug (fallback for older markets)
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

          const endDateIso = normalizeEndDate(
            market.end_date_iso || market.end_date || market.endDate || market.close_time || null
          );
          const resolvedEndDateIso =
            endDateIso || (cachedEndTime ? normalizeEndDate(cachedEndTime) : null);
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
          const gameStartTime = pickFirstString(
            event?.startTime,
            event?.startDate,
            event?.eventDate,
            market?.gameStartTime,
            cachedStartTime
          );
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

    // Try 3: Gamma API title search in open markets
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

          const endDateIso = normalizeEndDate(
            match.end_date_iso || match.end_date || match.endDate || match.close_time || null
          );
          const resolvedEndDateIso =
            endDateIso || (cachedEndTime ? normalizeEndDate(cachedEndTime) : null);
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
          const gameStartTime = pickFirstString(
            event?.startTime,
            event?.startDate,
            event?.eventDate,
            match?.gameStartTime,
            cachedStartTime
          );
          const resolvedEventSlug =
            cachedEventSlug || event?.slug || match?.event_slug || match?.eventSlug || null;
          const resolvedTags = match.tags ?? event?.tags ?? cachedTags ?? null;

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
