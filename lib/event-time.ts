const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MIDNIGHT_UTC_PATTERN = /T00:00:00(?:\.000)?(?:Z|[+-]00:00)$/
const ISO_DATE_IN_TEXT = /\b\d{4}-\d{2}-\d{2}\b/
const MONTH_LOOKUP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
}

const normalizeTimeValue = (value?: string | number | null) => {
  if (value === null || value === undefined) return undefined
  if (typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  return undefined
}

export const getTimeQuality = (value?: string | number | null) => {
  const normalized = normalizeTimeValue(value)
  if (!normalized) return 0
  if (DATE_ONLY_PATTERN.test(normalized)) return 1
  if (MIDNIGHT_UTC_PATTERN.test(normalized)) return 1
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return 0
  const hasClock =
    parsed.getUTCHours() !== 0 || parsed.getUTCMinutes() !== 0 || parsed.getUTCSeconds() !== 0
  return hasClock ? 2 : 1
}

export const pickBestStartTime = (
  primary?: string | number | null,
  fallback?: string | number | null
) => {
  const primaryValue = normalizeTimeValue(primary)
  const fallbackValue = normalizeTimeValue(fallback)
  const primaryQuality = getTimeQuality(primaryValue)
  const fallbackQuality = getTimeQuality(fallbackValue)

  if (primaryQuality === 0) return fallbackValue
  if (fallbackQuality === 0) return primaryValue
  if (primaryQuality >= fallbackQuality) return primaryValue
  return fallbackValue
}

export const extractDateFromTitle = (title?: string | null) => {
  if (!title) return undefined
  const isoMatch = title.match(ISO_DATE_IN_TEXT)
  if (isoMatch) return isoMatch[0]

  const monthFirstPattern =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i
  const monthFirstMatch = title.match(monthFirstPattern)
  if (monthFirstMatch) {
    const monthName = monthFirstMatch[1]?.toLowerCase()
    const day = monthFirstMatch[2]?.padStart(2, "0")
    const year = monthFirstMatch[3]
    const month = monthName ? MONTH_LOOKUP[monthName] : undefined
    if (month && day && year) return `${year}-${month}-${day}`
  }

  const dayFirstPattern =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i
  const dayFirstMatch = title.match(dayFirstPattern)
  if (dayFirstMatch) {
    const day = dayFirstMatch[1]?.padStart(2, "0")
    const monthName = dayFirstMatch[2]?.toLowerCase()
    const year = dayFirstMatch[3]
    const month = monthName ? MONTH_LOOKUP[monthName] : undefined
    if (month && day && year) return `${year}-${month}-${day}`
  }

  return undefined
}
