/* eslint-disable no-console */
/**
 * Find Active Users with Orders
 * 
 * This script finds users who have actual trading activity
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
  console.log('🔍 Finding users with active trading...\n')

  // Get users who have orders with copy_user_id
  const { data: ordersWithUsers } = await supabase
    .from('orders')
    .select('copy_user_id')
    .not('copy_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (!ordersWithUsers || ordersWithUsers.length === 0) {
    console.log('No orders with copy_user_id found')
    return
  }

  // Count orders per user
  const userOrderCounts: Record<string, number> = {}
  ordersWithUsers.forEach(o => {
    if (o.copy_user_id) {
      userOrderCounts[o.copy_user_id] = (userOrderCounts[o.copy_user_id] || 0) + 1
    }
  })

  // Sort by order count
  const sortedUsers = Object.entries(userOrderCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)

  console.log('Top 10 users by order count:\n')
  
  for (const [userId, orderCount] of sortedUsers) {
    // Get wallet info
    const { data: wallet } = await supabase
      .from('clob_credentials')
      .select('polymarket_account_address')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get order breakdown
    const { data: orders } = await supabase
      .from('orders')
      .select('side, status')
      .eq('copy_user_id', userId)

    const buyCount = orders?.filter(o => o.side?.toUpperCase() === 'BUY').length || 0
    const sellCount = orders?.filter(o => o.side?.toUpperCase() === 'SELL').length || 0
    const statusCounts = orders?.reduce((acc: any, o: any) => {
      acc[o.status || 'NULL'] = (acc[o.status || 'NULL'] || 0) + 1
      return acc
    }, {})

    console.log(`User ID: ${userId}`)
    console.log(`  Wallet: ${wallet?.polymarket_account_address || 'N/A'}`)
    console.log(`  Total Orders: ${orderCount}`)
    console.log(`  BUY: ${buyCount}, SELL: ${sellCount}`)
    console.log(`  Status breakdown: ${JSON.stringify(statusCounts)}`)
    console.log('')
  }

  // Pick the most active user
  if (sortedUsers.length > 0) {
    const [activeUserId, activeCount] = sortedUsers[0]
    console.log(`\n✅ Most active user: ${activeUserId}`)
    console.log(`   Total orders: ${activeCount}`)
    console.log('\n💡 Use this user ID in the analysis script')
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
