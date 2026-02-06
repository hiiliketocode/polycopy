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

async function refreshPortfolio() {
  console.log('🔄 Forcing Portfolio Refresh')
  console.log('=' .repeat(80))

  // 1. Clear the cache
  console.log('\n🗑️  Clearing portfolio cache...')
  const { error: deleteError } = await supabase
    .from('user_portfolio_summary')
    .delete()
    .eq('user_id', USER_ID)

  if (deleteError) {
    console.error('Error clearing cache:', deleteError)
  } else {
    console.log('✅ Cache cleared')
  }

  // 2. Call the API with forceRefresh
  console.log('\n🔄 Calling portfolio stats API...')
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const url = `${baseUrl}/api/portfolio/stats?userId=${USER_ID}&forceRefresh=true&debug=true`
  
  console.log(`   URL: ${url}`)
  console.log('   (This may take 30-60 seconds...)')
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    })

    if (!response.ok) {
      console.error(`❌ API call failed: ${response.status} ${response.statusText}`)
      const text = await response.text()
      console.error('Response:', text)
      return
    }

    const data = await response.json() as any
    
    console.log('\n✅ API Response:')
    console.log(`   Total P&L: $${Number(data.totalPnl || 0).toFixed(2)}`)
    console.log(`   Realized P&L: $${Number(data.realizedPnl || 0).toFixed(2)}`)
    console.log(`   Unrealized P&L: $${Number(data.unrealizedPnl || 0).toFixed(2)}`)
    console.log(`   Total Volume: $${Number(data.totalVolume || 0).toFixed(2)}`)
    console.log(`   ROI: ${Number(data.roi || 0).toFixed(2)}%`)
    console.log(`   Win Rate: ${Number(data.winRate || 0).toFixed(1)}%`)
    console.log(`   Open Positions: ${data.openTrades || 0}`)
    console.log(`   Closed Positions: ${data.closedTrades || 0}`)

  } catch (error) {
    console.error('❌ Error calling API:', error)
  }

  console.log('\n' + '='.repeat(80))
}

refreshPortfolio().catch(console.error)
