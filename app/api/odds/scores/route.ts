// Secondary scores provider proxy (The Odds API)
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, externalApiError } from '@/lib/http/error-response';
import { abbreviateTeamName } from '@/lib/utils/team-abbreviations';

interface OddsScoreEntry {
  name: string;
  score: string | number;
}

interface OddsScoreGame {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  completed?: boolean;
  home_team: string;
  away_team: string;
  scores?: OddsScoreEntry[] | null;
  last_update?: string;
}

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports';

function parseScore(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveStatus(game: OddsScoreGame): 'scheduled' | 'live' | 'final' {
  if (game.completed) return 'final';
  const start = new Date(game.commence_time);
  const now = new Date();
  const hasScores = Array.isArray(game.scores) && game.scores.length > 0;

  if (!Number.isNaN(start.getTime())) {
    if (now < start) return 'scheduled';
    if (hasScores) return 'live';
    return 'live';
  }

  return hasScores ? 'live' : 'scheduled';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const oddsKey = searchParams.get('oddsKey') || searchParams.get('sport');

  if (!oddsKey) {
    return badRequest('Missing oddsKey');
  }

  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      success: false,
      disabled: true,
      games: [],
    });
  }

  try {
    const url = `${ODDS_API_BASE}/${encodeURIComponent(oddsKey)}/scores/?apiKey=${apiKey}&daysFrom=3`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Odds API returned ${response.status}`);
    }

    const data: OddsScoreGame[] = await response.json();

    const games = (data || []).map((game) => {
      const homeLabel = game.home_team || '';
      const awayLabel = game.away_team || '';
      const status = resolveStatus(game);

      const scoreEntries = Array.isArray(game.scores) ? game.scores : [];
      const normalizeName = (value: string) => value.toLowerCase().trim();
      const homeScoreEntry = scoreEntries.find(entry => {
        const entryName = normalizeName(entry.name);
        const homeName = normalizeName(homeLabel);
        return entryName === homeName || entryName.includes(homeName) || homeName.includes(entryName);
      });
      const awayScoreEntry = scoreEntries.find(entry => {
        const entryName = normalizeName(entry.name);
        const awayName = normalizeName(awayLabel);
        return entryName === awayName || entryName.includes(awayName) || awayName.includes(entryName);
      });

      return {
        id: game.id,
        name: `${awayLabel} at ${homeLabel}`.trim(),
        shortName: `${abbreviateTeamName(awayLabel)} @ ${abbreviateTeamName(homeLabel)}`.trim(),
        homeTeam: {
          name: homeLabel,
          abbreviation: abbreviateTeamName(homeLabel),
          score: parseScore(homeScoreEntry?.score),
        },
        awayTeam: {
          name: awayLabel,
          abbreviation: abbreviateTeamName(awayLabel),
          score: parseScore(awayScoreEntry?.score),
        },
        status,
        startTime: game.commence_time,
        displayClock: undefined,
        period: undefined,
      };
    });

    return NextResponse.json({
      success: true,
      provider: 'odds',
      oddsKey,
      totalGames: games.length,
      games,
    });
  } catch (error: any) {
    return externalApiError('Odds', error, `fetch ${oddsKey} scores`);
  }
}
