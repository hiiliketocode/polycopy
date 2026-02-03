/**
 * Check status of a specific trader
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node check-trader-status.js <wallet_address>')
  process.exit(1)
}

async function checkTrader() {
  console.log(`🔍 Checking trader: ${wallet}\n`)
  
  // Check if in traders table
  const { data: trader, error: traderError } = await supabase
    .from('traders')
    .select('*')
    .eq('wallet_address', wallet)
    .single()
  
  if (traderError && traderError.code !== 'PGRST116') {
    console.error('❌ Error querying traders:', traderError)
    return
  }
  
  if (!trader) {
    console.log('❌ Trader NOT in traders table')
    console.log('\n💡 This trader needs to be added via the sync-leaderboard cron')
    
    // Check if they're on Polymarket leaderboard
    console.log('\n🔍 Checking Polymarket leaderboard...')
    try {
      const response = await fetch(
        `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${wallet}`,
        { cache: 'no-store' }
      )
      
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length > 0) {
          console.log('✅ Found on Polymarket leaderboard!')
          console.log('   Rank:', data[0].rank)
          console.log('   Name:', data[0].userName || 'Unknown')
          console.log('   PnL:', data[0].pnl)
          console.log('   Volume:', data[0].vol)
          console.log('\n💡 Run sync-leaderboard cron to add them')
        } else {
          console.log('⚠️  Not found in top leaderboard (may be outside top 1000)')
        }
      }
    } catch (err) {
      console.error('Error checking leaderboard:', err.message)
    }
    
    return
  }
  
  console.log('✅ Trader IS in traders table')
  console.log('\n📊 Trader Details:')
  console.log('   Wallet:', trader.wallet_address)
  console.log('   Display Name:', trader.display_name || 'N/A')
  console.log('   Is Active:', trader.is_active)
  console.log('   PnL:', trader.pnl ?? 'N/A')
  console.log('   Volume:', trader.volume ?? 'N/A')
  console.log('   ROI:', trader.roi ?? 'N/A')
  console.log('   Rank:', trader.rank ?? 'N/A')
  console.log('   Total Trades:', trader.total_trades ?? 'N/A')
  console.log('   Win Rate:', trader.win_rate ? `${(trader.win_rate * 100).toFixed(1)}%` : 'N/A')
  console.log('   Updated At:', trader.updated_at)
  console.log('   Created At:', trader.created_at)
  
  // Check PnL data
  console.log('\n📈 Checking PnL data...')
  const { data: pnlData, error: pnlError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('date, realized_pnl')
    .eq('wallet_address', wallet)
    .order('date', { ascending: false })
    .limit(10)
  
  if (pnlError) {
    console.error('❌ Error querying PnL:', pnlError)
  } else if (!pnlData || pnlData.length === 0) {
    console.log('⚠️  No PnL data found in wallet_realized_pnl_daily')
    console.log('💡 PnL backfill may still be running or wallet needs backfilling')
  } else {
    console.log(`✅ Found ${pnlData.length} recent PnL entries (showing latest 10):`)
    pnlData.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.date}: ${row.realized_pnl?.toFixed(2) ?? 'N/A'}`)
    })
  }
  
  // Check if they're in top 1000 leaderboard
  console.log('\n🏆 Checking current leaderboard position...')
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1000&offset=0&category=overall`,
      { cache: 'no-store' }
    )
    
    if (response.ok) {
      const data = await response.json()
      const found = data.find((t) => t.proxyWallet?.toLowerCase() === wallet)
      if (found) {
        console.log('✅ Currently in top 1000 leaderboard')
        console.log('   Rank:', found.rank)
        console.log('   PnL:', found.pnl)
        console.log('   Volume:', found.vol)
      } else {
        console.log('⚠️  Not currently in top 1000 leaderboard')
      }
    }
  } catch (err) {
    console.error('Error checking leaderboard:', err.message)
  }
  
  // Check follows
  console.log('\n👥 Checking followers...')
  const { count: followerCount, error: followError } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('trader_wallet', wallet)
  
  if (followError) {
    console.error('Error checking followers:', followError)
  } else {
    console.log(`   Followers: ${followerCount ?? 0}`)
  }
  
  console.log('\n' + '='.repeat(60))
  
  // Summary
  console.log('\n📋 Summary:')
  if (!trader.is_active) {
    console.log('⚠️  Trader is INACTIVE - this may prevent them from showing')
  }
  if (!trader.pnl && !trader.volume) {
    console.log('⚠️  Trader has no PnL/Volume data')
  }
  if (!pnlData || pnlData.length === 0) {
    console.log('⚠️  No daily PnL data - backfill may be needed')
  }
  
  console.log('\n✅ Trader should be visible if:')
  console.log('   1. is_active = true')
  console.log('   2. Has PnL/Volume data')
  console.log('   3. Is in top 1000 leaderboard (for discover page)')
}

checkTrader().catch(console.error)
