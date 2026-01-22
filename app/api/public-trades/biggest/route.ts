import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 30
const DEFAULT_HOURS = 1
const MAX_NOTIONAL = 20_000_000
const MAX_PAGES = 5
const MAX_ENTRY_PRICE = 0.94
const MIN_NOTIONAL = 10

type PolymarketPublicTrade = {
  transactionHash?: string
  conditionId?: string
  condition_id?: string
  proxyWallet?: string
  name?: string
  user?: string
  wallet?: string
  slug?: string
  title?: string
  outcome?: string
  side?: string
  price?: string | number
  size?: string | number
  amount?: string | number
  timestamp?: number | string
  time?: number | string
  [key: string]: unknown
}

function toNumber(value: string | null): number | null {
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizePrice(raw: number | null): number | null {
  if (!raw || !Number.isFinite(raw)) return null
  if (raw > 1 && raw <= 100) return raw / 100
  if (raw > 1 && raw <= 1000) return raw / 1000
  return raw
}

function computeNotional(size: number | null, price: number | null): number | null {
  if (!size || !price) return null
  const notional = size * price
  return Number.isFinite(notional) ? notional : null
}

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function getMarketOutcomeKey(trade: {
  conditionId: string | null
  marketSlug: string | null
  marketTitle: string | null
  outcome: string | null
}) {
  const base =
    trade.conditionId || trade.marketSlug || trade.marketTitle || 'unknown-market'
  const outcome = trade.outcome || 'unknown-outcome'
  return `${base}::${outcome}`
}

function parseTimestamp(value?: number | string): string | null {
  if (value === null || value === undefined) return null
  let ts = Number(value)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) ts *= 1000
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizePolymarketTrades(trades: PolymarketPublicTrade[]): Array<{
  tradeId: string
  wallet: string
  displayName: string | null
  marketTitle: string | null
  marketSlug: string | null
  conditionId: string | null
  outcome: string | null
  side: string | null
  price: number | null
  size: number | null
  notional: number | null
  tradeTimestamp: string | null
}> {
  return trades.map((trade, index) => {
    const price = normalizePrice(toNumber(trade.price))
    const size = toNumber(trade.size)
    const amount = toNumber(trade.amount)
    const notional = amount ?? computeNotional(size, price)
    return {
      tradeId: trade.transactionHash || `${trade.user || trade.wallet || 'trade'}-${index}`,
      wallet: (trade.user || trade.wallet || trade.proxyWallet || '').toLowerCase(),
      displayName: trade.name ?? null,
      marketTitle: trade.title ?? null,
      marketSlug: trade.slug ?? null,
      conditionId: trade.conditionId ?? trade.condition_id ?? null,
      outcome: trade.outcome ? String(trade.outcome).toUpperCase() : null,
      side: trade.side ? String(trade.side).toUpperCase() : null,
      price,
      size: size ?? amount,
      notional,
      tradeTimestamp: parseTimestamp(trade.timestamp ?? trade.time),
    }
  })
}

type NormalizedTrade = ReturnType<typeof normalizePolymarketTrades>[number]
type TimestampedTrade = NormalizedTrade & { timestampMs: number }
type TradeWithMetrics = TimestampedTrade & { priceMove: number }

async function fetchPolymarketTrades(limit: number): Promise<PolymarketPublicTrade[]> {
  let offset = 0
  let page = 0
  const trades: PolymarketPublicTrade[] = []

  while (page < MAX_PAGES) {
    const response = await fetch(
      `https://data-api.polymarket.com/trades?limit=${limit}&offset=${offset}`,
      { cache: 'no-store', headers: { 'User-Agent': 'Polycopy Discover Biggest Trades' } }
    )
    if (!response.ok) break
    const data = await response.json()
    const batch = Array.isArray(data) ? (data as PolymarketPublicTrade[]) : []
    trades.push(...batch)
    if (batch.length < limit) break
    offset += limit
    page += 1
  }

  return trades
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const requestedLimit = clampNumber(toNumber(url.searchParams.get('limit')) ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
    const hoursParam = clampNumber(toNumber(url.searchParams.get('hours')) ?? DEFAULT_HOURS, 1, 6)

    const since = new Date(Date.now() - hoursParam * 60 * 60 * 1000).toISOString()
    const data = await fetchPolymarketTrades(200)
    const normalized = normalizePolymarketTrades(Array.isArray(data) ? data : [])
    const filtered = normalized.filter((trade) => {
      if (!trade.tradeTimestamp) return false
      if (!trade.notional || trade.notional < MIN_NOTIONAL) return false
      if (!trade.price || trade.price <= 0 || trade.price > 1.0) return false
      if (trade.price > MAX_ENTRY_PRICE) return false
      if (!trade.size || trade.size <= 0) return false
      if (trade.notional > MAX_NOTIONAL) return false
      if (!trade.wallet) return false
      return trade.tradeTimestamp >= since
    })

    const tradesWithTimestamp: TimestampedTrade[] = filtered.reduce((acc, trade) => {
      if (!trade.tradeTimestamp) return acc
      const timestampMs = Date.parse(trade.tradeTimestamp)
      if (!Number.isFinite(timestampMs)) return acc
      acc.push({ ...trade, timestampMs })
      return acc
    }, [] as TimestampedTrade[])

    const lastPriceMap = new Map<string, number>()
    const tradesChrono = [...tradesWithTimestamp].sort((a, b) => a.timestampMs - b.timestampMs)
    const tradesWithMetrics: TradeWithMetrics[] = tradesChrono.map((trade) => {
      const key = getMarketOutcomeKey(trade)
      const prevPrice = lastPriceMap.get(key)
      const currentPrice = trade.price ?? 0
      const priceMove = typeof prevPrice === 'number' ? Math.abs(currentPrice - prevPrice) : 0
      lastPriceMap.set(key, currentPrice)
      return { ...trade, priceMove }
    })

    const metrics = [
      {
        name: 'notional',
        sorter: (a: TradeWithMetrics, b: TradeWithMetrics) => (b.notional ?? 0) - (a.notional ?? 0),
      },
      {
        name: 'priceMove',
        sorter: (a: TradeWithMetrics, b: TradeWithMetrics) => (b.priceMove ?? 0) - (a.priceMove ?? 0),
      },
      {
        name: 'recency',
        sorter: (a: TradeWithMetrics, b: TradeWithMetrics) => b.timestampMs - a.timestampMs,
      },
    ]

    const selectionLimit = Math.max(requestedLimit, metrics.length)
    const perMetric = Math.max(1, Math.floor(selectionLimit / metrics.length))
    const remainder = selectionLimit - perMetric * metrics.length

    const selectedTrades: TradeWithMetrics[] = []
    const selectedIds = new Set<string>()

    for (const metric of metrics) {
      let added = 0
      const sorted = [...tradesWithMetrics].sort(metric.sorter)
      for (const trade of sorted) {
        if (added >= perMetric) break
        if (selectedIds.has(trade.tradeId)) continue
        selectedTrades.push(trade)
        selectedIds.add(trade.tradeId)
        added += 1
      }
    }

    if (remainder > 0) {
      const fallback = [...tradesWithMetrics].sort(metrics[0].sorter)
      for (const trade of fallback) {
        if (selectedTrades.length >= selectionLimit) break
        if (selectedIds.has(trade.tradeId)) continue
        selectedTrades.push(trade)
        selectedIds.add(trade.tradeId)
      }
    }

    const randomized = shuffleArray(selectedTrades)
    const finalSelection = [...randomized]
    if (finalSelection.length < selectionLimit) {
      const fallback = shuffleArray(tradesWithMetrics)
      for (const trade of fallback) {
        if (finalSelection.length >= selectionLimit) break
        finalSelection.push(trade)
      }
    }

    const randomizedFinal = shuffleArray(finalSelection)
    const trimmedTrades = randomizedFinal.slice(0, requestedLimit)
    const payload = trimmedTrades.map((trade) => ({
      tradeId: trade.tradeId,
      wallet: trade.wallet,
      displayName: trade.displayName ?? null,
      profileImage: null,
      marketTitle: trade.marketTitle,
      marketSlug: trade.marketSlug,
      conditionId: trade.conditionId ?? null,
      outcome: trade.outcome,
      side: trade.side,
      price: trade.price,
      size: trade.size,
      notional: trade.notional,
      tradeTimestamp: trade.tradeTimestamp,
    }))

    return NextResponse.json({ trades: payload })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ trades: [], error: message }, { status: 200 })
  }
}
