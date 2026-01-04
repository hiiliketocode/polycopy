// ESPN Sports Scores API Proxy
// Fetches live scores for NFL, NBA, MLB, NHL games
import { NextRequest, NextResponse } from 'next/server';

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

// Sport type mapping
const SPORT_ENDPOINTS: Record<string, string> = {
  nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
  nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard',
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport') || 'nfl'; // Default to NFL
  const teamNames = searchParams.get('teams'); // Optional: filter by team names

  try {
    const endpoint = SPORT_ENDPOINTS[sport.toLowerCase()];
    
    if (!endpoint) {
      return NextResponse.json(
        { error: `Unsupported sport: ${sport}. Use: nfl, nba, mlb, nhl` },
        { status: 400 }
      );
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
    const games = data.events?.map((event) => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');

      const status = event.status.type.name;
      let gameStatus: 'scheduled' | 'live' | 'final' = 'scheduled';
      
      if (status === 'STATUS_FINAL' || event.status.type.completed) {
        gameStatus = 'final';
      } else if (status === 'STATUS_IN_PROGRESS' || event.status.type.state === 'in') {
        gameStatus = 'live';
      }

      return {
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        homeTeam: {
          name: homeTeam?.team.name || '',
          abbreviation: homeTeam?.team.abbreviation || '',
          score: homeTeam?.score ? parseInt(homeTeam.score) : null,
        },
        awayTeam: {
          name: awayTeam?.team.name || '',
          abbreviation: awayTeam?.team.abbreviation || '',
          score: awayTeam?.score ? parseInt(awayTeam.score) : null,
        },
        status: gameStatus,
        startTime: competition.date,
        displayClock: event.status.displayClock,
        period: event.status.period,
      };
    }) || [];

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
    console.error(`❌ ESPN API error for ${sport}:`, error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch ESPN scores' },
      { status: 500 }
    );
  }
}

