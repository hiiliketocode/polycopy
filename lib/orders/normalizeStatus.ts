import { OrderStatus } from './types'

function toNumber(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null) return null
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(numericValue) ? numericValue : null
}

function simplifyStatus(text: string | null | undefined): string {
  if (!text) return 'open'
  return text.trim().toLowerCase()
}

const STATUS_MAP: Record<string, OrderStatus> = {
  open: 'open',
  partial: 'partial',
  filled: 'filled',
  matched: 'filled',
  canceled: 'canceled',
  cancelled: 'canceled',
  expired: 'expired',
  failed: 'failed',
  rejected: 'failed',
  delayed: 'failed',
  error: 'failed',
  inactive: 'failed',
}

export function normalizeOrderStatus(
  rawOrder: any,
  statusText: string | null | undefined,
  filledSize?: number | null,
  size?: number | null,
  remainingSize?: number | null
): OrderStatus {
  const normalizedInput = simplifyStatus(statusText) || simplifyStatus(rawOrder?.status)
  const parsedSize = size ?? toNumber(rawOrder?.size ?? rawOrder?.original_size)
  const parsedFilled = filledSize ?? toNumber(rawOrder?.filled_size ?? rawOrder?.size_matched ?? rawOrder?.filledSize)
  const parsedRemaining =
    remainingSize ?? toNumber(rawOrder?.remaining_size ?? rawOrder?.size_remaining ?? rawOrder?.remainingSize)

  const isPartial =
    parsedFilled !== null &&
    parsedSize !== null &&
    parsedFilled > 0 &&
    parsedFilled < parsedSize

  const isFilled =
    parsedSize !== null &&
    parsedFilled !== null &&
    parsedSize > 0 &&
    parsedFilled >= parsedSize

  if (isFilled) {
    return 'filled'
  }

  if (isPartial) {
    return 'partial'
  }

  const mapped = STATUS_MAP[normalizedInput]
  if (mapped) {
    return mapped
  }

  if (parsedRemaining !== null && parsedRemaining <= 0 && parsedSize !== null && parsedSize > 0) {
    return 'filled'
  }

  return 'failed'
}
