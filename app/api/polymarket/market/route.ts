import { NextResponse } from 'next/server'

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function pickFirstString(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parseJsonField(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return val }
  }
  return val ?? null
}

const marketCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL_MS = 60000

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const conditionId = searchParams.get('conditionId')?.trim()

  if (!conditionId || !conditionId.startsWith('0x')) {
    return NextResponse.json({ error: 'conditionId is required' }, { status: 400 })
  }

  const cached = marketCache.get(conditionId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  try {
    // Gamma-first: get market metadata and prices
    let gammaMarket: any = null
    try {
      const gammaRes = await fetch(
        `https://gamma-api.polymarket.com/markets?condition_id=${encodeURIComponent(conditionId)}`,
        { cache: 'no-store', signal: AbortSignal.timeout(4000) }
      )
      if (gammaRes.ok) {
        const data = await gammaRes.json()
        gammaMarket = Array.isArray(data) && data.length > 0 ? data[0] : null
      }
    } catch {
      // Gamma unavailable, fall through to CLOB
    }

    // CLOB fallback: needed for trading-specific fields (tokens, tickSize, acceptingOrders)
    let clobMarket: any = null
    try {
      const clobRes = await fetch(
        `https://clob.polymarket.com/markets/${conditionId}`,
        { cache: 'no-store', signal: AbortSignal.timeout(4000) }
      )
      if (clobRes.ok) {
        clobMarket = await clobRes.json()
      }
    } catch {
      // CLOB unavailable — display-only callers will still work via Gamma
    }

    if (!gammaMarket && !clobMarket) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Build tokens array from CLOB (has real-time token_id and price per outcome)
    const tokens = Array.isArray(clobMarket?.tokens)
      ? clobMarket.tokens.map((token: any) => ({
          token_id: token?.token_id ?? token?.tokenId ?? null,
          outcome: token?.outcome ?? null,
          price: token?.price ?? null,
        }))
      : []

    // If CLOB tokens are empty but Gamma has prices, build synthetic tokens
    if (tokens.length === 0 && gammaMarket) {
      const outcomes = parseJsonField(gammaMarket.outcomes)
      const prices = parseJsonField(gammaMarket.outcomePrices)
      const clobTokenIds = parseJsonField(gammaMarket.clobTokenIds)
      if (Array.isArray(outcomes) && Array.isArray(prices)) {
        outcomes.forEach((outcome: string, idx: number) => {
          tokens.push({
            token_id: Array.isArray(clobTokenIds) ? clobTokenIds[idx] ?? null : null,
            outcome,
            price: String(prices[idx] ?? '0.5'),
          })
        })
      }
    }

    const icon = pickFirstString(
      clobMarket?.icon, clobMarket?.image,
      gammaMarket?.icon, gammaMarket?.image, gammaMarket?.twitterCardImage
    )
    const image = pickFirstString(
      gammaMarket?.image, gammaMarket?.icon, gammaMarket?.twitterCardImage,
      clobMarket?.image, clobMarket?.icon
    )

    const responseData = {
      ok: true,
      conditionId: clobMarket?.condition_id ?? gammaMarket?.conditionId ?? conditionId,
      question: clobMarket?.question ?? gammaMarket?.question ?? null,
      tokens,
      icon,
      image,
      minimumOrderSize: toNumber(clobMarket?.minimum_order_size) ?? toNumber(clobMarket?.min_order_size),
      minOrderSize: toNumber(clobMarket?.min_order_size),
      tickSize: toNumber(clobMarket?.tick_size),
      acceptingOrders: typeof clobMarket?.accepting_orders === 'boolean' ? clobMarket.accepting_orders : null,
      closed: typeof clobMarket?.closed === 'boolean'
        ? clobMarket.closed
        : gammaMarket?.closed ?? null,
      resolved: typeof clobMarket?.resolved === 'boolean'
        ? clobMarket.resolved
        : gammaMarket?.resolvedBy ? true : null,
    }

    marketCache.set(conditionId, { data: responseData, timestamp: Date.now() })

    if (marketCache.size > 1000) {
      const sortedEntries = Array.from(marketCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)
      const toDelete = sortedEntries.slice(0, 500)
      toDelete.forEach(([key]) => marketCache.delete(key))
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch market' },
      { status: 500 }
    )
  }
}
