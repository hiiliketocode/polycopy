#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

async function investigateMatching() {
  console.log('🔍 Investigating Matching Issues')
  console.log('=' .repeat(80))

  // Get user's wallet address
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const walletAddress = cred?.polymarket_account_address

  // Fetch all closed positions
  let allPositions: any[] = []
  let offset = 0
  const limit = 50

  while (true) {
    const response = await fetch(
      `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=${limit}&offset=${offset}`,
      { headers: { 'Accept': 'application/json' } }
    )

    if (!response.ok) break

    const batch = await response.json()
    allPositions = allPositions.concat(batch)
    
    if (batch.length < limit) break
    offset += limit
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log(`\n✅ Fetched ${allPositions.length} closed positions from Polymarket`)

  // Get all orders
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, amount_invested, trade_method')
    .eq('copy_user_id', USER_ID)

  console.log(`📦 Found ${orders?.length || 0} orders in Polycopy database`)

  // Group orders by market+outcome
  const ordersByPosition = new Map<string, any[]>()
  for (const order of orders || []) {
    if (order.side?.toLowerCase() === 'buy' && order.market_id) {
      const key = `${order.market_id}::${normalize(order.outcome)}`
      if (!ordersByPosition.has(key)) {
        ordersByPosition.set(key, [])
      }
      ordersByPosition.get(key)!.push(order)
    }
  }

  console.log(`\n📊 Unique positions in Polycopy (market+outcome combinations): ${ordersByPosition.size}`)
  console.log(`📊 Total closed positions from Polymarket: ${allPositions.length}`)

  // Find unmatched positions
  const unmatchedPositions: any[] = []
  const matchedPositions: any[] = []

  for (const position of allPositions) {
    const key = `${position.conditionId}::${normalize(position.outcome)}`
    const matchingOrders = ordersByPosition.get(key)
    
    if (matchingOrders && matchingOrders.length > 0) {
      matchedPositions.push({
        position,
        orderCount: matchingOrders.length,
        totalInvested: matchingOrders.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0)
      })
    } else {
      unmatchedPositions.push(position)
    }
  }

  console.log(`\n✅ Matched positions: ${matchedPositions.length} (covering ${matchedPositions.reduce((sum, m) => sum + m.orderCount, 0)} orders)`)
  console.log(`❌ Unmatched positions: ${unmatchedPositions.length}`)

  // Show breakdown by trade method for matched positions
  const matchedOrdersByMethod = new Map<string, number>()
  for (const matched of matchedPositions) {
    const key = `${matched.position.conditionId}::${normalize(matched.position.outcome)}`
    const orders = ordersByPosition.get(key) || []
    for (const order of orders) {
      const method = order.trade_method || 'unknown'
      matchedOrdersByMethod.set(method, (matchedOrdersByMethod.get(method) || 0) + 1)
    }
  }

  console.log('\n📈 Matched orders by trade method:')
  for (const [method, count] of matchedOrdersByMethod.entries()) {
    console.log(`   ${method}: ${count}`)
  }

  // Calculate P&L
  const matchedPnl = matchedPositions.reduce((sum, m) => sum + Number(m.position.realizedPnl || 0), 0)
  const unmatchedPnl = unmatchedPositions.reduce((sum, p) => sum + Number(p.realizedPnl || 0), 0)
  const totalPnl = matchedPnl + unmatchedPnl

  console.log('\n💰 P&L Breakdown:')
  console.log(`   Matched P&L: $${matchedPnl.toFixed(2)}`)
  console.log(`   Unmatched P&L: $${unmatchedPnl.toFixed(2)}`)
  console.log(`   Total P&L: $${totalPnl.toFixed(2)}`)

  // Show sample unmatched with details
  console.log('\n⚠️  Sample unmatched positions (first 10):')
  for (let i = 0; i < Math.min(10, unmatchedPositions.length); i++) {
    const pos = unmatchedPositions[i]
    console.log(`\n${i + 1}. Market: ${pos.conditionId.substring(0, 12)}...`)
    console.log(`   Outcome: ${pos.outcome}`)
    console.log(`   Realized P&L: $${Number(pos.realizedPnl || 0).toFixed(2)}`)
    console.log(`   Total Bought: ${pos.totalBought}`)
    
    // Check if we have ANY orders for this market (different outcome)
    const anyOrdersForMarket = Array.from(ordersByPosition.keys()).filter(k => k.startsWith(pos.conditionId))
    if (anyOrdersForMarket.length > 0) {
      console.log(`   ⚠️  We have orders for this market but different outcomes:`)
      for (const key of anyOrdersForMarket) {
        const outcome = key.split('::')[1]
        const orders = ordersByPosition.get(key) || []
        console.log(`      - ${outcome} (${orders.length} orders)`)
      }
    } else {
      console.log(`   ❌ No orders at all for this market in Polycopy`)
    }
  }

  console.log('\n' + '='.repeat(80))
}

investigateMatching().catch(console.error)
