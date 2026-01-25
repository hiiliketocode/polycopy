#!/usr/bin/env node

/**
 * Quick script to check if a wallet exists in various tables.
 * Usage: node scripts/check-wallet.js 0xd82079c0d6b837bad90abf202befc079da5819f6
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function checkWallet(wallet) {
  const normalized = wallet.toLowerCase().trim()
  console.log(`\n🔍 Checking wallet: ${normalized}\n`)

  // Check traders table
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .select('*')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (traderError) {
    console.error('❌ Error querying traders:', traderError.message)
  } else if (trader) {
    console.log('✅ Found in traders table:')
    console.log(`   - ID: ${trader.id}`)
    console.log(`   - Display Name: ${trader.display_name || '(none)'}`)
    console.log(`   - Is Active: ${trader.is_active || false}`)
    console.log(`   - Updated At: ${trader.updated_at || '(none)'}`)
  } else {
    console.log('❌ NOT found in traders table')
  }

  // Check wallet_realized_pnl_daily
  const { data: pnlData, error: pnlError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('date, realized_pnl')
    .eq('wallet_address', normalized)
    .order('date', { ascending: false })
    .limit(10)

  if (pnlError) {
    console.error('❌ Error querying wallet_realized_pnl_daily:', pnlError.message)
  } else if (pnlData && pnlData.length > 0) {
    console.log(`\n✅ Found ${pnlData.length} PnL records (showing latest 10):`)
    pnlData.forEach(row => {
      console.log(`   - ${row.date}: ${row.realized_pnl}`)
    })
  } else {
    console.log('\n❌ NO PnL data in wallet_realized_pnl_daily')
  }

  // Check follows table
  const { data: follows, error: followsError } = await supabase
    .from('follows')
    .select('user_id, active')
    .eq('trader_wallet', normalized)

  if (followsError) {
    console.error('❌ Error querying follows:', followsError.message)
  } else if (follows && follows.length > 0) {
    console.log(`\n✅ Found in ${follows.length} follow(s):`)
    follows.forEach(f => {
      console.log(`   - User: ${f.user_id}, Active: ${f.active}`)
    })
  } else {
    console.log('\n❌ NOT in follows table')
  }

  // Check trades_public
  const { data: trades, error: tradesError } = await supabase
    .from('trades_public')
    .select('id, market_title, trade_timestamp')
    .eq('trader_wallet', normalized)
    .order('trade_timestamp', { ascending: false })
    .limit(5)

  if (tradesError) {
    console.error('❌ Error querying trades_public:', tradesError.message)
  } else if (trades && trades.length > 0) {
    console.log(`\n✅ Found ${trades.length} trade(s) in trades_public (showing latest 5):`)
    trades.forEach(t => {
      console.log(`   - ${t.market_title || '(no title)'} at ${t.trade_timestamp || '(no timestamp)'}`)
    })
  } else {
    console.log('\n❌ NOT in trades_public table')
  }

  // Check orders (copied_trader_wallet)
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('order_id, market_id, created_at')
    .eq('copied_trader_wallet', normalized)
    .order('created_at', { ascending: false })
    .limit(5)

  if (ordersError) {
    console.error('❌ Error querying orders:', ordersError.message)
  } else if (orders && orders.length > 0) {
    console.log(`\n✅ Found in ${orders.length} order(s) as copied_trader_wallet (showing latest 5):`)
    orders.forEach(o => {
      console.log(`   - Order ${o.order_id || '(no order_id)'} for market ${o.market_id || '(no market)'} at ${o.created_at || '(no date)'}`)
    })
  } else {
    console.log('\n❌ NOT in orders table (as copied_trader_wallet)')
  }

  console.log('\n')
}

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/check-wallet.js <wallet_address>')
  process.exit(1)
}

checkWallet(wallet).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
