#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function compareCalculations() {
  console.log('🔍 Comparing P&L Calculations')
  console.log('=' .repeat(80))

  // 1. Get wallet address
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const wallet = cred?.polymarket_account_address?.toLowerCase()
  console.log(`\n💳 Wallet: ${wallet}`)

  if (!wallet) {
    console.log('❌ No wallet found')
    return
  }

  // 2. Get trader_id
  const { data: trader } = await supabase
    .from('traders')
    .select('id')
    .ilike('wallet_address', wallet)
    .limit(1)
    .maybeSingle()

  console.log(`👤 Trader ID: ${trader?.id || 'Not found'}`)

  // 3. Count orders by different criteria
  const { count: ordersByCopyUser } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('copy_user_id', USER_ID)

  const { count: ordersByTrader } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('trader_id', trader?.id || 'none')

  console.log(`\n📦 Order Counts:`)
  console.log(`  - By copy_user_id: ${ordersByCopyUser}`)
  console.log(`  - By trader_id: ${ordersByTrader}`)

  // 4. Get orders by copy_user_id
  const { data: copyUserOrders } = await supabase
    .from('orders')
    .select('order_id, side, amount_invested, filled_size, size, price, current_price, user_exit_price, market_resolved')
    .eq('copy_user_id', USER_ID)

  const copyUserInvested = copyUserOrders?.reduce((sum, o) => 
    sum + Number(o.amount_invested || 0), 0) || 0

  console.log(`\n💰 Orders by copy_user_id:`)
  console.log(`  - Count: ${copyUserOrders?.length}`)
  console.log(`  - Total Invested: $${copyUserInvested.toFixed(2)}`)
  console.log(`  - BUY: ${copyUserOrders?.filter(o => o.side?.toLowerCase() === 'buy').length}`)
  console.log(`  - SELL: ${copyUserOrders?.filter(o => o.side?.toLowerCase() === 'sell').length}`)

  // 5. Check cached summary
  const { data: cached } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()

  if (cached) {
    console.log(`\n📈 Cached Summary (what UI shows):`)
    console.log(`  - Total P&L: $${Number(cached.total_pnl).toFixed(2)}`)
    console.log(`  - Realized: $${Number(cached.realized_pnl).toFixed(2)}`)
    console.log(`  - Unrealized: $${Number(cached.unrealized_pnl).toFixed(2)}`)
    console.log(`  - Volume: $${Number(cached.total_volume).toFixed(2)}`)
    console.log(`  - Last Updated: ${cached.last_updated_at}`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('⚠️  DISCREPANCY FOUND:')
  console.log(`  - Cached shows: $${Number(cached?.total_pnl || 0).toFixed(2)}`)
  console.log(`  - Database invested: $${copyUserInvested.toFixed(2)}`)
  console.log(`  - Cached volume: $${Number(cached?.total_volume || 0).toFixed(2)}`)
  console.log(`  - Difference: $${Math.abs(copyUserInvested - Number(cached?.total_volume || 0)).toFixed(2)}`)
}

compareCalculations().catch(console.error)
