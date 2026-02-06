#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function checkMarketsTable() {
  console.log('🔍 Checking Markets Table for Resolution Data')
  console.log('=' .repeat(80))

  // Get all resolved orders
  const { data: resolvedOrders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, current_price, market_resolved, resolved_outcome, amount_invested')
    .eq('copy_user_id', USER_ID)
    .eq('market_resolved', true)

  if (!resolvedOrders) {
    console.log('❌ No resolved orders found')
    return
  }

  console.log(`\n📦 Found ${resolvedOrders.length} resolved orders`)

  // Get unique market_ids
  const marketIds = [...new Set(resolvedOrders.map(o => o.market_id).filter(Boolean))] as string[]
  console.log(`   Across ${marketIds.length} unique markets`)

  // Fetch market data
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, resolved_outcome, winning_side, outcome_prices, closed')
    .in('condition_id', marketIds)

  console.log(`\n📊 Market resolution data in markets table:`)
  console.log(`   Found ${markets?.length || 0} markets in database`)

  if (!markets) {
    console.log('   ❌ No market data found')
    return
  }

  // Check how many have resolution data
  const withResolution = markets.filter(m => m.resolved_outcome || m.winning_side)
  const withOutcomePrices = markets.filter(m => m.outcome_prices)
  
  console.log(`   - With resolved_outcome or winning_side: ${withResolution.length}`)
  console.log(`   - With outcome_prices: ${withOutcomePrices.length}`)

  // Create a map for easy lookup
  const marketMap = new Map(markets.map(m => [m.condition_id, m]))

  // Check each resolved order
  const needsPriceUpdate: any[] = []
  const canBeResolved: any[] = []

  for (const order of resolvedOrders) {
    if (!order.market_id) continue

    const market = marketMap.get(order.market_id)
    if (!market) {
      needsPriceUpdate.push({
        order_id: order.order_id,
        market_id: order.market_id,
        reason: 'market_not_in_db',
        amount: order.amount_invested
      })
      continue
    }

    // Check if we can determine resolution price
    const hasResolution = market.resolved_outcome || market.winning_side
    const hasOutcomePrices = market.outcome_prices && 
      typeof market.outcome_prices === 'object' &&
      'outcomes' in market.outcome_prices &&
      'outcomePrices' in market.outcome_prices

    if (hasResolution || hasOutcomePrices) {
      // We have data to calculate resolution price
      if (order.current_price !== 0 && order.current_price !== 1) {
        canBeResolved.push({
          order_id: order.order_id,
          market_id: order.market_id,
          outcome: order.outcome,
          current_price: order.current_price,
          market_resolution: market.resolved_outcome || market.winning_side,
          outcome_prices: hasOutcomePrices ? market.outcome_prices : null,
          amount: order.amount_invested
        })
      }
    } else {
      needsPriceUpdate.push({
        order_id: order.order_id,
        market_id: order.market_id,
        reason: 'no_resolution_data',
        amount: order.amount_invested
      })
    }
  }

  console.log(`\n\n✅ Orders with resolution data available: ${canBeResolved.length}`)
  if (canBeResolved.length > 0) {
    const total = canBeResolved.reduce((sum, o) => sum + Number(o.amount || 0), 0)
    console.log(`   Total investment: $${total.toFixed(2)}`)
    console.log(`   These can be fixed by updating current_price based on resolution`)
  }

  console.log(`\n❌ Orders missing resolution data: ${needsPriceUpdate.length}`)
  if (needsPriceUpdate.length > 0) {
    const total = needsPriceUpdate.reduce((sum, o) => sum + Number(o.amount || 0), 0)
    console.log(`   Total investment: $${total.toFixed(2)}`)
    
    const byReason = needsPriceUpdate.reduce((acc, o) => {
      acc[o.reason] = (acc[o.reason] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log(`   Reasons:`, byReason)
  }

  // Sample orders that can be resolved
  if (canBeResolved.length > 0) {
    console.log(`\n\n📋 Sample orders that can be fixed (first 5):`)
    canBeResolved.slice(0, 5).forEach((o, i) => {
      console.log(`   ${i + 1}. Order ${o.order_id}`)
      console.log(`      Market: ${o.market_id.substring(0, 20)}...`)
      console.log(`      Outcome: ${o.outcome}`)
      console.log(`      Current price: ${o.current_price}`)
      console.log(`      Market resolution: ${o.market_resolution}`)
      console.log(`      Amount: $${Number(o.amount || 0).toFixed(2)}`)
    })
  }

  console.log('\n' + '='.repeat(80))
}

checkMarketsTable().catch(console.error)
