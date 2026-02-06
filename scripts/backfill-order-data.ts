#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fetch from 'node-fetch'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
const CLOB_API_BASE = 'https://clob.polymarket.com'

interface ClobOrder {
  id: string
  market: string
  asset_id: string
  price: string
  size: string
  side: string
  outcome: string
  status: string
  created_at: string
  updated_at: string
}

async function fetchOrderFromClob(orderId: string): Promise<ClobOrder | null> {
  try {
    const response = await fetch(`${CLOB_API_BASE}/order/${orderId}`)
    if (!response.ok) {
      console.log(`   ⚠️  Failed to fetch order ${orderId}: ${response.status}`)
      return null
    }
    const data = await response.json() as ClobOrder
    return data
  } catch (error) {
    console.error(`   ❌ Error fetching order ${orderId}:`, error)
    return null
  }
}

async function backfillOrderData() {
  console.log('🔧 Backfilling Order Data from CLOB API')
  console.log('=' .repeat(80))

  // Get all orders missing asset_id
  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, asset_id, token_id, market_id, outcome, price, size, created_at')
    .eq('copy_user_id', USER_ID)
    .is('asset_id', null)
    .order('created_at', { ascending: true })

  if (!orders || orders.length === 0) {
    console.log('✅ All orders have asset_id!')
    return
  }

  console.log(`\n📦 Found ${orders.length} orders missing asset_id`)
  console.log(`   Fetching data from CLOB API (this may take a while)...`)

  let successCount = 0
  let failCount = 0
  const updates: Array<{ order_id: string; asset_id: string }> = []

  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5
  const DELAY_MS = 500

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE)
    console.log(`\n   Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(orders.length / BATCH_SIZE)}...`)

    const results = await Promise.all(
      batch.map(async (order) => {
        const clobData = await fetchOrderFromClob(order.order_id)
        if (clobData) {
          return {
            order_id: order.order_id,
            asset_id: clobData.asset_id,
            market: clobData.market,
            price: clobData.price,
            size: clobData.size,
            outcome: clobData.outcome
          }
        }
        return null
      })
    )

    for (const result of results) {
      if (result) {
        updates.push({
          order_id: result.order_id,
          asset_id: result.asset_id
        })
        successCount++
        console.log(`   ✅ ${result.order_id}: ${result.asset_id}`)
      } else {
        failCount++
      }
    }

    // Rate limit
    if (i + BATCH_SIZE < orders.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS))
    }
  }

  console.log(`\n\n📊 Summary:`)
  console.log(`   ✅ Successfully fetched: ${successCount}`)
  console.log(`   ❌ Failed to fetch: ${failCount}`)

  if (updates.length > 0) {
    console.log(`\n💾 Updating database with ${updates.length} asset_ids...`)

    let updateCount = 0
    for (const update of updates) {
      const { error } = await supabase
        .from('orders')
        .update({ asset_id: update.asset_id })
        .eq('order_id', update.order_id)

      if (error) {
        console.error(`   ❌ Failed to update ${update.order_id}:`, error)
      } else {
        updateCount++
      }
    }

    console.log(`   ✅ Updated ${updateCount} orders in database`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🎉 Backfill complete!')
}

backfillOrderData().catch(console.error)
