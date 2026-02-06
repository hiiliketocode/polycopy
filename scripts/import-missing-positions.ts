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

async function importMissingPositions() {
  console.log('📥 Importing Missing Polymarket Positions')
  console.log('=' .repeat(80))

  // Get user's wallet address
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const walletAddress = cred?.polymarket_account_address
  if (!walletAddress) {
    console.log('❌ No wallet address found')
    return
  }

  console.log(`\n💳 Wallet: ${walletAddress}`)

  // Get trader_id for this wallet
  const { data: trader } = await supabase
    .from('traders')
    .select('id')
    .eq('wallet_address', walletAddress)
    .maybeSingle()

  if (!trader) {
    console.log('❌ No trader record found for wallet')
    return
  }

  const traderId = trader.id
  console.log(`👤 Trader ID: ${traderId}`)

  // Fetch ALL closed positions
  let allPositions: any[] = []
  let offset = 0
  const limit = 50

  try {
    while (true) {
      const response = await fetch(
        `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=${limit}&offset=${offset}`,
        { headers: { 'Accept': 'application/json' } }
      )

      if (!response.ok) break

      const batch = await response.json()
      allPositions = allPositions.concat(batch)
      
      if (batch.length < limit) break
      offset += limit
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    console.log(`✅ Fetched ${allPositions.length} closed positions\n`)

    // Get all existing orders
    const { data: orders } = await supabase
      .from('orders')
      .select('order_id, market_id, outcome, side')
      .eq('copy_user_id', USER_ID)

    console.log(`📦 Found ${orders?.length || 0} existing orders in database\n`)

    // Find unmatched positions
    const unmatchedPositions: any[] = []
    const matchedPositions: any[] = []

    for (const position of allPositions) {
      const conditionId = position.conditionId
      const outcome = position.outcome

      const matchingOrders = (orders || []).filter(o => 
        o.market_id === conditionId && 
        normalize(o.outcome) === normalize(outcome) &&
        o.side?.toLowerCase() === 'buy'
      )

      if (matchingOrders.length === 0) {
        unmatchedPositions.push(position)
      } else {
        matchedPositions.push(position)
      }
    }

    console.log(`✅ Already matched: ${matchedPositions.length} positions`)
    console.log(`📥 Need to import: ${unmatchedPositions.length} positions\n`)

    // Calculate P&L
    const unmatchedPnl = unmatchedPositions.reduce((sum, p) => sum + Number(p.realizedPnl || 0), 0)
    console.log(`💰 P&L from positions to import: $${unmatchedPnl.toFixed(2)}\n`)

    // Ask for confirmation
    console.log(`⚠️  This will create ${unmatchedPositions.length} new orders in the database`)
    console.log(`   These will be marked as trade_method='imported' to distinguish them\n`)

    // Import the positions
    console.log('🔄 Starting import...\n')

    let imported = 0
    let failed = 0

    for (const position of unmatchedPositions) {
      const realizedPnl = Number(position.realizedPnl || 0)
      const avgPrice = Number(position.avgPrice || 0)
      const totalBought = Number(position.totalBought || 0)
      const amountInvested = avgPrice * totalBought

      try {
        const { error } = await supabase
          .from('orders')
          .insert({
            order_id: `imported-${position.conditionId}-${normalize(position.outcome)}`,
            copy_user_id: USER_ID,
            trader_id: traderId,
            market_id: position.conditionId,
            outcome: position.outcome,
            side: 'buy',
            size: totalBought,
            filled_size: totalBought,
            price: avgPrice,
            price_when_copied: avgPrice,
            amount_invested: amountInvested,
            trade_method: 'imported',
            status: 'FILLED',
            polymarket_realized_pnl: realizedPnl,
            polymarket_avg_price: avgPrice,
            polymarket_total_bought: totalBought,
            polymarket_synced_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })

        if (error) {
          console.error(`   ❌ Failed to import ${position.conditionId}::${position.outcome}:`, error.message)
          failed++
        } else {
          imported++
          if (imported % 50 === 0) {
            console.log(`   ✅ Imported ${imported}/${unmatchedPositions.length}...`)
          }
        }
      } catch (err) {
        console.error(`   ❌ Error importing position:`, err)
        failed++
      }
    }

    console.log(`\n✅ Import complete!`)
    console.log(`   Successfully imported: ${imported}`)
    console.log(`   Failed: ${failed}`)
    console.log(`\n💡 Next step: Clear the cache and refresh the portfolio page`)

  } catch (error) {
    console.error('❌ Error:', error)
  }

  console.log('\n' + '='.repeat(80))
}

importMissingPositions().catch(console.error)
