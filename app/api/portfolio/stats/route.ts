import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { resolveOrdersTableName } from '@/lib/orders/table'

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const toNullableNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const normalizeSide = (value?: string | null) => String(value ?? '').trim().toLowerCase()

const resolveFilledSize = (row: any) => {
  const filled = toNullableNumber(row?.filled_size)
  if (filled !== null && filled > 0) return filled
  const size = toNullableNumber(row?.size)
  if (filled === null && size !== null && size > 0) return size
  return null
}

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''
const PRICE_FETCH_TIMEOUT_MS = 6000
const MAX_MARKETS_TO_REFRESH = 40

type MarketPrice = {
  outcomes?: string[]
  outcomePrices?: number[]
}

const findOutcomePrice = (market: MarketPrice | undefined, outcome: string | null) => {
  if (!market || !market.outcomes || !market.outcomePrices || outcome === null) return null
  const target = normalize(outcome)
  const idx = market.outcomes.findIndex((o) => normalize(o) === target)
  if (idx >= 0 && market.outcomePrices[idx] !== undefined && market.outcomePrices[idx] !== null) {
    const price = Number(market.outcomePrices[idx])
    return Number.isFinite(price) ? price : null
  }
  return null
}

const fetchMarketPrices = async (marketIds: string[]) => {
  const priceMap = new Map<string, MarketPrice>()
  if (marketIds.length === 0) return priceMap

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  await Promise.all(
    marketIds.map(async (marketId) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PRICE_FETCH_TIMEOUT_MS)
      try {
        const res = await fetch(
          `${baseUrl}/api/polymarket/price?conditionId=${marketId}`,
          { signal: controller.signal }
        )
        if (!res.ok) return
        const json = await res.json()
        if (json?.success && json.market) {
          priceMap.set(marketId, {
            outcomes: json.market.outcomes,
            outcomePrices: json.market.outcomePrices,
          })
        }
      } catch (error) {
        // Best-effort price refresh; ignore failures.
      } finally {
        clearTimeout(timeout)
      }
    })
  )

  return priceMap
}

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('Auth error fetching user for portfolio stats:', authError)
    }

    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId') || user.id
    if (requestedUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createService()
    const ordersTable = await resolveOrdersTableName(supabase)

    // Realized = resolved OR user closed
    const { data: realizedRows, error: realizedError, count: realizedCount } = await supabase
      .from('orders_copy_enriched')
      .select('pnl_usd, invested_usd', { count: 'exact' })
      .eq('copy_user_id', requestedUserId)
      .or('market_resolved.eq.true,user_exit_price.not.is.null')

    if (realizedError) {
      console.error('Error aggregating realized PnL:', realizedError)
      return NextResponse.json({ error: realizedError.message }, { status: 500 })
    }

    // Unrealized = open positions (not resolved, not user closed)
    const { data: openRows, error: openError, count: openCount } = await supabase
      .from('orders_copy_enriched')
      .select(
        'order_id, market_id, outcome, entry_price, entry_size, current_price, pnl_usd, invested_usd',
        { count: 'exact' }
      )
      .eq('copy_user_id', requestedUserId)
      .is('market_resolved', false)
      .is('user_exit_price', null)

    if (openError) {
      console.error('Error aggregating unrealized PnL:', openError)
      return NextResponse.json({ error: openError.message }, { status: 500 })
    }

    // Win rate uses resolved/user-closed only
    const { count: winningTrades, error: winError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id', { count: 'exact', head: true })
      .eq('copy_user_id', requestedUserId)
      .or('market_resolved.eq.true,user_exit_price.not.is.null')
      .gt('pnl_usd', 0)

    if (winError) {
      console.error('Error counting winning trades:', winError)
      return NextResponse.json({ error: winError.message }, { status: 500 })
    }

    const { count: totalTrades, error: totalError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id', { count: 'exact', head: true })
      .eq('copy_user_id', requestedUserId)

    if (totalError) {
      console.error('Error counting total trades:', totalError)
      return NextResponse.json({ error: totalError.message }, { status: 500 })
    }

    const realizedPnl = (realizedRows || []).reduce(
      (sum, row: any) => sum + toNumber(row.pnl_usd),
      0
    )
    const openMarketIds = Array.from(
      new Set(
        (openRows || [])
          .map((row: any) => row.market_id)
          .filter((marketId: any): marketId is string => Boolean(marketId))
      )
    ).slice(0, MAX_MARKETS_TO_REFRESH)

    const priceMap = await fetchMarketPrices(openMarketIds)

    const unrealizedPnl = (openRows || []).reduce((sum, row: any) => {
      const entryPrice = toNullableNumber(row.entry_price)
      const entrySize = toNullableNumber(row.entry_size)
      const storedPnl = toNullableNumber(row.pnl_usd)
      const storedPrice = toNullableNumber(row.current_price)
      const marketPrice = findOutcomePrice(priceMap.get(row.market_id), row.outcome)
      const currentPrice = marketPrice ?? storedPrice

      if (entryPrice !== null && entrySize !== null && currentPrice !== null) {
        return sum + (currentPrice - entryPrice) * entrySize
      }
      return sum + (storedPnl ?? 0)
    }, 0)
    const { data: volumeRows, error: volumeError } = await supabase
      .from(ordersTable)
      .select('price, price_when_copied, amount_invested, filled_size, size, side')
      .eq('copy_user_id', requestedUserId)

    if (volumeError) {
      console.error('Error aggregating volume:', volumeError)
      return NextResponse.json({ error: volumeError.message }, { status: 500 })
    }

    const totalVolume = (volumeRows || []).reduce((sum, row: any) => {
      const side = normalizeSide(row?.side)
      if (side === 'sell') return sum

      const entryPrice = toNullableNumber(row?.price_when_copied) ?? toNullableNumber(row?.price)
      const filledSize = resolveFilledSize(row)
      const invested = toNullableNumber(row?.amount_invested)

      if (invested !== null && invested > 0) return sum + invested
      if (entryPrice !== null && filledSize !== null) return sum + entryPrice * filledSize
      return sum
    }, 0)

    const totalPnl = realizedPnl + unrealizedPnl
    const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0

    const resolvedTradesCount = toNumber(realizedCount)
    const openTradesCount = toNumber(openCount)
    const winRate =
      resolvedTradesCount > 0 ? (toNumber(winningTrades) / resolvedTradesCount) * 100 : 0

    return NextResponse.json({
      totalPnl,
      realizedPnl,
      unrealizedPnl,
      totalVolume,
      roi,
      winRate,
      totalTrades: toNumber(totalTrades),
      openTrades: openTradesCount,
      closedTrades: resolvedTradesCount,
      freshness: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
