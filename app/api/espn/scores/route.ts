// ESPN Sports Scores API Proxy
// Fetches live scores for multiple leagues via ESPN scoreboards
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, externalApiError } from '@/lib/http/error-response';

interface ESPNGame {
  id: string;
  name: string; // "Team A at Team B"
  shortName: string; // "TEAM1 @ TEAM2"
  links?: Array<{
    href?: string;
    rel?: string[];
  }>;
  status: {
    type: {
      name: string; // "STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_FINAL"
      state: string; // "pre", "in", "post"
      completed: boolean;
      shortDetail?: string;
      detail?: string;
    };
    displayClock?: string;
    period?: number;
  };
  competitions?: ESPNCompetition[];
  groupings?: Array<{
    competitions?: ESPNCompetition[];
  }>;
}

interface ESPNCompetition {
  competitors?: ESPNCompetitor[];
  date?: string;
  startDate?: string;
  status?: {
    type?: {
      name?: string;
      state?: string;
      completed?: boolean;
      shortDetail?: string;
      detail?: string;
    };
    displayClock?: string;
    period?: number;
  };
  links?: Array<{
    href?: string;
    rel?: string[];
  }>;
}

interface ESPNCompetitor {
  team?: {
    name?: string;
    abbreviation?: string;
    displayName?: string;
  };
  athlete?: {
    displayName?: string;
    shortName?: string;
    fullName?: string;
  };
  score?: string;
  homeAway?: 'home' | 'away';
  linescores?: Array<{
    value?: number;
  }>;
}

interface ESPNResponse {
  events: ESPNGame[];
}

interface NormalizedGame {
  id: string;
  name: string;
  shortName: string;
  link?: string;
  homeTeam: {
    name: string;
    abbreviation: string;
    score: number | null;
  };
  awayTeam: {
    name: string;
    abbreviation: string;
    score: number | null;
  };
  status: 'scheduled' | 'live' | 'final';
  startTime: string;
  displayClock?: string;
  period?: number;
  statusDetail?: string;
}

// Sport type mapping
const SPORT_ENDPOINTS: Record<string, string> = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
  wnba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard',
  ncaaf: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard',
  ncaab: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard',
  ncaaw: 'https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard',
  soccer_mls: 'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard',
  soccer_epl: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
  soccer_eng_champ: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard',
  soccer_laliga: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
  soccer_seriea: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard',
  soccer_bundesliga: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard',
  soccer_ligue1: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard',
  soccer_eredivisie: 'https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/scoreboard',
  soccer_primeira: 'https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/scoreboard',
  soccer_scottish_prem: 'https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard',
  soccer_uefa_champions: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
  soccer_uefa_europa: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard',
  soccer_uefa_conference: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard',
  soccer_liga_mx: 'https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard',
  soccer_fifa_world_cup: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
  soccer_fifa_womens_world_cup: 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.womens.world/scoreboard',
  soccer_uefa_euro: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.euro/scoreboard',
  soccer_copa_libertadores: 'https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.libertadores/scoreboard',
  soccer_copa_sudamericana: 'https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.sudamericana/scoreboard',
  tennis_atp: 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard',
  tennis_wta: 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard',
  golf_pga: 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
  golf_lpga: 'https://site.api.espn.com/apis/site/v2/sports/golf/lpga/scoreboard',
  mma_ufc: 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard',
  boxing: 'https://site.api.espn.com/apis/site/v2/sports/boxing/boxing/scoreboard',
};

const SPORT_GAME_URLS: Record<string, string> = {
  nfl: 'https://www.espn.com/nfl/game/_/gameId/',
  nba: 'https://www.espn.com/nba/game/_/gameId/',
  mlb: 'https://www.espn.com/mlb/game/_/gameId/',
  nhl: 'https://www.espn.com/nhl/game/_/gameId/',
  wnba: 'https://www.espn.com/wnba/game/_/gameId/',
  ncaaf: 'https://www.espn.com/college-football/game/_/gameId/',
  ncaab: 'https://www.espn.com/mens-college-basketball/game/_/gameId/',
  ncaaw: 'https://www.espn.com/womens-college-basketball/game/_/gameId/',
  tennis_atp: 'https://www.espn.com/tennis/match/_/gameId/',
  tennis_wta: 'https://www.espn.com/tennis/match/_/gameId/',
};

const SOCCER_GAME_URL = 'https://www.espn.com/soccer/match/_/gameId/';

const buildFallbackGameUrl = (sport: string, eventId?: string | null) => {
  if (!eventId) return undefined;
  if (sport.startsWith('soccer_')) return `${SOCCER_GAME_URL}${eventId}`;
  const base = SPORT_GAME_URLS[sport];
  return base ? `${base}${eventId}` : undefined;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'nfl'; // Default to NFL
  const teamNames = searchParams.get('teams'); // Optional: filter by team names
  const dateParam = searchParams.get('date');

  try {
    const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()];
    
    if (!endpoint) {
      return badRequest(`Unsupported sport: ${sport}`);
    }

    console.log(`📊 Fetching ${sport.toUpperCase()} scores from ESPN...`);

    const normalizeDateParam = (value?: string | null) => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d{8}$/.test(trimmed)) return trimmed;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, '');
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString().slice(0, 10).replace(/-/g, '');
    };

    const normalizeEspnLink = (link?: string | null) => {
      if (!link) return undefined;
      const trimmed = link.trim();
      if (!trimmed) return undefined;
      if (trimmed.startsWith('//')) return `https:${trimmed}`;
      if (trimmed.startsWith('/')) return `https://www.espn.com${trimmed}`;
      if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:/i, 'https:');
      if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
      return trimmed;
    };

    const endpointUrl = new URL(endpoint);
    const dateKey = normalizeDateParam(dateParam);
    if (dateKey) {
      endpointUrl.searchParams.set('dates', dateKey);
    }

    let upstreamStatus: number | undefined;
    let data: ESPNResponse | null = null;

    try {
      const response = await fetch(endpointUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
        },
        cache: 'no-store',
      });
      upstreamStatus = response.status;

      if (!response.ok) {
        throw new Error(`ESPN API returned ${response.status}`);
      }

      data = (await response.json()) as ESPNResponse;
    } catch (err) {
      console.warn(`[ESPN] scoreboard fetch failed for ${sport} (${dateKey || 'today'}):`, err);
      return NextResponse.json(
        {
          games: [],
          events: [],
          source: 'espn',
          status: 'unavailable',
          upstreamStatus: upstreamStatus ?? 'fetch_error',
          date: dateKey || undefined,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    
    console.log(`✅ Fetched ${data?.events?.length || 0} ${sport.toUpperCase()} games`);

    const getCompetitorName = (competitor: ESPNCompetitor) =>
      competitor?.team?.name ||
      competitor?.team?.displayName ||
      competitor?.athlete?.displayName ||
      competitor?.athlete?.fullName ||
      '';

    const getCompetitorAbbrev = (competitor: ESPNCompetitor) =>
      competitor?.team?.abbreviation ||
      competitor?.athlete?.shortName ||
      competitor?.athlete?.displayName ||
      '';

    const getLinescoreValues = (competitor: ESPNCompetitor) =>
      Array.isArray(competitor?.linescores)
        ? competitor.linescores
            .map((line) => Number(line?.value))
            .filter((value) => Number.isFinite(value))
        : [];

    const getSetScores = (homeLines: number[], awayLines: number[]) => {
      if (homeLines.length === 0 || awayLines.length === 0) return null;
      const setCount = Math.min(homeLines.length, awayLines.length);
      let homeSets = 0;
      let awaySets = 0;
      for (let i = 0; i < setCount; i += 1) {
        const home = homeLines[i];
        const away = awayLines[i];
        if (home > away) homeSets += 1;
        if (away > home) awaySets += 1;
      }
      return { homeSets, awaySets };
    };

    const normalizeStatus = (status: ESPNCompetition['status'] | ESPNGame['status']) => {
      const statusName = status?.type?.name || '';
      const statusState = status?.type?.state || '';
      const completed = Boolean(status?.type?.completed);
      let gameStatus: 'scheduled' | 'live' | 'final' = 'scheduled';

      if (statusName === 'STATUS_FINAL' || completed || statusState === 'post') {
        gameStatus = 'final';
      } else if (statusName === 'STATUS_IN_PROGRESS' || statusState === 'in') {
        gameStatus = 'live';
      }

      return gameStatus;
    };

    const events = data.events || [];
    const rawCompetitions = events.flatMap((event) => {
      if (Array.isArray(event.competitions) && event.competitions.length > 0) {
        return event.competitions.map((competition) => ({ event, competition }));
      }
      if (Array.isArray(event.groupings)) {
        return event.groupings.flatMap((grouping) =>
          Array.isArray(grouping.competitions)
            ? grouping.competitions.map((competition) => ({ event, competition }))
            : []
        );
      }
      return [];
    });

    // Parse and format the games
    const games = rawCompetitions.map(({ event, competition }) => {
      const competitors = competition?.competitors || [];
      if (competitors.length < 2) {
        return null;
      }

      const homeTeam = competitors.find((c) => c.homeAway === 'home') || competitors[0];
      const awayTeam = competitors.find((c) => c.homeAway === 'away') || competitors[1];

      if (!homeTeam || !awayTeam) {
        return null;
      }

      const gameStatus = normalizeStatus(competition.status || event.status);

      const homeName = getCompetitorName(homeTeam);
      const awayName = getCompetitorName(awayTeam);
      const shortName = event.shortName || `${awayName} @ ${homeName}`;

      const homeLines = getLinescoreValues(homeTeam);
      const awayLines = getLinescoreValues(awayTeam);
      const setScores = getSetScores(homeLines, awayLines);

      const parsedHomeScore = homeTeam?.score ? parseInt(homeTeam.score) : null;
      const parsedAwayScore = awayTeam?.score ? parseInt(awayTeam.score) : null;

      const homeScore = Number.isFinite(parsedHomeScore as number)
        ? parsedHomeScore
        : setScores
          ? setScores.homeSets
          : null;
      const awayScore = Number.isFinite(parsedAwayScore as number)
        ? parsedAwayScore
        : setScores
          ? setScores.awaySets
          : null;

      const startTime = competition.date || competition.startDate || null;

      const name = event.name || shortName || `${awayName} @ ${homeName}`;
      const pickEventLink = (
        links?: Array<{
          href?: string;
          rel?: string[];
        }>
      ) => {
        if (!Array.isArray(links)) return undefined;
        const prioritized = links.find((link) =>
          Array.isArray(link?.rel) &&
          link.rel.some((rel) =>
            ['event', 'summary', 'game', 'preview'].includes(rel)
          )
        );
        if (prioritized?.href) return prioritized.href;
        const espnLink = links.find((link) => link?.href?.includes('espn.com'));
        if (espnLink?.href) return espnLink.href;
        const fallback = links.find((link) => typeof link?.href === 'string');
        return fallback?.href;
      };

      const eventLink = normalizeEspnLink(
        pickEventLink(event.links) || pickEventLink(competition.links)
      );
      
      // For tennis, use competition ID (match ID) instead of event ID (tournament ID)
      // For other sports, event.id is usually the game/match ID
      const gameId = (sport.startsWith('tennis_') && competition?.id) 
        ? competition.id 
        : event.id;
      
      const resolvedLink = eventLink || buildFallbackGameUrl(sport, gameId);
      const statusDetail =
        competition.status?.type?.shortDetail ||
        event.status?.type?.shortDetail ||
        competition.status?.type?.detail ||
        event.status?.type?.detail ||
        undefined;

      return {
        id: gameId,
        name,
        shortName,
        link: resolvedLink,
        homeTeam: {
          name: homeName,
          abbreviation: getCompetitorAbbrev(homeTeam),
          score: homeScore,
        },
        awayTeam: {
          name: awayName,
          abbreviation: getCompetitorAbbrev(awayTeam),
          score: awayScore,
        },
        status: gameStatus,
        startTime,
        displayClock: competition.status?.displayClock || event.status?.displayClock,
        period: competition.status?.period || event.status?.period,
        statusDetail,
      } as NormalizedGame;
    }).filter((game): game is NormalizedGame => Boolean(game));

    // Filter by team names if provided
    let filteredGames = games;
    if (teamNames) {
      const searchTeams = teamNames.toLowerCase().split(',').map(t => t.trim());
      filteredGames = games.filter(game => {
        const gameName = game.name.toLowerCase();
        return searchTeams.some(team => 
          gameName.includes(team) ||
          game.homeTeam.name.toLowerCase().includes(team) ||
          game.awayTeam.name.toLowerCase().includes(team) ||
          game.homeTeam.abbreviation.toLowerCase().includes(team) ||
          game.awayTeam.abbreviation.toLowerCase().includes(team)
        );
      });
    }

    return NextResponse.json({
      success: true,
      sport: sport.toUpperCase(),
      totalGames: games.length,
      games: filteredGames,
    });

  } catch (error: any) {
    return externalApiError('ESPN', error, `fetch ${sport} scores`);
  }
}
