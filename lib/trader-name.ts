export const TRADER_NAME_KEYS = [
  'trader_username',
  'trader_name',
  'traderName',
  'display_name',
  'displayName',
]

export function normalizeTraderDisplayName(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

export function extractTraderNameFromRecord(record?: Record<string, any> | null) {
  const direct = firstStringValue(record, TRADER_NAME_KEYS)
  if (direct) return normalizeTraderDisplayName(direct)

  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return null
  const nested = firstStringValue(raw, TRADER_NAME_KEYS)
  return nested ? normalizeTraderDisplayName(nested) : null
}

function firstStringValue(record: Record<string, any> | undefined | null, keys: string[]) {
  if (!record || typeof record !== 'object') return ''
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') {
      return String(value)
    }
  }
  return ''
}
