export type OrderStatus = 'open' | 'partial' | 'filled' | 'canceled' | 'expired' | 'failed'
export type OrderActivity =
  | 'bought'
  | 'sold'
  | 'redeemed'
  | 'lost'
  | 'canceled'
  | 'expired'
  | 'failed'

export interface OrderRow {
  orderId: string
  status: OrderStatus
  activity: OrderActivity
  activityLabel: string
  activityIcon: string
  marketId: string
  marketTitle: string
  marketImageUrl: string | null
  marketIsOpen: boolean | null
  marketSlug?: string | null
  traderId: string
  traderWallet?: string | null
  traderName: string
  traderAvatarUrl: string | null
  copiedTraderId?: string | null
  copiedTraderWallet?: string | null
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
  isAutoClose?: boolean
}
