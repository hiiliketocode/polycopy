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
const PRICE_FETCH_TIMEOUT_MS = 8000 // Increased timeout
const MAX_MARKETS_TO_REFRESH = 100 // Increased from 40 to handle more open positions

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
}

interface Position {
  tokenId: string
  marketId: string
  outcome: string
  buys: Array<{ price: number; size: number; cost: number; timestamp: string }>
  sells: Array<{ price: number; size: number; proceeds: number; timestamp: string }>
  netSize: number
  totalCost: number
  totalProceeds: number
  realizedPnl: number
  unrealizedPnl: number
  avgEntryPrice: number
  currentPrice: number | null
}

export async function GET(request: Request) {
  // Force recompilation - updated query to include ALL orders (BUY + SELL)
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

    // Query ALL orders (both BUY and SELL) for position-based P&L calculation
    // Don't filter by copied_trade_id - we need ALL orders including sells
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
        created_at
      `)
      .eq('copy_user_id', requestedUserId)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    const orders = (allOrders || []) as Order[]

    // Group orders by position (token_id, or fallback to market_id + outcome)
    const positionsMap = new Map<string, Position>()

    for (const order of orders) {
      const side = normalizeSide(order.side)
      const price = toNullableNumber(order.price_when_copied) ?? toNullableNumber(order.price)
      const filledSize = resolveFilledSize(order)
      
      if (!price || !filledSize || filledSize <= 0) continue

      // Create position key using market_id + outcome
      const marketId = order.market_id?.trim() || ''
      const outcome = normalize(order.outcome)
      const positionKey = `${marketId}::${outcome}`

      if (!positionKey || positionKey === '::' || !marketId) continue

      // Get or create position
      let position = positionsMap.get(positionKey)
      if (!position) {
        position = {
          tokenId: positionKey,
          marketId: marketId,
          outcome: order.outcome || '',
          buys: [],
          sells: [],
          netSize: 0,
          totalCost: 0,
          totalProceeds: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
          avgEntryPrice: 0,
          currentPrice: toNullableNumber(order.current_price)
        }
        positionsMap.set(positionKey, position)
      }

      // Update current price if we have a newer one
      const orderCurrentPrice = toNullableNumber(order.current_price)
      if (orderCurrentPrice !== null) {
        position.currentPrice = orderCurrentPrice
      }

      // Record the trade
      const timestamp = order.created_at || new Date().toISOString()
      if (side === 'buy') {
        position.buys.push({
          price,
          size: filledSize,
          cost: price * filledSize,
          timestamp
        })
        position.totalCost += price * filledSize
        position.netSize += filledSize
      } else if (side === 'sell') {
        position.sells.push({
          price,
          size: filledSize,
          proceeds: price * filledSize,
          timestamp
        })
        position.totalProceeds += price * filledSize
        position.netSize -= filledSize
      }
    }

    // Fetch fresh prices for all positions
    const allMarketIds = Array.from(
      new Set(
        Array.from(positionsMap.values())
          .map(p => p.marketId)
          .filter(Boolean)
      )
    ).slice(0, MAX_MARKETS_TO_REFRESH)

    const priceMap = await fetchMarketPrices(allMarketIds)

    // Calculate P&L for each position using FIFO cost basis
    let totalRealizedPnl = 0
    let totalUnrealizedPnl = 0
    let totalVolume = 0
    let openPositionsCount = 0
    let closedPositionsCount = 0

    for (const position of positionsMap.values()) {
      // Update current price if we fetched a fresh one
      const freshPrice = findOutcomePrice(priceMap.get(position.marketId), position.outcome)
      if (freshPrice !== null) {
        position.currentPrice = freshPrice
      }

      // Calculate average entry price for remaining shares
      if (position.totalCost > 0) {
        position.avgEntryPrice = position.totalCost / position.buys.reduce((sum, b) => sum + b.size, 0)
      }

      // FIFO matching: Match sells to buys chronologically
      let remainingBuys = [...position.buys]
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
          
          if (buy.size <= 0.00001) { // Account for floating point precision
            remainingBuys.shift()
          }
        }
      }

      position.realizedPnl = realizedPnl
      totalRealizedPnl += realizedPnl

      // Calculate unrealized P&L on remaining position
      const remainingSize = remainingBuys.reduce((sum, b) => sum + b.size, 0)
      const remainingCost = remainingBuys.reduce((sum, b) => sum + b.cost, 0)

      if (remainingSize > 0 && position.currentPrice !== null) {
        const currentValue = remainingSize * position.currentPrice
        position.unrealizedPnl = currentValue - remainingCost
        totalUnrealizedPnl += position.unrealizedPnl
        openPositionsCount++
      } else if (remainingSize <= 0.00001) {
        closedPositionsCount++
      }

      // Add to total volume (buys + sells, matching Polymarket's volume calculation)
      totalVolume += position.totalCost + position.totalProceeds
    }

    const totalPnl = totalRealizedPnl + totalUnrealizedPnl
    const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0

    // Calculate win rate (closed positions that made profit)
    const closedPositions = Array.from(positionsMap.values()).filter(p => 
      p.netSize <= 0.00001 && p.sells.length > 0
    )
    const winningPositions = closedPositions.filter(p => p.realizedPnl > 0).length
    const winRate = closedPositions.length > 0 ? (winningPositions / closedPositions.length) * 100 : 0

    console.log('🎯 Position-Based P&L Calculated:', {
      userId: requestedUserId.substring(0, 8),
      method: 'FIFO Cost Basis (Polymarket-style)',
      totalPositions: positionsMap.size,
      openPositions: openPositionsCount,
      closedPositions: closedPositionsCount,
      totalVolume: totalVolume.toFixed(2),
      realizedPnl: totalRealizedPnl.toFixed(2),
      unrealizedPnl: totalUnrealizedPnl.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      roi: roi.toFixed(2),
      winRate: winRate.toFixed(1),
      freshPricesFetched: priceMap.size,
      samplePositions: Array.from(positionsMap.values()).slice(0, 3).map(p => ({
        tokenId: p.tokenId.substring(0, 12),
        outcome: p.outcome,
        buys: p.buys.length,
        sells: p.sells.length,
        netSize: p.netSize.toFixed(2),
        realizedPnl: p.realizedPnl.toFixed(2),
        unrealizedPnl: p.unrealizedPnl.toFixed(2),
        currentPrice: p.currentPrice?.toFixed(2) || 'N/A'
      }))
    })

    return NextResponse.json({
      totalPnl,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalVolume,
      roi,
      winRate,
      totalTrades: orders.filter(o => normalizeSide(o.side) === 'buy').length,
      openTrades: openPositionsCount,
      closedTrades: closedPositions.length,
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
