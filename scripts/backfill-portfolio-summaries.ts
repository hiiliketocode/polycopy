/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

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

const inferResolutionPrice = (position: Position, marketMeta?: any) => {
  if (!position.marketResolved) return null
  if (position.currentPrice !== null && position.currentPrice !== undefined) {
    return position.currentPrice
  }
  
  // First try resolvedOutcome/winningSide
  if (position.resolvedOutcome) {
    const targetOutcome = normalize(position.outcome)
    const resolved = normalize(position.resolvedOutcome)
    return targetOutcome === resolved ? 1 : 0
  }
  
  // If no resolvedOutcome, try outcome_prices from marketMeta
  if (marketMeta?.outcomePrices) {
    const outcomes = marketMeta.outcomes || []
    const prices = marketMeta.outcomePrices || []
    const targetOutcome = normalize(position.outcome)
    
    const outcomeIndex = outcomes.findIndex((o: string) => normalize(o) === targetOutcome)
    if (outcomeIndex >= 0 && outcomeIndex < prices.length) {
      const price = Number(prices[outcomeIndex])
      if (Number.isFinite(price)) {
        return price
      }
    }
  }
  
  return null
}

async function calculatePortfolioStats(userId: string, debug = false): Promise<{
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  totalVolume: number
  roi: number
  winRate: number
  totalBuyTrades: number
  totalSellTrades: number
  openPositions: number
  closedPositions: number
  winningPositions: number
  losingPositions: number
} | null> {
  // Determine orders table
  let ordersTable: 'orders' | 'trades' = 'orders'
  const { error: tableError } = await supabase
    .from('orders')
    .select('order_id')
    .limit(1)

  if (tableError) {
    const code = (tableError as any)?.code
    const isMissingTable =
      ['PGRST205', '42P01', '42703'].includes(code) ||
      tableError.message?.toLowerCase().includes('could not find the table')
    
    if (isMissingTable) {
      ordersTable = 'trades'
    } else {
      throw tableError
    }
  }

  // Fetch copy orders by copy_user_id
  const { data: copyOrders, error: queryError } = await supabase
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
    .eq('copy_user_id', userId)
    .order('created_at', { ascending: true })

  if (queryError) {
    console.error(`  ❌ Error fetching orders for ${userId.substring(0, 8)}:`, queryError.message)
    return null
  }

  let orders = (copyOrders || []) as Order[]
  
  // Build set of copy BUY (market_id, outcome) keys
  const copyBuyKeys = new Set<string>()
  for (const o of orders) {
    if (normalizeSide(o.side) !== 'buy') continue
    const mid = o.market_id?.trim() || ''
    const out = normalize(o.outcome)
    if (mid && out) copyBuyKeys.add(`${mid}::${out}`)
  }

  // Get trader_id for SELL orders
  let traderId: string | null = null
  if (copyBuyKeys.size > 0) {
    const { data: cred } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', userId)
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

  // Fetch matching SELL orders
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
      }
    }
  }

  if (orders.length === 0) {
    return null // No trades, skip
  }

  // Build positions
  const positionsMap = new Map<string, Position>()

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

    // NOTE: user_exit_price is only for realized P&L (manually closed positions)
    // For unrealized P&L, we should use current_price, not user_exit_price
    const orderCurrentPrice = toNullableNumber(order.current_price)
    if (orderCurrentPrice !== null) {
      position.currentPrice = orderCurrentPrice
    }

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

  // Fetch market prices
  const allMarketIds = Array.from(
    new Set(
      Array.from(positionsMap.values())
        .map(p => p.marketId)
        .filter(Boolean)
    )
  )

  // Batch market queries
  const BATCH_SIZE = 100
  const marketRows: any[] = []
  
  for (let i = 0; i < allMarketIds.length; i += BATCH_SIZE) {
    const batch = allMarketIds.slice(i, i + BATCH_SIZE)
    const { data: batchRows, error: batchError } = await supabase
      .from('markets')
      .select('condition_id, outcome_prices, last_price_updated_at, closed, resolved_outcome, winning_side')
      .in('condition_id', batch)
    
    if (!batchError && batchRows) {
      marketRows.push(...batchRows)
    }
  }

  const priceMap = new Map<string, any>()
  if (marketRows) {
    marketRows.forEach((row) => {
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
        
        priceMap.set(row.condition_id, {
          closed: row.closed,
          resolvedOutcome: row.resolved_outcome ?? null,
          winningSide: row.winning_side ?? null,
          outcomes: outcomes,
          outcomePrices: outcomePrices,
        })
      }
    })
  }

  // Calculate P&L
  let totalRealizedPnl = 0
  let totalUnrealizedPnl = 0
  let totalVolume = 0
  let openPositionsCount = 0

  for (const position of positionsMap.values()) {
    const marketMeta = priceMap.get(position.marketId)
    
    if (debug && userId === '490723a6-e0be-4a7a-9796-45d4d09aa1bd' && position.marketId.includes('d84a501cf5cc0b0271')) {
      console.log(`[DEBUG] Before marketMeta update:`)
      console.log(`  position.currentPrice: ${position.currentPrice}`)
      console.log(`  marketMeta:`, JSON.stringify(marketMeta))
    }

    if (!position.resolvedOutcome) {
      const winningSide = marketMeta?.winningSide
      // Handle winningSide as JSON object
      const winningSideStr = typeof winningSide === 'string' 
        ? winningSide 
        : (winningSide?.label || winningSide?.id || null)
      position.resolvedOutcome = marketMeta?.resolvedOutcome ?? winningSideStr ?? null
    }
    const hasResolutionData = marketMeta?.closed && (
      marketMeta?.resolvedOutcome ||
      marketMeta?.winningSide ||
      (marketMeta?.outcomePrices && Array.isArray(marketMeta.outcomePrices) && marketMeta.outcomePrices.length > 0)
    )
    position.marketResolved =
      position.marketResolved ||
      Boolean(hasResolutionData)
    
    // Update current price from markets table if available (like API route does)
    if (marketMeta?.outcomePrices && marketMeta?.outcomes) {
      const targetOutcome = normalize(position.outcome)
      const idx = marketMeta.outcomes.findIndex((o: string) => normalize(o) === targetOutcome)
      if (idx >= 0 && idx < marketMeta.outcomePrices.length) {
        const freshPrice = Number(marketMeta.outcomePrices[idx])
        if (Number.isFinite(freshPrice)) {
          position.currentPrice = freshPrice
          if (debug && userId === '490723a6-e0be-4a7a-9796-45d4d09aa1bd') {
            console.log(`[DEBUG] Updated currentPrice from markets table: ${freshPrice}`)
          }
        }
      }
    }

    if (position.totalCost > 0) {
      position.avgEntryPrice = position.totalCost / position.buys.reduce((sum, b) => sum + b.size, 0)
    }

    // FIFO matching
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
        
        if (buy.size <= 0.00001) {
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

    if (!position.closedByResolution && position.remainingSize > 0) {
      openPositionsCount++
      if (position.currentPrice !== null) {
        const currentValue = position.remainingSize * position.currentPrice
        position.unrealizedPnl = currentValue - position.remainingCost
        totalUnrealizedPnl += position.unrealizedPnl
        
        if (debug && userId === '490723a6-e0be-4a7a-9796-45d4d09aa1bd') {
          console.log(`[DEBUG] Position: ${position.marketId.substring(0, 20)}...`)
          console.log(`  Outcome: ${position.outcome}`)
          console.log(`  Remaining Size: ${position.remainingSize}`)
          console.log(`  Current Price: ${position.currentPrice}`)
          console.log(`  Remaining Cost: ${position.remainingCost}`)
          console.log(`  Current Value: ${currentValue}`)
          console.log(`  Unrealized P&L: ${position.unrealizedPnl}`)
          console.log(`  Market Resolved: ${position.marketResolved}`)
          console.log(`  Closed By Resolution: ${position.closedByResolution}`)
        }
      }
    }

    totalVolume += position.totalCost
  }

  const totalPnl = totalRealizedPnl + totalUnrealizedPnl
  const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0

  const closedPositions = Array.from(positionsMap.values()).filter(
    (p) => p.closedByResolution || p.netSize <= 0.00001
  )
  const winningPositions = closedPositions.filter(p => p.realizedPnl > 0).length
  const losingPositions = closedPositions.length - winningPositions
  const winRate = closedPositions.length > 0 ? (winningPositions / closedPositions.length) * 100 : 0

  const totalBuyTrades = orders.filter(o => normalizeSide(o.side) === 'buy').length
  const totalSellTrades = orders.filter(o => normalizeSide(o.side) === 'sell').length

  return {
    totalPnl,
    realizedPnl: totalRealizedPnl,
    unrealizedPnl: totalUnrealizedPnl,
    totalVolume,
    roi,
    winRate,
    totalBuyTrades,
    totalSellTrades,
    openPositions: openPositionsCount,
    closedPositions: closedPositions.length,
    winningPositions,
    losingPositions,
  }
}

async function backfillPortfolioSummaries() {
  console.log('🚀 Starting portfolio summary backfill...\n')

  // Get all users who have copy trades
  const { data: usersWithTrades, error: usersError } = await supabase
    .from('orders')
    .select('copy_user_id')
    .not('copy_user_id', 'is', null)
    .limit(10000) // Adjust if needed

  if (usersError) {
    console.error('❌ Error fetching users:', usersError)
    return
  }

  const uniqueUserIds = Array.from(
    new Set(
      (usersWithTrades || [])
        .map((row: any) => row.copy_user_id)
        .filter(Boolean)
    )
  )

  console.log(`📊 Found ${uniqueUserIds.length} users with copy trades\n`)

  let processed = 0
  let succeeded = 0
  let failed = 0
  let skipped = 0

  for (const userId of uniqueUserIds) {
    processed++
    const progress = `[${processed}/${uniqueUserIds.length}]`
    
    try {
      const stats = await calculatePortfolioStats(userId, userId === '490723a6-e0be-4a7a-9796-45d4d09aa1bd')
      
      if (!stats) {
        skipped++
        console.log(`${progress} ⏭️  ${userId.substring(0, 8)}... - No trades, skipped`)
        continue
      }

      // Save to cache
      const { error: saveError } = await supabase.rpc('upsert_user_portfolio_summary', {
        p_user_id: userId,
        p_total_pnl: stats.totalPnl,
        p_realized_pnl: stats.realizedPnl,
        p_unrealized_pnl: stats.unrealizedPnl,
        p_total_volume: stats.totalVolume,
        p_roi: stats.roi,
        p_win_rate: stats.winRate,
        p_total_trades: stats.totalBuyTrades + stats.totalSellTrades,
        p_total_buy_trades: stats.totalBuyTrades,
        p_total_sell_trades: stats.totalSellTrades,
        p_open_positions: stats.openPositions,
        p_closed_positions: stats.closedPositions,
        p_winning_positions: stats.winningPositions,
        p_losing_positions: stats.losingPositions,
        p_calculation_version: 1,
      })

      if (saveError) {
        failed++
        console.log(`${progress} ❌ ${userId.substring(0, 8)}... - Error: ${saveError.message}`)
      } else {
        succeeded++
        console.log(`${progress} ✅ ${userId.substring(0, 8)}... - P&L: $${stats.totalPnl.toFixed(2)}, Trades: ${stats.totalBuyTrades + stats.totalSellTrades}`)
      }
    } catch (error: any) {
      failed++
      console.log(`${progress} ❌ ${userId.substring(0, 8)}... - Exception: ${error.message}`)
    }

    // Small delay to avoid overwhelming the database
    if (processed % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('📊 Backfill Complete!')
  console.log(`${'='.repeat(60)}`)
  console.log(`Total users:     ${uniqueUserIds.length}`)
  console.log(`Processed:       ${processed}`)
  console.log(`✅ Succeeded:    ${succeeded}`)
  console.log(`⏭️  Skipped:      ${skipped}`)
  console.log(`❌ Failed:        ${failed}`)
  console.log(`${'='.repeat(60)}\n`)
}

backfillPortfolioSummaries()
  .then(() => {
    console.log('✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  })
