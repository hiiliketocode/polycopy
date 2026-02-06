#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

/**
 * Sync Polymarket's official realized P&L for all users' tracked positions
 * 
 * This script:
 * 1. Gets all users with connected wallets
 * 2. For each user, fetches their closed positions from Polymarket's Data API
 * 3. Matches closed positions to EXISTING orders in Polycopy (doesn't import new ones)
 * 4. Updates the orders with Polymarket's official realizedPnl (which includes fees)
 * 
 * This ensures accurate P&L without importing users' pre-Polycopy trading history
 */
async function syncAllUsers() {
  console.log('🔄 Syncing Polymarket P&L for All Users')
  console.log('=' .repeat(80))

  // Get all users with connected wallets
  const { data: credentials, error } = await supabase
    .from('clob_credentials')
    .select('user_id, polymarket_account_address')
    .not('polymarket_account_address', 'is', null)

  if (error) {
    console.error('❌ Error fetching credentials:', error)
    return
  }

  console.log(`\n👥 Found ${credentials?.length || 0} users with connected wallets\n`)

  let totalUsersProcessed = 0
  let totalOrdersUpdated = 0
  let totalErrors = 0

  for (const cred of credentials || []) {
    try {
      const result = await syncUserPositions(cred.user_id, cred.polymarket_account_address)
      totalUsersProcessed++
      totalOrdersUpdated += result.updated
      
      if (result.updated > 0) {
        console.log(`   ✅ User ${cred.user_id.substring(0, 8)}: Updated ${result.updated} orders`)
      }
    } catch (err) {
      console.error(`   ❌ Error syncing user ${cred.user_id}:`, err)
      totalErrors++
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log(`✅ Sync Complete`)
  console.log(`   Users processed: ${totalUsersProcessed}`)
  console.log(`   Orders updated: ${totalOrdersUpdated}`)
  console.log(`   Errors: ${totalErrors}`)
  console.log('=' .repeat(80))
}

async function syncUserPositions(userId: string, walletAddress: string) {
  // Fetch all closed positions from Polymarket
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
      await new Promise(resolve => setTimeout(resolve, 200)) // Rate limiting
    }
  } catch (err) {
    console.error(`   ⚠️  Failed to fetch positions for ${userId}:`, err)
    return { updated: 0 }
  }

  if (allPositions.length === 0) {
    return { updated: 0 }
  }

  // Get ONLY the orders that exist in Polycopy for this user
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, amount_invested')
    .eq('copy_user_id', userId)

  if (!orders || orders.length === 0) {
    return { updated: 0 }
  }

  // Match closed positions to existing orders
  let updatedCount = 0

  for (const position of allPositions) {
    const conditionId = position.conditionId
    const outcome = position.outcome
    const realizedPnl = Number(position.realizedPnl || 0)
    const avgPrice = Number(position.avgPrice || 0)
    const totalBought = Number(position.totalBought || 0)

    // Find matching orders in Polycopy (ONLY buy orders we're already tracking)
    const matchingOrders = orders.filter(o => 
      o.market_id === conditionId && 
      normalize(o.outcome) === normalize(outcome) &&
      o.side?.toLowerCase() === 'buy'
    )

    if (matchingOrders.length === 0) {
      // Position exists on Polymarket but NOT in Polycopy - skip it
      // This is expected and correct behavior (user's pre-Polycopy trades)
      continue
    }

    // Update ALL matching orders with Polymarket's P&L
    const totalInvested = matchingOrders.reduce((sum, o) => 
      sum + Number(o.amount_invested || 0), 0)

    for (const order of matchingOrders) {
      // Distribute P&L proportionally if multiple orders for same position
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

      if (!error) {
        updatedCount++
      }
    }
  }

  return { updated: updatedCount }
}

// Main execution
syncAllUsers().catch(console.error)
