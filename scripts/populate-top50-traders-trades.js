#!/usr/bin/env node
'use strict'

/**
 * Populate top50_traders_trades table from existing trades in the main trades table.
 * 
 * This script:
 * 1. Gets top 50 traders by realized PnL rank (30D window)
 * 2. Copies all their existing trades from trades table to top50_traders_trades table
 * 3. Handles large datasets with batching
 * 
 * Usage:
 *   node scripts/populate-top50-traders-trades.js
 *   node scripts/populate-top50-traders-trades.js --top-n 50 --window 30D
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

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '50')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || '30D'
const BATCH_SIZE = 1000 // PostgREST limit

async function getTopTraders(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized PnL rank (window: ${window})...`)
  
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) return []
  
  const traders = rankings.map(r => ({
    wallet: r.wallet_address?.toLowerCase(),
    pnl: Number(r.pnl_sum) || 0,
    rank: r.rank
  }))
  
  console.log(`✅ Found ${traders.length} traders`)
  return traders
}

async function checkTableExists() {
  const { data, error } = await supabase
    .from('top50_traders_trades')
    .select('*', { count: 'exact', head: true })
  
  if (error && error.code === 'PGRST116') {
    return false // Table doesn't exist
  }
  if (error) throw error
  
  return true
}

async function getTradeCount(wallets) {
  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .in('wallet_address', wallets.map(w => w.toLowerCase()))
  
  if (error) {
    console.error('Error getting trade count:', error)
    throw error
  }
  return count || 0
}

async function populateTableForWallet(wallet, walletIndex, totalWallets) {
  console.log(`\n[${walletIndex + 1}/${totalWallets}] Processing ${wallet.substring(0, 12)}...`)
  
  // Skip count query to avoid timeouts - always use ID-based pagination
  console.log(`  📊 Processing trades...`)
  
  // Get the first trade ID for this wallet to start pagination
  const { data: firstTrade, error: firstError } = await supabase
    .from('trades')
    .select('id')
    .eq('wallet_address', wallet)
    .order('id', { ascending: true })
    .limit(1)
    .single()
  
  if (firstError && firstError.code !== 'PGRST116') {
    console.error(`  ❌ Error getting first trade: ${firstError.message}`)
    throw firstError
  }
  
  if (!firstTrade) {
    console.log(`  ⏭️  No trades for this wallet`)
    return { inserted: 0, skipped: 0 }
  }
  
  let totalInserted = 0
  let totalSkipped = 0
  let batchNum = 0
  let lastId = firstTrade.id
  
  while (true) {
    batchNum++
    
    // Fetch batch from trades table for this wallet using ID-based pagination
    let tradesToProcess = []
    
    // For the first batch, include the first trade we found
    if (batchNum === 1) {
      const { data: firstBatch } = await supabase
        .from('trades')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('id', firstTrade.id)
        .limit(1)
      
      if (firstBatch && firstBatch.length > 0) {
        tradesToProcess.push(...firstBatch)
      }
    }
    
    // Fetch the next batch
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .eq('wallet_address', wallet)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)
    
    if (trades && trades.length > 0) {
      tradesToProcess.push(...trades)
    }
    
    if (fetchError) {
      console.error(`  ❌ Error fetching trades: ${fetchError.message}`)
      throw fetchError
    }
    
    if (!tradesToProcess || tradesToProcess.length === 0) {
      break
    }
    
    // Remove trade_uid (generated column) before inserting
    const tradesToInsert = tradesToProcess.map(trade => {
      const { trade_uid, ...rest } = trade
      return rest
    })
    
    // Insert into top50_traders_trades
    const { error: insertError, count } = await supabase
      .from('top50_traders_trades')
      .upsert(tradesToInsert, {
        ignoreDuplicates: true,
        count: 'exact'
      })
    
    if (insertError) {
      console.error(`  ❌ Error inserting batch: ${insertError.message}`)
      throw insertError
    }
    
    const inserted = count || 0
    const skipped = tradesToProcess.length - inserted
    totalInserted += inserted
    totalSkipped += skipped
    
    // Update pagination state - always use ID-based
    if (tradesToProcess.length > 0) {
      lastId = tradesToProcess[tradesToProcess.length - 1].id
    }
    
    // Show progress every 50 batches or on last batch
    if (batchNum % 50 === 0 || tradesToProcess.length < BATCH_SIZE) {
      console.log(
        `  📦 Batch ${batchNum}: ${inserted} inserted, ${skipped} skipped (total processed: ${(totalInserted + totalSkipped).toLocaleString()})`
      )
    }
    
    // Break if we got fewer trades than requested (last batch)
    if (tradesToProcess.length < BATCH_SIZE) {
      break
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log(`  ✅ ${wallet.substring(0, 12)}...: ${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped`)
  
  return { inserted: totalInserted, skipped: totalSkipped }
}

async function populateTable(wallets) {
  console.log(`\n📦 Populating top50_traders_trades table...`)
  
  // Check if table exists
  const tableExists = await checkTableExists()
  if (!tableExists) {
    console.error('❌ Table top50_traders_trades does not exist!')
    console.error('   Please run the migration first:')
    console.error('   supabase/migrations/20260127_create_top50_traders_trades.sql')
    process.exit(1)
  }
  
  // Process each wallet individually to avoid timeouts
  let totalInserted = 0
  let totalSkipped = 0
  
  for (let i = 0; i < wallets.length; i++) {
    const result = await populateTableForWallet(wallets[i], i, wallets.length)
    totalInserted += result.inserted
    totalSkipped += result.skipped
    
    // Small delay between wallets
    if (i < wallets.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  
  console.log(`\n✨ Population complete!`)
  console.log(`   ✅ Inserted: ${totalInserted.toLocaleString()} trades`)
  console.log(`   ⏭️  Skipped (duplicates): ${totalSkipped.toLocaleString()} trades`)
  console.log(`   📊 Total processed: ${(totalInserted + totalSkipped).toLocaleString()} trades`)
}

async function main() {
  console.log('='.repeat(70))
  console.log(`🚀 Populate top50_traders_trades from existing trades`)
  console.log('='.repeat(70))
  console.log('')
  
  // Get top traders
  const traders = await getTopTraders(TOP_N, WINDOW)
  
  if (traders.length === 0) {
    console.error('❌ No traders found')
    process.exit(1)
  }
  
  const wallets = traders.map(t => t.wallet)
  
  console.log('\n📋 Top traders:')
  traders.slice(0, 10).forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.wallet.substring(0, 12)}... (Rank: ${t.rank}, PnL: $${t.pnl.toLocaleString()})`)
  })
  if (traders.length > 10) {
    console.log(`   ... and ${traders.length - 10} more`)
  }
  
  // Populate table
  await populateTable(wallets)
  
  // Show final stats
  const { count: finalCount } = await supabase
    .from('top50_traders_trades')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n📊 Final table count: ${(finalCount || 0).toLocaleString()} trades`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error?.message || error)
  if (error?.stack) console.error(error.stack)
  if (error?.details) console.error('Details:', error.details)
  if (error?.hint) console.error('Hint:', error.hint)
  process.exit(1)
})
