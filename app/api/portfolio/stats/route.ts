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
// Keep cache fresh but avoid blocking API responses: treat 5 min as stale
const PRICE_STALE_AFTER_MS = 5 * 60 * 1000 // 5 minutes
const PRICE_FETCH_BATCH_SIZE = 40 // throttle external calls while allowing heavy users

// Portfolio summary cache settings
const PORTFOLIO_CACHE_STALE_AFTER_MS = 5 * 60 * 1000 // 5 minutes - recalculate if older
const CALCULATION_VERSION = 3 // Increment when calculation logic changes (v2: fixed resolution price priority, v3: added manual close handling)

type MarketPrice = {
  outcomes?: string[]
  outcomePrices?: number[]
  lastUpdatedAt?: string | null
  closed?: boolean
  resolvedOutcome?: string | null
  winningSide?: string | null
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

const loadCachedMarketPrices = async (
  supabase: ReturnType<typeof createService>,
  marketIds: string[]
) => {
  const priceMap = new Map<string, MarketPrice>()
  const staleMarketIds = new Set<string>()

  if (marketIds.length === 0) return { priceMap, staleMarketIds: [] as string[] }

  const { data: cachedRows, error: cacheError } = await supabase
    .from('markets')
    .select('condition_id, outcome_prices, last_price_updated_at, closed, resolved_outcome, winning_side')
    .in('condition_id', marketIds)

  const now = Date.now()

  if (!cacheError && cachedRows) {
    cachedRows.forEach((row) => {
      if (row.condition_id) {
        const outcomes =
          row.outcome_prices?.outcomes ??
          row.outcome_prices?.labels ??
          row.outcome_prices?.choices ??
          null
        const outcomePrices =
          row.outcome_prices?.outcomePrices ??
          row.outcome_prices?.prices ??
          row.outcome_prices?.probabilities ??
          null

        if (outcomes && outcomePrices) {
          priceMap.set(row.condition_id, {
            outcomes,
            outcomePrices,
            lastUpdatedAt: row.last_price_updated_at,
            closed: row.closed,
            resolvedOutcome: row.resolved_outcome ?? null,
            winningSide: row.winning_side ?? null,
          })
        } else {
          // even if prices missing, keep resolution info for settlement
          priceMap.set(row.condition_id, {
            outcomes: outcomes ?? undefined,
            outcomePrices: outcomePrices ?? undefined,
            lastUpdatedAt: row.last_price_updated_at,
            closed: row.closed,
            resolvedOutcome: row.resolved_outcome ?? null,
            winningSide: row.winning_side ?? null,
          })
        }

        const last = row.last_price_updated_at
          ? new Date(row.last_price_updated_at).getTime()
          : 0
        const isStale =
          !outcomePrices ||
          (!row.closed && (Number.isNaN(last) || now - last > PRICE_STALE_AFTER_MS))
        if (isStale) {
          staleMarketIds.add(row.condition_id)
        }
      }
    })
  }

  // Any markets missing from the cache are automatically stale
  marketIds.forEach((id) => {
    if (!priceMap.has(id)) {
      staleMarketIds.add(id)
    }
  })

  return { priceMap, staleMarketIds: Array.from(staleMarketIds) }
}

const refreshMarketPrices = async (
  supabase: ReturnType<typeof createService>,
  marketIds: string[]
) => {
  if (marketIds.length === 0) return

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'

  for (let i = 0; i < marketIds.length; i += PRICE_FETCH_BATCH_SIZE) {
    const chunk = marketIds.slice(i, i + PRICE_FETCH_BATCH_SIZE)

    await Promise.all(
      chunk.map(async (marketId) => {
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
            const nowIso = new Date().toISOString()
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
                  closed: json.market.closed ?? null,
                  resolved_outcome:
                    json.market.resolvedOutcome ??
                    json.market.resolved_outcome ??
                    json.market.winningSide ??
                    json.market.winning_side ??
                    null,
                  winning_side:
                    json.market.winningSide ??
                    json.market.winning_side ??
                    json.market.resolvedOutcome ??
                    json.market.resolved_outcome ??
                    null,
                },
                { onConflict: 'condition_id' }
              )
          }
        } catch (error) {
          console.warn('[portfolio/stats] background price refresh failed', error)
        } finally {
          clearTimeout(timeout)
        }
      })
    )
  }
}

const inferResolutionPrice = (position: Position, marketMeta?: MarketPrice) => {
  if (!position.marketResolved) return null
  
  // For resolved markets, prioritize resolved outcome over currentPrice
  // Current price might be stale (e.g., 0.47) but resolution is always 0 or 1
  if (position.resolvedOutcome) {
    const targetOutcome = normalize(position.outcome)
    const resolved = normalize(position.resolvedOutcome)
    return targetOutcome === resolved ? 1 : 0
  }
  
  // Fallback to marketMeta outcome_prices if available
  if (marketMeta?.outcomePrices && marketMeta?.outcomes) {
    const targetOutcome = normalize(position.outcome)
    const idx = marketMeta.outcomes.findIndex((o: string) => normalize(o) === targetOutcome)
    if (idx >= 0 && idx < marketMeta.outcomePrices.length) {
      const price = Number(marketMeta.outcomePrices[idx])
      if (Number.isFinite(price)) {
        return price
      }
    }
  }
  
  // Only use currentPrice as last resort (shouldn't happen for resolved markets)
  if (position.currentPrice !== null && position.currentPrice !== undefined) {
    return position.currentPrice
  }
  
  return null
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
    
    // Check for cached portfolio summary
    const { data: cachedSummary, error: cacheError } = await supabase
      .from('user_portfolio_summary')
      .select('*')
      .eq('user_id', requestedUserId)
      .maybeSingle()

    const now = Date.now()
    const cacheAge = cachedSummary?.last_updated_at
      ? now - new Date(cachedSummary.last_updated_at).getTime()
      : Infinity
    const isCacheValid = 
      cachedSummary &&
      cacheAge < PORTFOLIO_CACHE_STALE_AFTER_MS &&
      cachedSummary.calculation_version === CALCULATION_VERSION

    if (isCacheValid) {
      console.log(`📊 Returning cached portfolio summary (age: ${Math.round(cacheAge / 1000)}s)`)
    return NextResponse.json({
      totalPnl: Number(cachedSummary.total_pnl),
      realizedPnl: Number(cachedSummary.realized_pnl),
      unrealizedPnl: Number(cachedSummary.unrealized_pnl),
      totalVolume: Number(cachedSummary.total_volume),
      roi: Number(cachedSummary.roi),
      winRate: Number(cachedSummary.win_rate),
      totalTrades: cachedSummary.total_trades || (cachedSummary.total_buy_trades + cachedSummary.total_sell_trades),
      totalBuyTrades: cachedSummary.total_buy_trades,
      totalSellTrades: cachedSummary.total_sell_trades,
      openTrades: cachedSummary.open_positions,
      closedTrades: cachedSummary.closed_positions,
      winningPositions: cachedSummary.winning_positions,
      losingPositions: cachedSummary.losing_positions,
      freshness: cachedSummary.last_updated_at,
      cached: true,
    })
    }

    // Cache miss or stale - calculate fresh stats
    console.log(`🔄 Calculating fresh portfolio stats (cache ${cachedSummary ? 'stale' : 'missing'})`)
    
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

    let orders = (allOrders || []) as Order[]
    
    // SELL orders often lack copy_user_id. Fetch by trader_id and include only SELLs
    // that close copy positions (same market_id + outcome as copy BUYs).
    const copyBuyKeys = new Set<string>()
    for (const o of orders) {
      if (normalizeSide(o.side) !== 'buy') continue
      const mid = o.market_id?.trim() || ''
      const out = normalize(o.outcome)
      if (mid && out) copyBuyKeys.add(`${mid}::${out}`)
    }

    // Get trader_id from wallet (via clob_credentials -> traders)
    let traderId: string | null = null
    if (copyBuyKeys.size > 0) {
      const { data: cred } = await supabase
        .from('clob_credentials')
        .select('polymarket_account_address')
        .eq('user_id', requestedUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      const wallet = cred?.polymarket_account_address?.toLowerCase()
      if (wallet) {
        const { data: trader } = await supabase
          .from('traders')
          .select('id')
          .ilike('wallet_address', wallet)
          .limit(1)
          .maybeSingle()
        if (trader?.id) traderId = trader.id
      }
    }

    // Fetch SELL orders by trader_id that match copy positions
    if (traderId && copyBuyKeys.size > 0) {
      const { data: sellRows, error: sellErr } = await supabase
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
        .eq('trader_id', traderId)
        .order('created_at', { ascending: true })

      if (!sellErr && sellRows && sellRows.length > 0) {
        const orderIds = new Set(orders.map((o) => o.order_id))
        const matchingSells = (sellRows as Order[]).filter((o) => {
          if (normalizeSide(o.side) !== 'sell') return false
          const mid = o.market_id?.trim() || ''
          const out = normalize(o.outcome)
          const key = `${mid}::${out}`
          if (!copyBuyKeys.has(key)) return false
          if (orderIds.has(o.order_id)) return false
          return true
        })
        if (matchingSells.length > 0) {
          orders = [...orders, ...matchingSells].sort(
            (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          )
          console.log(`✅ Included ${matchingSells.length} SELL orders (trader_id match)`)
        }
      }
    }

    // Group orders by position (token_id, or fallback to market_id + outcome)
    const positionsMap = new Map<string, Position>()

    for (const order of orders) {
      const side = normalizeSide(order.side)
      const price = side === 'buy'
        ? (toNullableNumber(order.price_when_copied) ?? toNullableNumber(order.price))
        : (toNullableNumber(order.price) ?? toNullableNumber(order.price_when_copied))
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

      // Update current price if we have a newer one
      // NOTE: user_exit_price is only for realized P&L (manually closed positions)
      // For unrealized P&L, we should use current_price, not user_exit_price
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
        
        // Handle manually closed positions (user_exit_price) - treat as SELL order
        // Only if there's no actual SELL order for this position yet
        if (order.user_closed_at && order.user_exit_price !== null && order.user_exit_price !== undefined) {
          const exitPrice = toNullableNumber(order.user_exit_price)
          if (exitPrice !== null && filledSize > 0) {
            const closeTimestamp = order.user_closed_at || timestamp
            position.sells.push({
              price: exitPrice,
              size: filledSize,
              proceeds: exitPrice * filledSize,
              timestamp: closeTimestamp
            })
            position.totalProceeds += exitPrice * filledSize
            position.netSize -= filledSize
          }
        }
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
    )

    const { priceMap, staleMarketIds } = await loadCachedMarketPrices(supabase, allMarketIds)

    // Refresh stale prices in the background; don't block the response
    if (staleMarketIds.length > 0) {
      refreshMarketPrices(supabase, staleMarketIds).catch((err) =>
        console.warn('[portfolio/stats] async price refresh failed', err)
      )
    }

    // Calculate P&L for each position using FIFO cost basis
    let totalRealizedPnl = 0
    let totalUnrealizedPnl = 0
    let totalVolume = 0
    let openPositionsCount = 0

    for (const position of positionsMap.values()) {
      const marketMeta = priceMap.get(position.marketId)

      // Prefer resolved outcome from markets cache if not already on the position
      if (!position.resolvedOutcome) {
        position.resolvedOutcome = marketMeta?.resolvedOutcome ?? marketMeta?.winningSide ?? null
      }
      // Mark resolved if markets table says it's closed/resolved
      position.marketResolved =
        position.marketResolved ||
        Boolean(
          marketMeta?.closed ||
            marketMeta?.resolvedOutcome ||
            marketMeta?.winningSide
        )

      // Update current price if we fetched a fresh one
      const freshPrice = findOutcomePrice(marketMeta, position.outcome)
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

      position.remainingSize = remainingBuys.reduce((sum, b) => sum + b.size, 0)
      position.remainingCost = remainingBuys.reduce((sum, b) => sum + b.cost, 0)
      position.netSize = position.remainingSize

      const resolutionPrice = inferResolutionPrice(position, marketMeta)
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
      
      // Debug logging for resolved positions
      if (position.closedByResolution && realizedPnl !== 0) {
        console.log(`[Portfolio Stats] Resolved position: ${position.marketId}::${position.outcome}, PnL: ${realizedPnl.toFixed(2)}, remainingSize: ${position.remainingSize}`)
      }

      // Calculate unrealized P&L on remaining position
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

    // Calculate win rate (closed positions that made profit)
    const closedPositions = Array.from(positionsMap.values()).filter(
      (p) => p.closedByResolution || p.netSize <= 0.00001
    )
    const winningPositions = closedPositions.filter(p => p.realizedPnl > 0).length
    const losingPositions = closedPositions.length - winningPositions
    const winRate = closedPositions.length > 0 ? (winningPositions / closedPositions.length) * 100 : 0

    const totalBuyTrades = orders.filter(o => normalizeSide(o.side) === 'buy').length
    const totalSellTrades = orders.filter(o => normalizeSide(o.side) === 'sell').length

    console.log('🎯 Position-Based P&L Calculated:', {
      userId: requestedUserId.substring(0, 8),
      method: 'FIFO Cost Basis (Polymarket-style)',
      totalPositions: positionsMap.size,
      openPositions: openPositionsCount,
      closedPositions: closedPositions.length,
      totalVolume: totalVolume.toFixed(2),
      realizedPnl: totalRealizedPnl.toFixed(2),
      unrealizedPnl: totalUnrealizedPnl.toFixed(2),
      totalPnl: totalPnl.toFixed(2),
      roi: roi.toFixed(2),
      winRate: winRate.toFixed(1),
      freshPricesFetched: priceMap.size,
    })

    console.log(`[Portfolio Stats] Calculated totals: realized=${totalRealizedPnl.toFixed(2)}, unrealized=${totalUnrealizedPnl.toFixed(2)}, total=${(totalRealizedPnl + totalUnrealizedPnl).toFixed(2)}`)
    
    // Save to cache
    const { error: saveError } = await supabase.rpc('upsert_user_portfolio_summary', {
      p_user_id: requestedUserId,
      p_total_pnl: totalPnl,
      p_realized_pnl: totalRealizedPnl,
      p_unrealized_pnl: totalUnrealizedPnl,
      p_total_volume: totalVolume,
      p_roi: roi,
      p_win_rate: winRate,
      p_total_trades: totalBuyTrades + totalSellTrades,
      p_total_buy_trades: totalBuyTrades,
      p_total_sell_trades: totalSellTrades,
      p_open_positions: openPositionsCount,
      p_closed_positions: closedPositions.length,
      p_winning_positions: winningPositions,
      p_losing_positions: losingPositions,
      p_calculation_version: CALCULATION_VERSION,
    })

    if (saveError) {
      console.error('⚠️ Failed to save portfolio summary to cache:', saveError)
      // Continue anyway - don't fail the request
    } else {
      console.log('✅ Saved portfolio summary to cache')
    }

    return NextResponse.json({
      totalPnl,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalVolume,
      roi,
      winRate,
      totalTrades: totalBuyTrades + totalSellTrades,
      totalBuyTrades,
      totalSellTrades,
      openTrades: openPositionsCount,
      closedTrades: closedPositions.length,
      winningPositions,
      losingPositions,
      freshness: new Date().toISOString(),
      cached: false,
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
