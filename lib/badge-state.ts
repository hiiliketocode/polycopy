import { extractDateFromTitle } from "./event-time"
import {
  isSeasonLongMarketTitle,
  normalizeEventStatus,
  statusLooksFinal,
  statusLooksLive,
  statusLooksScheduled,
} from "./market-status"

export type MarketCategoryType = "SPORTS_SCOREABLE" | "SPORTS_NON_SCOREABLE" | "NON_SPORTS"
export type BadgeStateType = "scheduled" | "live" | "ended" | "resolved" | "none"
export type BadgeSource = "gamma" | "websocket" | "espn" | "none"

export type ScoreValue = { home: number | null; away: number | null }
export type ScoreSources = {
  gamma?: ScoreValue | null
  espn?: ScoreValue | null
  websocket?: ScoreValue | null
}

export type ResolvedGameTime = { time: string | null; source: BadgeSource; priority?: number }

export type BadgeState = {
  type: BadgeStateType
  time: string | null
  score: ScoreValue | null
  source: BadgeSource
}

type MarketIdentity = {
  marketKey: string
  title: string
  category?: string | null
  tags?: unknown
  outcomes?: string[] | null
  categoryType?: MarketCategoryType
  gameStartTime?: string | null
}

export type DeriveBadgeStateInput = MarketIdentity & {
  gammaStartTime?: string | null
  marketStartTime?: string | null
  endDateIso?: string | null
  completedTime?: string | null
  gammaStatus?: string | null
  gammaResolved?: boolean
  websocketLive?: boolean
  websocketEnded?: boolean
  scoreSources?: ScoreSources
  espnStatus?: "scheduled" | "live" | "final" | null
  previousState?: BadgeState | null
  cachedGameTime?: ResolvedGameTime | null
  now?: number
}

export type DeriveBadgeStateResult = {
  state: BadgeState
  resolvedGameTime: ResolvedGameTime
  upgraded: boolean
  illegalDowngrade: boolean
  timeMissing: boolean
  categoryType: MarketCategoryType
}

const STATE_RANK: Record<BadgeStateType, number> = {
  none: 0,
  scheduled: 1,
  live: 2,
  ended: 3,
  resolved: 3,
}

const SOURCE_RANK: Record<BadgeSource, number> = {
  none: 0,
  gamma: 1,
  espn: 2,
  websocket: 3,
}

const sportsTokens = [
  "nfl",
  "nba",
  "mlb",
  "nhl",
  "soccer",
  "premier league",
  "laliga",
  "la liga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "mls",
  "f1",
  "formula 1",
  "ufc",
  "mma",
  "boxing",
  "golf",
  "pga",
  "tennis",
  "wimbledon",
  "ncaa",
  "ncaab",
  "ncaaf",
  "ncaaw",
  "college",
  "basketball",
  "football",
  "baseball",
  "hockey",
]

const futuresTokens = [
  "to win",
  "winner",
  "championship",
  "champion",
  "title",
  "outright",
  "futures",
  "make playoffs",
  "win total",
  "regular season",
  "series price",
  "division",
  "conference",
  "mvp",
  "cy young",
  "heisman",
  "ballon d'or",
  "golden boot",
]

const scoreableTokens = [
  " vs ",
  " vs.",
  " v ",
  " @ ",
  " at ",
  "o/u",
  "over/under",
  "spread",
  "moneyline",
]

const normalizeValue = (value?: string | null) => value?.toLowerCase().trim() || ""

const normalizeTags = (tags?: unknown) => {
  if (!tags) return ""
  if (typeof tags === "string") return tags.toLowerCase()
  if (Array.isArray(tags)) {
    return tags
      .map((entry) => {
        if (typeof entry === "string") return entry.toLowerCase()
        if (typeof entry === "object" && entry !== null) {
          const record = entry as Record<string, unknown>
          const candidate =
            record.name ??
            record.label ??
            record.value ??
            record.slug ??
            record.title ??
            record.sport ??
            null
          if (typeof candidate === "string") return candidate.toLowerCase()
        }
        return ""
      })
      .filter(Boolean)
      .join(" ")
  }
  if (typeof tags === "object") {
    return Object.values(tags as Record<string, unknown>)
      .map((value) => (typeof value === "string" ? value.toLowerCase() : ""))
      .filter(Boolean)
      .join(" ")
  }
  return ""
}

export const resolveMarketCategoryType = (identity: MarketIdentity): MarketCategoryType => {
  const title = normalizeValue(identity.title)
  const category = normalizeValue(identity.category)
  const tags = normalizeTags(identity.tags)
  const outcomes = identity.outcomes ?? []
  const startHint = identity.gameStartTime
  const hasGameStartTime = typeof startHint === "string" && startHint.trim().length > 0

  // Check if tags contain sports tokens (ONLY tags, no title/category fallbacks)
  const hasSportsInTags = tags.length > 0
    ? sportsTokens.some((token) => tags.includes(token))
    : false

  // For live games: if it has game_start_time, treat it as sports
  // (game_start_time is the primary indicator of a sports game)
  // Tags are used to confirm, but game_start_time is the key signal
  const isLiveGame = hasGameStartTime

  if (!isLiveGame) {
    return "NON_SPORTS"
  }

  // Don't use title for scoreable signals - only check if it's a future
  const hasScoreableSignals = hasGameStartTime

  const isFuture =
    isSeasonLongMarketTitle(identity.title) ||
    futuresTokens.some((token) => title.includes(token)) ||
    outcomes.length > 2

  if (isFuture || !hasScoreableSignals) {
    return "SPORTS_NON_SCOREABLE"
  }

  return "SPORTS_SCOREABLE"
}

const normalizeIso = (value?: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

const parseExplicitIsoFromTitle = (title: string) => {
  const match = title.match(/\b(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\b/)
  if (!match) return null
  const raw = `${match[1]}T${match[2]}`
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

type GameTimeCandidate = {
  time: string
  source: BadgeSource
  priority: number
}

const buildGameTimeCandidate = (
  value: string | null | undefined,
  source: BadgeSource,
  priority: number
): GameTimeCandidate | null => {
  const normalized = normalizeIso(value)
  if (!normalized) return null
  return { time: normalized, source, priority }
}

const buildEndOfDayCandidate = (endDateIso: string | null | undefined, title: string): GameTimeCandidate | null => {
  const normalizedEnd = normalizeIso(endDateIso)
  if (!normalizedEnd) return null
  const titleDate = extractDateFromTitle(title)
  if (!titleDate) return null
  if (normalizedEnd.slice(0, 10) !== titleDate) return null
  return { time: normalizedEnd, source: "gamma", priority: 2 }
}

// Build end time candidate without title date restriction (for use as fallback)
const buildEndTimeCandidate = (endDateIso: string | null | undefined): GameTimeCandidate | null => {
  const normalizedEnd = normalizeIso(endDateIso)
  if (!normalizedEnd) return null
  return { time: normalizedEnd, source: "gamma", priority: 1 }
}

export const resolveGameTime = ({
  cachedGameTime,
  gammaStartTime,
  marketStartTime,
  endDateIso,
  useEndTimeAsFallback = false,
}: {
  cachedGameTime?: ResolvedGameTime | null
  gammaStartTime?: string | null
  marketStartTime?: string | null
  endDateIso?: string | null
  useEndTimeAsFallback?: boolean
}): ResolvedGameTime => {
  const candidates: GameTimeCandidate[] = []
  // ONLY use game_start_time (marketStartTime) from markets table, no fallbacks
  const marketCandidate = buildGameTimeCandidate(marketStartTime, "gamma", 4)
  if (marketCandidate) candidates.push(marketCandidate)

  let bestCandidate: GameTimeCandidate | null = null
  if (cachedGameTime && cachedGameTime.time) {
    bestCandidate = {
      time: cachedGameTime.time,
      source: cachedGameTime.source,
      priority: cachedGameTime.priority ?? 0,
    }
  }

  for (const candidate of candidates) {
    if (!bestCandidate || candidate.priority > bestCandidate.priority) {
      bestCandidate = candidate
    }
  }

  // If no start time found and we should use end time as fallback, use it
  if (!bestCandidate && useEndTimeAsFallback) {
    const endTimeCandidate = buildEndTimeCandidate(endDateIso)
    if (endTimeCandidate) {
      bestCandidate = endTimeCandidate
    }
  }

  if (bestCandidate) {
    return { ...bestCandidate }
  }

  return {
    time: cachedGameTime?.time ?? null,
    source: cachedGameTime?.source ?? "none",
    priority: cachedGameTime?.priority ?? 0,
  }
}

const pickHigherSource = (next?: BadgeSource, prev?: BadgeSource): BadgeSource => {
  const current = prev || "none"
  const candidate = next || "none"
  return SOURCE_RANK[candidate] >= SOURCE_RANK[current] ? candidate : current
}

const pickScore = (type: BadgeStateType, sources?: ScoreSources | null): ScoreValue | null => {
  if (type !== "live" && type !== "ended") return null
  if (!sources) return null
  const ordered: (ScoreValue | null | undefined)[] = [
    sources.websocket,
    sources.espn,
    sources.gamma,
  ]
  for (const candidate of ordered) {
    if (!candidate) continue
    const home = Number.isFinite(candidate.home) ? Number(candidate.home) : null
    const away = Number.isFinite(candidate.away) ? Number(candidate.away) : null
    if (home !== null || away !== null) {
      return { home, away }
    }
  }
  return null
}

export const deriveBadgeState = (input: DeriveBadgeStateInput): DeriveBadgeStateResult => {
  const {
    marketKey,
    title,
    category,
    tags,
    outcomes,
    categoryType: providedCategory,
    gammaStartTime,
    marketStartTime,
    endDateIso,
    completedTime,
    gammaStatus,
    gammaResolved,
    websocketLive,
    websocketEnded,
    scoreSources,
    previousState,
    cachedGameTime,
    now,
  } = input

  // ============================================================================
  // CANONICAL FLOW - Three simple questions:
  // 1. Is it a game? → Check if game_start_time exists
  // 2. When does it start? → Use game_start_time
  // 3. Is it live or ended? → Compare current time to game_start_time and completed_time
  // ============================================================================

  // STEP 1: Is it a game?
  // If marketStartTime (game_start_time) exists, it's a sports game
  const hasGameStartTime = Boolean(marketStartTime)
  const categoryType = hasGameStartTime
    ? resolveMarketCategoryType({
        marketKey,
        title,
        category,
        tags,
        outcomes,
        categoryType: providedCategory,
        gameStartTime: marketStartTime,
      })
    : providedCategory ??
      resolveMarketCategoryType({
        marketKey,
        title,
        category,
        tags,
        outcomes,
        categoryType: providedCategory,
        gameStartTime: gammaStartTime,
      })

  const isSportsMarket = categoryType === "SPORTS_SCOREABLE" || categoryType === "SPORTS_NON_SCOREABLE"

  // STEP 2: When does it start?
  // Use game_start_time for sports, end_time for non-sports
  const prev = previousState || null
  let finalTime: string | null = null
  
  if (isSportsMarket && hasGameStartTime && marketStartTime) {
    const normalized = normalizeIso(marketStartTime)
    finalTime = normalized ?? prev?.time ?? null
  } else if (endDateIso) {
    const endTimeCandidate = buildEndTimeCandidate(endDateIso)
    finalTime = endTimeCandidate?.time ?? prev?.time ?? null
  } else {
    finalTime = prev?.time ?? cachedGameTime?.time ?? null
  }

  // STEP 3: Is it live or ended?
  // Simple rules:
  // - If completed_time exists → ended
  // - If current time >= game_start_time AND no completed_time → live
  // - Otherwise → scheduled
  const currentTime = now ? new Date(now) : new Date()
  let candidateType: BadgeStateType = "scheduled"
  let candidateSource: BadgeSource = "gamma"

  if (categoryType === "NON_SPORTS") {
    // Non-sports: resolved or scheduled
    candidateType = gammaResolved || statusLooksFinal(normalizeEventStatus(gammaStatus)) ? "resolved" : "scheduled"
  } else if (isSportsMarket && hasGameStartTime && marketStartTime) {
    // Sports game: check live/ended status
    const normalizedStartTime = normalizeIso(marketStartTime)
    if (normalizedStartTime) {
      const startDate = new Date(normalizedStartTime)
      if (!Number.isNaN(startDate.getTime())) {
        // Check if game has ended (completed_time exists)
        if (completedTime) {
          candidateType = "ended"
          candidateSource = "gamma"
        }
        // Check if game is live (current time >= start time AND not ended)
        else if (currentTime >= startDate) {
          candidateType = "live"
          candidateSource = "gamma"
        }
        // Otherwise, game hasn't started yet
        else {
          candidateType = "scheduled"
          candidateSource = "gamma"
        }
      }
    }
    
    // Override with status-based indicators if available (but time-based takes priority)
    const normalizedStatus = normalizeEventStatus(gammaStatus)
    if (candidateType === "scheduled" && statusLooksLive(normalizedStatus)) {
      candidateType = "live"
      candidateSource = "gamma"
    } else if (candidateType === "scheduled" && statusLooksFinal(normalizedStatus)) {
      candidateType = "ended"
      candidateSource = "gamma"
    }
    
    // Websocket indicators
    if (websocketLive && candidateType === "scheduled") {
      candidateType = "live"
      candidateSource = "websocket"
    } else if (websocketEnded && candidateType !== "ended") {
      candidateType = "ended"
      candidateSource = "websocket"
    }
  } else {
    // Sports market without game_start_time: treat as scheduled
    candidateType = "scheduled"
  }

  const nextState: BadgeState = {
    type: candidateType,
    time: finalTime,
    score: null,
    source: candidateSource || "none",
  }

  const prevRank = STATE_RANK[prev?.type ?? "none"]
  const nextRank = STATE_RANK[nextState.type]
  const illegalDowngrade = nextRank < prevRank
  const upgraded = nextRank > prevRank

  if (illegalDowngrade && prev) {
    nextState.type = prev.type
    nextState.source = prev.source
    nextState.time = prev.time
    nextState.score = prev.score
  } else {
    nextState.source = pickHigherSource(nextState.source, prev?.source)
  }

  const resolvedScore = pickScore(nextState.type, scoreSources)
  if (resolvedScore) {
    nextState.score = resolvedScore
    const scoreSource = scoreSources?.websocket
      ? "websocket"
      : scoreSources?.espn
        ? "espn"
        : scoreSources?.gamma
          ? "gamma"
          : nextState.source
    nextState.source = pickHigherSource(scoreSource as BadgeSource, nextState.source)
  } else if (prev?.score && nextState.type === prev.type) {
    nextState.score = prev.score
    nextState.source = pickHigherSource(prev.source, nextState.source)
  }

  // Create resolvedGameTime for return value
  const resolvedGameTime: ResolvedGameTime = {
    time: finalTime,
    source: candidateSource,
    priority: 0,
  }

  return {
    state: nextState,
    resolvedGameTime,
    upgraded,
    illegalDowngrade,
    timeMissing: !nextState.time,
    categoryType,
  }
}
