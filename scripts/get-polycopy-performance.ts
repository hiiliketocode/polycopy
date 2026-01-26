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

async function resolveAuthUserByEmail(email: string): Promise<{ id: string; email: string | null }> {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to resolve user by email: ${res.status} ${text}`)
  }

  const data = await res.json()
  if (!data.users || data.users.length === 0) {
    throw new Error(`No user found with email: ${email}`)
  }

  return { id: data.users[0].id, email: data.users[0].email }
}

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

async function getPolycopyPerformance(walletOrEmail: string) {
  const walletAddress = walletOrEmail.toLowerCase().startsWith('0x') 
    ? walletOrEmail.toLowerCase() 
    : null
  const email = walletAddress ? null : walletOrEmail

  let userId: string | null = null
  let userEmail: string | null = null
  let traderId: string | null = null

  if (walletAddress) {
    console.log(`\n🔍 Looking up wallet: ${walletAddress}`)
    
    // Resolve user_id from clob_credentials
    const { data: credential } = await supabase
      .from('clob_credentials')
      .select('user_id')
      .ilike('polymarket_account_address', walletAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (credential?.user_id) {
      userId = credential.user_id
      console.log(`✅ Found user ID from clob_credentials: ${userId.substring(0, 8)}...`)
      
      const url = `${SUPABASE_URL}/auth/v1/admin/users/${userId}`
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      })
      if (res.ok) {
        const userData = await res.json()
        userEmail = userData.email
        console.log(`   Email: ${userEmail}`)
      }
    }

    // Resolve trader_id from traders (for SELL orders – sells often lack copy_user_id)
    const { data: trader } = await supabase
      .from('traders')
      .select('id')
      .ilike('wallet_address', walletAddress)
      .limit(1)
      .maybeSingle()
    if (trader?.id) {
      traderId = trader.id
      console.log(`   Trader ID: ${traderId.substring(0, 8)}...`)
    }
  } else if (email) {
    console.log(`\n🔍 Looking up user: ${email}`)
    const user = await resolveAuthUserByEmail(email)
    userId = user.id
    userEmail = user.email
    console.log(`✅ Found user ID: ${userId.substring(0, 8)}...`)
    const { data: cred } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const wallet = cred?.polymarket_account_address?.toLowerCase()
    if (wallet) {
      const { data: t } = await supabase
        .from('traders')
        .select('id')
        .ilike('wallet_address', wallet)
        .limit(1)
        .maybeSingle()
      if (t?.id) {
        traderId = t.id
        console.log(`   Trader ID: ${traderId.substring(0, 8)}...`)
      }
    }
  } else {
    throw new Error('Invalid input: must be email or wallet address')
  }

  // Determine orders table name (similar to resolveOrdersTableName)
  let ordersTable: 'orders' | 'trades' = 'orders'
  const { error: ordersError } = await supabase
    .from('orders')
    .select('order_id')
    .limit(1)

  if (ordersError) {
    const code = (ordersError as any)?.code
    const isMissingTable =
      ['PGRST205', '42P01', '42703'].includes(code) ||
      ordersError.message?.toLowerCase().includes('could not find the table')
    
    if (isMissingTable) {
      ordersTable = 'trades'
    } else {
      throw ordersError
    }
  }

  console.log(`\n📊 Fetching PolyCopy trades from ${ordersTable}...`)

  // Build query - use copy_user_id if we have userId
  if (!userId) {
    throw new Error('Could not find user_id for wallet/email. Cannot query orders.')
  }

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
    console.error('❌ Error fetching orders:', queryError)
    throw queryError
  }

  let orders = (copyOrders || []) as Order[]
  const copyBuyKeys = new Set<string>()
  for (const o of orders) {
    if (normalizeSide(o.side) !== 'buy') continue
    const mid = o.market_id?.trim() || ''
    const out = normalize(o.outcome)
    if (mid && out) copyBuyKeys.add(`${mid}::${out}`)
  }

  // SELLs often lack copy_user_id (close flow doesn't send it). Fetch by trader_id
  // and include only SELLs that close copy positions (same market+outcome as copy BUYs).
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
      const added = matchingSells.length
      if (added > 0) {
        orders = [...orders, ...matchingSells].sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        )
        console.log(`✅ Included ${added} SELL orders (trader_id match, closing copy positions)`)
      }
    }
  }

  console.log(`✅ Found ${orders.length} total orders (BUY + SELL) in ${ordersTable}`)

  // If no orders found, also check copied_trades table as a fallback
  if (orders.length === 0 && userId) {
    console.log(`\n⚠️  No orders found in ${ordersTable}, checking copied_trades table...`)
    const { data: copiedTrades, error: copiedError } = await supabase
      .from('copied_trades')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    
    if (copiedError) {
      console.log(`   Error checking copied_trades: ${copiedError.message}`)
    } else if (copiedTrades && copiedTrades.length > 0) {
      console.log(`   Found ${copiedTrades.length} copied trades (but these may not be in orders table yet)`)
      console.log(`   Note: Performance stats are calculated from the orders table, not copied_trades`)
    }
  }

  // Also check trades table if we're searching by wallet
  if (orders.length === 0 && walletAddress) {
    console.log(`\n⚠️  No orders found, checking trades table by wallet address...`)
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select(`
        id,
        wallet_address,
        side,
        shares_normalized,
        price,
        condition_id,
        market_slug,
        title,
        timestamp,
        created_at
      `)
      .ilike('wallet_address', walletAddress)
      .order('timestamp', { ascending: true })
      .limit(100)
    
    if (tradesError) {
      console.log(`   Error checking trades: ${tradesError.message}`)
    } else if (trades && trades.length > 0) {
      console.log(`   Found ${trades.length} trades in trades table`)
      console.log(`   Note: These are raw trades, not PolyCopy orders. They may include manual trades.`)
    }
  }

  const buyTrades = orders.filter(o => normalizeSide(o.side) === 'buy')
  const sellTrades = orders.filter(o => normalizeSide(o.side) === 'sell')
  console.log(`   - ${buyTrades.length} BUY orders`)
  console.log(`   - ${sellTrades.length} SELL orders`)

  // Group orders by position (market_id + outcome)
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
    const orderCurrentPrice =
      toNullableNumber(order.user_exit_price) ?? toNullableNumber(order.current_price)
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

  // Fetch market prices for resolution info
  const allMarketIds = Array.from(
    new Set(
      Array.from(positionsMap.values())
        .map(p => p.marketId)
        .filter(Boolean)
    )
  )

  // Batch market queries to avoid Supabase limit (typically 100-200 items per .in() query)
  const BATCH_SIZE = 100
  const marketRows: any[] = []
  
  for (let i = 0; i < allMarketIds.length; i += BATCH_SIZE) {
    const batch = allMarketIds.slice(i, i + BATCH_SIZE)
    const { data: batchRows, error: batchError } = await supabase
      .from('markets')
      .select('condition_id, outcome_prices, last_price_updated_at, closed, resolved_outcome, winning_side')
      .in('condition_id', batch)
    
    if (batchError) {
      console.log(`[WARN] Error fetching market batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batchError.message}`)
    } else if (batchRows) {
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

  // Calculate P&L for each position using FIFO cost basis
  let totalRealizedPnl = 0
  let totalUnrealizedPnl = 0
  let totalVolume = 0
  let openPositionsCount = 0
  const openPositionsDetails: Array<{marketId: string, outcome: string, remainingSize: number, currentPrice: number | null, marketResolved: boolean}> = []

  for (const position of positionsMap.values()) {
    const marketMeta = priceMap.get(position.marketId)

    // Prefer resolved outcome from markets cache if not already on the position
    if (!position.resolvedOutcome) {
      position.resolvedOutcome = marketMeta?.resolvedOutcome ?? marketMeta?.winningSide ?? null
    }
    // Mark resolved if markets table says it's closed/resolved
    // Also mark as resolved if market is closed and has outcome_prices (which indicates resolution)
    const hasResolutionData = marketMeta?.closed && (
      marketMeta?.resolvedOutcome ||
      marketMeta?.winningSide ||
      (marketMeta?.outcomePrices && Array.isArray(marketMeta.outcomePrices) && marketMeta.outcomePrices.length > 0)
    )
    position.marketResolved =
      position.marketResolved ||
      Boolean(hasResolutionData)

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

    // Calculate unrealized P&L on remaining position
    if (!position.closedByResolution && position.remainingSize > 0) {
      openPositionsCount++
      openPositionsDetails.push({
        marketId: position.marketId,
        outcome: position.outcome,
        remainingSize: position.remainingSize,
        currentPrice: position.currentPrice,
        marketResolved: position.marketResolved
      })
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
  const winRate = closedPositions.length > 0 ? (winningPositions / closedPositions.length) * 100 : 0

  // Print results
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📈 POLYCOPY PERFORMANCE SUMMARY`)
  console.log(`${'='.repeat(60)}`)
  console.log(`\n💰 P&L Breakdown:`)
  console.log(`   Realized P&L:    $${totalRealizedPnl.toFixed(2)}`)
  console.log(`   Unrealized P&L:  $${totalUnrealizedPnl.toFixed(2)}`)
  console.log(`   Total P&L:       $${totalPnl.toFixed(2)}`)
  console.log(`\n📊 Trading Statistics:`)
  console.log(`   Total Buy Trades:     ${buyTrades.length}`)
  console.log(`   Total Sell Trades:    ${sellTrades.length}`)
  console.log(`   Total Orders:         ${orders.length}`)
  console.log(`   Total Unique Positions: ${positionsMap.size}`)
  console.log(`   Open Positions:       ${openPositionsCount}`)
  console.log(`   Closed Positions:     ${closedPositions.length}`)
  console.log(`   Winning Positions:    ${winningPositions}`)
  console.log(`   Losing Positions:     ${closedPositions.length - winningPositions}`)
  console.log(`\n💵 Volume & Returns:`)
  console.log(`   Total Volume:        $${totalVolume.toFixed(2)}`)
  console.log(`   ROI:                 ${roi.toFixed(2)}%`)
  console.log(`   Win Rate:            ${winRate.toFixed(1)}%`)

  // Show breakdown of open positions
  if (openPositionsDetails.length > 0) {
    console.log(`\n🔍 Open Positions Breakdown:`)
    const resolvedOpen = openPositionsDetails.filter(p => p.marketResolved).length
    const unresolvedOpen = openPositionsDetails.filter(p => !p.marketResolved).length
    const withPrice = openPositionsDetails.filter(p => p.currentPrice !== null).length
    const withoutPrice = openPositionsDetails.filter(p => p.currentPrice === null).length
    
    console.log(`   Unresolved Markets:  ${unresolvedOpen}`)
    console.log(`   Resolved Markets:   ${resolvedOpen} (should be 0 if correctly closed)`)
    console.log(`   With Current Price: ${withPrice}`)
    console.log(`   Without Price:      ${withoutPrice}`)
    
    // Show resolved positions that are still open (potential issue)
    const resolvedButOpen = openPositionsDetails.filter(p => p.marketResolved)
    if (resolvedButOpen.length > 0) {
      console.log(`\n   ⚠️  Resolved but still open (${resolvedButOpen.length}):`)
      
      // Fetch market details for these resolved positions
      const resolvedMarketIds = resolvedButOpen.map(p => p.marketId)
      const { data: resolvedMarkets } = await supabase
        .from('markets')
        .select('condition_id, winning_side, resolved_outcome, closed, outcome_prices')
        .in('condition_id', resolvedMarketIds)
      
      const marketMap = new Map<string, any>()
      if (resolvedMarkets) {
        resolvedMarkets.forEach(m => {
          if (m.condition_id) marketMap.set(m.condition_id, m)
        })
      }
      
      resolvedButOpen.forEach((p, i) => {
        const market = marketMap.get(p.marketId)
        const winningSide = market?.winning_side || 'N/A'
        const resolvedOutcome = market?.resolved_outcome || 'N/A'
        const closed = market?.closed ? 'Yes' : 'No'
        console.log(`   ${i + 1}. Market ID: ${p.marketId}`)
        console.log(`      Outcome: ${p.outcome}, Size: ${p.remainingSize.toFixed(4)}`)
        console.log(`      Market Closed: ${closed}`)
        console.log(`      Winning Side: ${winningSide}`)
        console.log(`      Resolved Outcome: ${resolvedOutcome}`)
        console.log(`      Position Price: ${p.currentPrice?.toFixed(4) || 'N/A'}`)
        if (market?.outcome_prices) {
          console.log(`      Outcome Prices: ${JSON.stringify(market.outcome_prices)}`)
        }
        
        // Check if position outcome matches winning side
        const positionOutcome = normalize(p.outcome)
        const winning = normalize(winningSide)
        const resolved = normalize(resolvedOutcome)
        const isWinner = positionOutcome === winning || positionOutcome === resolved
        console.log(`      Is Winner: ${isWinner ? 'YES' : 'NO'}`)
        console.log(``)
      })
    }

    // Show sample of unresolved open positions
    const unresolvedOpenList = openPositionsDetails.filter(p => !p.marketResolved)
    if (unresolvedOpenList.length > 0) {
      console.log(`\n   Sample Unresolved Positions (first 5 of ${unresolvedOpenList.length}):`)
      unresolvedOpenList.slice(0, 5).forEach((p, i) => {
        console.log(`   ${i + 1}. Market: ${p.marketId.substring(0, 30)}..., Outcome: ${p.outcome}, Size: ${p.remainingSize.toFixed(4)}, Price: ${p.currentPrice?.toFixed(4) || 'N/A'}`)
      })
    }
  }

  console.log(`\n${'='.repeat(60)}\n`)

  return {
    realizedPnl: totalRealizedPnl,
    unrealizedPnl: totalUnrealizedPnl,
    totalPnl,
    totalBuyTrades: buyTrades.length,
    totalSellTrades: sellTrades.length,
    totalOrders: orders.length,
    openPositions: openPositionsCount,
    closedPositions: closedPositions.length,
    winningPositions,
    losingPositions: closedPositions.length - winningPositions,
    totalVolume,
    roi,
    winRate
  }
}

// Main execution
const input = process.argv[2] || 'donraw@gmail.com'

getPolycopyPerformance(input)
  .then(() => {
    console.log('✅ Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
