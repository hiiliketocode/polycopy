import { randomUUID } from 'crypto'

const SENSITIVE_KEYS = new Set([
  // Authentication & Authorization
  'signature',
  'privatekey',
  'private_key',
  'token',
  'authorization',
  'cookie',
  'session',
  'bearer',
  
  // API Keys & Secrets
  'apikey',
  'api_key',
  'secret',
  'passphrase',
  'password',
  'pwd',
  'key',
  
  // Credentials
  'credential',
  'credentials',
  'auth',
  'access_token',
  'refresh_token',
  'id_token',
  
  // Wallet & Crypto
  'mnemonic',
  'seed',
  'seedphrase',
  'wallet',
  'address', // Be cautious - might be too broad
  
  // Payment
  'card',
  'cvv',
  'ssn',
  'stripe',
  
  // Encryption
  'encrypted',
  'cipher',
  'iv',
])
const MAX_STRING_LENGTH = 500
const MAX_ARRAY_ITEMS = 10
const MAX_OBJECT_KEYS = 20
const MAX_DEPTH = 4

export function makeRequestId(): string {
  return randomUUID()
}

export function logInfo(eventName: string, payload: Record<string, unknown>) {
  emitLog('info', eventName, payload)
}

export function logError(eventName: string, payload: Record<string, unknown>) {
  emitLog('error', eventName, payload)
}

export function sanitizeForLogging(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet(), 0)
}

function emitLog(level: 'info' | 'error', eventName: string, payload: Record<string, unknown>) {
  const sanitizedPayload = sanitizeForLogging(payload)
  const base = {
    timestamp: new Date().toISOString(),
    level,
    event: eventName,
  }
  const message = isObject(sanitizedPayload)
    ? { ...base, ...sanitizedPayload }
    : { ...base, payload: sanitizedPayload }
  const line = JSON.stringify(message)
  if (level === 'info') {
    console.log(line)
  } else {
    console.error(line)
  }
}

function sanitizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  keyName?: string
): unknown {
  if (value === undefined) {
    return null
  }
  if (value === null) {
    return null
  }
  if (typeof value === 'string') {
    return truncateString(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (value instanceof Date) {
    return value.toISOString()
  }

  const sensitive = keyName && SENSITIVE_KEYS.has(keyName.toLowerCase())
  if (sensitive) {
    return '[REDACTED]'
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) {
      return `[Array with ${value.length} items]`
    }
    if (seen.has(value as object)) {
      return '[Circular]'
    }
    seen.add(value as object)
    const limited = value.slice(0, MAX_ARRAY_ITEMS).map((item) =>
      sanitizeValue(item, seen, depth + 1)
    )
    if (value.length > MAX_ARRAY_ITEMS) {
      limited.push(`... (${value.length - MAX_ARRAY_ITEMS} more items)`)
    }
    return limited
  }

  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) {
      return '[Object truncated]'
    }
    if (seen.has(value as object)) {
      return '[Circular]'
    }
    seen.add(value as object)
    const entries = Object.keys(value as Record<string, unknown>).sort()
    const slice = entries.slice(0, MAX_OBJECT_KEYS)
    const record: Record<string, unknown> = {}
    for (const key of slice) {
      const rawValue = (value as Record<string, unknown>)[key]
      const sanitized = sanitizeValue(rawValue, seen, depth + 1, key)
      if (sanitized !== undefined) {
        record[key] = sanitized
      }
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      record.__truncated_keys = entries.length - MAX_OBJECT_KEYS
    }
    return record
  }

  return String(value)
}

function truncateString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value
  return value.slice(0, MAX_STRING_LENGTH) + '...'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
