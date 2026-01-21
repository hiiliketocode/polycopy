// Proxy API for fetching Polymarket prices (bypasses CORS)
// Uses CLOB API for accurate real-time prices
import { NextResponse } from 'next/server';

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

  const hasSportsTag = (tags: any) => {
    if (!Array.isArray(tags)) return false;
    return tags.some((tag) => {
      if (!tag) return false;
      const normalized = String(tag).toLowerCase();
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

  try {
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
          let marketAvatarUrl = pickFirstString(market.icon, market.image);

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
          let eventStatus = market.event_status || market.status || null;
          let gameStartTime =
            market.game_start_time || market.start_date_iso || market.event_start_date || null;

          const shouldFetchGammaEvent =
            Boolean(market.market_slug) &&
            (hasSportsTag(market.tags) || Boolean(gameStartTime)) &&
            (!score || !homeTeam || !awayTeam || !eventStatus);
          const shouldFetchGammaMarket =
            Boolean(market.market_slug) && (shouldFetchGammaEvent || !marketAvatarUrl);

          if (shouldFetchGammaMarket) {
            try {
              const gammaResponse = await fetch(
                `https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(market.market_slug)}`,
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

          if ((!marketAvatarUrl || !gameStartTime || !endDateIso || !eventStatus || !score) && (eventSlug || slug)) {
            try {
              const gammaEventResponse = await fetch(
                `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(eventSlug || slug || '')}`,
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
                    gameStartTime = gammaEvent?.startTime || gammaEvent?.startDate || null;
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
              slug: market.market_slug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              // Sports/Event metadata
              description: market.description,
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
          const event =
            Array.isArray(market?.events) && market.events.length > 0 ? market.events[0] : null;
          const marketAvatarUrl = pickFirstString(
            market.icon,
            market.image,
            market.twitterCardImage,
            market.twitter_card_image,
            event?.icon,
            event?.image
          );

          return NextResponse.json({
            success: true,
            market: {
              question: market.question,
              conditionId: market.conditionId,
              slug: market.slug,
              closed: market.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              endDateIso,
              marketAvatarUrl,
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
          const event =
            Array.isArray(match?.events) && match.events.length > 0 ? match.events[0] : null;
          const marketAvatarUrl = pickFirstString(
            match.icon,
            match.image,
            match.twitterCardImage,
            match.twitter_card_image,
            event?.icon,
            event?.image
          );

          return NextResponse.json({
            success: true,
            market: {
              question: match.question,
              conditionId: match.conditionId,
              slug: match.slug,
              closed: match.closed,
              resolved,
              outcomePrices: prices,
              outcomes: outcomes,
              endDateIso,
              marketAvatarUrl,
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
