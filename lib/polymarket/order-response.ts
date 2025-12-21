const HTML_SNIPPET_REGEX = /<html|<!DOCTYPE\s+html/i
const CLOUDFLARE_RAY_ID_REGEX = /Cloudflare Ray ID:\s*<strong[^>]*>([\da-f]+)<\/strong>/i

type OrderResponseData = Record<string, unknown>

type FailureType = 'blocked_by_cloudflare' | 'missing_order_id' | 'api_error'

export type ClobOrderEvaluation =
  | {
      success: true
      orderId: string
      raw: OrderResponseData
    }
  | {
      success: false
      message: string
      status?: number
      errorType: FailureType
      rayId?: string
      htmlBody?: string
      raw: unknown
    }

function asRecord(value: unknown): OrderResponseData | null {
  if (typeof value === 'object' && value !== null) {
    return value as OrderResponseData
  }
  return null
}

function toString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function extractOrderIdFromRecord(record: OrderResponseData): string | null {
  const keys = ['orderID', 'orderId', 'order_hash', 'orderHash', 'order_id']
  for (const key of keys) {
    const candidate = toString(record[key])
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

function extractStatus(record: OrderResponseData): number | undefined {
  const statusCandidate = record.status ?? record.statusCode ?? record.code
  if (typeof statusCandidate === 'number') {
    return statusCandidate
  }
  const numeric = toString(statusCandidate)
  if (numeric) {
    const parsed = Number.parseInt(numeric, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function findHtmlBody(value: unknown): string | null {
  if (typeof value === 'string' && HTML_SNIPPET_REGEX.test(value)) {
    return value
  }
  const record = asRecord(value)
  if (!record) return null

  const errorValue = record['error'] ?? record['message'] ?? record['data']
  if (typeof errorValue === 'string' && HTML_SNIPPET_REGEX.test(errorValue)) {
    return errorValue
  }

  return null
}

function extractCloudflareRayId(html: string): string | undefined {
  const match = html.match(CLOUDFLARE_RAY_ID_REGEX)
  if (match && match[1]) {
    return match[1]
  }
  const fallback = html.match(/Cloudflare Ray ID:\s*([0-9a-f]+)/i)
  if (fallback && fallback[1]) {
    return fallback[1]
  }
  return undefined
}

export function interpretClobOrderResult(raw: unknown): ClobOrderEvaluation {
  const htmlBody = findHtmlBody(raw)
  if (htmlBody) {
    return {
      success: false,
      message: 'Blocked by Cloudflare',
      errorType: 'blocked_by_cloudflare',
      rayId: extractCloudflareRayId(htmlBody),
      htmlBody,
      raw,
      status: 403,
    }
  }

  const record = asRecord(raw)
  const status = record ? extractStatus(record) : undefined
  if (status !== undefined && (status < 200 || status >= 300)) {
    return {
      success: false,
      message: `Polymarket returned HTTP ${status}`,
      status,
      errorType: 'api_error',
      raw,
    }
  }

  if (!record) {
    return {
      success: false,
      message: 'Unexpected empty response from Polymarket',
      errorType: 'api_error',
      raw,
    }
  }

  const orderId = extractOrderIdFromRecord(record)
  if (!orderId) {
    return {
      success: false,
      message: 'Polymarket response missing order identifier',
      status,
      errorType: 'missing_order_id',
      raw,
    }
  }

  return {
    success: true,
    orderId,
    raw: record,
  }
}
