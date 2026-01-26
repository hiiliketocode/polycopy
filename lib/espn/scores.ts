// Helper to fetch and match ESPN scores with Polymarket markets
import type { FeedTrade } from '@/app/feed/page';
import { extractDateFromTitle } from '@/lib/event-time';
import { abbreviateTeamName } from '@/lib/utils/team-abbreviations';

interface ESPNGame {
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

interface ESPNScoreResult {
  gameId: string;
  homeScore: number;
  awayScore: number;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  status: 'scheduled' | 'live' | 'final';
  startTime: string;
  gameUrl?: string;
  displayClock?: string;
  period?: number;
  statusDetail?: string;
}

/** Input type for getScoreDisplaySides; gameId is optional (unused by that helper). */
export type ESPNScoreInput = Omit<ESPNScoreResult, 'gameId'> & { gameId?: string };

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

type TeamHint = {
  homeTeam?: string | null;
  awayTeam?: string | null;
};

const ESPORTS_TOKENS = [
  'esports',
  'e-sports',
  'counter-strike',
  'counter strike',
  'cs:go',
  'csgo',
  'cs2',
  'dota',
  'dota2',
  'league of legends',
  'lol',
  'valorant',
  'overwatch',
  'rocket league',
  'fortnite',
  'pubg',
  'call of duty',
  'cod',
  'iem',
  'esl',
  'blast',
  'lcs',
  'lck',
  'lpl',
  'academy',
];

const looksLikeEsportsTitle = (value: string) =>
  ESPORTS_TOKENS.some((token) => value.includes(token));

const splitTagString = (value: string) =>
  value
    .split(/[|,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeTagValue = (tag: unknown): string[] => {
  if (!tag) return [];
  if (typeof tag === 'string') return splitTagString(tag);
  if (typeof tag === 'number' || typeof tag === 'boolean') return [String(tag)];
  if (typeof tag === 'object') {
    const record = tag as Record<string, unknown>;
    const candidate =
      record.name ?? record.label ?? record.value ?? record.slug ?? record.title ?? null;
    if (typeof candidate === 'string' && candidate.trim()) {
      return splitTagString(candidate);
    }
  }
  return [];
};

const normalizeTags = (tags: unknown): string[] => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags
      .flatMap((tag) => normalizeTagValue(tag))
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return normalizeTagValue(tags).map((tag) => tag.trim()).filter(Boolean);
};

const detectSportFromTags = (tags: unknown): SportGroup | null => {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) return null;
  const tagText = normalized.join(' ').toLowerCase();

  if (looksLikeEsportsTitle(tagText)) return null;

  if (tagText.match(/\bwnba\b/)) return 'wnba';
  if (tagText.match(/\bnfl\b/)) return 'nfl';
  if (tagText.match(/\bnba\b/)) return 'nba';
  if (tagText.match(/\bmlb\b/)) return 'mlb';
  if (tagText.match(/\bnhl\b/)) return 'nhl';
  if (tagText.match(/\bncaaf\b|\bcollege football\b|\bncaa football\b|\bcfb\b/)) return 'ncaaf';
  if (tagText.match(/\bncaaw\b|\bwcbb\b|\bwomen'?s college basketball\b/)) return 'ncaaw';
  if (tagText.match(/\bncaab\b|\bcbb\b|\bcollege basketball\b|\bncaa basketball\b/)) return 'ncaab';
  if (
    tagText.match(
      /\b(soccer|uefa|fifa|mls|epl|premier league|laliga|la liga|serie a|bundesliga|ligue 1|eredivisie|primeira|champions league|europa|conference league|copa|libertadores|sudamericana|liga mx|ligamx)\b/
    )
  ) {
    return 'soccer';
  }
  if (
    tagText.match(
      /\b(tennis|atp|wta|australian open|wimbledon|us open|roland garros|grand slam)\b/
    )
  ) {
    return 'tennis';
  }
  if (tagText.match(/\b(golf|pga|lpga|masters|open championship)\b/)) return 'golf';
  if (tagText.match(/\b(ufc|mma)\b/)) return 'mma';
  if (tagText.match(/\bboxing\b/)) return 'boxing';

  return null;
};

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
    'soccer_liga_mx',
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

const ESPN_TIME_ZONE = 'America/New_York';
const ESPN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ESPN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatEspnDateKey = (date: Date) =>
  ESPN_DATE_FORMATTER.format(date).replace(/-/g, '');

const toEspnDateKey = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatEspnDateKey(parsed);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.replace(/-/g, '');
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatEspnDateKey(parsed);
};

const toMatchDateKey = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const getDefaultEspnDateKeys = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return [formatEspnDateKey(now), formatEspnDateKey(tomorrow)];
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

// Detect sport type from market title
function detectSportType(
  title: string,
  category?: string | null,
  slug?: string | null,
  eventSlug?: string | null,
  tags?: unknown
): SportGroup | null {
  const titleLower = title.toLowerCase();
  const categoryLower = category ? category.toLowerCase() : '';
  const slugLower = [slug, eventSlug].filter(Boolean).join(' ').toLowerCase();
  const tagText = normalizeTags(tags).join(' ').toLowerCase();

  if (tagText && looksLikeEsportsTitle(tagText)) return null;

  const tagSport = detectSportFromTags(tags);
  if (tagSport) return tagSport;

  if (looksLikeEsportsTitle(titleLower) || looksLikeEsportsTitle(slugLower)) return null;

  if (titleLower.includes('wnba')) return 'wnba';
  if (slugLower.includes('wnba')) return 'wnba';
  if (slugLower.includes('nfl')) return 'nfl';
  if (slugLower.includes('nba')) return 'nba';
  if (slugLower.includes('mlb')) return 'mlb';
  if (slugLower.includes('nhl')) return 'nhl';
  if (
    slugLower.match(
      /\b(tennis|atp|wta|australian-?open|roland-?garros|wimbledon|us-?open)\b/
    )
  ) {
    return 'tennis';
  }
  if (slugLower.match(/\b(ncaaf|college-football|cfb)\b/)) return 'ncaaf';
  if (slugLower.match(/\b(ncaaw|womens?-college-basketball|wcbb)\b/)) return 'ncaaw';
  if (slugLower.match(/\b(ncaab|cbb|mens?-college-basketball|college-basketball|march-madness|college-hoops)\b/)) return 'ncaab';
  if (
    slugLower.match(
      /\b(soccer|fifa|uefa|mls|epl|premier-?league|laliga|serie-?a|bundesliga|ligue-?1|eredivisie|primeira|liga-?mx|champions-?league|europa-?league|europa-?cup|libertadores|sudamericana|copa|concacaf)\b/
    )
  ) {
    return 'soccer';
  }
  if (categoryLower.includes('tennis')) return 'tennis';
  if (
    titleLower.match(/\b(ncaaf|college football|cfb)\b/) ||
    (titleLower.includes('ncaa') && titleLower.includes('football')) ||
    (categoryLower.includes('college') && categoryLower.includes('football')) ||
    categoryLower.includes('ncaaf')
  ) {
    return 'ncaaf';
  }
  if (titleLower.match(/\b(ncaaw|women's college basketball|womens college basketball|wcbb)\b/)) return 'ncaaw';
  if (
    titleLower.match(/\b(ncaab|cbb|college basketball|college hoops|march madness)\b/) ||
    (titleLower.includes('ncaa') && titleLower.includes('basketball')) ||
    (categoryLower.includes('college') && categoryLower.includes('basketball')) ||
    categoryLower.includes('ncaab')
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

  if (titleLower.match(/\b(premier league|la liga|serie a|bundesliga|ligue 1|eredivisie|primeira|uefa|champions league|europa league|europa cup|conference league|world cup|fifa|copa|conmebol|concacaf|afc|caf|mls|liga mx|ligamx)\b/)) {
    return 'soccer';
  }

  if (
    titleLower.match(/\b(fc|cf|sc|afc)\b/) &&
    (titleLower.includes(' vs ') || titleLower.includes(' vs.') || titleLower.includes(' v ') || titleLower.includes(' @ ') || titleLower.includes(' versus '))
  ) {
    return 'soccer';
  }

  if (titleLower.match(/\b(afc|cf|fc)\b/) && titleLower.match(/\bwin\b/) && titleLower.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
    return 'soccer';
  }

  if (categoryLower === 'sports') {
    if (titleLower.match(/\b(premier league|premiership|epl|uefa|champions league|europa league|conference league|fa cup|carabao|community shield|liga mx|ligamx)\b/)) {
      return 'soccer';
    }
    if (titleLower.match(/\b(afc|cf|fc)\b/) && titleLower.match(/\bwin\b/)) {
      return 'soccer';
    }
    if (titleLower.match(/\bwin\b/) && titleLower.match(/\b\d{4}-\d{2}-\d{2}\b/)) {
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
    'club america',
    'atlas',
    'pachuca',
    'toluca',
    'leon',
    'santos laguna',
    'necaxa',
    'queretaro',
    'tijuana',
    'juarez',
    'mazatlan',
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

function isLikelySportsTitle(title: string, category?: string | null): boolean {
  const titleLower = title.toLowerCase();
  const categoryLower = category ? category.toLowerCase() : '';

  if (looksLikeEsportsTitle(titleLower)) return false;

  if (categoryLower === 'sports') return true;

  if (
    titleLower.includes(' vs ') ||
    titleLower.includes(' vs.') ||
    titleLower.includes(' v ') ||
    titleLower.includes(' @ ') ||
    titleLower.includes(' versus ')
  ) {
    return true;
  }

  return [
    'nfl',
    'nba',
    'wnba',
    'mlb',
    'nhl',
    'ncaa',
    'cbb',
    'college hoops',
    'soccer',
    'football',
    'basketball',
    'baseball',
    'hockey',
    'tennis',
    'golf',
    'mma',
    'ufc',
    'boxing',
    'wimbledon',
    'roland garros',
    'australian open',
    'us open',
    'atp',
    'wta',
    'liga mx',
    'ligamx',
    'world cup',
    'champions league',
    'premier league',
    'mls',
    'laliga',
    'serie a',
    'bundesliga',
    'ligue 1',
    'eredivisie',
    'primeira',
    'libertadores',
    'sudamericana',
  ].some(term => titleLower.includes(term));
}

// Extract team names from market title
export function extractTeamNames(title: string): { team1: string; team2: string } | null {
  let workingTitle = title.trim();
  if (workingTitle.includes(':')) {
    const afterColon = workingTitle.split(':').slice(1).join(':').trim();
    if (/\b(vs\.?|v\.?|@|versus|at)\b/i.test(afterColon)) {
      workingTitle = afterColon;
    }
  }

  // Remove spread/O-U indicators first: "Thunder (−9.5)" → "Thunder"
  const cleanTitle = workingTitle
    .replace(/\s*\([−+]?\d+\.?\d*\)/g, '') // Remove (−9.5) or (+7)
    .replace(/\s*O\/U\s*\d+\.?\d*/gi, '') // Remove O/U 215.5
    .replace(/\s*(Over|Under)\s*\d+\.?\d*/gi, '') // Remove Over/Under 215.5
    .replace(/\b(?:bo[1-7]|best of \d+)\b/gi, '') // Remove BO3/Best of 3
    .replace(/^\s*(Spread|Total|Moneyline|ML|Pick'?em|O\/U|Over\/Under)\s*\d*\.?\d*\s*:\s*/i, '') // Remove leading bet type
    .replace(/^\s*(Spread|Total|Moneyline|ML|Pick'?em)\s+/i, '') // Remove leading bet type without colon
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

  const beatPattern =
    /(?:will\s+)?(.+?)\s+(?:beat|defeat|defeats|win\s+over|win\s+against|to\s+beat)\s+(.+?)(?:\s|$|\?)/i;
  const beatMatch = cleanTitle.match(beatPattern);
  if (beatMatch) {
    return {
      team1: beatMatch[1].trim(),
      team2: beatMatch[2].trim(),
    };
  }
  
  return null;
}

function extractSingleTeamMatch(title: string): { team: string; dateKey?: string } | null {
  if (isSeasonLongMarketTitle(title)) return null;
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

function isSeasonLongMarketTitle(title: string): boolean {
  const lower = title.toLowerCase();
  if (!/\bwin\b/.test(lower)) return false;
  if (/\b20\d{2}\s*-\s*\d{2}\b/.test(lower) || /\b20\d{2}-\d{2}\b/.test(lower)) {
    return true;
  }
  return /\b(season|league|premier league|champions league|championship|tournament|cup|title)\b/.test(lower);
}

function extractSingleTeamHint(title: string): { team: string } | null {
  if (!/\b(spread|moneyline|ml|pick'?em|total|o\/u|over\/under)\b/i.test(title)) return null;
  const cleaned = title
    .replace(/\s*\([−+]?\d+\.?\d*\)/g, '')
    .replace(/\b(spread|moneyline|ml|pick'?em|total|o\/u|over\/under)\b\s*:/i, '')
    .replace(/\s*[−+-]?\d+\.?\d*\s*$/g, '')
    .trim();
  if (!cleaned || /\b(vs\.?|v\.?|@|versus|at)\b/i.test(cleaned)) return null;
  return { team: cleaned };
}

function buildTeamsFromHint(hint?: TeamHint) {
  if (!hint) return null;
  const home = hint.homeTeam?.trim();
  const away = hint.awayTeam?.trim();
  if (!home || !away) return null;
  return { team1: home, team2: away };
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
    .filter(token => token.length > 0 && !TEAM_NAME_STOP_WORDS.has(token));
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
    // For tennis players, check if last names match (common pattern: "Lorenzo Musetti" vs "L. Musetti")
    const marketLastToken = marketTokens[marketTokens.length - 1];
    const espnLastToken = espnTokens[espnTokens.length - 1];
    if (marketLastToken && espnLastToken && marketLastToken === espnLastToken && marketTokens.length > 1 && espnTokens.length > 0) {
      // Last name matches, give it a score boost
      const firstNameMatch = marketTokens[0] && espnTokens[0] && 
        (marketTokens[0].startsWith(espnTokens[0]) || espnTokens[0].startsWith(marketTokens[0]) || 
         marketTokens[0][0] === espnTokens[0][0]);
      if (firstNameMatch || espnTokens[0]?.length === 1) {
        // First name initial matches or ESPN has just an initial
        return 5;
      }
      // Last name matches but first name doesn't - still a good match
      return 3;
    }

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
  espnScore: ESPNScoreInput
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
async function fetchESPNScores(sportKey: string, dateKey?: string): Promise<ESPNGame[]> {
  try {
    const params = new URLSearchParams({ sport: sportKey });
    if (dateKey) params.set('date', dateKey);
    let response = await fetch(`/api/espn/scores?${params.toString()}`, {
      cache: 'no-store',
    });
    
    if (!response.ok && dateKey) {
      response = await fetch(`/api/espn/scores?sport=${sportKey}`, {
        cache: 'no-store',
      });
    }

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

async function fetchESPNGroupScores(sport: SportGroup, dateKey?: string): Promise<ESPNGame[]> {
  const groupKeys = ESPN_SPORT_GROUPS[sport];
  if (!groupKeys || groupKeys.length === 0) return [];

  const results = await Promise.all(groupKeys.map(key => fetchESPNScores(key, dateKey)));
  return results.flat();
}

function findMatchingGame(
  marketTitle: string,
  games: ESPNGame[],
  options?: { dateHintKey?: string | null; sport?: SportGroup; teamHint?: TeamHint }
): ESPNGame | null {
  const teamsFromTitle = extractTeamNames(marketTitle);
  const teams = teamsFromTitle || buildTeamsFromHint(options?.teamHint);
  if (!teams) {
    const singleTeamMatch = extractSingleTeamMatch(marketTitle);
    const fallbackSingleTeam = singleTeamMatch ?? extractSingleTeamHint(marketTitle);
    if (!fallbackSingleTeam) return null;
    const titleDateKey = extractDateFromTitle(marketTitle);
    const targetDateKey =
      'dateKey' in fallbackSingleTeam && fallbackSingleTeam.dateKey
        ? fallbackSingleTeam.dateKey
        : titleDateKey || options?.dateHintKey || null;

    const scoredMatches = games.map(game => {
      const homeScore = scoreTeamMatch(fallbackSingleTeam.team, game.homeTeam.name, game.homeTeam.abbreviation);
      const awayScore = scoreTeamMatch(fallbackSingleTeam.team, game.awayTeam.name, game.awayTeam.abbreviation);
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
        return match.baseScore >= 4;
      })
      .sort((a, b) => {
        const statusScore = (game: ESPNGame) =>
          game.status === 'live' ? 2 : game.status === 'final' ? 1 : 0;
        return b.bestScore + statusScore(b.game) - (a.bestScore + statusScore(a.game));
      })[0];

    if (bestMatch) return bestMatch.game;

    if (targetDateKey) return null;

    return null;
  }

  const titleDateKey = extractDateFromTitle(marketTitle);
  const targetDateKey = titleDateKey || options?.dateHintKey || null;

  const scoredMatches = games.map(game => {
    const team1Home = scoreTeamMatch(teams.team1, game.homeTeam.name, game.homeTeam.abbreviation);
    const team2Away = scoreTeamMatch(teams.team2, game.awayTeam.name, game.awayTeam.abbreviation);
    const team1Away = scoreTeamMatch(teams.team1, game.awayTeam.name, game.awayTeam.abbreviation);
    const team2Home = scoreTeamMatch(teams.team2, game.homeTeam.name, game.homeTeam.abbreviation);

    const directScore = team1Home + team2Away;
    const swappedScore = team1Away + team2Home;
    const bestScore = Math.max(directScore, swappedScore);
    const minSideScore = bestScore === directScore ? Math.min(team1Home, team2Away) : Math.min(team1Away, team2Home);
    const dateKey = getStartDateKey(game.startTime);
    const dateMatch = targetDateKey && dateKey && targetDateKey === dateKey;

    return { game, bestScore, minSideScore, dateMatch: Boolean(dateMatch) };
  });

  const bestMatch = scoredMatches
    .filter(match => {
      if (options?.sport === 'tennis') {
        if (targetDateKey) {
          return match.bestScore >= 4 && match.minSideScore >= 1 && match.dateMatch;
        }
        return match.bestScore >= 4 && match.minSideScore >= 1;
      }
      if (targetDateKey) {
        return match.bestScore >= 6 && match.minSideScore >= 2 && match.dateMatch;
      }
      return match.bestScore >= 6 && match.minSideScore >= 2;
    })
    .sort((a, b) => b.bestScore - a.bestScore)[0];

  if (bestMatch) return bestMatch.game;

  if (targetDateKey) {
    const fallbackMatch = scoredMatches
      .filter(match => {
        if (options?.sport === 'tennis') {
          return match.bestScore >= 4 && match.minSideScore >= 1;
        }
        return match.bestScore >= 6 && match.minSideScore >= 2;
      })
      .sort((a, b) => b.bestScore - a.bestScore)[0];
    return fallbackMatch ? fallbackMatch.game : null;
  }

  return null;
}

function buildScoreResult(matchingGame: ESPNGame): ESPNScoreResult {
  return {
    gameId: matchingGame.id,
    homeScore: matchingGame.homeTeam.score || 0,
    awayScore: matchingGame.awayTeam.score || 0,
    homeTeamName: matchingGame.homeTeam.name,
    awayTeamName: matchingGame.awayTeam.name,
    homeTeamAbbrev: matchingGame.homeTeam.abbreviation,
    awayTeamAbbrev: matchingGame.awayTeam.abbreviation,
    status: matchingGame.status,
    startTime: matchingGame.startTime,
    gameUrl: normalizeEspnLink(matchingGame.link),
    displayClock: matchingGame.displayClock,
    period: matchingGame.period,
    statusDetail: matchingGame.statusDetail,
  };
}

// Main function to get score for a Polymarket trade
export async function getESPNScoreForTrade(trade: FeedTrade): Promise<ESPNScoreResult | null> {
  const scores = await getESPNScoresForTrades([trade]);
  const key = trade.market.conditionId || trade.market.id || trade.market.title;
  return key ? scores.get(key) || null : null;
}

// Batch fetch scores for multiple trades (more efficient)
export async function getESPNScoresForTrades(
  trades: FeedTrade[],
  options?: {
    dateHints?: Array<string | number | null | undefined>;
    dateHintsByMarketKey?: Record<string, string | number | null | undefined>;
    teamHintsByMarketKey?: Record<string, TeamHint>;
  }
): Promise<Map<string, ESPNScoreResult>> {
  const scoreMap = new Map<string, ESPNScoreResult>();
  const gamesBySportDate = new Map<string, ESPNGame[]>();
  const ALL_SPORTS = Object.keys(ESPN_SPORT_GROUPS) as SportGroup[];
  const matchDateKeysByMarketKey = (() => {
    const keys = new Map<string, string>();
    if (!options?.dateHintsByMarketKey) return keys;
    Object.entries(options.dateHintsByMarketKey).forEach(([marketKey, hint]) => {
      const matchKey = toMatchDateKey(hint ?? undefined);
      if (matchKey) keys.set(marketKey, matchKey);
    });
    return keys;
  })();

  const teamHintsByMarketKeyMap = (() => {
    const hints = new Map<string, TeamHint>();
    if (!options?.teamHintsByMarketKey) return hints;
    Object.entries(options.teamHintsByMarketKey).forEach(([marketKey, hint]) => {
      if (!hint) return;
      const homeTeam = typeof hint.homeTeam === 'string' ? hint.homeTeam.trim() : hint.homeTeam;
      const awayTeam = typeof hint.awayTeam === 'string' ? hint.awayTeam.trim() : hint.awayTeam;
      if (!homeTeam && !awayTeam) return;
      hints.set(marketKey, {
        homeTeam: homeTeam || undefined,
        awayTeam: awayTeam || undefined,
      });
    });
    return hints;
  })();

  const dateKeys = (() => {
    const keys = new Set(getDefaultEspnDateKeys());
    options?.dateHints?.forEach((hint) => {
      const key = toEspnDateKey(hint ?? undefined);
      if (key) keys.add(key);
    });
    return Array.from(keys);
  })();

  const fetchGamesForSportDate = async (
    sport: SportGroup,
    dateKey?: string
  ): Promise<ESPNGame[]> => {
    const cacheKey = `${sport}:${dateKey ?? 'default'}`;
    const cached = gamesBySportDate.get(cacheKey);
    if (cached) return cached;
    const games = await fetchESPNGroupScores(sport, dateKey);
    gamesBySportDate.set(cacheKey, games);
    return games;
  };

  const fetchGamesForSport = async (sport: SportGroup): Promise<ESPNGame[]> => {
    const targetKeys = dateKeys.length > 0 ? dateKeys : [undefined];
    const results = await Promise.all(
      targetKeys.map((key) => fetchGamesForSportDate(sport, key))
    );
    const seen = new Set<string>();
    const deduped: ESPNGame[] = [];
    results.flat().forEach((game) => {
      if (seen.has(game.id)) return;
      seen.add(game.id);
      deduped.push(game);
    });
    return deduped;
  };
  
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
  const unknownTrades: FeedTrade[] = [];
  
  trades.forEach(trade => {
    const sport = detectSportType(
      trade.market.title,
      trade.market.category,
      trade.market.slug,
      trade.market.eventSlug,
      trade.market.tags
    );
    if (sport && sportGroups[sport]) {
      sportGroups[sport].push(trade);
    } else if (isLikelySportsTitle(trade.market.title, trade.market.category)) {
      unknownTrades.push(trade);
    }
  });
  
  // Fetch all sports in parallel
  const sportFetches = Object.entries(sportGroups)
    .filter(([_, trades]) => trades.length > 0)
    .map(async ([sport, sportTrades]) => {
      const sportKey = sport as SportGroup;
      const espnGames = await fetchGamesForSport(sportKey);

      sportTrades.forEach(trade => {
        const marketKey = trade.market.conditionId || trade.market.id || trade.market.title;
        const dateHintKey = marketKey ? matchDateKeysByMarketKey.get(marketKey) ?? null : null;
        const matchingGame = findMatchingGame(trade.market.title, espnGames, {
          dateHintKey,
          sport: sportKey,
          teamHint: marketKey ? teamHintsByMarketKeyMap.get(marketKey) : undefined,
        });
        if (matchingGame) {
          console.log(`✅ Found ESPN game for "${trade.market.title}": ${matchingGame.name} (${matchingGame.status})`);
          const key = marketKey;
          scoreMap.set(key, buildScoreResult(matchingGame));
        } else {
          console.log(`❌ No ESPN game found for "${trade.market.title}" in ${sportKey.toUpperCase()} feeds.`);
        }
      });
    });
  
  await Promise.all(sportFetches);

  if (unknownTrades.length > 0) {
    for (const trade of unknownTrades) {
      const key = trade.market.conditionId || trade.market.id || trade.market.title;
      if (!key || scoreMap.has(key)) continue;

      for (const sport of ALL_SPORTS) {
        const games = await fetchGamesForSport(sport);
        const dateHintKey = matchDateKeysByMarketKey.get(key) ?? null;
        const matchingGame = findMatchingGame(trade.market.title, games, {
          dateHintKey,
          sport,
          teamHint: teamHintsByMarketKeyMap.get(key),
        });
        if (matchingGame) {
          console.log(`✅ Found ESPN game for "${trade.market.title}": ${matchingGame.name} (${matchingGame.status})`);
          scoreMap.set(key, buildScoreResult(matchingGame));
          break;
        }
      }
    }
  }
  
  console.log(`✅ Fetched scores for ${scoreMap.size} markets`);
  return scoreMap;
}

// Map sport keys to their ESPN URL paths (for scoreboard URLs)
const SPORT_KEY_TO_URL_PATH: Record<string, string> = {
  nfl: 'nfl',
  nba: 'nba',
  mlb: 'mlb',
  nhl: 'nhl',
  wnba: 'wnba',
  ncaaf: 'college-football',
  ncaab: 'mens-college-basketball',
  ncaaw: 'womens-college-basketball',
  tennis_atp: 'tennis',
  tennis_wta: 'tennis',
  golf_pga: 'golf',
  golf_lpga: 'golf',
  mma_ufc: 'mma',
  boxing: 'boxing',
  // Soccer leagues all use 'soccer'
  soccer_mls: 'soccer',
  soccer_epl: 'soccer',
  soccer_eng_champ: 'soccer',
  soccer_laliga: 'soccer',
  soccer_seriea: 'soccer',
  soccer_bundesliga: 'soccer',
  soccer_ligue1: 'soccer',
  soccer_eredivisie: 'soccer',
  soccer_primeira: 'soccer',
  soccer_scottish_prem: 'soccer',
  soccer_uefa_champions: 'soccer',
  soccer_uefa_europa: 'soccer',
  soccer_uefa_conference: 'soccer',
  soccer_liga_mx: 'soccer',
  soccer_fifa_world_cup: 'soccer',
  soccer_fifa_womens_world_cup: 'soccer',
  soccer_uefa_euro: 'soccer',
  soccer_copa_libertadores: 'soccer',
  soccer_copa_sudamericana: 'soccer',
};

// Generate a fallback ESPN URL based on market information
export function getFallbackEspnUrl(params: {
  title?: string | null;
  category?: string | null;
  slug?: string | null;
  eventSlug?: string | null;
  tags?: unknown;
  dateHint?: string | number | null | undefined;
}): string | undefined {
  const { title, category, slug, eventSlug, tags, dateHint } = params;
  
  if (!title) return undefined;
  
  const sport = detectSportType(title, category, slug, eventSlug, tags);
  if (!sport) return undefined;
  
  const sportGroups = ESPN_SPORT_GROUPS[sport];
  if (!sportGroups || sportGroups.length === 0) return undefined;
  
  // Use the first sport key in the group
  const sportKey = sportGroups[0];
  
  // Map sport key to URL path (e.g., tennis_atp -> tennis)
  const urlPath = SPORT_KEY_TO_URL_PATH[sportKey] || sportKey;
  
  // Build ESPN URL
  let url = `https://www.espn.com/${urlPath}/scoreboard`;
  
  // Add date if provided
  if (dateHint) {
    const dateKey = toEspnDateKey(dateHint);
    if (dateKey) {
      url += `/_/date/${dateKey}`;
    }
  }
  
  return url;
}
