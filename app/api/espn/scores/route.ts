// ESPN Sports Scores API Proxy
// Fetches live scores for multiple leagues via ESPN scoreboards
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, externalApiError } from '@/lib/http/error-response';

interface ESPNGame {
  id: string;
  name: string; // "Team A at Team B"
  shortName: string; // "TEAM1 @ TEAM2"
  status: {
    type: {
      name: string; // "STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_FINAL"
      state: string; // "pre", "in", "post"
      completed: boolean;
    };
    displayClock?: string;
    period?: number;
  };
  competitions: Array<{
    competitors: Array<{
      team: {
        name: string;
        abbreviation: string;
      };
      score?: string;
      homeAway: 'home' | 'away';
    }>;
    date: string; // ISO 8601
  }>;
}

interface ESPNResponse {
  events: ESPNGame[];
}

interface NormalizedGame {
  id: string;
  name: string;
  shortName: string;
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'nfl'; // Default to NFL
  const teamNames = searchParams.get('teams'); // Optional: filter by team names

  try {
    const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()];
    
    if (!endpoint) {
      return badRequest(`Unsupported sport: ${sport}`);
    }

    console.log(`📊 Fetching ${sport.toUpperCase()} scores from ESPN...`);

    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}`);
    }

    const data: ESPNResponse = await response.json();
    
    console.log(`✅ Fetched ${data.events?.length || 0} ${sport.toUpperCase()} games`);

    // Parse and format the games
    const games = (data.events || []).map((event) => {
      const competition = event.competitions?.[0];
      if (!competition || !competition.competitors || competition.competitors.length < 2) {
        return null;
      }

      const competitors = competition.competitors;
      const homeTeam = competitors.find(c => c.homeAway === 'home') || competitors[0];
      const awayTeam = competitors.find(c => c.homeAway === 'away') || competitors[1];

      if (!homeTeam || !awayTeam) {
        return null;
      }

      const statusName = event.status?.type?.name || '';
      const statusState = event.status?.type?.state || '';
      const completed = Boolean(event.status?.type?.completed);
      let gameStatus: 'scheduled' | 'live' | 'final' = 'scheduled';

      if (statusName === 'STATUS_FINAL' || completed || statusState === 'post') {
        gameStatus = 'final';
      } else if (statusName === 'STATUS_IN_PROGRESS' || statusState === 'in') {
        gameStatus = 'live';
      }

      const homeName = homeTeam?.team?.name || '';
      const awayName = awayTeam?.team?.name || '';
      const shortName = event.shortName || `${awayName} @ ${homeName}`;

      return {
        id: event.id,
        name: event.name || shortName,
        shortName,
        homeTeam: {
          name: homeName,
          abbreviation: homeTeam?.team?.abbreviation || '',
          score: homeTeam?.score ? parseInt(homeTeam.score) : null,
        },
        awayTeam: {
          name: awayName,
          abbreviation: awayTeam?.team?.abbreviation || '',
          score: awayTeam?.score ? parseInt(awayTeam.score) : null,
        },
        status: gameStatus,
        startTime: competition.date,
        displayClock: event.status?.displayClock,
        period: event.status?.period,
      };
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
