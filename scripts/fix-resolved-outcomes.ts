#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function fixResolvedOutcomes() {
  console.log('🔧 Fixing resolved_outcome for resolved positions...\n')

  // Get all resolved positions missing resolved_outcome
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)
    .is('resolved_outcome', null)

  console.log(`Found ${orders?.length || 0} positions with missing resolved_outcome\n`)

  if (!orders || orders.length === 0) {
    console.log('✅ All resolved positions already have resolved_outcome!')
    return
  }

  // Get unique market IDs
  const marketIds = [...new Set(orders.map(o => o.market_id))]
  console.log(`Fetching resolution data for ${marketIds.length} markets...\n`)

  // Fetch market data
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, resolved_outcome, winning_side')
    .in('condition_id', marketIds)

  const marketMap = new Map(markets?.map(m => [m.condition_id, m]) || [])

  let updated = 0
  let skipped = 0

  for (const order of orders) {
    const market = marketMap.get(order.market_id)
    
    if (!market) {
      skipped++
      continue
    }

    const resolvedOutcome = market.resolved_outcome || market.winning_side
    
    if (!resolvedOutcome) {
      skipped++
      continue
    }

    // Update the order
    const { error } = await supabase
      .from('orders')
      .update({ resolved_outcome: resolvedOutcome })
      .eq('order_id', order.order_id)

    if (error) {
      console.error(`  ❌ Error updating ${order.order_id}:`, error.message)
    } else {
      updated++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ Updated: ${updated}`)
  console.log(`⚠️  Skipped (no resolution data): ${skipped}`)
  console.log('='.repeat(60))
}

fixResolvedOutcomes()
