import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrdersTableName } from '@/lib/orders/table'

type OpenOrder = {
  order_id: string
  market_id: string | null
  outcome: string | null
}

type MarketPrice = {
  outcomes?: string[]
  outcomePrices?: number[]
  closed?: boolean
  resolved?: boolean
}

const createService = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

const findOutcomePrice = (market: MarketPrice, outcome: string | null) => {
  if (!market.outcomes || !market.outcomePrices || outcome === null) return null
  const target = normalize(outcome)
  const idx = market.outcomes.findIndex((o) => normalize(o) === target)
  if (idx >= 0 && market.outcomePrices[idx] !== undefined && market.outcomePrices[idx] !== null) {
    return Number(market.outcomePrices[idx])
  }
  return null
}

const resolveIsResolved = (market: MarketPrice) => {
  if (typeof market.resolved === 'boolean') return market.resolved
  if (typeof market.closed === 'boolean') return market.closed
  return false
}

const parseMaybeArray = (value: any) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

const fetchGammaMarket = async (marketId: string) => {
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?condition_id=${marketId}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = await res.json()
    const market = Array.isArray(data) && data.length > 0 ? data[0] : null
    if (!market) return null

    const outcomes = parseMaybeArray(market.outcomes)
    const outcomePrices = parseMaybeArray(market.outcomePrices)
    const resolved =
      typeof market.resolved === 'boolean'
        ? market.resolved
        : typeof market.is_resolved === 'boolean'
          ? market.is_resolved
          : typeof market.isResolved === 'boolean'
            ? market.isResolved
            : undefined

    return {
      outcomes: outcomes ?? undefined,
      outcomePrices: outcomePrices ?? undefined,
      closed: typeof market.closed === 'boolean' ? market.closed : undefined,
      resolved,
    }
  } catch (error) {
    console.warn('Failed to fetch gamma market for', marketId, error)
    return null
  }
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const provided = request.headers.get('x-cron-secret')
      if (provided !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = createService()
    const ordersTable = await resolveOrdersTableName(supabase)

    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode')
    const backfill = mode === 'backfill'
    const limit = Math.min(500, Math.max(50, Number(searchParams.get('limit') || 200)))
    const page = Math.max(1, Number(searchParams.get('page') || 1))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Fetch a batch of open/unresolved copy orders
    let openOrdersQuery = supabase
      .from(ordersTable)
      .select('order_id, market_id, outcome')
      .eq('market_resolved', false)
      .is('user_exit_price', null)
      .not('market_id', 'is', null)
      .range(from, to)

    if (backfill) {
      openOrdersQuery = openOrdersQuery.is('current_price', null)
    }

    const { data: openOrders, error: openError } = await openOrdersQuery

    if (openError) {
      console.error('Error fetching open orders for refresh:', openError)
      return NextResponse.json({ error: openError.message }, { status: 500 })
    }

    if (!openOrders || openOrders.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const marketIds = [...new Set(openOrders.map((o) => o.market_id).filter(Boolean))] as string[]

    // Fetch market prices in parallel
    const priceMap = new Map<string, MarketPrice>()
    await Promise.all(
      marketIds.map(async (marketId) => {
        try {
          const res = await fetch(`${baseUrl}/api/polymarket/price?conditionId=${marketId}`)
          if (!res.ok) return
          const json = await res.json()
          if (json?.success && json.market) {
            const market: MarketPrice = {
              outcomes: json.market.outcomes,
              outcomePrices: json.market.outcomePrices,
              closed: json.market.closed,
              resolved: json.market.resolved,
            }

            if (market.resolved === undefined && market.closed === undefined) {
              const gammaMarket = await fetchGammaMarket(marketId)
              if (gammaMarket) {
                market.resolved = gammaMarket.resolved ?? market.resolved
                market.closed = gammaMarket.closed ?? market.closed
                market.outcomes = market.outcomes ?? gammaMarket.outcomes
                market.outcomePrices = market.outcomePrices ?? gammaMarket.outcomePrices
              }
            }

            priceMap.set(marketId, market)
          }
        } catch (err) {
          console.warn('Failed to fetch market price for', marketId, err)
        }
      })
    )

    let updated = 0
    const now = new Date().toISOString()

    for (const order of openOrders as OpenOrder[]) {
      if (!order.market_id) continue
      const market = priceMap.get(order.market_id)
      if (!market) continue

      const outcomePrice = findOutcomePrice(market, order.outcome)
      const isResolved = resolveIsResolved(market)
      if (outcomePrice === null && !isResolved) continue

      const updatePayload: Record<string, any> = {
        last_checked_at: now,
        market_resolved: isResolved,
      }

      if (outcomePrice !== null) {
        updatePayload.current_price = outcomePrice
      }

      if (isResolved) {
        updatePayload.market_resolved_at = now
      }

      const { error: updateError } = await supabase
        .from(ordersTable)
        .update(updatePayload)
        .eq('order_id', order.order_id)

      if (updateError) {
        console.error('Failed updating order', order.order_id, updateError)
      } else {
        updated += 1
      }
    }

    return NextResponse.json({
      ok: true,
      marketsFetched: priceMap.size,
      updated,
    })
  } catch (error: any) {
    console.error('Error in /api/cron/refresh-copy-pnl:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
