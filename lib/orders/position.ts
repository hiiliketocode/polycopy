export type PositionSummary = {
  tokenId: string
  marketId: string | null
  outcome: string | null
  direction: 'LONG' | 'SHORT'
  side: 'BUY' | 'SELL'
  size: number
  avgEntryPrice: number | null
  firstTradeAt: string | null
  lastTradeAt: string | null
}
