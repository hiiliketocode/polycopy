// Helper to fetch and match ESPN scores with Polymarket markets
import type { FeedTrade } from '@/app/feed/page';
import { abbreviateTeamName } from '@/lib/utils/team-abbreviations';

interface ESPNGame {
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

interface ESPNScoreResult {
  homeScore: number;
  awayScore: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  status: 'scheduled' | 'live' | 'final';
  startTime: string;
  displayClock?: string;
  period?: number;
}

// Detect sport type from market title
function detectSportType(title: string): string | null {
  const titleLower = title.toLowerCase();
  
  // NFL teams
  const nflTeams = [
    'chiefs', 'raiders', 'chargers', 'broncos', 'cowboys', 'giants', 'eagles', 'commanders',
    'bears', 'lions', 'packers', 'vikings', 'falcons', 'panthers', 'saints', 'buccaneers',
    'cardinals', 'rams', 'seahawks', '49ers', 'bills', 'dolphins', 'patriots', 'jets',
    'ravens', 'bengals', 'browns', 'steelers', 'texans', 'colts', 'jaguars', 'titans',
    // Add common variations
    'niners', 'bucs', 'pats', 'fins'
  ];
  
  // NBA teams
  const nbaTeams = [
    'lakers', 'clippers', 'warriors', 'kings', 'suns', 'mavericks', 'rockets', 'spurs',
    'nuggets', 'jazz', 'thunder', 'timberwolves', 'trail blazers', 'grizzlies', 'pelicans',
    'heat', 'magic', 'hawks', 'hornets', 'wizards', 'celtics', 'nets', '76ers', 'knicks',
    'raptors', 'bucks', 'bulls', 'cavaliers', 'pistons', 'pacers',
    // Add variations
    'blazers', 'sixers', 'cavs', 'wolves'
  ];
  
  // MLB teams
  const mlbTeams = [
    'yankees', 'red sox', 'dodgers', 'giants', 'cubs', 'cardinals', 'astros', 'braves',
    'mets', 'phillies', 'padres', 'mariners', 'rangers', 'angels', 'athletics', 'rays'
  ];
  
  // NHL teams
  const nhlTeams = [
    'bruins', 'canadiens', 'maple leafs', 'senators', 'penguins', 'flyers', 'rangers',
    'islanders', 'devils', 'blackhawks', 'red wings', 'predators', 'blues', 'wild',
    'avalanche', 'stars', 'jets', 'oilers', 'flames', 'canucks', 'golden knights',
    'hurricanes', 'panthers', 'lightning', 'capitals', 'blue jackets', 'sabres',
    'kings', 'ducks', 'sharks', 'kraken', 'coyotes'
  ];
  
  if (nflTeams.some(team => titleLower.includes(team))) return 'nfl';
  if (nbaTeams.some(team => titleLower.includes(team))) return 'nba';
  if (mlbTeams.some(team => titleLower.includes(team))) return 'mlb';
  if (nhlTeams.some(team => titleLower.includes(team))) return 'nhl';
  
  return null;
}

// Extract team names from market title
export function extractTeamNames(title: string): { team1: string; team2: string } | null {
  // Remove spread/O-U indicators first: "Thunder (−9.5)" → "Thunder"
  const cleanTitle = title
    .replace(/\s*\([−+]?\d+\.?\d*\)/g, '') // Remove (−9.5) or (+7)
    .replace(/\s*O\/U\s*\d+\.?\d*/gi, '') // Remove O/U 215.5
    .replace(/\s*(Over|Under)\s*\d+\.?\d*/gi, ''); // Remove Over/Under 215.5
  
  // Match patterns like "Chiefs vs. Raiders" or "Chiefs @ Raiders"
  const vsPattern = /(.+?)\s+(?:vs\.?|@|versus)\s+(.+?)(?:\s+\||$)/i;
  const match = cleanTitle.match(vsPattern);
  
  if (match) {
    return {
      team1: match[1].trim(),
      team2: match[2].trim(),
    };
  }
  
  // Try alternative pattern for spread bets: "Spread: Thunder vs Suns"
  const spreadPattern = /(?:Spread|Total):\s*(.+?)\s+(?:vs\.?|@)\s+(.+?)(?:\s|$)/i;
  const spreadMatch = cleanTitle.match(spreadPattern);
  
  if (spreadMatch) {
    return {
      team1: spreadMatch[1].trim(),
      team2: spreadMatch[2].trim(),
    };
  }
  
  return null;
}

// Check if two team names match (flexible matching)
export function teamsMatch(marketTeam: string, espnTeamName: string, espnAbbrev: string): boolean {
  const marketLower = marketTeam.toLowerCase().trim();
  const espnLower = espnTeamName.toLowerCase().trim();
  const abbrevLower = espnAbbrev.toLowerCase().trim();
  
  // Direct match
  if (marketLower === espnLower || marketLower === abbrevLower) return true;
  
  // Partial match (e.g., "Chiefs" matches "Kansas City Chiefs")
  if (espnLower.includes(marketLower) || marketLower.includes(espnLower)) return true;
  
  // Abbreviation match
  if (marketLower.includes(abbrevLower) || abbrevLower.includes(marketLower)) return true;
  
  // Special cases for common team name variations
  const specialCases: Record<string, string[]> = {
    'golden knights': ['vegas', 'vgk', 'vegas golden knights'],
    'trail blazers': ['blazers', 'portland'],
    'timberwolves': ['wolves', 't-wolves', 'minnesota'],
    '76ers': ['sixers', 'philadelphia'],
    'oilers': ['edmonton'],
    'blues': ['st. louis', 'stl'],
    'kings': ['sacramento', 'los angeles', 'la kings'],
  };
  
  // Check if either team has special cases
  for (const [canonical, variations] of Object.entries(specialCases)) {
    const matchesCanonical = marketLower.includes(canonical) || espnLower.includes(canonical) || abbrevLower.includes(canonical);
    const matchesVariation = variations.some(v => 
      marketLower.includes(v) || espnLower.includes(v) || abbrevLower.includes(v)
    );
    
    if (matchesCanonical && matchesVariation) return true;
    if (variations.some(v => marketLower.includes(v) && (espnLower.includes(canonical) || abbrevLower.includes(canonical)))) return true;
  }
  
  return false;
}

export function getScoreDisplaySides(
  marketTitle: string,
  espnScore: ESPNScoreResult
): { team1Label: string; team1Score: number; team2Label: string; team2Score: number } {
  const teams = extractTeamNames(marketTitle);

  const homeLabel = espnScore.homeTeamAbbrev || abbreviateTeamName(espnScore.homeTeamName);
  const awayLabel = espnScore.awayTeamAbbrev || abbreviateTeamName(espnScore.awayTeamName);

  if (teams) {
    const firstIsHome = teamsMatch(teams.team1, espnScore.homeTeamName, espnScore.homeTeamAbbrev);
    const firstIsAway = teamsMatch(teams.team1, espnScore.awayTeamName, espnScore.awayTeamAbbrev);

    if (firstIsHome) {
      return {
        team1Label: homeLabel,
        team1Score: espnScore.homeScore,
        team2Label: awayLabel,
        team2Score: espnScore.awayScore,
      };
    }

    if (firstIsAway) {
      return {
        team1Label: awayLabel,
        team1Score: espnScore.awayScore,
        team2Label: homeLabel,
        team2Score: espnScore.homeScore,
      };
    }
  }

  return {
    team1Label: homeLabel,
    team1Score: espnScore.homeScore,
    team2Label: awayLabel,
    team2Score: espnScore.awayScore,
  };
}

// Fetch ESPN scores for a specific sport
async function fetchESPNScores(sport: string): Promise<ESPNGame[]> {
  try {
    const response = await fetch(`/api/espn/scores?sport=${sport}`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch ${sport.toUpperCase()} scores:`, response.status);
      return [];
    }
    
    const data = await response.json();
    return data.games || [];
  } catch (error) {
    console.error(`Error fetching ${sport} scores:`, error);
    return [];
  }
}

// Main function to get score for a Polymarket trade
export async function getESPNScoreForTrade(trade: FeedTrade): Promise<ESPNScoreResult | null> {
  const marketTitle = trade.market.title;
  
  // Detect sport type
  const sport = detectSportType(marketTitle);
  if (!sport) {
    console.log(`No sport detected for: ${marketTitle}`);
    return null;
  }
  
  console.log(`🔍 Detected ${sport.toUpperCase()} for: ${marketTitle}`);
  
  // Extract team names
  const teams = extractTeamNames(marketTitle);
  if (!teams) {
    console.log(`Could not extract teams from: ${marketTitle}`);
    return null;
  }
  
  console.log(`🏈 Looking for: ${teams.team1} vs ${teams.team2}`);
  
  // Fetch ESPN scores
  const espnGames = await fetchESPNScores(sport);
  
  // Find matching game
  const matchingGame = espnGames.find(game => {
    const homeMatches = teamsMatch(teams.team1, game.homeTeam.name, game.homeTeam.abbreviation) ||
                        teamsMatch(teams.team2, game.homeTeam.name, game.homeTeam.abbreviation);
    
    const awayMatches = teamsMatch(teams.team1, game.awayTeam.name, game.awayTeam.abbreviation) ||
                        teamsMatch(teams.team2, game.awayTeam.name, game.awayTeam.abbreviation);
    
    return homeMatches && awayMatches;
  });
  
  if (!matchingGame) {
    console.log(`❌ No ESPN game found for: ${marketTitle}`);
    return null;
  }
  
  console.log(`✅ Found ESPN game: ${matchingGame.name} | Status: ${matchingGame.status}`);
  
  return {
    homeScore: matchingGame.homeTeam.score || 0,
    awayScore: matchingGame.awayTeam.score || 0,
    homeTeamName: matchingGame.homeTeam.name,
    awayTeamName: matchingGame.awayTeam.name,
    homeTeamAbbrev: matchingGame.homeTeam.abbreviation,
    awayTeamAbbrev: matchingGame.awayTeam.abbreviation,
    status: matchingGame.status,
    startTime: matchingGame.startTime,
    displayClock: matchingGame.displayClock,
    period: matchingGame.period,
  };
}

// Batch fetch scores for multiple trades (more efficient)
export async function getESPNScoresForTrades(trades: FeedTrade[]): Promise<Map<string, ESPNScoreResult>> {
  const scoreMap = new Map<string, ESPNScoreResult>();
  
  // Group trades by sport
  const sportGroups: Record<string, FeedTrade[]> = {
    nfl: [],
    nba: [],
    mlb: [],
    nhl: [],
  };
  
  trades.forEach(trade => {
    const sport = detectSportType(trade.market.title);
    if (sport && sportGroups[sport]) {
      sportGroups[sport].push(trade);
    }
  });
  
  // Fetch all sports in parallel
  const sportFetches = Object.entries(sportGroups)
    .filter(([_, trades]) => trades.length > 0)
    .map(async ([sport, sportTrades]) => {
      const espnGames = await fetchESPNScores(sport);
      
      sportTrades.forEach(trade => {
        const teams = extractTeamNames(trade.market.title);
        if (!teams) {
          console.log(`⚠️ Could not extract teams from: ${trade.market.title}`);
          return;
        }
        
        console.log(`🔍 Searching for ${sport.toUpperCase()} game: ${teams.team1} vs ${teams.team2}`);
        
        const matchingGame = espnGames.find(game => {
          const homeMatches = teamsMatch(teams.team1, game.homeTeam.name, game.homeTeam.abbreviation) ||
                              teamsMatch(teams.team2, game.homeTeam.name, game.homeTeam.abbreviation);
          
          const awayMatches = teamsMatch(teams.team1, game.awayTeam.name, game.awayTeam.abbreviation) ||
                              teamsMatch(teams.team2, game.awayTeam.name, game.awayTeam.abbreviation);
          
          return homeMatches && awayMatches;
        });
        
        if (matchingGame) {
          console.log(`✅ Found ESPN game for "${trade.market.title}": ${matchingGame.name} (${matchingGame.status})`);
          const key = trade.market.conditionId || trade.market.id || trade.market.title;
          scoreMap.set(key, {
            homeScore: matchingGame.homeTeam.score || 0,
            awayScore: matchingGame.awayTeam.score || 0,
            homeTeamName: matchingGame.homeTeam.name,
            awayTeamName: matchingGame.awayTeam.name,
            homeTeamAbbrev: matchingGame.homeTeam.abbreviation,
            awayTeamAbbrev: matchingGame.awayTeam.abbreviation,
            status: matchingGame.status,
            startTime: matchingGame.startTime,
            displayClock: matchingGame.displayClock,
            period: matchingGame.period,
          });
        } else {
          console.log(`❌ No ESPN game found for "${trade.market.title}". Available ${sport.toUpperCase()} games:`, espnGames.map(g => g.name));
        }
      });
    });
  
  await Promise.all(sportFetches);
  
  console.log(`✅ Fetched ESPN scores for ${scoreMap.size} markets`);
  return scoreMap;
}
