#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function verifyPriceFixes() {
  console.log('🔍 Verifying Price Fixes')
  console.log('=' .repeat(80))

  // Check resolved orders with correct prices (0 or 1)
  const { data: resolved } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, current_price, market_resolved, amount_invested')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)

  if (!resolved) {
    console.log('❌ No resolved orders found')
    return
  }

  const withCorrectPrice = resolved.filter(o => o.current_price === 0 || o.current_price === 1)
  const withWrongPrice = resolved.filter(o => o.current_price !== 0 && o.current_price !== 1 && o.current_price !== null)
  const withNullPrice = resolved.filter(o => o.current_price === null)

  console.log(`\n📊 Resolved Orders Status:`)
  console.log(`   Total resolved orders: ${resolved.length}`)
  console.log(`   ✅ With correct price (0 or 1): ${withCorrectPrice.length}`)
  console.log(`   ❌ With wrong price: ${withWrongPrice.length}`)
  console.log(`   ⚠️  With null price: ${withNullPrice.length}`)

  const totalCorrect = withCorrectPrice.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0)
  const totalWrong = withWrongPrice.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0)
  const totalNull = withNullPrice.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0)

  console.log(`\n💰 Investment totals:`)
  console.log(`   Correct prices: $${totalCorrect.toFixed(2)}`)
  console.log(`   Wrong prices: $${totalWrong.toFixed(2)}`)
  console.log(`   Null prices: $${totalNull.toFixed(2)}`)

  if (withWrongPrice.length > 0) {
    console.log(`\n⚠️  Sample orders with wrong prices:`)
    withWrongPrice.slice(0, 5).forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.order_id}`)
      console.log(`      Price: ${o.current_price} (should be 0 or 1)`)
      console.log(`      Market: ${o.market_id?.substring(0, 20)}...`)
      console.log(`      Amount: $${Number(o.amount_invested || 0).toFixed(2)}`)
    })
  }

  // Count wins vs losses
  const wins = withCorrectPrice.filter(o => o.current_price === 1)
  const losses = withCorrectPrice.filter(o => o.current_price === 0)

  console.log(`\n🎯 Resolved Outcomes:`)
  console.log(`   Wins (price=1): ${wins.length} orders`)
  console.log(`   Losses (price=0): ${losses.length} orders`)

  console.log('\n' + '='.repeat(80))
}

verifyPriceFixes().catch(console.error)
