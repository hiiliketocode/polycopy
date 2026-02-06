#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function findSkippedOrders() {
  console.log('🔍 Finding Skipped Orders')
  console.log('=' .repeat(80))

  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, side, price, price_when_copied, filled_size, size, amount_invested, market_id, outcome')
    .eq('copy_user_id', USER_ID)

  if (!orders) {
    console.log('❌ No orders found')
    return
  }

  console.log(`\n📦 Total orders: ${orders.length}`)

  const resolveFilledSize = (order: any) => {
    const filled = Number(order.filled_size) || 0
    const size = Number(order.size) || 0
    return filled > 0 ? filled : size
  }

  const skipped: any[] = []
  const valid: any[] = []

  for (const order of orders) {
    const side = order.side?.toLowerCase()
    const price = side === 'buy'
      ? (Number(order.price_when_copied) || Number(order.price) || null)
      : (Number(order.price) || Number(order.price_when_copied) || null)
    const filledSize = resolveFilledSize(order)

    if (!price || !filledSize || filledSize <= 0) {
      skipped.push({ ...order, price, filledSize })
    } else {
      valid.push({ ...order, price, filledSize })
    }
  }

  console.log(`\n✅ Valid orders (included in P&L): ${valid.length}`)
  console.log(`❌ Skipped orders (excluded from P&L): ${skipped.length}`)

  if (skipped.length > 0) {
    console.log(`\n⚠️  SKIPPED ORDERS:`)
    const totalSkippedInvestment = skipped.reduce((sum, o) => 
      sum + Number(o.amount_invested || 0), 0)
    
    console.log(`   Total amount_invested in skipped orders: $${totalSkippedInvestment.toFixed(2)}`)
    
    const noPriceCount = skipped.filter(o => !o.price).length
    const noSizeCount = skipped.filter(o => !o.filledSize || o.filledSize <= 0).length
    
    console.log(`   - Missing price: ${noPriceCount}`)
    console.log(`   - Missing/zero filled_size: ${noSizeCount}`)
    
    console.log(`\n   Sample of first 10 skipped orders:`)
    skipped.slice(0, 10).forEach((o, i) => {
      console.log(`   ${i + 1}. Order ${o.order_id}`)
      console.log(`      - side: ${o.side}`)
      console.log(`      - price: ${o.price || 'MISSING'}`)
      console.log(`      - filled_size: ${o.filled_size || 'null'}`)
      console.log(`      - size: ${o.size || 'null'}`)
      console.log(`      - amount_invested: $${Number(o.amount_invested || 0).toFixed(2)}`)
      console.log(`      - market_id: ${o.market_id}`)
      console.log(`      - outcome: ${o.outcome}`)
    })
  }

  const totalValidInvestment = valid.reduce((sum, o) => 
    sum + Number(o.amount_invested || 0), 0)
  
  console.log(`\n💰 Investment totals:`)
  console.log(`   - Valid orders: $${totalValidInvestment.toFixed(2)}`)
  console.log(`   - Skipped orders: $${skipped.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0).toFixed(2)}`)
  console.log(`   - Grand total: $${(totalValidInvestment + skipped.reduce((sum, o) => sum + Number(o.amount_invested || 0), 0)).toFixed(2)}`)

  console.log('\n' + '='.repeat(80))
}

findSkippedOrders().catch(console.error)
