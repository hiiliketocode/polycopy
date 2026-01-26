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
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('Auth error fetching user for top traders stats:', authError)
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const ordersTable = await resolveOrdersTableName(supabase)

    // Fetch all copy orders for this user
    const { data: copyOrders, error: ordersError } = await supabase
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
        trader_id,
        copied_trader_wallet,
        copied_trader_username
      `)
      .eq('copy_user_id', user.id)
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching copy orders:', ordersError)
      return NextResponse.json({ error: 'Failed to fetch orders', details: ordersError.message }, { status: 500 })
    }

    if (!copyOrders || copyOrders.length === 0) {
      return NextResponse.json({ traders: [] })
    }

    // Get trader_id for fetching SELL orders
    const { data: cred } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const wallet = cred?.polymarket_account_address?.toLowerCase()
    let traderId: string | null = null
    if (wallet) {
      const { data: trader } = await supabase
        .from('traders')
        .select('id')
        .ilike('wallet_address', wallet)
        .limit(1)
        .maybeSingle()
      if (trader?.id) traderId = trader.id
    }

    // Build copy BUY keys
    const copyBuyKeys = new Set<string>()
    for (const o of copyOrders) {
      if (normalizeSide(o.side) !== 'buy') continue
      const mid = o.market_id?.trim() || ''
      const out = normalize(o.outcome)
      if (mid && out) copyBuyKeys.add(`${mid}::${out}`)
    }

    // Fetch matching SELL orders
    let orders = [...copyOrders] as any[]
    if (traderId && copyBuyKeys.size > 0) {
      const { data: sellRows, error: sellError } = await supabase
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
          trader_id,
          copied_trader_wallet,
          copied_trader_username
        `)
        .eq('trader_id', traderId)
        .order('created_at', { ascending: true })

      if (sellError) {
        console.warn('Error fetching SELL orders (non-fatal):', sellError)
      } else if (sellRows && sellRows.length > 0) {
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

    // Group orders by trader
    const traderMap = new Map<string, any[]>()
    for (const order of orders) {
      const traderWallet = order.copied_trader_wallet || ''
      if (!traderWallet) continue
      
      if (!traderMap.has(traderWallet)) {
        traderMap.set(traderWallet, [])
      }
      traderMap.get(traderWallet)!.push(order)
    }

    // Fetch market resolution data
    const allMarketIds = Array.from(new Set(orders.map((o: any) => o.market_id).filter(Boolean)))
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

    // Calculate stats for each trader using FIFO
    const traderStats = Array.from(traderMap.entries()).map(([traderWallet, traderOrders]) => {
      // Build positions for this trader
      const positionsMap = new Map<string, any>()

      for (const order of traderOrders) {
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
            buys: [],
            sells: [],
          }
          positionsMap.set(positionKey, position)
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

      // Calculate realized P&L using FIFO
      let totalRealizedPnl = 0
      let totalInvested = 0
      let closedPositions = 0
      let winningPositions = 0

      for (const position of positionsMap.values()) {
        const marketMeta = priceMap.get(position.marketId)
        
        // Track invested (from buys only)
        totalInvested += position.buys.reduce((sum: number, b: any) => sum + b.cost, 0)

        // Check if market is resolved
        const hasResolutionData = marketMeta?.closed && (
          marketMeta?.resolvedOutcome ||
          marketMeta?.winningSide ||
          (marketMeta?.outcomePrices && Array.isArray(marketMeta.outcomePrices) && marketMeta.outcomePrices.length > 0)
        )

        let remainingBuys = [...position.buys]
        let positionRealizedPnl = 0
        
        // Match sells to buys (FIFO)
        for (const sell of position.sells) {
          let remainingSellSize = sell.size
          
          while (remainingSellSize > 0 && remainingBuys.length > 0) {
            const buy = remainingBuys[0]
            const matchSize = Math.min(remainingSellSize, buy.size)
            const matchCost = (buy.cost / buy.size) * matchSize
            const matchProceeds = (sell.proceeds / sell.size) * matchSize
            
            positionRealizedPnl += matchProceeds - matchCost
            
            remainingSellSize -= matchSize
            buy.size -= matchSize
            buy.cost -= matchCost
            
            if (buy.size <= 0.00001) {
              remainingBuys.shift()
            }
          }
        }

        // Handle resolved markets
        if (hasResolutionData && remainingBuys.length > 0) {
          const winningSide = marketMeta?.winningSide
          const winningSideStr = typeof winningSide === 'string' 
            ? winningSide 
            : (winningSide?.label || winningSide?.id || null)
          const resolvedOutcome = marketMeta?.resolvedOutcome ?? winningSideStr

          if (resolvedOutcome) {
            const targetOutcome = normalize(position.outcome)
            const resolved = normalize(resolvedOutcome)
            const resolutionPrice = targetOutcome === resolved ? 1 : 0

            for (const buy of remainingBuys) {
              const resolutionValue = buy.size * resolutionPrice
              positionRealizedPnl += resolutionValue - buy.cost
            }
          } else if (marketMeta?.outcomePrices && marketMeta?.outcomes) {
            const targetOutcome = normalize(position.outcome)
            const idx = marketMeta.outcomes.findIndex((o: string) => normalize(o) === targetOutcome)
            if (idx >= 0 && idx < marketMeta.outcomePrices.length) {
              const resolutionPrice = Number(marketMeta.outcomePrices[idx])
              if (Number.isFinite(resolutionPrice)) {
                for (const buy of remainingBuys) {
                  const resolutionValue = buy.size * resolutionPrice
                  positionRealizedPnl += resolutionValue - buy.cost
                }
              }
            }
          }
        }

        // Count closed positions (fully sold or resolved)
        const isClosed = remainingBuys.length === 0 || (hasResolutionData && remainingBuys.length > 0)
        if (isClosed) {
          closedPositions++
          if (positionRealizedPnl > 0) {
            winningPositions++
          }
        }

        totalRealizedPnl += positionRealizedPnl
      }

      const roi = totalInvested > 0 ? (totalRealizedPnl / totalInvested) * 100 : 0
      const winRate = closedPositions > 0 ? (winningPositions / closedPositions) * 100 : 0

      return {
        trader_id: traderWallet,
        trader_wallet: traderWallet,
        copy_count: closedPositions,
        total_invested: totalInvested,
        pnl: totalRealizedPnl,
        roi,
        win_rate: winRate,
      }
    })
    .filter((trader) => trader.copy_count > 0 && trader.total_invested > 0)

    // Fetch trader display names
    const traderWallets = Array.from(new Set(traderStats.map(t => t.trader_wallet)))
    const { data: traderRows } = await supabase
      .from('traders')
      .select('wallet_address, display_name')
      .in('wallet_address', traderWallets)

    const traderNameMap = new Map<string, string>()
    if (traderRows) {
      traderRows.forEach((row) => {
        if (row.wallet_address) {
          traderNameMap.set(row.wallet_address.toLowerCase(), row.display_name || row.wallet_address)
        }
      })
    }

    // Get trader usernames from orders (fallback)
    const traderUsernameMap = new Map<string, string>()
    for (const order of orders) {
      const wallet = order.copied_trader_wallet?.toLowerCase()
      const username = order.copied_trader_username
      if (wallet && username && !traderUsernameMap.has(wallet)) {
        traderUsernameMap.set(wallet, username)
      }
    }

    // Add trader names and sort
    const tradersWithNames = traderStats.map((trader) => {
      const wallet = trader.trader_wallet.toLowerCase()
      const displayName = traderNameMap.get(wallet)
      const username = traderUsernameMap.get(wallet)
      const traderName = displayName || username || trader.trader_wallet
      
      return {
        ...trader,
        trader_name: traderName,
      }
    })
    .sort((a, b) => b.total_invested - a.total_invested)

    return NextResponse.json({ traders: tradersWithNames })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/top-traders:', error)
    console.error('Error stack:', error?.stack)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error?.message || 'Unknown error',
        traders: [] // Return empty array on error so UI doesn't break
      },
      { status: 500 }
    )
  }
}
