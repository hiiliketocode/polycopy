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

    // Fetch a batch of open/unresolved copy orders
    const { data: openOrders, error: openError } = await supabase
      .from(ordersTable)
      .select('order_id, market_id, outcome')
      .eq('market_resolved', false)
      .is('user_exit_price', null)
      .not('market_id', 'is', null)
      .limit(200)

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
            priceMap.set(marketId, {
              outcomes: json.market.outcomes,
              outcomePrices: json.market.outcomePrices,
              closed: json.market.closed,
            })
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
      if (outcomePrice === null) continue

      const { error: updateError } = await supabase
        .from(ordersTable)
        .update({
          current_price: outcomePrice,
          market_resolved: Boolean(market.closed),
          last_checked_at: now,
        })
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
