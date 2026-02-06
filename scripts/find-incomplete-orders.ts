#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function findIncompleteOrders() {
  console.log('🔍 Finding Orders with Incomplete Data')
  console.log('=' .repeat(80))

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: true })

  if (!orders) {
    console.log('❌ No orders found')
    return
  }

  console.log(`\n📦 Total orders: ${orders.length}`)

  interface IncompleteOrder {
    order_id: string
    missing_fields: string[]
    amount_invested: number
    created_at: string
    asset_id?: string
  }

  const incomplete: IncompleteOrder[] = []

  for (const order of orders) {
    const missing: string[] = []

    // Check critical fields
    if (!order.price && !order.price_when_copied) {
      missing.push('price')
    }
    if (!order.filled_size && !order.size) {
      missing.push('size')
    }
    if (!order.market_id) {
      missing.push('market_id')
    }
    if (!order.outcome) {
      missing.push('outcome')
    }
    if (!order.asset_id && !order.token_id) {
      missing.push('asset_id/token_id')
    }

    if (missing.length > 0) {
      incomplete.push({
        order_id: order.order_id,
        missing_fields: missing,
        amount_invested: Number(order.amount_invested || 0),
        created_at: order.created_at,
        asset_id: order.asset_id || order.token_id
      })
    }
  }

  console.log(`\n✅ Complete orders: ${orders.length - incomplete.length}`)
  console.log(`❌ Incomplete orders: ${incomplete.length}`)

  if (incomplete.length > 0) {
    const totalIncompleteInvestment = incomplete.reduce((sum, o) => 
      sum + o.amount_invested, 0)
    
    console.log(`\n⚠️  INCOMPLETE ORDERS:`)
    console.log(`   Total amount_invested: $${totalIncompleteInvestment.toFixed(2)}`)
    console.log(`   This represents ${((incomplete.length / orders.length) * 100).toFixed(1)}% of all orders`)
    
    // Group by missing fields
    const byMissingFields = incomplete.reduce((acc, o) => {
      const key = o.missing_fields.sort().join(', ')
      if (!acc[key]) acc[key] = []
      acc[key].push(o)
      return acc
    }, {} as Record<string, IncompleteOrder[]>)

    console.log(`\n   Breakdown by missing fields:`)
    Object.entries(byMissingFields).forEach(([fields, orders]) => {
      const total = orders.reduce((sum, o) => sum + o.amount_invested, 0)
      console.log(`   - ${fields}: ${orders.length} orders ($${total.toFixed(2)})`)
    })

    console.log(`\n   Sample of incomplete orders:`)
    incomplete.slice(0, 10).forEach((o, i) => {
      console.log(`   ${i + 1}. Order ${o.order_id}`)
      console.log(`      - Missing: ${o.missing_fields.join(', ')}`)
      console.log(`      - Amount: $${o.amount_invested.toFixed(2)}`)
      console.log(`      - Created: ${o.created_at}`)
      if (o.asset_id) {
        console.log(`      - Asset ID: ${o.asset_id}`)
      }
    })

    console.log(`\n💡 These orders can potentially be backfilled from the CLOB API`)
    console.log(`   We can use the order_id or asset_id to fetch complete data from Polymarket`)
  } else {
    console.log(`\n✅ All orders have complete data!`)
  }

  // Also check for orders with data but potentially wrong/stale prices
  console.log(`\n\n🔍 Checking for orders with potentially stale data...`)
  
  const resolvedWithoutPrice = orders.filter(o => 
    o.market_resolved && (!o.current_price || (o.current_price !== 0 && o.current_price !== 1))
  )

  if (resolvedWithoutPrice.length > 0) {
    const totalInvestment = resolvedWithoutPrice.reduce((sum, o) => 
      sum + Number(o.amount_invested || 0), 0)
    console.log(`\n⚠️  Found ${resolvedWithoutPrice.length} resolved markets without proper prices (should be 0 or 1)`)
    console.log(`   Total investment: $${totalInvestment.toFixed(2)}`)
    console.log(`   These need price updates from the markets table`)
  }

  console.log('\n' + '='.repeat(80))
}

findIncompleteOrders().catch(console.error)
