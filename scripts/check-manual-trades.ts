#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function checkManualTrades() {
  console.log('🔍 Checking Manual Trades')
  console.log('=' .repeat(80))

  // Get all orders
  const { data: allOrders } = await supabase
    .from('orders')
    .select('order_id, copied_trade_id, trade_method, market_id, outcome, side, amount_invested')
    .eq('copy_user_id', USER_ID)

  console.log(`\n📊 Total orders: ${allOrders?.length || 0}`)

  // Count by trade method
  const byMethod = (allOrders || []).reduce((acc, o) => {
    const method = o.trade_method || 'unknown'
    acc[method] = (acc[method] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('\n📈 Orders by trade method:')
  Object.entries(byMethod).forEach(([method, count]) => {
    console.log(`   ${method}: ${count}`)
  })

  // Get manual trades
  const manualTrades = (allOrders || []).filter(o => o.trade_method === 'manual')
  console.log(`\n🎯 Manual trades: ${manualTrades.length}`)

  // Sample 5 manual trades
  console.log('\n📝 Sample manual trades:')
  manualTrades.slice(0, 5).forEach((trade, i) => {
    console.log(`\n${i + 1}. ${trade.side?.toUpperCase() || 'UNKNOWN'}`)
    console.log(`   order_id: ${trade.order_id || 'null'}`)
    console.log(`   copied_trade_id: ${trade.copied_trade_id || 'null'}`)
    console.log(`   market_id: ${trade.market_id || 'null'}`)
    console.log(`   outcome: ${trade.outcome || 'null'}`)
    console.log(`   amount_invested: $${trade.amount_invested || 0}`)
  })

  console.log('\n' + '='.repeat(80))
}

checkManualTrades().catch(console.error)
