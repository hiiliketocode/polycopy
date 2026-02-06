/* eslint-disable no-console */
/**
 * Check side field values and patterns
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  console.log('🔍 Analyzing order side field values...\n')

  // Get sample of all orders with side field
  const { data: orders } = await supabase
    .from('orders')
    .select('side, status, market_id, user_closed_at, trader_still_has_position')
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!orders || orders.length === 0) {
    console.log('No orders found')
    return
  }

  // Count by side
  const sideCount: Record<string, number> = {}
  orders.forEach(o => {
    const side = o.side || 'NULL'
    sideCount[side] = (sideCount[side] || 0) + 1
  })

  console.log('Side field values (last 1000 orders):')
  console.table(sideCount)

  // Check for closed positions
  const closedCount = orders.filter(o => o.user_closed_at !== null).length
  const stillHasPosition = orders.filter(o => o.trader_still_has_position === false).length

  console.log(`\nOrders with user_closed_at set: ${closedCount}`)
  console.log(`Orders with trader_still_has_position = false: ${stillHasPosition}`)

  if (closedCount > 0) {
    console.log('\n🔍 Sample of orders with user_closed_at set:')
    const closed = orders.filter(o => o.user_closed_at !== null).slice(0, 5)
    closed.forEach((o, i) => {
      console.log(`\n${i + 1}. Side: ${o.side}`)
      console.log(`   Status: ${o.status}`)
      console.log(`   User Closed At: ${o.user_closed_at}`)
      console.log(`   Trader Still Has Position: ${o.trader_still_has_position}`)
    })
  }

  // Check case variations
  console.log('\n📝 Checking case-insensitive patterns:')
  const buyVariations = ['BUY', 'buy', 'Buy']
  const sellVariations = ['SELL', 'sell', 'Sell']

  for (const variation of buyVariations) {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('side', variation)
    if (count && count > 0) {
      console.log(`  "${variation}": ${count}`)
    }
  }

  for (const variation of sellVariations) {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('side', variation)
    if (count && count > 0) {
      console.log(`  "${variation}": ${count}`)
    }
  }

  // Check total orders
  const { count: total } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📊 Total orders: ${total || 0}`)

  // Key insight
  if (closedCount === 0) {
    console.log('\n✅ KEY FINDING: No positions have been closed yet!')
    console.log('This explains why there are no SELL orders.')
    console.log('The P&L discrepancy issue will manifest once users start closing positions.')
  } else {
    console.log('\n⚠️ KEY FINDING: Some positions are marked as closed,')
    console.log('but no SELL orders exist. This suggests the closing mechanism')
    console.log('updates the BUY order metadata instead of creating SELL orders.')
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
