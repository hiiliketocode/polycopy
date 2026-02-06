#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function fetchPolymarketClosedPositions() {
  console.log('🔍 Fetching Closed Positions from Polymarket API')
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

  // Fetch closed positions from Polymarket Data API
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=50`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    )

    if (!response.ok) {
      console.log(`❌ API Error: ${response.status} ${response.statusText}`)
      const text = await response.text()
      console.log('Response:', text)
      return
    }

    const closedPositions = await response.json()
    console.log(`\n✅ Fetched ${closedPositions.length} closed positions from Polymarket`)

    // Calculate total realized P&L
    let totalRealizedPnl = 0
    let winCount = 0
    let lossCount = 0

    console.log(`\n📊 Closed Positions:`)
    closedPositions.forEach((pos: any, i: number) => {
      const pnl = Number(pos.realizedPnl || 0)
      totalRealizedPnl += pnl
      
      if (pnl > 0) winCount++
      if (pnl < 0) lossCount++

      if (i < 10) { // Show first 10
        console.log(`   ${i + 1}. ${pos.outcome} - ${pos.title?.substring(0, 50)}`)
        console.log(`      Avg Price: ${pos.avgPrice}`)
        console.log(`      Total Bought: ${pos.totalBought}`)
        console.log(`      Realized P&L: $${pnl.toFixed(2)}`)
      }
    })

    console.log(`\n💰 Summary:`)
    console.log(`   Total Closed Positions: ${closedPositions.length}`)
    console.log(`   Winning Positions: ${winCount}`)
    console.log(`   Losing Positions: ${lossCount}`)
    console.log(`   Total Realized P&L: $${totalRealizedPnl.toFixed(2)}`)
    
    console.log(`\n🔄 Comparison:`)
    console.log(`   Polymarket shows: -$158.11`)
    console.log(`   Closed positions P&L: $${totalRealizedPnl.toFixed(2)}`)
    console.log(`   Difference: $${(totalRealizedPnl - (-158.11)).toFixed(2)}`)

  } catch (error) {
    console.error('❌ Error fetching closed positions:', error)
  }

  console.log('\n' + '='.repeat(80))
}

fetchPolymarketClosedPositions().catch(console.error)
