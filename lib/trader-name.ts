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
  const candidateScopes = collectNameScopes(record)
  for (const scope of candidateScopes) {
    const direct = firstStringValue(scope, TRADER_NAME_KEYS)
    if (direct) return normalizeTraderDisplayName(direct)
  }

  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return null
  const rawScopes = collectNameScopes(raw)
  for (const scope of rawScopes) {
    const nested = firstStringValue(scope, TRADER_NAME_KEYS)
    if (nested) return normalizeTraderDisplayName(nested)
  }

  return null
}

function collectNameScopes(record?: Record<string, any> | null) {
  if (!record || typeof record !== 'object') return []
  const scopes: Record<string, any>[] = [record]
  const nestedKeys = ['trader', 'maker', 'user', 'owner', 'creator']
  for (const key of nestedKeys) {
    const nested = record[key]
    if (nested && typeof nested === 'object') {
      scopes.push(nested)
    }
  }
  return scopes
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
