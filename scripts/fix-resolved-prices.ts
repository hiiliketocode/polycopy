#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

async function fixResolvedPrices() {
  console.log('🔧 Fixing Resolved Market Prices')
  console.log('=' .repeat(80))

  // Get all resolved orders
  const { data: resolvedOrders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, current_price, market_resolved, amount_invested')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)

  if (!resolvedOrders) {
    console.log('❌ No resolved orders found')
    return
  }

  console.log(`\n📦 Found ${resolvedOrders.length} resolved orders`)

  // Get unique market_ids
  const marketIds = [...new Set(resolvedOrders.map(o => o.market_id).filter(Boolean))] as string[]

  // Fetch market data
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, outcome_prices')
    .in('condition_id', marketIds)

  if (!markets) {
    console.log('❌ No market data found')
    return
  }

  const marketMap = new Map(markets.map(m => [m.condition_id, m]))

  const updates: Array<{ order_id: string; new_price: number; old_price: number }> = []
  let skipped = 0

  console.log(`\n🔍 Analyzing orders...`)

  for (const order of resolvedOrders) {
    if (!order.market_id) continue

    const market = marketMap.get(order.market_id)
    if (!market || !market.outcome_prices) {
      skipped++
      continue
    }

    const outcomePrices = market.outcome_prices as any
    if (!outcomePrices.outcomes || !outcomePrices.outcomePrices) {
      skipped++
      continue
    }

    // Find the outcome price for this order
    const outcomes = outcomePrices.outcomes as string[]
    const prices = outcomePrices.outcomePrices as string[]
    
    const normalizedOrderOutcome = normalize(order.outcome)
    const outcomeIndex = outcomes.findIndex((o: string) => normalize(o) === normalizedOrderOutcome)

    if (outcomeIndex === -1) {
      console.log(`   ⚠️  Could not find outcome "${order.outcome}" in market ${order.market_id.substring(0, 20)}`)
      skipped++
      continue
    }

    const correctPrice = Number(prices[outcomeIndex])
    
    // Only update if price is wrong (should be 0 or 1 for resolved markets)
    if (correctPrice === 0 || correctPrice === 1) {
      if (order.current_price !== correctPrice) {
        updates.push({
          order_id: order.order_id,
          new_price: correctPrice,
          old_price: order.current_price
        })
      }
    } else {
      // Price is not 0 or 1, try to infer from all prices
      // If one price is very close to 1 and others close to 0, we can infer resolution
      const numPrices = prices.map(p => Number(p))
      const hasWinner = numPrices.some(p => p >= 0.99)
      
      if (hasWinner) {
        // Find the winning price (closest to 1)
        const maxPrice = Math.max(...numPrices)
        const isWinner = numPrices[outcomeIndex] === maxPrice
        const inferredPrice = isWinner ? 1 : 0
        
        if (order.current_price !== inferredPrice) {
          updates.push({
            order_id: order.order_id,
            new_price: inferredPrice,
            old_price: order.current_price
          })
        }
      } else {
        skipped++
      }
    }
  }

  console.log(`\n📊 Analysis complete:`)
  console.log(`   - Orders to update: ${updates.length}`)
  console.log(`   - Skipped (no data): ${skipped}`)

  if (updates.length === 0) {
    console.log(`\n✅ All prices are already correct!`)
    return
  }

  console.log(`\n💾 Updating ${updates.length} orders...`)

  const winUpdates = updates.filter(u => u.new_price === 1)
  const lossUpdates = updates.filter(u => u.new_price === 0)
  
  console.log(`   - Setting to WIN (1.0): ${winUpdates.length} orders`)
  console.log(`   - Setting to LOSS (0.0): ${lossUpdates.length} orders`)

  let updateCount = 0
  let errorCount = 0

  for (const update of updates) {
    const { error } = await supabase
      .from('orders')
      .update({ current_price: update.new_price })
      .eq('order_id', update.order_id)

    if (error) {
      console.error(`   ❌ Failed to update ${update.order_id}:`, error.message)
      errorCount++
    } else {
      updateCount++
    }
  }

  console.log(`\n✅ Successfully updated ${updateCount} orders`)
  if (errorCount > 0) {
    console.log(`❌ Failed to update ${errorCount} orders`)
  }

  console.log('\n' + '='.repeat(80))
  console.log('🎉 Price fix complete!')
  console.log('\n💡 Next steps:')
  console.log('   1. Visit portfolio page to trigger fresh P&L calculation')
  console.log('   2. Or call: /api/portfolio/stats?userId=...&forceRefresh=true')
}

fixResolvedPrices().catch(console.error)
