const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MIDNIGHT_UTC_PATTERN = /T00:00:00(?:\.000)?(?:Z|[+-]00:00)$/

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
