import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const supabaseService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    console.log('🔍 Comparing trades for wallet:', walletAddress)

    // 1. Fetch all Polymarket trades for this wallet
    const polymarketTrades: any[] = []
    let page = 1
    const maxPages = 20
    
    while (page <= maxPages) {
      try {
        const response = await fetch(
          `https://data-api.polymarket.com/trades?user=${walletAddress}&limit=100&page=${page}`,
          { cache: 'no-store' }
        )
        
        if (!response.ok) break
        
        const trades = await response.json()
        if (!Array.isArray(trades) || trades.length === 0) break
        
        polymarketTrades.push(...trades)
        
        if (trades.length < 100) break // Last page
        page++
      } catch (err) {
        console.error('Error fetching Polymarket trades:', err)
        break
      }
    }

    console.log(`📊 Found ${polymarketTrades.length} Polymarket trades`)

    // 2. Fetch all Polycopy orders for this user
    const supabaseAdmin = supabaseService()
    const { data: polycopyOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('copy_user_id', user.id)
      .order('created_at', { ascending: false })

    if (ordersError) {
      console.error('Error fetching Polycopy orders:', ordersError)
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    console.log(`📊 Found ${polycopyOrders?.length || 0} Polycopy orders`)

    // 3. Compare trades - use asset_id (token_id) for reliable matching
    const polymarketByToken = new Map<string, any[]>()
    polymarketTrades.forEach(trade => {
      // Use asset_id (token_id) as the key - this is the unique identifier
      const key = trade.asset_id || trade.token_id || `${trade.market}-${trade.outcome}`
      if (!polymarketByToken.has(key)) {
        polymarketByToken.set(key, [])
      }
      polymarketByToken.get(key)!.push(trade)
    })

    const polycopyByToken = new Map<string, any[]>()
    polycopyOrders?.forEach(order => {
      // In orders table, we might have token_id or need to derive from market_id+outcome
      const key = order.token_id || order.asset_id || `${order.market_id}-${order.outcome}`
      if (!polycopyByToken.has(key)) {
        polycopyByToken.set(key, [])
      }
      polycopyByToken.get(key)!.push(order)
    })

    // 4. Calculate P&L from Polymarket trades (position-based)
    const positions = new Map<string, {
      market: string
      outcome: string
      buyShares: number
      buyCost: number
      sellShares: number
      sellProceeds: number
      tokenId: string
    }>()

    polymarketTrades.forEach(trade => {
      const tokenId = trade.asset_id || trade.token_id || `${trade.market}-${trade.outcome}`
      const existing = positions.get(tokenId) || {
        market: trade.market || 'Unknown',
        outcome: trade.outcome || trade.option || 'Unknown',
        buyShares: 0,
        buyCost: 0,
        sellShares: 0,
        sellProceeds: 0,
        tokenId
      }
      
      const size = parseFloat(trade.size || '0')
      const price = parseFloat(trade.price || '0')
      const total = size * price

      if (!isNaN(size) && !isNaN(price)) {
        if (trade.side?.toUpperCase() === 'BUY') {
          existing.buyShares += size
          existing.buyCost += total
        } else if (trade.side?.toUpperCase() === 'SELL') {
          existing.sellShares += size
          existing.sellProceeds += total
        }
      }

      positions.set(tokenId, existing)
    })

    // Fetch current prices for open positions
    const openPositions = Array.from(positions.entries())
      .filter(([_, pos]) => Math.abs(pos.buyShares - pos.sellShares) > 0.001)

    console.log(`📊 Found ${openPositions.length} open positions`)

    // Calculate realized P&L
    let realizedPnl = 0
    let totalInvested = 0

    positions.forEach((pos) => {
      if (pos.buyShares > 0) {
        totalInvested += pos.buyCost
        if (pos.sellShares > 0) {
          // Calculate realized P&L for closed portion
          const costBasisOfSold = pos.buyCost * (pos.sellShares / pos.buyShares)
          realizedPnl += (pos.sellProceeds - costBasisOfSold)
        }
      }
    })

    console.log(`💰 Polymarket P&L: ${realizedPnl.toFixed(2)} realized from ${positions.size} positions`)
    console.log(`💰 Total invested: ${totalInvested.toFixed(2)}`)

    // 5. Build comparison report
    const missingInPolycopy: string[] = []
    const extraInPolycopy: string[] = []
    const matched: string[] = []

    polymarketByToken.forEach((trades, tokenId) => {
      if (polycopyByToken.has(tokenId)) {
        matched.push(`${tokenId}: ${trades.length} PM trades, ${polycopyByToken.get(tokenId)!.length} PC orders`)
      } else {
        const sample = trades[0]
        missingInPolycopy.push(`${sample?.market || 'Unknown'} - ${sample?.outcome || 'Unknown'}: ${trades.length} Polymarket trades (token: ${tokenId.substring(0, 10)}...)`)
      }
    })

    polycopyByToken.forEach((orders, tokenId) => {
      if (!polymarketByToken.has(tokenId)) {
        const sample = orders[0]
        extraInPolycopy.push(`${sample?.copied_market_title || 'Unknown'} - ${sample?.outcome || 'Unknown'}: ${orders.length} Polycopy orders (token: ${tokenId.substring(0, 10)}...)`)
      }
    })

    return NextResponse.json({
      summary: {
        polymarketTrades: polymarketTrades.length,
        polymarketTradesNote: 'Each order can have multiple trades (fills)',
        polycopyOrders: polycopyOrders?.length || 0,
        polymarketUniqueTokens: polymarketByToken.size,
        polycopyUniqueTokens: polycopyByToken.size,
        matchedTokens: matched.length,
        totalInvested: totalInvested.toFixed(2),
        realizedPnl: realizedPnl.toFixed(2),
        openPositionsCount: openPositions.length,
      },
      matching: {
        matched: matched.slice(0, 10),
        missingInPolycopy: missingInPolycopy.slice(0, 10),
        extraInPolycopy: extraInPolycopy.slice(0, 10),
      },
      polymarketPositions: Array.from(positions.entries())
        .map(([tokenId, pos]) => ({
          market: pos.market,
          outcome: pos.outcome,
          tokenId: tokenId.substring(0, 16) + '...',
          netShares: +(pos.buyShares - pos.sellShares).toFixed(2),
          buyCost: +pos.buyCost.toFixed(2),
          sellProceeds: +pos.sellProceeds.toFixed(2),
          realizedPnl: pos.sellShares > 0 ? +((pos.sellProceeds - (pos.buyCost * (pos.sellShares / pos.buyShares))).toFixed(2)) : 0,
          isOpen: Math.abs(pos.buyShares - pos.sellShares) > 0.001
        }))
        .sort((a, b) => Math.abs(b.buyCost) - Math.abs(a.buyCost))
        .slice(0, 30),
    })
  } catch (error: any) {
    console.error('Error comparing trades:', error)
    return NextResponse.json(
      { error: 'Failed to compare trades', details: error.message },
      { status: 500 }
    )
  }
}
