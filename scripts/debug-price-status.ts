#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function debugPriceStatus() {
  console.log('🔍 Checking Current Price Status in Database')
  console.log('=' .repeat(80))

  // Get a sample of resolved orders to check their prices
  const { data: resolvedOrders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, current_price, market_resolved, amount_invested, created_at')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!resolvedOrders) {
    console.log('❌ No resolved orders found')
    return
  }

  console.log(`\n📦 Sample of 20 most recent resolved orders:`)
  resolvedOrders.forEach((order, i) => {
    const priceStatus = 
      order.current_price === 0 ? '✅ 0 (LOSS)' :
      order.current_price === 1 ? '✅ 1 (WIN)' :
      order.current_price === null ? '❌ NULL' :
      `❌ ${order.current_price} (WRONG)`
    
    console.log(`   ${i + 1}. ${order.outcome} - Price: ${priceStatus} - $${Number(order.amount_invested || 0).toFixed(2)}`)
  })

  // Get overall stats
  const { data: allResolved } = await supabase
    .from('orders')
    .select('current_price, amount_invested')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)

  if (!allResolved) return

  const correct = allResolved.filter(o => o.current_price === 0 || o.current_price === 1)
  const wrong = allResolved.filter(o => o.current_price !== 0 && o.current_price !== 1 && o.current_price !== null)
  const nullPrice = allResolved.filter(o => o.current_price === null)

  console.log(`\n📊 Overall Status:`)
  console.log(`   Total resolved: ${allResolved.length}`)
  console.log(`   ✅ Correct (0 or 1): ${correct.length}`)
  console.log(`   ❌ Wrong: ${wrong.length}`)
  console.log(`   ⚠️  Null: ${nullPrice.length}`)

  console.log('\n' + '='.repeat(80))
}

debugPriceStatus().catch(console.error)
