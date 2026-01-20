#!/usr/bin/env node

require('dotenv/config')
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkAutoCloseActivity() {
  console.log('🔍 Checking for recent auto-close activity...\n')

  // Check for orders with recent auto-close attempts (last hour)
  const { data: recentAttempts, error: attemptsError } = await supabase
    .from('orders')
    .select(`
      order_id,
      copied_trader_wallet,
      market_id,
      outcome,
      side,
      remaining_size,
      status,
      auto_close_attempted_at,
      auto_close_triggered_at,
      auto_close_order_id,
      auto_close_error,
      trader_position_size,
      created_at
    `)
    .or('auto_close_attempted_at.gt.' + new Date(Date.now() - 60 * 60 * 1000).toISOString() + ',auto_close_triggered_at.gt.' + new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('auto_close_attempted_at', { ascending: false, nullsFirst: false })
    .order('auto_close_triggered_at', { ascending: false, nullsFirst: false })
    .limit(20)

  if (attemptsError) {
    console.error('❌ Error fetching auto-close attempts:', attemptsError)
    return
  }

  if (!recentAttempts || recentAttempts.length === 0) {
    console.log('ℹ️ No recent auto-close activity found in the last hour.\n')
  } else {
    console.log(`✅ Found ${recentAttempts.length} orders with recent auto-close activity:\n`)
    recentAttempts.forEach((order, idx) => {
      console.log(`${idx + 1}. Order: ${order.order_id}`)
      console.log(`   Trader: ${order.copied_trader_wallet || 'N/A'}`)
      console.log(`   Market: ${order.market_id}`)
      console.log(`   Outcome: ${order.outcome}`)
      console.log(`   Remaining Size: ${order.remaining_size}`)
      console.log(`   Status: ${order.status}`)
      console.log(`   Trader Position Size: ${order.trader_position_size || 'null'}`)
      console.log(`   Attempted At: ${order.auto_close_attempted_at || 'null'}`)
      console.log(`   Triggered At: ${order.auto_close_triggered_at || 'null'}`)
      console.log(`   Auto-close Order ID: ${order.auto_close_order_id || 'null'}`)
      console.log(`   Error: ${order.auto_close_error || 'none'}`)
      console.log('')
    })
  }

  // Check for specific orders mentioned
  const specificOrderIds = [
    '0x7dd36d0ad08d9a427b0dde259495e7a1c5c57d029479d82a934842655c1e855e',
    '0x48730a7581585dd199819eee67b7976841e8599fbce77e4d4614204bf0fa9aad'
  ]

  console.log('\n🔍 Checking specific orders...\n')
  for (const orderId of specificOrderIds) {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        order_id,
        copied_trader_wallet,
        market_id,
        outcome,
        side,
        remaining_size,
        status,
        auto_close_on_trader_close,
        auto_close_attempted_at,
        auto_close_triggered_at,
        auto_close_order_id,
        auto_close_error,
        trader_position_size,
        auto_close_slippage_percent
      `)
      .eq('order_id', orderId)
      .single()

    if (orderError) {
      console.log(`❌ Error fetching order ${orderId}:`, orderError.message)
      continue
    }

    if (!order) {
      console.log(`⚠️ Order ${orderId} not found`)
      continue
    }

    console.log(`Order: ${order.order_id}`)
    console.log(`  Trader Wallet: ${order.copied_trader_wallet || 'null'}`)
    console.log(`  Auto-close Enabled: ${order.auto_close_on_trader_close}`)
    console.log(`  Remaining Size: ${order.remaining_size}`)
    console.log(`  Status: ${order.status}`)
    console.log(`  Trader Position Size: ${order.trader_position_size || 'null'}`)
    console.log(`  Auto-close Attempted: ${order.auto_close_attempted_at || 'never'}`)
    console.log(`  Auto-close Triggered: ${order.auto_close_triggered_at || 'never'}`)
    console.log(`  Auto-close Order ID: ${order.auto_close_order_id || 'none'}`)
    console.log(`  Error: ${order.auto_close_error || 'none'}`)
    console.log('')
  }

  // Check if specific orders would be included in auto-close query
  console.log('\n🔍 Checking if orders meet auto-close query criteria...\n')
  for (const orderId of specificOrderIds) {
    const { data: order } = await supabase
      .from('orders')
      .select('order_id, auto_close_triggered_at, auto_close_on_trader_close, copied_trader_wallet, status, remaining_size, created_at')
      .eq('order_id', orderId)
      .single()

    if (!order) continue

    console.log(`Order: ${orderId}`)
    console.log(`  Meets criteria:`)
    console.log(`    auto_close_triggered_at is null: ${order.auto_close_triggered_at === null} ✓`)
    console.log(`    auto_close_on_trader_close is not false: ${order.auto_close_on_trader_close !== false} ✓`)
    console.log(`    copied_trader_wallet is not null: ${order.copied_trader_wallet !== null} ✓`)
    console.log(`    status in allowed list: ${['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'].includes(order.status)} ✓`)
    console.log(`    remaining_size > 0: ${Number(order.remaining_size) > 0} ✓`)
    
    // Check position in query results
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .is('auto_close_triggered_at', null)
      .neq('auto_close_on_trader_close', false)
      .not('copied_trader_wallet', 'is', null)
      .in('status', ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'])
      .gt('remaining_size', 0)
      .gt('created_at', order.created_at)
    
    const position = (count || 0) + 1
    console.log(`  Position in query (by created_at): ${position}${position > 200 ? ' (OUTSIDE LIMIT!)' : ' (within limit)'}`)
    console.log('')
  }

  // Check current trader position sizes via API
  console.log('\n🔍 Checking current trader positions via Polymarket API...\n')
  for (const orderId of specificOrderIds) {
    const { data: order } = await supabase
      .from('orders')
      .select('copied_trader_wallet, market_id, outcome, trader_position_size')
      .eq('order_id', orderId)
      .single()

    if (!order || !order.copied_trader_wallet || !order.market_id || !order.outcome) {
      continue
    }

    try {
      const positionsUrl = `https://data-api.polymarket.com/positions?user=${order.copied_trader_wallet}&limit=500&offset=0`
      const response = await fetch(positionsUrl, { cache: 'no-store' })
      if (!response.ok) {
        console.log(`❌ Failed to fetch positions for ${order.copied_trader_wallet}: ${response.status}`)
        continue
      }
      const positions = await response.json()
      const normalizedOutcome = (order.outcome || '').trim().toLowerCase()
      const match = positions.find((pos) => {
        const idMatch = pos.conditionId === order.market_id || pos.asset === order.market_id
        const outcomeMatch = (pos.outcome || '').trim().toLowerCase() === normalizedOutcome
        return idMatch && outcomeMatch && Number(pos.size ?? 0) > 0
      })

      const currentSize = match ? Number(match.size ?? 0) : 0
      const storedSize = Number(order.trader_position_size ?? 0)

      console.log(`Order: ${orderId}`)
      console.log(`  Trader: ${order.copied_trader_wallet}`)
      console.log(`  Stored Position Size: ${storedSize}`)
      console.log(`  Current Position Size (API): ${currentSize}`)
      console.log(`  Difference: ${storedSize - currentSize}`)
      console.log(`  Reduction %: ${storedSize > 0 ? ((storedSize - currentSize) / storedSize * 100).toFixed(2) : 0}%`)
      console.log('')
    } catch (error) {
      console.log(`❌ Error checking position for ${order.copied_trader_wallet}:`, error.message)
    }
  }
}

checkAutoCloseActivity().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

