/* eslint-disable no-console */
/**
 * Check System-Wide SELL Orders
 * 
 * This script checks if SELL orders exist anywhere in the system
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
  console.log('🔍 Checking for SELL orders system-wide...\n')

  // Check total SELL orders
  const { count: totalSellCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('side', 'SELL')

  console.log(`Total SELL orders in system: ${totalSellCount || 0}`)

  if (!totalSellCount || totalSellCount === 0) {
    console.log('\n⚠️  No SELL orders found in the entire system!')
    console.log('This could mean:')
    console.log('  1. Users haven\'t closed any positions yet')
    console.log('  2. SELL orders are stored elsewhere (different table?)')
    console.log('  3. SELL orders use a different value for side field')
    return
  }

  // Check SELL orders with vs without copy_user_id
  const { count: sellWithCopyUser } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('side', 'SELL')
    .not('copy_user_id', 'is', null)

  const { count: sellWithoutCopyUser } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('side', 'SELL')
    .is('copy_user_id', null)

  console.log(`\nSELL orders WITH copy_user_id: ${sellWithCopyUser || 0}`)
  console.log(`SELL orders WITHOUT copy_user_id: ${sellWithoutCopyUser || 0}`)

  if (sellWithoutCopyUser && sellWithoutCopyUser > 0) {
    console.log(`\n🔴 ISSUE CONFIRMED: ${sellWithoutCopyUser} SELL orders missing copy_user_id`)
    
    // Sample some SELL orders without copy_user_id
    const { data: sampleSells } = await supabase
      .from('orders')
      .select('order_id, trader_id, market_id, outcome, price, filled_size, status, created_at')
      .eq('side', 'SELL')
      .is('copy_user_id', null)
      .order('created_at', { ascending: false })
      .limit(5)

    console.log('\nSample SELL orders without copy_user_id:')
    sampleSells?.forEach((o, i) => {
      console.log(`\n${i + 1}. Order ID: ${o.order_id}`)
      console.log(`   Trader ID: ${o.trader_id}`)
      console.log(`   Market: ${o.market_id?.substring(0, 40)}...`)
      console.log(`   Price: ${o.price}`)
      console.log(`   Status: ${o.status}`)
      console.log(`   Created: ${o.created_at}`)
    })
  }

  // Check what side values exist
  console.log('\n📊 All unique side values in orders table:')
  const { data: sides } = await supabase
    .from('orders')
    .select('side')

  const uniqueSides = new Set(sides?.map(s => s.side))
  uniqueSides.forEach(side => {
    console.log(`  - "${side}"`)
  })

  // Check total orders
  const { count: totalOrders } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })

  console.log(`\n📈 Total orders in system: ${totalOrders || 0}`)
  console.log(`   BUY orders: ${(totalOrders || 0) - (totalSellCount || 0)}`)
  console.log(`   SELL orders: ${totalSellCount || 0}`)
  console.log(`   Ratio: ${((totalSellCount || 0) / (totalOrders || 1) * 100).toFixed(2)}% are SELLs`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
