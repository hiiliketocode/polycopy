export type OrderStatus = 'open' | 'partial' | 'filled' | 'canceled' | 'expired' | 'failed'

export interface OrderRow {
  orderId: string
  status: OrderStatus
  marketId: string
  marketTitle: string
  marketImageUrl: string | null
  marketIsOpen: boolean | null
  traderId: string
  traderName: string
  traderAvatarUrl: string | null
  side: string
  outcome: string | null
  size: number
  filledSize: number
  priceOrAvgPrice: number | null
  currentPrice: number | null
  pnlUsd: number | null
  positionState: 'open' | 'closed' | 'unknown' | null
  positionStateLabel: string | null
  createdAt: string
  updatedAt: string
  raw: Record<string, any> | null
}
