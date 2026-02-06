#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function fetchAllClosedPositions() {
  console.log('🔍 Fetching ALL Closed Positions from Polymarket API')
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

  // Fetch ALL closed positions with pagination
  let allPositions: any[] = []
  let offset = 0
  const limit = 50
  let hasMore = true

  try {
    while (hasMore) {
      console.log(`   Fetching batch at offset ${offset}...`)
      
      const response = await fetch(
        `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Accept': 'application/json'
          }
        }
      )

      if (!response.ok) {
        console.log(`❌ API Error: ${response.status} ${response.statusText}`)
        break
      }

      const batch = await response.json()
      allPositions = allPositions.concat(batch)
      
      console.log(`   Got ${batch.length} positions (total: ${allPositions.length})`)
      
      // Check if there are more
      if (batch.length < limit) {
        hasMore = false
      } else {
        offset += limit
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    console.log(`\n✅ Fetched ${allPositions.length} total closed positions`)

    // Calculate stats
    let totalRealizedPnl = 0
    let winCount = 0
    let lossCount = 0
    let biggestWin = { pnl: 0, pos: null as any }
    let biggestLoss = { pnl: 0, pos: null as any }

    allPositions.forEach((pos: any) => {
      const pnl = Number(pos.realizedPnl || 0)
      totalRealizedPnl += pnl
      
      if (pnl > 0) {
        winCount++
        if (pnl > biggestWin.pnl) {
          biggestWin = { pnl, pos }
        }
      }
      if (pnl < 0) {
        lossCount++
        if (pnl < biggestLoss.pnl) {
          biggestLoss = { pnl, pos }
        }
      }
    })

    console.log(`\n💰 Summary:`)
    console.log(`   Total Closed Positions: ${allPositions.length}`)
    console.log(`   Winning Positions: ${winCount}`)
    console.log(`   Losing Positions: ${lossCount}`)
    console.log(`   Win Rate: ${((winCount / allPositions.length) * 100).toFixed(1)}%`)
    console.log(`   Total Realized P&L: $${totalRealizedPnl.toFixed(2)}`)
    
    if (biggestWin.pos) {
      console.log(`\n🏆 Biggest Win: $${biggestWin.pnl.toFixed(2)}`)
      console.log(`   ${biggestWin.pos.outcome} - ${biggestWin.pos.title}`)
    }
    
    if (biggestLoss.pos) {
      console.log(`\n📉 Biggest Loss: $${biggestLoss.pnl.toFixed(2)}`)
      console.log(`   ${biggestLoss.pos.outcome} - ${biggestLoss.pos.title}`)
    }
    
    console.log(`\n🔄 Comparison with Polymarket:`)
    console.log(`   Polymarket shows: -$158.11`)
    console.log(`   API Closed positions: $${totalRealizedPnl.toFixed(2)}`)
    console.log(`   Difference: $${(totalRealizedPnl - (-158.11)).toFixed(2)}`)

    // Show sample of losses if any
    if (lossCount > 0) {
      console.log(`\n📊 Sample losing positions:`)
      allPositions
        .filter((pos: any) => Number(pos.realizedPnl || 0) < 0)
        .slice(0, 10)
        .forEach((pos: any, i: number) => {
          console.log(`   ${i + 1}. ${pos.outcome} - ${pos.title?.substring(0, 50)}`)
          console.log(`      P&L: $${Number(pos.realizedPnl).toFixed(2)}`)
        })
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }

  console.log('\n' + '='.repeat(80))
}

fetchAllClosedPositions().catch(console.error)
