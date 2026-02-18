import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ClosedPosition {
  conditionId: string
  realizedPnl: number
  timestamp: number
}

interface DailyPnlRow {
  date: string
  realized_pnl: number
}

// Per-wallet cache with 60-second TTL
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { data: DailyPnlRow[]; timestamp: number }>()

function getCached(wallet: string): DailyPnlRow[] | null {
  const entry = cache.get(wallet)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(wallet)
    return null
  }
  return entry.data
}

function setCache(wallet: string, data: DailyPnlRow[]) {
  cache.set(wallet, { data, timestamp: Date.now() })

  if (cache.size > 1000) {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key)
      }
    }
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function fetchSparklineForWallet(wallet: string): Promise<DailyPnlRow[]> {
  const cached = getCached(wallet)
  if (cached) return cached

  // Single page of closed positions — enough for a sparkline
  const positions = await fetchJson<ClosedPosition[]>(
    `https://data-api.polymarket.com/closed-positions?user=${wallet}&limit=50&offset=0&sortBy=TIMESTAMP&sortDirection=DESC`
  )

  if (!positions || positions.length === 0) {
    const empty: DailyPnlRow[] = []
    setCache(wallet, empty)
    return empty
  }

  // Group by day and compute daily realized P&L
  const dailyMap = new Map<string, number>()
  for (const pos of positions) {
    let ts = pos.timestamp
    if (ts < 10000000000) ts = ts * 1000
    const date = new Date(ts).toISOString().slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + (pos.realizedPnl ?? 0))
  }

  const rows: DailyPnlRow[] = Array.from(dailyMap.keys())
    .sort()
    .map((date) => ({ date, realized_pnl: dailyMap.get(date) ?? 0 }))

  setCache(wallet, rows)
  return rows
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const wallets: string[] = body?.wallets

    if (!Array.isArray(wallets) || wallets.length === 0) {
      return NextResponse.json({ error: 'wallets array required' }, { status: 400 })
    }

    // Cap at 50 wallets per request
    const normalized = wallets.slice(0, 50).map((w) => w.toLowerCase())

    // Process in parallel batches of 10
    const BATCH_SIZE = 10
    const result: Record<string, DailyPnlRow[]> = {}

    for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
      const batch = normalized.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (wallet) => ({
          wallet,
          data: await fetchSparklineForWallet(wallet),
        }))
      )

      for (const res of batchResults) {
        if (res.status === 'fulfilled') {
          result[res.value.wallet] = res.value.data
        }
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[batch/sparklines] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
