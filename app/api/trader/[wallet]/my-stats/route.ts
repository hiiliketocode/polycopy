import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { resolveOrdersTableName } from '@/lib/orders/table'

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
const PRICE_FETCH_TIMEOUT_MS = 8000
const PRICE_STALE_AFTER_MS = 5 * 60 * 1000 // 5 minutes
const PRICE_FETCH_BATCH_SIZE = 40
const POSITION_EPSILON = 0.00001

type MarketPrice = {
  outcomes?: string[]
  outcomePrices?: number[]
  lastUpdatedAt?: string | null
  closed?: boolean
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

const fetchMarketPrices = async (
  supabase: ReturnType<typeof createService>,
  marketIds: string[]
) => {
  const priceMap = new Map<string, MarketPrice>()
  if (marketIds.length === 0) return priceMap

  // Load cached prices
  const { data: cachedRows, error: cacheError } = await supabase
    .from('markets')
    .select('condition_id, outcome_prices, last_price_updated_at, closed')
    .in('condition_id', marketIds)

  if (!cacheError && cachedRows) {
    cachedRows.forEach((row) => {
      if (row.outcome_prices) {
        priceMap.set(row.condition_id, {
          outcomes:
            row.outcome_prices?.outcomes ??
            row.outcome_prices?.labels ??
            row.outcome_prices?.choices ??
            null,
          outcomePrices:
            row.outcome_prices?.outcomePrices ??
            row.outcome_prices?.prices ??
            row.outcome_prices?.probabilities ??
            null,
          lastUpdatedAt: row.last_price_updated_at,
          closed: row.closed,
        })
      }
    })
  }

  const now = Date.now()
  const needsRefresh = marketIds.filter((id) => {
    const cached = priceMap.get(id)
    if (!cached || !cached.outcomePrices || !cached.lastUpdatedAt) return true
    if (cached.closed) return true
    const last = new Date(cached.lastUpdatedAt).getTime()
    return Number.isNaN(last) || now - last > PRICE_STALE_AFTER_MS
  })

  if (needsRefresh.length === 0) return priceMap

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  for (let i = 0; i < needsRefresh.length; i += PRICE_FETCH_BATCH_SIZE) {
    const chunk = needsRefresh.slice(i, i + PRICE_FETCH_BATCH_SIZE)
    await Promise.all(
      chunk.map(async (marketId) => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), PRICE_FETCH_TIMEOUT_MS)
        try {
          const res = await fetch(
            `${baseUrl}/api/polymarket/price?conditionId=${marketId}&tier=T3`,
            { signal: controller.signal }
          )
          if (!res.ok) return
          const json = await res.json()
          if (json?.success && json.market) {
            const nowIso = new Date().toISOString()
            priceMap.set(marketId, {
              outcomes: json.market.outcomes,
              outcomePrices: json.market.outcomePrices,
              lastUpdatedAt: nowIso,
            })
            await supabase
              .from('markets')
              .upsert(
                {
                  condition_id: marketId,
                  outcome_prices: {
                    outcomes: json.market.outcomes,
                    outcomePrices: json.market.outcomePrices,
                  },
                  last_price_updated_at: nowIso,
                },
                { onConflict: 'condition_id' }
              )
          }
        } catch {
          // Best-effort price refresh; ignore failures.
        } finally {
          clearTimeout(timeout)
        }
      })
    )
  }

  return priceMap
}

const inferResolutionPrice = (position: Position) => {
  if (!position.marketResolved) return null
  if (position.currentPrice !== null && position.currentPrice !== undefined) {
    return position.currentPrice
  }
  if (!position.resolvedOutcome) return null
  const targetOutcome = normalize(position.outcome)
  const resolved = normalize(position.resolvedOutcome)
  return targetOutcome === resolved ? 1 : 0
}

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

interface Order {
  order_id: string
  side: string
  filled_size: number | null
  size: number | null
  price: number | null
  price_when_copied: number | null
  amount_invested: number | null
  market_id: string | null
  outcome: string | null
  current_price: number | null
  market_resolved: boolean
  resolved_outcome: string | null
  user_exit_price: number | null
  user_closed_at: string | null
  created_at: string | null
  copied_trader_wallet: string | null
}

interface Position {
  tokenId: string
  marketId: string
  outcome: string
  marketResolved: boolean
  resolvedOutcome: string | null
  buys: Array<{ price: number; size: number; cost: number; timestamp: string }>
  sells: Array<{ price: number; size: number; proceeds: number; timestamp: string }>
  netSize: number
  totalCost: number
  totalProceeds: number
  realizedPnl: number
  unrealizedPnl: number
  avgEntryPrice: number
  currentPrice: number | null
  remainingSize: number
  remainingCost: number
  closedByResolution: boolean
}

type DailyPnlPoint = {
  date: string
  pnl: number
  trades: number
}

const buildPositionsMap = (orders: Order[]) => {
  const positionsMap = new Map<string, Position>()

  for (const order of orders) {
    const side = normalizeSide(order.side)
    const price =
      side === 'buy'
        ? toNullableNumber(order.price_when_copied) ?? toNullableNumber(order.price)
        : toNullableNumber(order.price) ?? toNullableNumber(order.price_when_copied)
    const filledSize = resolveFilledSize(order)

    if (!price || !filledSize || filledSize <= 0) continue

    const marketId = order.market_id?.trim() || ''
    const outcome = normalize(order.outcome)
    const positionKey = `${marketId}::${outcome}`

    if (!positionKey || positionKey === '::' || !marketId) continue

    let position = positionsMap.get(positionKey)
    if (!position) {
      position = {
        tokenId: positionKey,
        marketId: marketId,
        outcome: order.outcome || '',
        marketResolved: Boolean(order.market_resolved),
        resolvedOutcome: order.resolved_outcome || null,
        buys: [],
        sells: [],
        netSize: 0,
        totalCost: 0,
        totalProceeds: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        avgEntryPrice: 0,
        currentPrice: toNullableNumber(order.current_price),
        remainingSize: 0,
        remainingCost: 0,
        closedByResolution: false,
      }
      positionsMap.set(positionKey, position)
    } else {
      position.marketResolved = position.marketResolved || Boolean(order.market_resolved)
      if (order.resolved_outcome) {
        position.resolvedOutcome = order.resolved_outcome
      }
    }

    const orderCurrentPrice =
      toNullableNumber(order.user_exit_price) ?? toNullableNumber(order.current_price)
    if (orderCurrentPrice !== null) {
      position.currentPrice = orderCurrentPrice
    }

    const timestamp = order.created_at || new Date().toISOString()
    if (side === 'buy') {
      position.buys.push({
        price,
        size: filledSize,
        cost: price * filledSize,
        timestamp,
      })
      position.totalCost += price * filledSize
      position.netSize += filledSize
    } else if (side === 'sell') {
      position.sells.push({
        price,
        size: filledSize,
        proceeds: price * filledSize,
        timestamp,
      })
      position.totalProceeds += price * filledSize
      position.netSize -= filledSize
    }
  }

  return positionsMap
}

const toDateKey = (timestamp?: string | null) => {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

const getLatestTimestamp = (position: Position) => {
  const timestamps = [...position.buys, ...position.sells]
    .map((entry) => new Date(entry.timestamp).getTime())
    .filter((value) => Number.isFinite(value))
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

type Stats = {
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  totalVolume: number
  roi: number
  winRate: number
  totalTrades: number
  openTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
}

const buildDailyPnlSeries = (positionsMap: Map<string, Position>) => {
  const daily = new Map<string, { pnl: number; trades: number }>()

  const ensureEntry = (dateKey: string) => {
    const existing = daily.get(dateKey)
    if (existing) return existing
    const created = { pnl: 0, trades: 0 }
    daily.set(dateKey, created)
    return created
  }

  const addDailyPnl = (dateKey: string | null, value: number) => {
    if (!dateKey || !Number.isFinite(value)) return
    const entry = ensureEntry(dateKey)
    entry.pnl += value
  }

  const addDailyTrades = (dateKey: string | null, count = 1) => {
    if (!dateKey || !Number.isFinite(count) || count <= 0) return
    const entry = ensureEntry(dateKey)
    entry.trades += count
  }

  for (const position of positionsMap.values()) {
    let remainingBuys = position.buys.map((buy) => ({ ...buy }))

    for (const sell of position.sells) {
      let remainingSellSize = sell.size
      const sellDateKey = toDateKey(sell.timestamp)
      let matched = false

      while (remainingSellSize > 0 && remainingBuys.length > 0) {
        const buy = remainingBuys[0]
        const matchSize = Math.min(remainingSellSize, buy.size)
        const matchCost = (buy.cost / buy.size) * matchSize
        const matchProceeds = (sell.proceeds / sell.size) * matchSize
        const matchPnl = matchProceeds - matchCost

        addDailyPnl(sellDateKey, matchPnl)
        matched = true

        remainingSellSize -= matchSize
        buy.size -= matchSize
        buy.cost -= matchCost

        if (buy.size <= POSITION_EPSILON) {
          remainingBuys.shift()
        }
      }

      if (matched) {
        addDailyTrades(sellDateKey, 1)
      }
    }

    const remainingSize = remainingBuys.reduce((sum, b) => sum + b.size, 0)
    const remainingCost = remainingBuys.reduce((sum, b) => sum + b.cost, 0)
    const resolutionPrice = inferResolutionPrice(position)
    if (remainingSize > 0 && resolutionPrice !== null) {
      const resolutionValue = remainingSize * resolutionPrice
      const resolutionPnl = resolutionValue - remainingCost
      const resolutionTimestamp = getLatestTimestamp(position) ?? new Date().toISOString()
      const resolutionDateKey = toDateKey(resolutionTimestamp)
      addDailyPnl(resolutionDateKey, resolutionPnl)
      addDailyTrades(resolutionDateKey, 1)
    }
  }

  return Array.from(daily.entries())
    .map(([date, entry]) => ({ date, pnl: entry.pnl, trades: entry.trades }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

const computeStatsFromPositions = (
  positionsMap: Map<string, Position>,
  orders: Order[],
  priceMap: Map<string, MarketPrice>
): Stats => {
  let totalRealizedPnl = 0
  let totalUnrealizedPnl = 0
  let totalVolume = 0
  let openPositionsCount = 0

  for (const position of positionsMap.values()) {
    const freshPrice = findOutcomePrice(priceMap.get(position.marketId), position.outcome)
    if (freshPrice !== null) {
      position.currentPrice = freshPrice
    }

    if (position.totalCost > 0) {
      const totalBuys = position.buys.reduce((sum, b) => sum + b.size, 0)
      position.avgEntryPrice = totalBuys > 0 ? position.totalCost / totalBuys : 0
    }

    let remainingBuys = position.buys.map((buy) => ({ ...buy }))
    let realizedPnl = 0

    for (const sell of position.sells) {
      let remainingSellSize = sell.size

      while (remainingSellSize > 0 && remainingBuys.length > 0) {
        const buy = remainingBuys[0]
        const matchSize = Math.min(remainingSellSize, buy.size)
        const matchCost = (buy.cost / buy.size) * matchSize
        const matchProceeds = (sell.proceeds / sell.size) * matchSize

        realizedPnl += matchProceeds - matchCost

        remainingSellSize -= matchSize
        buy.size -= matchSize
        buy.cost -= matchCost

        if (buy.size <= POSITION_EPSILON) {
          remainingBuys.shift()
        }
      }
    }

    position.remainingSize = remainingBuys.reduce((sum, b) => sum + b.size, 0)
    position.remainingCost = remainingBuys.reduce((sum, b) => sum + b.cost, 0)
    position.netSize = position.remainingSize

    const resolutionPrice = inferResolutionPrice(position)
    if (position.remainingSize > 0 && resolutionPrice !== null) {
      const resolutionValue = position.remainingSize * resolutionPrice
      const resolutionPnl = resolutionValue - position.remainingCost
      realizedPnl += resolutionPnl
      position.closedByResolution = true
      position.remainingSize = 0
      position.remainingCost = 0
      position.netSize = 0
    }

    position.realizedPnl = realizedPnl
    totalRealizedPnl += realizedPnl

    if (!position.closedByResolution && position.remainingSize > 0) {
      openPositionsCount++
      if (position.currentPrice !== null) {
        const currentValue = position.remainingSize * position.currentPrice
        position.unrealizedPnl = currentValue - position.remainingCost
        totalUnrealizedPnl += position.unrealizedPnl
      }
    }

    // Volume should reflect capital deployed (buys only)
    totalVolume += position.totalCost
  }

  const totalPnl = totalRealizedPnl + totalUnrealizedPnl
  const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0

  const closedPositions = Array.from(positionsMap.values()).filter(
    (p) => p.closedByResolution || p.netSize <= POSITION_EPSILON
  )
  const winningPositions = closedPositions.filter((p) => p.realizedPnl > 0).length
  const losingPositions = closedPositions.filter((p) => p.realizedPnl <= 0).length
  const winRate = closedPositions.length > 0 ? (winningPositions / closedPositions.length) * 100 : 0

  const totalTrades = openPositionsCount + winningPositions + losingPositions

  return {
    totalPnl,
    realizedPnl: totalRealizedPnl,
    unrealizedPnl: totalUnrealizedPnl,
    totalVolume,
    roi,
    winRate,
    totalTrades,
    openTrades: openPositionsCount,
    closedTrades: closedPositions.length,
    winningTrades: winningPositions,
    losingTrades: losingPositions,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()
    if (authError) {
      console.error('Auth error fetching user for trader stats:', authError)
    }

    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const normalizedWallet = wallet.toLowerCase()
    const supabase = createService()
    const ordersTable = await resolveOrdersTableName(supabase)

    const { data: allOrders, error: ordersError } = await supabase
      .from(ordersTable)
      .select(`
        order_id,
        side,
        filled_size,
        size,
        price,
        price_when_copied,
        amount_invested,
        market_id,
        outcome,
        current_price,
        market_resolved,
        resolved_outcome,
        user_exit_price,
        user_closed_at,
        created_at,
        copied_trader_wallet
      `)
      .eq('copy_user_id', user.id)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders for trader stats:', ordersError)
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    const orders = (allOrders || []) as Order[]
    const traderOrders = orders.filter(
      (order) => order.copied_trader_wallet?.toLowerCase() === normalizedWallet
    )

    const allPositions = buildPositionsMap(orders)
    const traderPositions = buildPositionsMap(traderOrders)

    const marketIds = Array.from(
      new Set([
        ...Array.from(allPositions.values()).map((p) => p.marketId),
        ...Array.from(traderPositions.values()).map((p) => p.marketId),
      ])
    ).filter(Boolean)

    const priceMap = await fetchMarketPrices(supabase, marketIds)

    const overallStats = computeStatsFromPositions(allPositions, orders, priceMap)
    const traderStats = computeStatsFromPositions(traderPositions, traderOrders, priceMap)

    const tradesPct = overallStats.totalTrades > 0
      ? (traderStats.totalTrades / overallStats.totalTrades) * 100
      : null
    const pnlPct = overallStats.totalPnl !== 0
      ? (traderStats.totalPnl / overallStats.totalPnl) * 100
      : null
    const winsPct = overallStats.winningTrades > 0
      ? (traderStats.winningTrades / overallStats.winningTrades) * 100
      : null
    const lossesPct = overallStats.losingTrades > 0
      ? (traderStats.losingTrades / overallStats.losingTrades) * 100
      : null

    const dailyPnl = buildDailyPnlSeries(traderPositions)

    return NextResponse.json({
      trader: traderStats,
      overall: overallStats,
      dailyPnl,
      shares: {
        tradesPct,
        pnlPct,
        winsPct,
        lossesPct,
      },
    })
  } catch (error: any) {
    console.error('Unexpected error in trader my-stats route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
