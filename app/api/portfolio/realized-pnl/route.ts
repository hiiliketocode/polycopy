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
const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

const resolveFilledSize = (row: any) => {
  const filled = toNullableNumber(row?.filled_size)
  if (filled !== null && filled > 0) return filled
  const size = toNullableNumber(row?.size)
  if (filled === null && size !== null && size > 0) return size
  return null
}

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json({ daily: [], summaries: [], volume: null, rankings: {} }, { status: 200 })
    }

    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('Auth error fetching user for realized PnL:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
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

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const ordersTable = await resolveOrdersTableName(supabase)

    // Get wallet address for this user
    const { data: cred } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', requestedUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const wallet = cred?.polymarket_account_address?.toLowerCase()
    if (!wallet) {
      return NextResponse.json({ daily: [], summaries: [], volume: null, rankings: {} })
    }

    // Get trader_id
    const { data: trader } = await supabase
      .from('traders')
      .select('id, volume')
      .ilike('wallet_address', wallet)
      .limit(1)
      .maybeSingle()

    const traderId = trader?.id

    // Fetch copy orders
    const { data: copyOrders } = await supabase
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

    let orders = (copyOrders || []) as any[]

    // Build copy BUY keys and fetch matching SELLs
    const copyBuyKeys = new Set<string>()
    for (const o of orders) {
      if (normalizeSide(o.side) !== 'buy') continue
      const mid = o.market_id?.trim() || ''
      const out = normalize(o.outcome)
      if (mid && out) copyBuyKeys.add(`${mid}::${out}`)
    }

    if (traderId && copyBuyKeys.size > 0) {
      const { data: sellRows } = await supabase
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

      if (sellRows && sellRows.length > 0) {
        const orderIds = new Set(orders.map((o: any) => o.order_id))
        const matchingSells = (sellRows as any[]).filter((o) => {
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
        }
      }
    }

    // Build positions and calculate realized PnL by date
    const positionsMap = new Map<string, any>()

    for (const order of orders) {
      const side = normalizeSide(order.side)
      const price = side === 'buy'
        ? (toNullableNumber(order.price_when_copied) ?? toNullableNumber(order.price))
        : (toNullableNumber(order.price) ?? toNullableNumber(order.price_when_copied))
      const filledSize = resolveFilledSize(order)
      
      if (!price || !filledSize || filledSize <= 0) continue

      const marketId = order.market_id?.trim() || ''
      const outcome = normalize(order.outcome)
      const positionKey = `${marketId}::${outcome}`

      if (!positionKey || positionKey === '::' || !marketId) continue

      let position = positionsMap.get(positionKey)
      if (!position) {
        position = {
          marketId: marketId,
          outcome: order.outcome || '',
          marketResolved: Boolean(order.market_resolved),
          resolvedOutcome: order.resolved_outcome || null,
          buys: [],
          sells: [],
        }
        positionsMap.set(positionKey, position)
      } else {
        // Update resolution status if order has newer info
        position.marketResolved = position.marketResolved || Boolean(order.market_resolved)
        if (order.resolved_outcome) {
          position.resolvedOutcome = order.resolved_outcome
        }
      }

      const timestamp = order.created_at || new Date().toISOString()
      if (side === 'buy') {
        position.buys.push({
          price,
          size: filledSize,
          cost: price * filledSize,
          timestamp,
          date: timestamp.split('T')[0],
        })
        
        // Handle manually closed positions (user_exit_price) - treat as SELL order
        // Only if there's no actual SELL order for this position yet
        if (order.user_closed_at && order.user_exit_price !== null && order.user_exit_price !== undefined) {
          const exitPrice = toNullableNumber(order.user_exit_price)
          if (exitPrice !== null && filledSize > 0) {
            const closeTimestamp = order.user_closed_at || timestamp
            const closeDate = closeTimestamp.split('T')[0]
            position.sells.push({
              price: exitPrice,
              size: filledSize,
              proceeds: exitPrice * filledSize,
              timestamp: closeTimestamp,
              date: closeDate,
            })
          }
        }
      } else if (side === 'sell') {
        position.sells.push({
          price,
          size: filledSize,
          proceeds: price * filledSize,
          timestamp,
          date: timestamp.split('T')[0],
        })
      }
    }

    // Fetch market resolution data
    const allMarketIds = Array.from(new Set(Array.from(positionsMap.values()).map((p: any) => p.marketId).filter(Boolean)))
    const BATCH_SIZE = 100
    const marketRows: any[] = []
    
    for (let i = 0; i < allMarketIds.length; i += BATCH_SIZE) {
      const batch = allMarketIds.slice(i, i + BATCH_SIZE)
      const { data: batchRows } = await supabase
        .from('markets')
        .select('condition_id, outcome_prices, closed, resolved_outcome, winning_side')
        .in('condition_id', batch)
      
      if (batchRows) {
        marketRows.push(...batchRows)
      }
    }

    const priceMap = new Map<string, any>()
    marketRows.forEach((row) => {
      if (row.condition_id) {
        const outcomes = row.outcome_prices?.outcomes ?? row.outcome_prices?.labels ?? null
        const outcomePrices = row.outcome_prices?.outcomePrices ?? row.outcome_prices?.prices ?? null
        
        priceMap.set(row.condition_id, {
          closed: row.closed,
          resolvedOutcome: row.resolved_outcome ?? null,
          winningSide: row.winning_side ?? null,
          outcomes: outcomes,
          outcomePrices: outcomePrices,
        })
      }
    })

    // Calculate realized PnL by date (FIFO matching)
    const dailyPnlMap = new Map<string, number>()

    for (const position of positionsMap.values()) {
      const marketMeta = priceMap.get(position.marketId)
      
      // Mark position as resolved if markets table indicates it (same logic as portfolio stats)
      // This ensures consistency between the two APIs
      if (!position.resolvedOutcome && marketMeta) {
        position.resolvedOutcome = marketMeta?.resolvedOutcome ?? marketMeta?.winningSide ?? null
      }
      position.marketResolved =
        position.marketResolved ||
        Boolean(
          marketMeta?.closed ||
          marketMeta?.resolvedOutcome ||
          marketMeta?.winningSide
        )
      
      const isResolved = position.marketResolved
      const resolvedOutcome = position.resolvedOutcome

      let remainingBuys = [...position.buys]
      
      // Match sells to buys (FIFO)
      for (const sell of position.sells) {
        let remainingSellSize = sell.size
        const sellDate = sell.date
        
        while (remainingSellSize > 0 && remainingBuys.length > 0) {
          const buy = remainingBuys[0]
          const matchSize = Math.min(remainingSellSize, buy.size)
          const matchCost = (buy.cost / buy.size) * matchSize
          const matchProceeds = (sell.proceeds / sell.size) * matchSize
          
          const realizedPnl = matchProceeds - matchCost
          const current = dailyPnlMap.get(sellDate) || 0
          dailyPnlMap.set(sellDate, current + realizedPnl)
          
          remainingSellSize -= matchSize
          buy.size -= matchSize
          buy.cost -= matchCost
          
          if (buy.size <= 0.00001) {
            remainingBuys.shift()
          }
        }
      }

      // Handle resolved markets (same logic as portfolio stats - use inferResolutionPrice logic)
      if (isResolved && remainingBuys.length > 0) {
        // Determine resolution price using same priority as portfolio stats:
        // 1. Resolved outcome (0 or 1)
        // 2. Market outcome_prices
        // 3. Current price (last resort)
        let resolutionPrice: number | null = null
        
        if (resolvedOutcome) {
          const targetOutcome = normalize(position.outcome)
          const resolved = normalize(resolvedOutcome)
          resolutionPrice = targetOutcome === resolved ? 1 : 0
        } else if (marketMeta?.outcomePrices && marketMeta?.outcomes) {
          // Use outcome_prices
          const targetOutcome = normalize(position.outcome)
          const idx = marketMeta.outcomes.findIndex((o: string) => normalize(o) === targetOutcome)
          if (idx >= 0 && idx < marketMeta.outcomePrices.length) {
            const price = Number(marketMeta.outcomePrices[idx])
            if (Number.isFinite(price)) {
              resolutionPrice = price
            }
          }
        }
        
        // Only process if we have a valid resolution price
        if (resolutionPrice !== null) {
          // Get resolution date (use latest buy date or market resolved date)
          let resolutionDate = remainingBuys[remainingBuys.length - 1]?.date
          if (!resolutionDate) {
            // Try to get from markets table
            const marketRow = marketRows.find((r: any) => r.condition_id === position.marketId)
            if (marketRow?.resolved_at) {
              resolutionDate = new Date(marketRow.resolved_at).toISOString().split('T')[0]
            } else {
              resolutionDate = new Date().toISOString().split('T')[0] // Fallback to today
            }
          }

          for (const buy of remainingBuys) {
            const resolutionValue = buy.size * resolutionPrice
            const realizedPnl = resolutionValue - buy.cost
            const current = dailyPnlMap.get(resolutionDate) || 0
            dailyPnlMap.set(resolutionDate, current + realizedPnl)
            
            // Debug logging for resolved positions
            if (realizedPnl !== 0) {
              console.log(`[Realized PnL] Resolved position: ${position.marketId}::${position.outcome}, PnL: ${realizedPnl.toFixed(2)}, date: ${resolutionDate}`)
            }
          }
        }
      }
    }

    // Convert to array and calculate cumulative
    const dailyRows = Array.from(dailyPnlMap.entries())
      .map(([date, realized_pnl]) => ({ date, realized_pnl }))
      .sort((a, b) => a.date.localeCompare(b.date))
    
    const totalRealizedPnl = dailyRows.reduce((sum, row) => sum + row.realized_pnl, 0)
    console.log(`[Realized PnL] Calculated total: ${totalRealizedPnl.toFixed(2)}, from ${dailyRows.length} days`)

    let cumulative = 0
    const normalizedRows = dailyRows.map((row) => {
      cumulative += row.realized_pnl
      return {
        date: row.date,
        realized_pnl: row.realized_pnl,
        pnl_to_date: cumulative,
      }
    })

    // Generate summaries for different time periods
    const shiftDate = (dateStr: string, days: number) => {
      const date = new Date(`${dateStr}T00:00:00Z`)
      if (Number.isNaN(date.getTime())) return dateStr
      date.setUTCDate(date.getUTCDate() + days)
      return date.toISOString().slice(0, 10)
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const yesterdayStr = shiftDate(todayStr, -1)
    const lastDateStr = normalizedRows.length > 0 ? normalizedRows[normalizedRows.length - 1].date : null
    let shiftDays = 0
    if (lastDateStr) {
      const lastMs = Date.parse(`${lastDateStr}T00:00:00Z`)
      const yesterdayMs = Date.parse(`${yesterdayStr}T00:00:00Z`)
      if (Number.isFinite(lastMs) && Number.isFinite(yesterdayMs) && lastMs > yesterdayMs) {
        shiftDays = Math.round((yesterdayMs - lastMs) / (24 * 60 * 60 * 1000))
      }
    }

    const shiftedRows = shiftDays !== 0
      ? normalizedRows.map((row) => ({
          ...row,
          date: shiftDate(row.date, shiftDays)
        }))
      : normalizedRows

    let anchorIndex = shiftedRows.length - 1
    if (anchorIndex >= 0 && shiftedRows[anchorIndex].date === todayStr && shiftedRows.length > 1) {
      anchorIndex -= 1
    }
    const anchorDate = anchorIndex >= 0
      ? new Date(`${shiftedRows[anchorIndex].date}T00:00:00Z`)
      : new Date()
    const startOfAnchor = Date.UTC(
      anchorDate.getUTCFullYear(),
      anchorDate.getUTCMonth(),
      anchorDate.getUTCDate()
    )
    const cutoffDate = (days: number | null) => {
      if (days === null) return null
      const d = new Date(startOfAnchor)
      d.setUTCDate(d.getUTCDate() - (days - 1))
      return d
    }

    const volume = trader?.volume !== null && trader?.volume !== undefined
      ? Number(trader.volume)
      : null

    const periods: { label: string; days: number | null }[] = [
      { label: '1D', days: 1 },
      { label: '7D', days: 7 },
      { label: '30D', days: 30 },
      { label: '90D', days: 90 },
      { label: '1Y', days: 365 },
      { label: 'ALL', days: null }
    ]

    const summaries = periods.map(({ label, days }) => {
      const cutoff = cutoffDate(days)
      const windowRows = cutoff
        ? shiftedRows.filter((row) => {
            const rowDate = new Date(`${row.date}T00:00:00Z`)
            return rowDate >= cutoff
          })
        : shiftedRows

      const pnl = windowRows.reduce((acc, row) => acc + (row.realized_pnl || 0), 0)
      const returnPct = volume && volume !== 0 ? (pnl / volume) * 100 : null
      const cumulative = windowRows.length > 0 ? windowRows[windowRows.length - 1].pnl_to_date : null

      return {
        label,
        days,
        pnl,
        returnPct,
        cumulative,
        windowStart: windowRows.length > 0 ? windowRows[0].date : null,
        windowEnd: windowRows.length > 0 ? windowRows[windowRows.length - 1].date : null
      }
    })

    return NextResponse.json({
      daily: shiftedRows,
      summaries,
      volume,
      rankings: {} // User portfolio doesn't have rankings
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/realized-pnl:', error)
    console.error('Error stack:', error?.stack)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error?.message || 'Unknown error',
        daily: [],
        summaries: [],
        volume: null,
        rankings: {}
      },
      { status: 500 }
    )
  }
}
