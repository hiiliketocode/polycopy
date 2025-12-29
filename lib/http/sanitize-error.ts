import axios from 'axios'

type JsonSafeError = {
  name: string
  message: string
  stack?: string
  code?: string
  status?: number
  upstream?: {
    status?: number
    data?: unknown
    headers?: Record<string, string>
  }
  details?: unknown
}

const DEV = process.env.NODE_ENV !== 'production'

export function sanitizeError(err: unknown): JsonSafeError {
  const safe: JsonSafeError = {
    name: 'UnknownError',
    message: 'Unknown error',
  }

  if (!err) return safe

  if (err instanceof Error) {
    safe.name = err.name
    safe.message = err.message
    if (DEV) {
      safe.stack = err.stack
    }
  }

  if (axios.isAxiosError(err)) {
    safe.name = 'AxiosError'
    safe.message = err.message
    safe.code = err.code
    safe.status = err.response?.status
    safe.upstream = {
      status: err.response?.status,
      data: tryJsonSafe(err.response?.data),
      headers: pickHeaders(err.response?.headers),
    }
    return safe
  }

  if (typeof err === 'object') {
    safe.details = tryJsonSafe(err as Record<string, unknown>)
  }

  return safe
}

function tryJsonSafe(value: any) {
  try {
    JSON.stringify(value)
    return value
  } catch {
    return String(value)
  }
}

function pickHeaders(headers: any) {
  if (!headers || typeof headers !== 'object') return undefined
  const allow = ['content-type', 'cf-ray', 'date']
  const out: Record<string, string> = {}
  for (const key of allow) {
    const value = headers[key]
    if (typeof value === 'string') {
      out[key] = value
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}
