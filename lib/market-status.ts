export type MarketLiveStatus = "live" | "scheduled" | "final" | "unknown"

const FINAL_STATUS_TOKENS = [
  "final",
  "finished",
  "full time",
  "fulltime",
  "ft",
  "post",
]

const LIVE_STATUS_TOKENS = [
  "live",
  "in_progress",
  "in progress",
  "in-progress",
  "in_play",
  "in play",
  "inplay",
  "running",
  "halftime",
  "half time",
  "half-time",
  "1st half",
  "2nd half",
  "first half",
  "second half",
  "overtime",
  "extra time",
  "ot",
]

const SCHEDULED_STATUS_TOKENS = [
  "scheduled",
  "not_started",
  "not started",
  "preview",
  "upcoming",
  "pre_game",
  "pre-game",
  "pre game",
  "pregame",
  "pre_match",
  "pre-match",
  "pre match",
  "prematch",
]

const includesAny = (value: string, tokens: string[]) =>
  tokens.some((token) => value.includes(token))

export const normalizeEventStatus = (value?: string | null) =>
  value?.toLowerCase().trim() || ""

export const statusLooksFinal = (value: string) => {
  if (!value) return false
  if (value.includes("postpon")) return false
  return includesAny(value, FINAL_STATUS_TOKENS)
}

export const statusLooksLive = (value: string) => {
  if (!value) return false
  return includesAny(value, LIVE_STATUS_TOKENS)
}

export const statusLooksScheduled = (value: string) => {
  if (!value) return false
  return includesAny(value, SCHEDULED_STATUS_TOKENS)
}

export const isSeasonLongMarketTitle = (title?: string | null) => {
  if (!title) return false
  const lower = title.toLowerCase()
  if (!/\bwin\b/.test(lower)) return false
  const hasSeasonKeyword =
    /\b(season|league|premier league|champions league|championship|tournament|cup|title)\b/.test(
      lower
    )
  if (hasSeasonKeyword) return true
  const hasYearRange =
    /\b20\d{2}\s*-\s*\d{2}\b/.test(lower) || /\b20\d{2}-\d{2}\b(?!-\d{2})/.test(lower)
  if (hasYearRange) return true
  const hasSpecificDate = /\b20\d{2}-\d{2}-\d{2}\b/.test(lower)
  if (hasSpecificDate) return false
  return false
}
