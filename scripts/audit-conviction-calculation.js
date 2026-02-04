#!/usr/bin/env node
'use strict'

/**
 * Audit conviction score calculation
 * 
 * Checks:
 * 1. Sample traders' avg bet sizes vs current trade sizes
 * 2. Conviction calculations for sample trades
 * 3. Distribution of conviction scores
 * 4. Whether averages seem inflated
 * 
 * Usage:
 *   node scripts/audit-conviction-calculation.js [wallet]
 */

const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function auditTraderStats(wallet) {
  console.log('\n' + '='.repeat(70))
  console.log('AUDITING TRADER STATS FOR CONVICTION CALCULATION')
  console.log('='.repeat(70))
  
  if (wallet) {
    console.log(`\nAuditing wallet: ${wallet}\n`)
  } else {
    console.log('\nAuditing sample traders\n')
  }

  // Fetch trader stats
  const wallets = wallet ? [wallet] : []
  if (!wallet) {
    // Get top traders
    const { data: traders } = await supabase
      .from('traders')
      .select('wallet')
      .limit(10)
    
    if (traders) {
      wallets.push(...traders.map(t => t.wallet))
    }
  }

  if (wallets.length === 0) {
    console.log('No wallets to audit')
    return
  }

  for (const w of wallets.slice(0, 5)) {
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`Wallet: ${w.substring(0, 12)}...`)
    console.log(`${'─'.repeat(70)}`)

    // Get global stats
    const { data: globalStats } = await supabase
      .from('trader_global_stats')
      .select('*')
      .eq('wallet_address', w)
      .maybeSingle()

    if (!globalStats) {
      console.log('  ⚠️  No global stats found')
      continue
    }

    console.log('\nGlobal Stats:')
    console.log(`  avg_bet_size_usdc: ${globalStats.avg_bet_size_usdc || 'NULL'}`)
    console.log(`  l_avg_trade_size_usd: ${globalStats.l_avg_trade_size_usd || 'NULL'}`)
    console.log(`  l_avg_pos_size_usd: ${globalStats.l_avg_pos_size_usd || 'NULL'}`)
    console.log(`  d30_avg_trade_size_usd: ${globalStats.d30_avg_trade_size_usd || 'NULL'}`)
    console.log(`  l_count: ${globalStats.l_count || 0}`)
    console.log(`  d30_count: ${globalStats.d30_count || 0}`)

    // Get recent trades to compare
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('price, shares_normalized, side')
      .eq('wallet_address', w)
      .eq('side', 'BUY')
      .order('timestamp', { ascending: false })
      .limit(20)

    if (!recentTrades || recentTrades.length === 0) {
      console.log('\n  ⚠️  No recent trades found')
      continue
    }

    const tradeSizes = recentTrades
      .map(t => Number(t.price) * Number(t.shares_normalized))
      .filter(s => s > 0)

    if (tradeSizes.length === 0) {
      console.log('\n  ⚠️  No valid trade sizes')
      continue
    }

    const avgTradeSize = tradeSizes.reduce((a, b) => a + b, 0) / tradeSizes.length
    const medianTradeSize = [...tradeSizes].sort((a, b) => a - b)[Math.floor(tradeSizes.length / 2)]
    const minTradeSize = Math.min(...tradeSizes)
    const maxTradeSize = Math.max(...tradeSizes)

    console.log('\nRecent Trade Sizes (last 20 BUY trades):')
    console.log(`  Count: ${tradeSizes.length}`)
    console.log(`  Min: $${minTradeSize.toFixed(2)}`)
    console.log(`  Max: $${maxTradeSize.toFixed(2)}`)
    console.log(`  Average: $${avgTradeSize.toFixed(2)}`)
    console.log(`  Median: $${medianTradeSize.toFixed(2)}`)

    // Compare with stored averages
    const storedAvg = globalStats.l_avg_trade_size_usd || globalStats.avg_bet_size_usdc
    if (storedAvg) {
      console.log(`\n  Stored Average: $${storedAvg.toFixed(2)}`)
      console.log(`  Recent Average: $${avgTradeSize.toFixed(2)}`)
      console.log(`  Ratio (stored/recent): ${(storedAvg / avgTradeSize).toFixed(2)}x`)
      
      if (storedAvg > avgTradeSize * 1.5) {
        console.log(`  ⚠️  WARNING: Stored average is ${((storedAvg / avgTradeSize - 1) * 100).toFixed(0)}% higher than recent average!`)
        console.log(`     This will make conviction scores appear low.`)
      }
    }

    // Calculate sample convictions
    console.log('\nSample Conviction Calculations:')
    for (const trade of recentTrades.slice(0, 5)) {
      const tradeSize = Number(trade.price) * Number(trade.shares_normalized)
      if (storedAvg && storedAvg > 0) {
        const conviction = tradeSize / storedAvg
        console.log(`  Trade: $${tradeSize.toFixed(2)} → Conviction: ${conviction.toFixed(2)}x`)
      }
    }
  }
}

async function checkConvictionDistribution() {
  console.log('\n' + '='.repeat(70))
  console.log('CHECKING CONVICTION DISTRIBUTION')
  console.log('='.repeat(70))

  // Get sample trades with stats
  const { data: trades } = await supabase
    .from('trades')
    .select('wallet_address, price, shares_normalized')
    .eq('side', 'BUY')
    .limit(100)

  if (!trades || trades.length === 0) {
    console.log('No trades found')
    return
  }

  const wallets = [...new Set(trades.map(t => t.wallet_address.toLowerCase()))]
  const { data: stats } = await supabase
    .from('trader_global_stats')
    .select('wallet_address, avg_bet_size_usdc, l_avg_trade_size_usd')
    .in('wallet_address', wallets)

  const statsMap = new Map()
  if (stats) {
    stats.forEach(s => {
      statsMap.set(s.wallet_address.toLowerCase(), {
        avg_bet_size: s.avg_bet_size_usdc || s.l_avg_trade_size_usd,
      })
    })
  }

  const convictions = []
  for (const trade of trades) {
    const wallet = trade.wallet_address.toLowerCase()
    const tradeSize = Number(trade.price) * Number(trade.shares_normalized)
    const avgSize = statsMap.get(wallet)?.avg_bet_size

    if (avgSize && avgSize > 0) {
      const conviction = tradeSize / avgSize
      convictions.push(conviction)
    }
  }

  if (convictions.length === 0) {
    console.log('\n⚠️  No convictions calculated (missing avg bet sizes)')
    return
  }

  convictions.sort((a, b) => a - b)
  const avgConviction = convictions.reduce((a, b) => a + b, 0) / convictions.length
  const medianConviction = convictions[Math.floor(convictions.length / 2)]
  const p25 = convictions[Math.floor(convictions.length * 0.25)]
  const p75 = convictions[Math.floor(convictions.length * 0.75)]
  const below1 = convictions.filter(c => c < 1.0).length
  const below05 = convictions.filter(c => c < 0.5).length

  console.log(`\nConviction Distribution (${convictions.length} trades):`)
  console.log(`  Average: ${avgConviction.toFixed(2)}x`)
  console.log(`  Median: ${medianConviction.toFixed(2)}x`)
  console.log(`  25th percentile: ${p25.toFixed(2)}x`)
  console.log(`  75th percentile: ${p75.toFixed(2)}x`)
  console.log(`  Min: ${convictions[0].toFixed(2)}x`)
  console.log(`  Max: ${convictions[convictions.length - 1].toFixed(2)}x`)
  console.log(`\n  Below 1.0x: ${below1} (${((below1 / convictions.length) * 100).toFixed(1)}%)`)
  console.log(`  Below 0.5x: ${below05} (${((below05 / convictions.length) * 100).toFixed(1)}%)`)

  if (avgConviction < 0.8) {
    console.log(`\n  ⚠️  WARNING: Average conviction is below 0.8x!`)
    console.log(`     This suggests avg bet sizes are inflated.`)
  }
}

async function main() {
  const wallet = process.argv[2] || null
  
  console.log('🔍 CONVICTION CALCULATION AUDIT')
  console.log('='.repeat(70))
  
  await auditTraderStats(wallet)
  await checkConvictionDistribution()
  
  console.log('\n' + '='.repeat(70))
  console.log('AUDIT COMPLETE')
  console.log('='.repeat(70))
  
  console.log('\nRecommendations:')
  console.log('1. Check if avg_bet_size_usdc includes outliers')
  console.log('2. Consider using median instead of mean for averages')
  console.log('3. Consider using recent (30d) average instead of lifetime')
  console.log('4. Check if position size calculation is correct')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Audit failed:', err)
    process.exit(1)
  })
