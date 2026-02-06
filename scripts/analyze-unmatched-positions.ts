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

async function analyzeUnmatched() {
  console.log('🔍 Analyzing Unmatched Polymarket Positions')
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

  // Fetch first batch of closed positions
  const response = await fetch(
    `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=50&offset=0`,
    { headers: { 'Accept': 'application/json' } }
  )

  const positions = await response.json()
  console.log(`\n✅ Fetched ${positions.length} positions`)

  // Get all orders for this user
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, created_at')
    .eq('copy_user_id', USER_ID)

  console.log(`📦 Found ${orders?.length || 0} orders in database\n`)

  // Find first 5 unmatched
  let unmatchedCount = 0
  for (const position of positions) {
    if (unmatchedCount >= 5) break

    const conditionId = position.conditionId
    const outcome = position.outcome

    const matchingOrders = (orders || []).filter(o => 
      o.market_id === conditionId && 
      normalize(o.outcome) === normalize(outcome) &&
      o.side?.toLowerCase() === 'buy'
    )

    if (matchingOrders.length === 0) {
      unmatchedCount++
      console.log(`\n${unmatchedCount}. UNMATCHED POSITION:`)
      console.log(`   Condition ID: ${conditionId}`)
      console.log(`   Outcome: ${outcome}`)
      console.log(`   Realized P&L: $${Number(position.realizedPnl || 0).toFixed(2)}`)
      console.log(`   Total Bought: ${position.totalBought}`)
      console.log(`   Avg Price: ${position.avgPrice}`)
      
      // Check if any orders exist for this market at all
      const anyMarketOrders = (orders || []).filter(o => o.market_id === conditionId)
      if (anyMarketOrders.length > 0) {
        console.log(`   📍 Found ${anyMarketOrders.length} orders for this market (different outcomes):`)
        anyMarketOrders.forEach(o => {
          console.log(`      - ${o.outcome} (${o.side}) ${o.created_at}`)
        })
      } else {
        console.log(`   ❌ No orders at all for this market in Polycopy`)
      }
    }
  }

  console.log('\n' + '='.repeat(80))
}

analyzeUnmatched().catch(console.error)
