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

async function syncClosedPositionsToDatabase() {
  console.log('🔄 Syncing Closed Positions from Polymarket to Database')
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
  if (!walletAddress) {
    console.log('❌ No wallet address found')
    return
  }

  console.log(`\n💳 Wallet: ${walletAddress}`)

  // Fetch ALL closed positions
  let allPositions: any[] = []
  let offset = 0
  const limit = 50

  try {
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

    console.log(`✅ Fetched ${allPositions.length} closed positions\n`)

    // Get all orders for this user
    const { data: orders } = await supabase
      .from('orders')
      .select('order_id, market_id, outcome, side, amount_invested')
      .eq('copy_user_id', USER_ID)

    if (!orders) {
      console.log('❌ No orders found in database')
      return
    }

    console.log(`📦 Found ${orders.length} orders in database\n`)

    // Match closed positions to orders
    let matchedCount = 0
    let unmatchedCount = 0
    let totalSyncedPnl = 0

    console.log('🔗 Matching positions to orders...')

    for (const position of allPositions) {
      const conditionId = position.conditionId
      const outcome = position.outcome
      const realizedPnl = Number(position.realizedPnl || 0)
      const avgPrice = Number(position.avgPrice || 0)
      const totalBought = Number(position.totalBought || 0)

      // Find matching orders in database (same market + outcome)
      const matchingOrders = orders.filter(o => 
        o.market_id === conditionId && 
        normalize(o.outcome) === normalize(outcome) &&
        o.side?.toLowerCase() === 'buy'
      )

      if (matchingOrders.length === 0) {
        unmatchedCount++
        continue
      }

      // Update ALL matching orders with the Polymarket P&L data
      // (distribute P&L proportionally if multiple orders)
      const totalInvested = matchingOrders.reduce((sum, o) => 
        sum + Number(o.amount_invested || 0), 0)

      for (const order of matchingOrders) {
        const proportion = totalInvested > 0 
          ? Number(order.amount_invested || 0) / totalInvested 
          : 1 / matchingOrders.length

        const orderPnl = realizedPnl * proportion

        const { error } = await supabase
          .from('orders')
          .update({
            polymarket_realized_pnl: orderPnl,
            polymarket_avg_price: avgPrice,
            polymarket_total_bought: totalBought,
            polymarket_synced_at: new Date().toISOString()
          })
          .eq('order_id', order.order_id)

        if (error) {
          console.error(`   ❌ Failed to update ${order.order_id}:`, error.message)
        } else {
          matchedCount++
          totalSyncedPnl += orderPnl
        }
      }
    }

    console.log(`\n✅ Sync complete:`)
    console.log(`   Matched & updated: ${matchedCount} orders`)
    console.log(`   Unmatched positions: ${unmatchedCount}`)
    console.log(`   Total synced P&L: $${totalSyncedPnl.toFixed(2)}`)

    console.log(`\n💡 Next step: Update portfolio stats API to use polymarket_realized_pnl`)

  } catch (error) {
    console.error('❌ Error:', error)
  }

  console.log('\n' + '='.repeat(80))
}

syncClosedPositionsToDatabase().catch(console.error)
