import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 20
const DEFAULT_HOURS = 24
const MAX_HOURS = 72
const TRADES_TO_FETCH = 500 // Fetch more trades to get better coverage
const MIN_TRADES_PER_TRADER = 3 // Filter out one-off traders

type PolymarketPublicTrade = {
  transactionHash?: string
  proxyWallet?: string
  name?: string
  user?: string
  wallet?: string
  timestamp?: number | string
  time?: number | string
  [key: string]: unknown
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseTimestamp(value?: number | string): string | null {
  if (value === null || value === undefined) return null
  let ts = Number(value)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) ts *= 1000
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function fetchPolymarketTrades(limit: number): Promise<PolymarketPublicTrade[]> {
  const response = await fetch(
    `https://data-api.polymarket.com/trades?limit=${limit}&offset=0`,
    { 
      cache: 'no-store', 
      headers: { 'User-Agent': 'Polycopy Most Active Traders' },
      signal: AbortSignal.timeout(8000) // 8 second timeout
    }
  )
  
  if (!response.ok) {
    throw new Error(`Polymarket API returned ${response.status}`)
  }
  
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const requestedLimit = clampNumber(toNumber(url.searchParams.get('limit')) ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
    const hoursParam = clampNumber(toNumber(url.searchParams.get('hours')) ?? DEFAULT_HOURS, 1, MAX_HOURS)

    const since = new Date(Date.now() - hoursParam * 60 * 60 * 1000).toISOString()
    
    // Fetch recent trades
    const trades = await fetchPolymarketTrades(TRADES_TO_FETCH)
    
    // Aggregate trades by wallet
    const traderActivity = new Map<string, {
      wallet: string
      displayName: string | null
      tradeCount: number
      lastTradeTime: number
    }>()

    for (const trade of trades) {
      const wallet = (trade.user || trade.wallet || trade.proxyWallet || '').toLowerCase()
      if (!wallet) continue

      const timestamp = parseTimestamp(trade.timestamp ?? trade.time)
      if (!timestamp || timestamp < since) continue

      const timestampMs = Date.parse(timestamp)
      if (!Number.isFinite(timestampMs)) continue

      const existing = traderActivity.get(wallet)
      if (existing) {
        existing.tradeCount += 1
        existing.lastTradeTime = Math.max(existing.lastTradeTime, timestampMs)
      } else {
        traderActivity.set(wallet, {
          wallet,
          displayName: trade.name ?? null,
          tradeCount: 1,
          lastTradeTime: timestampMs,
        })
      }
    }

    // Filter and sort traders
    const activeTraders = Array.from(traderActivity.values())
      .filter(trader => trader.tradeCount >= MIN_TRADES_PER_TRADER)
      .sort((a, b) => {
        // Primary sort: by trade count (descending)
        if (b.tradeCount !== a.tradeCount) {
          return b.tradeCount - a.tradeCount
        }
        // Secondary sort: by recency (more recent first)
        return b.lastTradeTime - a.lastTradeTime
      })
      .slice(0, requestedLimit)

    const result = activeTraders.map(trader => ({
      wallet: trader.wallet,
      displayName: trader.displayName,
      tradeCount: trader.tradeCount,
      lastTradeTimestamp: new Date(trader.lastTradeTime).toISOString(),
    }))

    return NextResponse.json({ 
      traders: result,
      meta: {
        hours: hoursParam,
        tradesAnalyzed: trades.length,
        uniqueTraders: traderActivity.size,
        returned: result.length,
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('Error fetching most active traders:', message)
    return NextResponse.json({ traders: [], error: message }, { status: 200 })
  }
}
