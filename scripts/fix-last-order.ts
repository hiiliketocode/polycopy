#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''

async function fixLastOrder() {
  console.log('🔧 Fixing Last Order with Wrong Price')
  console.log('=' .repeat(80))

  const ORDER_ID = '0x48730a7581585dd199819eee67b7976841e8599fbce77e4d4614204bf0fa9aad'

  // Get the order
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('order_id', ORDER_ID)
    .single()

  if (!order) {
    console.log('❌ Order not found')
    return
  }

  console.log(`\n📦 Order Details:`)
  console.log(`   ID: ${order.order_id}`)
  console.log(`   Market: ${order.market_id}`)
  console.log(`   Outcome: ${order.outcome}`)
  console.log(`   Current Price: ${order.current_price}`)
  console.log(`   Amount: $${Number(order.amount_invested || 0).toFixed(2)}`)

  // Get market data
  const { data: market } = await supabase
    .from('markets')
    .select('condition_id, outcome_prices, resolved_outcome, winning_side')
    .eq('condition_id', order.market_id)
    .single()

  if (!market) {
    console.log('❌ Market not found in database')
    return
  }

  console.log(`\n📊 Market Data:`)
  console.log(`   Resolved Outcome: ${market.resolved_outcome || 'null'}`)
  console.log(`   Winning Side: ${market.winning_side || 'null'}`)
  console.log(`   Outcome Prices:`, market.outcome_prices)

  // Determine correct price
  let correctPrice: number | null = null

  if (market.outcome_prices && typeof market.outcome_prices === 'object') {
    const outcomePrices = market.outcome_prices as any
    if (outcomePrices.outcomes && outcomePrices.outcomePrices) {
      const outcomes = outcomePrices.outcomes as string[]
      const prices = outcomePrices.outcomePrices as string[]
      
      const normalizedOrderOutcome = normalize(order.outcome)
      const outcomeIndex = outcomes.findIndex((o: string) => normalize(o) === normalizedOrderOutcome)

      if (outcomeIndex !== -1) {
        const price = Number(prices[outcomeIndex])
        
        // If price is 0 or 1, use it
        if (price === 0 || price === 1) {
          correctPrice = price
        } else {
          // Check if there's a clear winner
          const numPrices = prices.map(p => Number(p))
          const maxPrice = Math.max(...numPrices)
          
          if (maxPrice >= 0.99) {
            correctPrice = numPrices[outcomeIndex] === maxPrice ? 1 : 0
          }
        }
      }
    }
  }

  if (correctPrice === null) {
    console.log('\n❌ Could not determine correct price from market data')
    console.log('   You may need to manually check this market on Polymarket')
    return
  }

  console.log(`\n✅ Correct price determined: ${correctPrice}`)

  // Update the order
  const { error } = await supabase
    .from('orders')
    .update({ current_price: correctPrice })
    .eq('order_id', ORDER_ID)

  if (error) {
    console.error('❌ Error updating order:', error)
    return
  }

  console.log('✅ Order updated successfully!')
  console.log('\n' + '='.repeat(80))
}

fixLastOrder().catch(console.error)
