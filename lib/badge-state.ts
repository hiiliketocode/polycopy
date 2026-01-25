import { extractDateFromTitle } from "./event-time"
import {
  isSeasonLongMarketTitle,
  normalizeEventStatus,
  statusLooksFinal,
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

export type ResolvedGameTime = { time: string | null; source: BadgeSource }

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
}

export type DeriveBadgeStateInput = MarketIdentity & {
  gammaStartTime?: string | null
  marketStartTime?: string | null
  endDateIso?: string | null
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

  const looksSports =
    category.includes("sport") ||
    sportsTokens.some((token) => title.includes(token)) ||
    sportsTokens.some((token) => tags.includes(token))

  if (!looksSports) {
    return "NON_SPORTS"
  }

  const hasScoreableSignals =
    scoreableTokens.some((token) => title.includes(token)) ||
    /\b(fc|sc|cf|afc|club)\b/.test(title) ||
    /\b\d+-\d+\b/.test(title)

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

export const resolveGameTime = ({
  cachedGameTime,
  gammaStartTime,
  marketStartTime,
  endDateIso,
  title,
}: {
  cachedGameTime?: ResolvedGameTime | null
  gammaStartTime?: string | null
  marketStartTime?: string | null
  endDateIso?: string | null
  title: string
}): ResolvedGameTime => {
  if (cachedGameTime) return cachedGameTime

  const gamma = normalizeIso(gammaStartTime)
  if (gamma) return { time: gamma, source: "gamma" }

  const market = normalizeIso(marketStartTime)
  if (market) return { time: market, source: "gamma" }

  const endIso = normalizeIso(endDateIso)
  const titleDate = extractDateFromTitle(title)
  if (endIso && titleDate && endIso.slice(0, 10) === titleDate) {
    return { time: endIso, source: "gamma" }
  }

  const explicit = parseExplicitIsoFromTitle(title)
  if (explicit) return { time: explicit, source: "none" }

  return { time: null, source: "none" }
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
    gammaStatus,
    gammaResolved,
    websocketLive,
    websocketEnded,
    scoreSources,
    previousState,
    cachedGameTime,
  } = input

  const categoryType =
    providedCategory ??
    resolveMarketCategoryType({ marketKey, title, category, tags, outcomes, categoryType: providedCategory })

  const resolvedGameTime = resolveGameTime({
    cachedGameTime,
    gammaStartTime,
    marketStartTime,
    endDateIso,
    title,
  })

  const normalizedStatus = normalizeEventStatus(gammaStatus)
  const gammaScheduled = statusLooksScheduled(normalizedStatus)
  const gammaEnded = Boolean(gammaResolved) || statusLooksFinal(normalizedStatus)

  let candidateType: BadgeStateType = "scheduled"
  let candidateSource: BadgeSource = resolvedGameTime.source

  if (categoryType === "NON_SPORTS") {
    candidateType = gammaEnded ? "resolved" : "scheduled"
    candidateSource = gammaEnded ? "gamma" : resolvedGameTime.source
  } else if (categoryType === "SPORTS_NON_SCOREABLE") {
    candidateType = "scheduled"
    candidateSource = resolvedGameTime.source
  } else {
    if (gammaEnded || (websocketEnded && !gammaScheduled)) {
      candidateType = "ended"
      candidateSource = gammaEnded ? "gamma" : "websocket"
    } else if (websocketLive && !gammaScheduled) {
      candidateType = "live"
      candidateSource = "websocket"
    } else {
      candidateType = "scheduled"
      candidateSource = resolvedGameTime.source || "gamma"
    }
  }

  const prev = previousState || null
  const nextState: BadgeState = {
    type: candidateType,
    time: resolvedGameTime.time ?? prev?.time ?? null,
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

  return {
    state: nextState,
    resolvedGameTime,
    upgraded,
    illegalDowngrade,
    timeMissing: !nextState.time,
    categoryType,
  }
}
