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

async function diagnoseMatching() {
  console.log('🔍 Diagnosing Matching Issues for 182 Unmatched Positions')
  console.log('=' .repeat(80))

  // Get wallet
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .maybeSingle()

  const walletAddress = cred?.polymarket_account_address

  // Fetch first 10 closed positions from Polymarket
  const response = await fetch(
    `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=300`,
    { headers: { 'Accept': 'application/json' } }
  )

  const positions = await response.json()
  
  // Get all orders from Polycopy
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, trade_method')
    .eq('copy_user_id', USER_ID)

  console.log(`\n📊 Data loaded:`)
  console.log(`   Polymarket closed positions: ${positions.length}`)
  console.log(`   Polycopy orders: ${orders?.length}`)

  // Find unmatched positions
  let unmatchedCount = 0
  const unmatchedSample = []

  for (const position of positions) {
    const matchingOrders = (orders || []).filter(o => 
      o.market_id === position.conditionId && 
      normalize(o.outcome) === normalize(position.outcome) &&
      o.side?.toLowerCase() === 'buy'
    )

    if (matchingOrders.length === 0 && unmatchedCount < 10) {
      unmatchedCount++
      
      // Check if ANY orders exist for this market (any outcome)
      const anyMarketOrders = (orders || []).filter(o => o.market_id === position.conditionId)
      
      unmatchedSample.push({
        position,
        anyMarketOrders: anyMarketOrders.length,
        orderOutcomes: anyMarketOrders.map(o => o.outcome)
      })
    }
  }

  console.log(`\n❌ Sample unmatched positions (showing first 10):`)
  
  for (let i = 0; i < unmatchedSample.length; i++) {
    const sample = unmatchedSample[i]
    console.log(`\n${i + 1}. Market: ${sample.position.market?.question || 'Unknown'}`)
    console.log(`   Polymarket conditionId: ${sample.position.conditionId}`)
    console.log(`   Polymarket outcome: "${sample.position.outcome}"`)
    console.log(`   Realized P&L: $${Number(sample.position.realizedPnl || 0).toFixed(2)}`)
    
    if (sample.anyMarketOrders > 0) {
      console.log(`   ⚠️  Found ${sample.anyMarketOrders} orders for this market in Polycopy`)
      console.log(`   Polycopy outcomes: ${sample.orderOutcomes.map((o: any) => '"' + o + '"').join(', ')}`)
      console.log(`   ❌ MISMATCH: Outcomes don't match!`)
    } else {
      console.log(`   ❌ No orders at all for this market in Polycopy`)
    }
  }

  console.log('\n' + '='.repeat(80))
}

diagnoseMatching().catch(console.error)
