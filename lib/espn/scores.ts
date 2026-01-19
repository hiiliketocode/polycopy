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

type SportGroup =
  | 'nfl'
  | 'nba'
  | 'mlb'
  | 'nhl'
  | 'wnba'
  | 'ncaaf'
  | 'ncaab'
  | 'ncaaw'
  | 'soccer'
  | 'tennis'
  | 'golf'
  | 'mma'
  | 'boxing';

const ESPN_SPORT_GROUPS: Record<SportGroup, string[]> = {
  nfl: ['nfl'],
  nba: ['nba'],
  mlb: ['mlb'],
  nhl: ['nhl'],
  wnba: ['wnba'],
  ncaaf: ['ncaaf'],
  ncaab: ['ncaab'],
  ncaaw: ['ncaaw'],
  soccer: [
    'soccer_mls',
    'soccer_epl',
    'soccer_eng_champ',
    'soccer_laliga',
    'soccer_seriea',
    'soccer_bundesliga',
    'soccer_ligue1',
    'soccer_eredivisie',
    'soccer_primeira',
    'soccer_scottish_prem',
    'soccer_uefa_champions',
    'soccer_uefa_europa',
    'soccer_uefa_conference',
    'soccer_fifa_world_cup',
    'soccer_fifa_womens_world_cup',
    'soccer_uefa_euro',
    'soccer_copa_libertadores',
    'soccer_copa_sudamericana',
  ],
  tennis: ['tennis_atp', 'tennis_wta'],
  golf: ['golf_pga', 'golf_lpga'],
  mma: ['mma_ufc'],
  boxing: ['boxing'],
};

const TEAM_NAME_STOP_WORDS = new Set([
  'fc',
  'sc',
  'cf',
  'ac',
  'afc',
  'c.f',
  's.c',
  'club',
  'the',
]);

// Detect sport type from market title
function detectSportType(title: string, category?: string | null): SportGroup | null {
  const titleLower = title.toLowerCase();
  const categoryLower = category ? category.toLowerCase() : '';

  if (titleLower.includes('wnba')) return 'wnba';
  if (
    titleLower.match(/\b(ncaaf|college football|cfb)\b/) ||
    (titleLower.includes('ncaa') && titleLower.includes('football'))
  ) {
    return 'ncaaf';
  }
  if (titleLower.match(/\b(ncaaw|women's college basketball|womens college basketball|wcbb)\b/)) return 'ncaaw';
  if (
    titleLower.match(/\b(ncaab|college basketball|march madness)\b/) ||
    (titleLower.includes('ncaa') && titleLower.includes('basketball'))
  ) {
    return 'ncaab';
  }
  
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
    'yankees', 'red sox', 'blue jays', 'orioles', 'rays', 'white sox', 'guardians', 'tigers',
    'twins', 'royals', 'astros', 'angels', 'athletics', 'mariners', 'rangers',
    'braves', 'marlins', 'mets', 'nationals', 'phillies',
    'cubs', 'reds', 'brewers', 'pirates', 'cardinals',
    'diamondbacks', 'dodgers', 'giants', 'padres', 'rockies'
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

  if (titleLower.match(/\b(premier league|la liga|serie a|bundesliga|ligue 1|eredivisie|primeira|uefa|champions league|europa league|conference league|world cup|fifa|copa|conmebol|concacaf|afc|caf|mls)\b/)) {
    return 'soccer';
  }

  if (
    titleLower.match(/\b(fc|cf|sc|afc)\b/) &&
    (titleLower.includes(' vs ') || titleLower.includes(' vs.') || titleLower.includes(' v ') || titleLower.includes(' @ ') || titleLower.includes(' versus '))
  ) {
    return 'soccer';
  }

  if (titleLower.match(/\b(afc|fc)\b/) && titleLower.match(/\bwin\b/) && titleLower.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
    return 'soccer';
  }

  if (categoryLower === 'sports') {
    if (titleLower.match(/\b(premier league|premiership|epl|uefa|champions league|europa league|conference league|fa cup|carabao|community shield)\b/)) {
      return 'soccer';
    }
    if (titleLower.match(/\b(afc|fc)\b/) && titleLower.match(/\bwin\b/)) {
      return 'soccer';
    }
  }

  const soccerClubHints = [
    'real madrid',
    'barcelona',
    'atletico',
    'athletic',
    'real sociedad',
    'real betis',
    'sevilla',
    'valencia',
    'villarreal',
    'juventus',
    'inter',
    'milan',
    'napoli',
    'roma',
    'lazio',
    'bayern',
    'dortmund',
    'leverkusen',
    'arsenal',
    'chelsea',
    'liverpool',
    'tottenham',
    'manchester',
    'man city',
    'man utd',
    'psg',
    'marseille',
    'lyon',
    'monaco',
    'ajax',
    'psv',
    'feyenoord',
    'benfica',
    'porto',
    'sporting',
    'celtic',
    'rangers',
    'galatasaray',
    'fenerbahce',
    'besiktas',
    'boca',
    'river',
    'flamengo',
    'palmeiras',
    'corinthians',
    'santos',
    'tigres',
    'monterrey',
    'chivas',
    'pumas',
    'cruz azul',
    'inter miami',
    'al nassr',
    'al hilal',
    'al ittihad',
    'al ahli',
  ];

  if (
    soccerClubHints.some(hint => titleLower.includes(hint)) &&
    (titleLower.includes(' vs ') || titleLower.includes(' vs.') || titleLower.includes(' v ') || titleLower.includes(' @ ') || titleLower.includes(' versus '))
  ) {
    return 'soccer';
  }

  if (titleLower.match(/\b(tennis|wimbledon|roland garros|australian open|us open|atp|wta)\b/)) {
    return 'tennis';
  }

  if (titleLower.match(/\b(golf|pga|lpga|masters|ryder cup|open championship|the open)\b/)) {
    return 'golf';
  }

  if (titleLower.match(/\b(ufc|mma)\b/)) return 'mma';
  if (titleLower.match(/\bboxing\b/)) return 'boxing';

  return null;
}

// Extract team names from market title
export function extractTeamNames(title: string): { team1: string; team2: string } | null {
  // Remove spread/O-U indicators first: "Thunder (−9.5)" → "Thunder"
  const cleanTitle = title
    .replace(/\s*\([−+]?\d+\.?\d*\)/g, '') // Remove (−9.5) or (+7)
    .replace(/\s*O\/U\s*\d+\.?\d*/gi, '') // Remove O/U 215.5
    .replace(/\s*(Over|Under)\s*\d+\.?\d*/gi, '') // Remove Over/Under 215.5
    .replace(/\s*\|\s*.*$/, '') // Remove trailing pipes
    .replace(/\s*:\s*.*$/, '') // Remove trailing descriptor after colon
    .trim();
  
  // Match patterns like "Chiefs vs. Raiders" or "Chiefs @ Raiders"
  const vsPattern = /(.+?)\s+(?:vs\.?|v\.?|@|versus|at)\s+(.+?)(?:\s|$)/i;
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

function extractSingleTeamMatch(title: string): { team: string; dateKey?: string } | null {
  const match = title.match(/\bwill\s+(.+?)\s+win(?:\s+on\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[a-z]{3,9}\s+\d{1,2},?\s+\d{4}))?/i);
  if (!match) return null;
  const rawTeam = match[1]?.trim();
  if (!rawTeam) return null;
  const rawDate = match[2]?.trim();
  if (!rawDate) {
    return { team: rawTeam };
  }
  const dateKey = normalizeDateKey(rawDate);
  return dateKey ? { team: rawTeam, dateKey } : { team: rawTeam };
}

function normalizeDateKey(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getStartDateKey(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeTeamTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !TEAM_NAME_STOP_WORDS.has(token));
}

function buildTeamAbbrev(value: string): string {
  const tokens = normalizeTeamTokens(value);
  if (tokens.length === 0) return '';
  return tokens.map(token => token[0]).join('');
}

function scoreTeamMatch(marketTeam: string, espnTeamName: string, espnAbbrev: string): number {
  const marketLower = marketTeam.toLowerCase().trim();
  const espnLower = espnTeamName.toLowerCase().trim();
  const abbrevLower = espnAbbrev.toLowerCase().trim();

  if (!marketLower || !espnLower) return 0;

  if (marketLower === espnLower) return 6;
  if (abbrevLower && marketLower === abbrevLower) return 6;

  if (espnLower.includes(marketLower) || marketLower.includes(espnLower)) return 4;
  if (abbrevLower && (marketLower.includes(abbrevLower) || abbrevLower.includes(marketLower))) return 3;

  const marketAbbrev = buildTeamAbbrev(marketTeam).toLowerCase();
  const espnDerivedAbbrev = (espnAbbrev ? espnAbbrev : buildTeamAbbrev(espnTeamName)).toLowerCase();
  if (marketAbbrev && espnDerivedAbbrev) {
    if (marketAbbrev === espnDerivedAbbrev) return 4;
    if (marketAbbrev.startsWith(espnDerivedAbbrev) || espnDerivedAbbrev.startsWith(marketAbbrev)) return 2;
  }

  const marketTokens = normalizeTeamTokens(marketTeam);
  const espnTokens = normalizeTeamTokens(espnTeamName);
  if (marketTokens.length > 0 && espnTokens.length > 0) {
    const forwardMatch = marketTokens.every(token =>
      espnTokens.some(espnToken => espnToken === token || espnToken.startsWith(token) || token.startsWith(espnToken))
    );
    if (forwardMatch) return 2;

    const reverseMatch = espnTokens.every(token =>
      marketTokens.some(marketToken => marketToken === token || marketToken.startsWith(token) || token.startsWith(marketToken))
    );
    if (reverseMatch) return 2;
  }

  return 0;
}

// Check if two team names match (flexible matching)
export function teamsMatch(marketTeam: string, espnTeamName: string, espnAbbrev: string): boolean {
  const marketLower = marketTeam.toLowerCase().trim();
  const espnLower = espnTeamName.toLowerCase().trim();
  const abbrevLower = espnAbbrev.toLowerCase().trim();
  
  // Direct match
  if (marketLower === espnLower || (abbrevLower && marketLower === abbrevLower)) return true;
  
  // Partial match (e.g., "Chiefs" matches "Kansas City Chiefs")
  if (espnLower.includes(marketLower) || marketLower.includes(espnLower)) return true;
  
  // Abbreviation match
  if (abbrevLower && (marketLower.includes(abbrevLower) || abbrevLower.includes(marketLower))) return true;

  const marketAbbrev = buildTeamAbbrev(marketTeam);
  const espnDerivedAbbrev = espnAbbrev ? espnAbbrev : buildTeamAbbrev(espnTeamName);
  if (marketAbbrev && espnDerivedAbbrev) {
    const marketAbbrevLower = marketAbbrev.toLowerCase();
    const espnAbbrevLower = espnDerivedAbbrev.toLowerCase();
    if (marketAbbrevLower === espnAbbrevLower) return true;
    if (marketAbbrevLower.startsWith(espnAbbrevLower) || espnAbbrevLower.startsWith(marketAbbrevLower)) return true;
  }
  
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

  const marketTokens = normalizeTeamTokens(marketTeam);
  const espnTokens = normalizeTeamTokens(espnTeamName);
  if (marketTokens.length > 0 && espnTokens.length > 0) {
    const forwardMatch = marketTokens.every(token =>
      espnTokens.some(espnToken => espnToken === token || espnToken.startsWith(token) || token.startsWith(espnToken))
    );
    if (forwardMatch) return true;

    const reverseMatch = espnTokens.every(token =>
      marketTokens.some(marketToken => marketToken === token || marketToken.startsWith(token) || token.startsWith(marketToken))
    );
    if (reverseMatch) return true;
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

// Fetch ESPN scores for a specific sport key
async function fetchESPNScores(sportKey: string): Promise<ESPNGame[]> {
  try {
    const response = await fetch(`/api/espn/scores?sport=${sportKey}`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch ${sportKey.toUpperCase()} scores:`, response.status);
      return [];
    }
    
    const data = await response.json();
    return data.games || [];
  } catch (error) {
    console.error(`Error fetching ${sportKey} scores:`, error);
    return [];
  }
}

async function fetchESPNGroupScores(sport: SportGroup): Promise<ESPNGame[]> {
  const groupKeys = ESPN_SPORT_GROUPS[sport];
  if (!groupKeys || groupKeys.length === 0) return [];

  const results = await Promise.all(groupKeys.map(key => fetchESPNScores(key)));
  return results.flat();
}

function findMatchingGame(marketTitle: string, games: ESPNGame[]): ESPNGame | null {
  const teams = extractTeamNames(marketTitle);
  if (!teams) {
    const singleTeamMatch = extractSingleTeamMatch(marketTitle);
    if (!singleTeamMatch) return null;
    const targetDateKey = singleTeamMatch.dateKey || null;

    const scoredMatches = games.map(game => {
      const homeScore = scoreTeamMatch(singleTeamMatch.team, game.homeTeam.name, game.homeTeam.abbreviation);
      const awayScore = scoreTeamMatch(singleTeamMatch.team, game.awayTeam.name, game.awayTeam.abbreviation);
      const baseScore = Math.max(homeScore, awayScore);
      const dateKey = getStartDateKey(game.startTime);
      const dateMatch = targetDateKey && dateKey && targetDateKey === dateKey;
      const bestScore = baseScore + (dateMatch ? 2 : 0);
      return { game, baseScore, bestScore, dateMatch: Boolean(dateMatch) };
    });

    const bestMatch = scoredMatches
      .filter(match => {
        if (targetDateKey) {
          return match.baseScore >= 4 && match.dateMatch;
        }
        return match.baseScore >= 6;
      })
      .sort((a, b) => b.bestScore - a.bestScore)[0];

    return bestMatch ? bestMatch.game : null;
  }

  const scoredMatches = games.map(game => {
    const team1Home = scoreTeamMatch(teams.team1, game.homeTeam.name, game.homeTeam.abbreviation);
    const team2Away = scoreTeamMatch(teams.team2, game.awayTeam.name, game.awayTeam.abbreviation);
    const team1Away = scoreTeamMatch(teams.team1, game.awayTeam.name, game.awayTeam.abbreviation);
    const team2Home = scoreTeamMatch(teams.team2, game.homeTeam.name, game.homeTeam.abbreviation);

    const directScore = team1Home + team2Away;
    const swappedScore = team1Away + team2Home;
    const bestScore = Math.max(directScore, swappedScore);
    const minSideScore = bestScore === directScore ? Math.min(team1Home, team2Away) : Math.min(team1Away, team2Home);

    return { game, bestScore, minSideScore };
  });

  const bestMatch = scoredMatches
    .filter(match => match.bestScore >= 6 && match.minSideScore >= 2)
    .sort((a, b) => b.bestScore - a.bestScore)[0];

  return bestMatch ? bestMatch.game : null;
}

function buildScoreResult(matchingGame: ESPNGame): ESPNScoreResult {
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

// Main function to get score for a Polymarket trade
export async function getESPNScoreForTrade(trade: FeedTrade): Promise<ESPNScoreResult | null> {
  const scores = await getESPNScoresForTrades([trade]);
  const key = trade.market.conditionId || trade.market.id || trade.market.title;
  return key ? scores.get(key) || null : null;
}

// Batch fetch scores for multiple trades (more efficient)
export async function getESPNScoresForTrades(trades: FeedTrade[]): Promise<Map<string, ESPNScoreResult>> {
  const scoreMap = new Map<string, ESPNScoreResult>();
  
  // Group trades by sport
  const sportGroups: Record<SportGroup, FeedTrade[]> = {
    nfl: [],
    nba: [],
    mlb: [],
    nhl: [],
    wnba: [],
    ncaaf: [],
    ncaab: [],
    ncaaw: [],
    soccer: [],
    tennis: [],
    golf: [],
    mma: [],
    boxing: [],
  };
  
  trades.forEach(trade => {
    const sport = detectSportType(trade.market.title, trade.market.category);
    if (sport && sportGroups[sport]) {
      sportGroups[sport].push(trade);
    }
  });
  
  // Fetch all sports in parallel
  const sportFetches = Object.entries(sportGroups)
    .filter(([_, trades]) => trades.length > 0)
    .map(async ([sport, sportTrades]) => {
      const sportKey = sport as SportGroup;
      const espnGames = await fetchESPNGroupScores(sportKey);

      sportTrades.forEach(trade => {
        const matchingGame = findMatchingGame(trade.market.title, espnGames);
        if (matchingGame) {
          console.log(`✅ Found ESPN game for "${trade.market.title}": ${matchingGame.name} (${matchingGame.status})`);
          const key = trade.market.conditionId || trade.market.id || trade.market.title;
          scoreMap.set(key, buildScoreResult(matchingGame));
        } else {
          console.log(`❌ No ESPN game found for "${trade.market.title}" in ${sportKey.toUpperCase()} feeds.`);
        }
      });
    });
  
  await Promise.all(sportFetches);
  
  console.log(`✅ Fetched scores for ${scoreMap.size} markets`);
  return scoreMap;
}
