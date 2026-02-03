/**
 * Enrich a trader with Polymarket leaderboard data and backfill PnL
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node enrich-and-backfill-trader.js <wallet_address>')
  process.exit(1)
}

async function enrichTraderFromLeaderboard() {
  console.log(`\n🔍 Fetching trader data from Polymarket leaderboard...`)
  
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${wallet}`,
      { cache: 'no-store' }
    )
    
    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`)
    }
    
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) {
      console.log('⚠️  Trader not found in Polymarket leaderboard')
      return null
    }
    
    const entry = data[0]
    console.log('✅ Found trader data:')
    console.log(`   Name: ${entry.userName || 'N/A'}`)
    console.log(`   Rank: ${entry.rank || 'N/A'}`)
    console.log(`   PnL: ${entry.pnl ?? 'N/A'}`)
    console.log(`   Volume: ${entry.vol ?? 'N/A'}`)
    
    // Update trader with leaderboard data
    const updates = {
      updated_at: new Date().toISOString(),
      is_active: true
    }
    
    if (entry.userName) updates.display_name = entry.userName
    if (entry.profileImage) updates.profile_image = entry.profileImage
    if (entry.xUsername) updates.x_username = entry.xUsername
    if (entry.verifiedBadge !== null && entry.verifiedBadge !== undefined) {
      updates.verified_badge = entry.verifiedBadge
    }
    
    const pnl = entry.pnl ? Number(entry.pnl) : null
    if (pnl !== null) updates.pnl = pnl
    
    const volume = entry.vol ? Number(entry.vol) : null
    if (volume !== null) updates.volume = volume
    
    const rank = entry.rank ? Number(entry.rank) : null
    if (rank !== null) updates.rank = Math.trunc(rank)
    
    if (pnl !== null && volume !== null && volume > 0) {
      updates.roi = Math.round((pnl / volume) * 10000) / 100
    }
    
    const marketsTraded = entry.marketsTraded ?? entry.markets_traded
    if (marketsTraded) updates.markets_traded = Math.trunc(Number(marketsTraded))
    
    const totalTrades = entry.totalTrades ?? entry.total_trades
    if (totalTrades) updates.total_trades = Math.trunc(Number(totalTrades))
    
    const winRate = entry.winRate ?? entry.win_rate
    if (winRate !== null && winRate !== undefined) {
      updates.win_rate = Number(winRate)
    }
    
    const lastSeenAt = entry.lastSeenAt ?? entry.last_seen_at
    if (lastSeenAt) {
      const ms = lastSeenAt < 1_000_000_000_000 ? lastSeenAt * 1000 : lastSeenAt
      updates.last_seen_at = new Date(ms).toISOString()
    }
    
    // Get follower count
    const { count } = await supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('trader_wallet', wallet)
    
    if (count !== null) updates.follower_count = count
    
    // Update trader
    const { error: updateError } = await supabase
      .from('traders')
      .update(updates)
      .eq('wallet_address', wallet)
    
    if (updateError) {
      throw updateError
    }
    
    console.log('\n✅ Trader data updated in database')
    return entry
    
  } catch (error) {
    console.error('❌ Error enriching trader:', error.message)
    return null
  }
}

async function backfillPnL() {
  if (!DOME_API_KEY) {
    console.log('\n⚠️  DOME_API_KEY not set, skipping PnL backfill')
    console.log('   PnL will be backfilled by the daily cron job')
    return
  }
  
  console.log('\n📊 Backfilling PnL data from Dome API...')
  
  try {
    // Import and run the backfill script for this specific wallet
    process.env.WALLET = wallet
    
    const mod = await import('./scripts/backfill-wallet-pnl.js')
    const { runBackfillWalletPnl } = mod
    
    if (typeof runBackfillWalletPnl !== 'function') {
      throw new Error('Backfill function not found')
    }
    
    const result = await runBackfillWalletPnl()
    console.log('\n✅ PnL backfill completed')
    console.log(`   Processed: ${result.processed} wallet(s)`)
    console.log(`   Rows upserted: ${result.totalRows}`)
    
  } catch (error) {
    console.error('❌ Error backfilling PnL:', error.message)
    console.log('   PnL will be backfilled by the daily cron job')
  } finally {
    delete process.env.WALLET
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log(`🚀 ENRICHING AND BACKFILLING TRADER`)
  console.log('='.repeat(60))
  console.log(`Wallet: ${wallet}`)
  
  // Step 1: Enrich from leaderboard
  const leaderboardData = await enrichTraderFromLeaderboard()
  
  // Step 2: Backfill PnL
  await backfillPnL()
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ COMPLETE')
  console.log('='.repeat(60))
  console.log('\n💡 Trader should now be visible on the site')
}

main().catch(console.error)
