#!/usr/bin/env node
'use strict'

/**
 * Count trades for top N traders before creating the table.
 * 
 * Usage:
 *   node scripts/count-top-traders-trades.js --top-n 20 --window ALL
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '20')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || 'ALL'

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function getTopTradersByRank(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized PnL rank (window: ${window})...`)
  
  // Get top traders directly from rankings table (already sorted by PnL)
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) return []
  
  // Get volume from wallet_realized_pnl_daily to calculate ROI
  const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  
  const { data: dailyData, error: dailyError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, notional_total')
    .in('wallet_address', wallets)
  
  if (dailyError) throw dailyError
  
  const volumeMap = new Map()
  ;(dailyData || []).forEach(row => {
    const wallet = row.wallet_address?.toLowerCase()
    if (!wallet) return
    const vol = toNumber(row.notional_total) || 0
    volumeMap.set(wallet, (volumeMap.get(wallet) || 0) + vol)
  })
  
  const traders = rankings
    .slice(0, limit) // Only take the top N by rank
    .map(r => {
      const wallet = r.wallet_address?.toLowerCase()
      const pnl = toNumber(r.pnl_sum) || 0
      const volume = volumeMap.get(wallet) || 0
      const roi = volume > 0 ? (pnl / volume) * 100 : 0
      return { wallet, pnl, volume, roi, rank: r.rank }
    })
  
  console.log(`✅ Found ${traders.length} traders`)
  return traders
}

async function getTradeCounts(wallets) {
  console.log(`\n📊 Counting trades for ${wallets.length} traders...`)
  
  // Try case-insensitive matching - check both lowercase and original case
  // First, get sample of wallet addresses from trades to see the format
  const { data: sample, error: sampleError } = await supabase
    .from('trades')
    .select('wallet_address')
    .limit(10)
  
  if (sampleError) throw sampleError
  
  console.log(`  📝 Sample wallet format from trades: ${sample?.[0]?.wallet_address || 'N/A'}`)
  console.log(`  📝 Sample wallet from rankings: ${wallets[0] || 'N/A'}`)
  
  // Get total count - use LOWER() for case-insensitive matching
  // Since Supabase client doesn't support LOWER() directly, we'll query each wallet
  let totalCount = 0
  const traderCounts = new Map()
  
  for (const wallet of wallets) {
    // Try exact match first
    const { count: exactCount, error: exactError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', wallet)
    
    if (!exactError && exactCount) {
      totalCount += exactCount
      traderCounts.set(wallet, exactCount)
      continue
    }
    
    // Try case-insensitive by checking both cases
    const walletUpper = wallet.toUpperCase()
    const { count: upperCount, error: upperError } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('wallet_address', walletUpper)
    
    if (!upperError && upperCount) {
      totalCount += upperCount
      traderCounts.set(wallet, upperCount)
    } else {
      traderCounts.set(wallet, 0)
    }
  }
  
  // Get date range
  const { data: dateRange, error: dateError } = await supabase
    .from('trades')
    .select('timestamp')
    .in('wallet_address', wallets)
    .order('timestamp', { ascending: true })
    .limit(1)
  
  const { data: dateRangeMax, error: dateMaxError } = await supabase
    .from('trades')
    .select('timestamp')
    .in('wallet_address', wallets)
    .order('timestamp', { ascending: false })
    .limit(1)
  
  return {
    totalCount: totalCount || 0,
    traderCounts,
    earliestTrade: dateRange?.[0]?.timestamp,
    latestTrade: dateRangeMax?.[0]?.timestamp,
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('📊 Counting trades for top traders')
  console.log('='.repeat(60))
  console.log(`👥 Top N: ${TOP_N}`)
  console.log(`📅 Window: ${WINDOW}`)
  console.log('')
  
  try {
    // Get top traders
    const traders = await getTopTradersByRank(TOP_N, WINDOW)
    
    if (traders.length === 0) {
      console.log('❌ No traders found')
      return
    }
    
    const wallets = traders.map(t => t.wallet.toLowerCase())
    
    console.log('\n📋 Top traders (showing first 10):')
    traders.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.wallet} - ROI: ${t.roi.toFixed(2)}%, PnL: $${t.pnl.toFixed(2)}, Volume: $${t.volume.toFixed(2)}`)
    })
    if (traders.length > 10) {
      console.log(`  ... and ${traders.length - 10} more`)
    }
    
    // Get trade counts
    const counts = await getTradeCounts(wallets)
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 Trade Count Summary')
    console.log('='.repeat(60))
    console.log(`✅ Total trades: ${counts.totalCount.toLocaleString()}`)
    console.log(`👥 Unique traders: ${traders.length}`)
    if (counts.earliestTrade) {
      console.log(`📅 Earliest trade: ${new Date(counts.earliestTrade).toISOString()}`)
    }
    if (counts.latestTrade) {
      console.log(`📅 Latest trade: ${new Date(counts.latestTrade).toISOString()}`)
    }
    console.log('')
    console.log('📊 Trades per trader:')
    traders.forEach((t, i) => {
      const tradeCount = counts.traderCounts.get(t.wallet.toLowerCase()) || 0
      const pct = counts.totalCount > 0 ? ((tradeCount / counts.totalCount) * 100).toFixed(1) : 0
      console.log(`  ${i + 1}. ${t.wallet}: ${tradeCount.toLocaleString()} trades (${pct}%)`)
    })
    console.log('')
    console.log('💡 This is the size of the table that would be created.')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
