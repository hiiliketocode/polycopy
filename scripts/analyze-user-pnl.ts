#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function analyzeUserPnL() {
  console.log('🔍 Analyzing P&L for user:', USER_ID.substring(0, 8))
  console.log('=' .repeat(80))

  // Check which tables exist and have data
  console.log('\n📊 Checking order tables...')
  
  const { data: ordersData, error: ordersError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('copy_user_id', USER_ID)
  
  const { data: ordersCopyData, error: ordersCopyError } = await supabase
    .from('orders_copy')
    .select('*', { count: 'exact', head: true })
    .eq('copy_user_id', USER_ID)
  
  console.log(`  - orders table: ${ordersError ? 'ERROR' : `${(ordersData as any)?.length || 0} rows`}`)
  console.log(`  - orders_copy table: ${ordersCopyError ? 'ERROR' : `${(ordersCopyData as any)?.length || 0} rows`}`)

  // 1. Get all orders for the user
  const { data: orders, error, count } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching orders:', error)
    return
  }

  console.log(`\n📦 Total Orders from 'orders' table: ${count || 0}`)
  console.log(`📦 Total Orders fetched: ${orders?.length || 0}`)

  // Analyze orders
  const buyOrders = orders?.filter(o => o.side?.toLowerCase() === 'buy') || []
  const sellOrders = orders?.filter(o => o.side?.toLowerCase() === 'sell') || []
  
  console.log(`  - BUY orders: ${buyOrders.length}`)
  console.log(`  - SELL orders: ${sellOrders.length}`)

  // 2. Check for orders missing critical data
  const missingPrice = orders?.filter(o => !o.current_price && !o.user_exit_price) || []
  const missingSize = orders?.filter(o => !o.filled_size && !o.size) || []
  const missingInvested = orders?.filter(o => !o.amount_invested && !o.price) || []
  
  console.log(`\n⚠️  Data Quality Issues:`)
  console.log(`  - Missing current_price: ${missingPrice.length}`)
  console.log(`  - Missing size data: ${missingSize.length}`)
  console.log(`  - Missing price/investment: ${missingInvested.length}`)

  if (missingPrice.length > 0) {
    console.log(`\n📋 Orders missing current_price (first 10):`)
    missingPrice.slice(0, 10).forEach(o => {
      console.log(`  - ${o.order_id}: ${o.market_id?.substring(0, 10)}... | resolved: ${o.market_resolved} | user_closed: ${!!o.user_closed_at}`)
    })
  }

  // 3. Calculate total invested
  let totalInvested = 0
  let totalRealized = 0
  let totalUnrealized = 0

  for (const order of orders || []) {
    if (order.side?.toLowerCase() !== 'buy') continue

    const invested = Number(order.amount_invested || 0)
    const size = Number(order.filled_size || order.size || 0)
    const currentPrice = Number(order.current_price || 0)
    const exitPrice = Number(order.user_exit_price || 0)
    const marketResolved = Boolean(order.market_resolved)

    totalInvested += invested

    // Calculate P&L for this order
    if (order.user_closed_at && exitPrice) {
      // User manually closed
      const proceeds = exitPrice * size
      const pnl = proceeds - invested
      totalRealized += pnl
    } else if (marketResolved) {
      // Market resolved - need to check if they won
      // For now, skip these as we need market resolution data
      continue
    } else if (currentPrice > 0 && size > 0) {
      // Open position with current price
      const currentValue = currentPrice * size
      const pnl = currentValue - invested
      totalUnrealized += pnl
    }
  }

  console.log(`\n💰 Simple P&L Calculation (without resolution data):`)
  console.log(`  - Total Invested: $${totalInvested.toFixed(2)}`)
  console.log(`  - Realized P&L: $${totalRealized.toFixed(2)}`)
  console.log(`  - Unrealized P&L: $${totalUnrealized.toFixed(2)}`)
  console.log(`  - Total P&L: $${(totalRealized + totalUnrealized).toFixed(2)}`)

  // 4. Get market resolution data for resolved positions
  const resolvedOrders = orders?.filter(o => o.market_resolved) || []
  const resolvedMarketIds = [...new Set(resolvedOrders.map(o => o.market_id).filter(Boolean))]
  
  console.log(`\n🏁 Resolved Markets:`)
  console.log(`  - Resolved orders: ${resolvedOrders.length}`)
  console.log(`  - Unique resolved markets: ${resolvedMarketIds.length}`)

  if (resolvedMarketIds.length > 0) {
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id, resolved_outcome, winning_side, outcome_prices, closed')
      .in('condition_id', resolvedMarketIds)

    console.log(`  - Markets with resolution data: ${markets?.length || 0}`)

    // Calculate resolved positions P&L
    let resolvedPnL = 0
    let resolvedCount = 0
    let resolvedMissingOutcome = 0
    let resolvedWithCurrentPrice = 0

    for (const order of resolvedOrders) {
      if (order.side?.toLowerCase() !== 'buy') continue
      
      const market = markets?.find(m => m.condition_id === order.market_id)
      const invested = Number(order.amount_invested || 0)
      const size = Number(order.filled_size || order.size || 0)
      const outcome = order.outcome?.trim().toLowerCase()
      const currentPrice = Number(order.current_price || 0)
      
      // Try to get resolved outcome from multiple sources
      let resolvedOutcome = order.resolved_outcome || market?.resolved_outcome || market?.winning_side
      
      if (!resolvedOutcome && market?.outcome_prices) {
        // Try to infer from prices (if price is 0 or 1)
        const prices = market.outcome_prices as any
        if (prices.outcomePrices && prices.outcomes) {
          const idx = prices.outcomes.findIndex((o: string) => o.trim().toLowerCase() === outcome)
          if (idx >= 0) {
            const price = Number(prices.outcomePrices[idx])
            if (price === 0 || price === 1) {
              resolvedOutcome = price === 1 ? outcome : (prices.outcomes[1 - idx] || null)
              resolvedWithCurrentPrice++
            }
          }
        }
      }
      
      if (!resolvedOutcome) {
        resolvedMissingOutcome++
        continue
      }

      const resolved = resolvedOutcome.trim().toLowerCase()
      const won = outcome === resolved
      const finalValue = won ? size * 1.0 : size * 0.0
      const pnl = finalValue - invested

      resolvedPnL += pnl
      resolvedCount++
      
      if (Math.abs(pnl) > 10) {
        console.log(`    - ${order.market_id?.substring(0, 10)}... | outcome: ${outcome} | resolved: ${resolved} | won: ${won} | P&L: $${pnl.toFixed(2)}`)
      }
    }

    console.log(`\n🎲 Resolved Positions P&L:`)
    console.log(`  - Calculated: ${resolvedCount} positions`)
    console.log(`  - Inferred from prices: ${resolvedWithCurrentPrice}`)
    console.log(`  - Missing outcome data: ${resolvedMissingOutcome}`)
    console.log(`  - Resolved P&L: $${resolvedPnL.toFixed(2)}`)
  }

  // 5. Compare with portfolio stats API
  console.log(`\n\n📊 Fetching Portfolio Stats from API...`)
  const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/portfolio/stats?userId=${USER_ID}`)
  const stats = await response.json()

  console.log(`\n📈 API Response:`)
  console.log(`  - Total P&L: $${stats.totalPnl?.toFixed(2) || 'N/A'}`)
  console.log(`  - Realized P&L: $${stats.realizedPnl?.toFixed(2) || 'N/A'}`)
  console.log(`  - Unrealized P&L: $${stats.unrealizedPnl?.toFixed(2) || 'N/A'}`)
  console.log(`  - Total Volume: $${stats.totalVolume?.toFixed(2) || 'N/A'}`)
  console.log(`  - Open Positions: ${stats.openTrades || 'N/A'}`)
  console.log(`  - Closed Positions: ${stats.closedTrades || 'N/A'}`)
  console.log(`  - Win Rate: ${stats.winRate?.toFixed(1) || 'N/A'}%`)

  console.log(`\n` + '='.repeat(80))
  console.log(`✅ Analysis Complete`)
}

analyzeUserPnL().catch(console.error)
