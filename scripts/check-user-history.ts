#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function checkUserHistory() {
  console.log('🔍 Checking User Trading History')
  console.log('=' .repeat(80))

  // Get user's earliest order in Polycopy
  const { data: firstOrder } = await supabase
    .from('orders')
    .select('created_at, market_id, outcome')
    .eq('copy_user_id', USER_ID)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstOrder) {
    console.log(`\n📅 First order in Polycopy: ${firstOrder.created_at}`)
  }

  // Get user's wallet address
  const { data: cred } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cred) {
    console.log(`📅 Wallet connected: ${cred.created_at}`)
  }

  // Fetch sample of unmatched positions with timestamps
  const walletAddress = cred?.polymarket_account_address
  const response = await fetch(
    `https://data-api.polymarket.com/closed-positions?user=${walletAddress}&limit=182&offset=235`,
    { headers: { 'Accept': 'application/json' } }
  )

  const unmatchedPositions = await response.json()
  
  console.log(`\n📊 Analyzing ${unmatchedPositions.length} unmatched positions`)
  
  // Check if positions have timestamps
  const withTimestamps = unmatchedPositions.filter((p: any) => p.createdAt || p.closedAt)
  console.log(`   With timestamps: ${withTimestamps.length}`)

  // Sort by creation date if available
  const sorted = withTimestamps.sort((a: any, b: any) => {
    const dateA = new Date(a.createdAt || a.closedAt).getTime()
    const dateB = new Date(b.createdAt || b.closedAt).getTime()
    return dateA - dateB
  })

  if (sorted.length > 0) {
    console.log(`\n📅 Date range of unmatched positions:`)
    console.log(`   Earliest: ${sorted[0].createdAt || sorted[0].closedAt}`)
    console.log(`   Latest: ${sorted[sorted.length - 1].createdAt || sorted[sorted.length - 1].closedAt}`)
    
    if (firstOrder?.created_at) {
      const firstOrderDate = new Date(firstOrder.created_at)
      const beforeFirst = sorted.filter((p: any) => {
        const posDate = new Date(p.createdAt || p.closedAt)
        return posDate < firstOrderDate
      })
      console.log(`\n🔍 Unmatched positions opened BEFORE first Polycopy order: ${beforeFirst.length}`)
      console.log(`🔍 Unmatched positions opened AFTER first Polycopy order: ${sorted.length - beforeFirst.length}`)
    }
  }

  // Sample 5 unmatched positions with full details
  console.log(`\n📝 Sample unmatched positions (first 5):`)
  for (let i = 0; i < Math.min(5, unmatchedPositions.length); i++) {
    const pos = unmatchedPositions[i]
    console.log(`\n${i + 1}. ${pos.market?.question || 'Unknown market'}`)
    console.log(`   Market ID: ${pos.conditionId}`)
    console.log(`   Outcome: ${pos.outcome}`)
    console.log(`   Realized P&L: $${Number(pos.realizedPnl || 0).toFixed(2)}`)
    console.log(`   Created: ${pos.createdAt || 'N/A'}`)
    console.log(`   Closed: ${pos.closedAt || 'N/A'}`)
  }

  console.log('\n' + '='.repeat(80))
}

checkUserHistory().catch(console.error)
