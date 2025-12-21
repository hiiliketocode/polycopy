export type UIOrderStatus =
  | 'Pending'
  | 'Open'
  | 'Partially Filled'
  | 'Filled'
  | 'Canceled'
  | 'Expired'
  | 'Rejected'

function toNumber(value: number | string | null | undefined): number | null {
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' ? parseFloat(value) : value
  return Number.isFinite(n) ? n : null
}

export function mapOrderStatus(
  status: string | null | undefined,
  filledSize: number | string | null | undefined,
  size: number | string | null | undefined
): UIOrderStatus {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'delayed') return 'Pending'
  if (normalized === 'filled') return 'Filled'
  if (normalized === 'canceled') return 'Canceled'
  if (normalized === 'expired') return 'Expired'
  if (normalized === 'rejected') return 'Rejected'

  const filled = toNumber(filledSize) ?? 0
  const total = toNumber(size)
  if (normalized === 'open') {
    if (total !== null && filled > 0 && filled < total) return 'Partially Filled'
    return 'Open'
  }

  return 'Pending'
}
