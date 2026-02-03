#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase configuration')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function debugQuery() {
  const orderId = '0x7dd36d0ad08d9a427b0dde259495e7a1c5c57d029479d82a934842655c1e855e'
  
  console.log('🔍 Checking if order is included in auto-close query...\n')
  
  // First, get the order details
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('order_id', orderId)
    .single()
  
  if (orderError || !order) {
    console.error('❌ Error fetching order:', orderError)
    return
  }
  
  console.log('Order details:')
  console.log(`  order_id: ${order.order_id}`)
  console.log(`  trader_id: ${order.trader_id}`)
  console.log(`  copied_trader_wallet: ${order.copied_trader_wallet}`)
  console.log(`  market_id: ${order.market_id}`)
  console.log(`  outcome: ${order.outcome}`)
  console.log(`  status: ${order.status}`)
  console.log(`  remaining_size: ${order.remaining_size}`)
  console.log(`  auto_close_on_trader_close: ${order.auto_close_on_trader_close}`)
  console.log(`  auto_close_triggered_at: ${order.auto_close_triggered_at}`)
  console.log(`  auto_close_attempted_at: ${order.auto_close_attempted_at}`)
  console.log(`  trader_position_size: ${order.trader_position_size}`)
  console.log(`  created_at: ${order.created_at}`)
  
  console.log('\n🔍 Running auto-close query (same as cron job)...\n')
  
  // Run the exact query from the cron job
  const { data: openOrders, error: queryError } = await supabase
    .from('orders')
    .select(
      'order_id, trader_id, copied_trader_wallet, market_id, outcome, side, status, remaining_size, trader_position_size, auto_close_on_trader_close, auto_close_slippage_percent, auto_close_triggered_at, auto_close_attempted_at, created_at'
    )
    .is('auto_close_triggered_at', null)
    .neq('auto_close_on_trader_close', false)
    .not('copied_trader_wallet', 'is', null)
    .in('status', ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'])
    .gt('remaining_size', 0)
    .order('created_at', { ascending: false })
    .limit(200)
  
  if (queryError) {
    console.error('❌ Query error:', queryError)
    return
  }
  
  console.log(`✅ Query returned ${openOrders?.length || 0} orders\n`)
  
  // Check if our order is in the results
  const orderInResults = openOrders?.find(o => o.order_id === orderId)
  
  if (orderInResults) {
    console.log(`✅ Order IS in query results (position ${openOrders.findIndex(o => o.order_id === orderId) + 1})\n`)
    console.log('Order data from query:')
    console.log(JSON.stringify(orderInResults, null, 2))
    
    // Check each condition
    console.log('\n🔍 Checking each condition:')
    console.log(`  auto_close_triggered_at is null: ${orderInResults.auto_close_triggered_at === null}`)
    console.log(`  auto_close_on_trader_close is not false: ${orderInResults.auto_close_on_trader_close !== false}`)
    console.log(`  copied_trader_wallet is not null: ${orderInResults.copied_trader_wallet !== null}`)
    console.log(`  status in ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled']: ${['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'].includes(orderInResults.status)}`)
    console.log(`  remaining_size > 0: ${Number(orderInResults.remaining_size) > 0}`)
    console.log(`  trader_id exists: ${!!orderInResults.trader_id}`)
    console.log(`  market_id exists: ${!!orderInResults.market_id}`)
    console.log(`  outcome exists: ${!!orderInResults.outcome}`)
  } else {
    console.log(`❌ Order is NOT in query results\n`)
    console.log('Checking why it might be excluded:')
    console.log(`  auto_close_triggered_at: ${order.auto_close_triggered_at} (should be null)`)
    console.log(`  auto_close_on_trader_close: ${order.auto_close_on_trader_close} (should not be false)`)
    console.log(`  copied_trader_wallet: ${order.copied_trader_wallet} (should not be null)`)
    console.log(`  status: ${order.status} (should be in ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'])`)
    console.log(`  remaining_size: ${order.remaining_size} (should be > 0)`)
    
    // Test each filter individually
    console.log('\n🔍 Testing each filter individually:')
    
    const test1 = await supabase.from('orders').select('order_id').eq('order_id', orderId).is('auto_close_triggered_at', null)
    console.log(`  Filter: auto_close_triggered_at is null → ${test1.data?.length || 0} results`)
    
    const test2 = await supabase.from('orders').select('order_id').eq('order_id', orderId).neq('auto_close_on_trader_close', false)
    console.log(`  Filter: auto_close_on_trader_close != false → ${test2.data?.length || 0} results`)
    
    const test3 = await supabase.from('orders').select('order_id').eq('order_id', orderId).not('copied_trader_wallet', 'is', null)
    console.log(`  Filter: copied_trader_wallet is not null → ${test3.data?.length || 0} results`)
    
    const test4 = await supabase.from('orders').select('order_id').eq('order_id', orderId).in('status', ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'])
    console.log(`  Filter: status in allowed list → ${test4.data?.length || 0} results`)
    
    const test5 = await supabase.from('orders').select('order_id').eq('order_id', orderId).gt('remaining_size', 0)
    console.log(`  Filter: remaining_size > 0 → ${test5.data?.length || 0} results`)
  }
}

debugQuery().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

