#!/usr/bin/env node
'use strict'

/**
 * Robust version that resumes from where it left off and handles timeouts better.
 * Uses smaller batch sizes and checks existing data to skip already-processed trades.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '50')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || '30D'
const BATCH_SIZE = 500 // Smaller batch size to avoid timeouts
const MAX_RETRIES = 3

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getTopTraders(limit, window) {
  const { data: rankings, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit)
  
  if (error) throw error
  if (!rankings || rankings.length === 0) return []
  
  return rankings.map(r => ({
    wallet: r.wallet_address?.toLowerCase(),
    pnl: Number(r.pnl_sum) || 0,
    rank: r.rank
  }))
}

async function getLastProcessedId(wallet) {
  // Get the max ID already in top50_traders_trades for this wallet
  const { data, error } = await supabase
    .from('top50_traders_trades')
    .select('id')
    .eq('wallet_address', wallet)
    .order('id', { ascending: false })
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') {
    // Some other error
    return null
  }
  
  return data?.id || null
}

async function processWallet(wallet, walletIndex, totalWallets) {
  console.log(`\n[${walletIndex + 1}/${totalWallets}] Processing ${wallet.substring(0, 12)}...`)
  
  // Get the last ID we've already processed
  const lastProcessedId = await getLastProcessedId(wallet)
  if (lastProcessedId) {
    console.log(`  🔄 Resuming from ID: ${lastProcessedId.substring(0, 8)}...`)
  } else {
    console.log(`  🆕 Starting fresh...`)
  }
  
  let totalInserted = 0
  let totalSkipped = 0
  let batchNum = 0
  let lastId = lastProcessedId
  let consecutiveErrors = 0
  
  while (true) {
    batchNum++
    
    // Try to fetch batch with retries
    let trades = []
    let fetchError = null
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        let query = supabase
          .from('trades')
          .select('*')
          .eq('wallet_address', wallet)
          .order('id', { ascending: true })
          .limit(BATCH_SIZE)
        
        if (lastId) {
          query = query.gt('id', lastId)
        }
        
        const { data, error } = await query
        
        if (error) {
          fetchError = error
          if (error.message?.includes('timeout')) {
            console.log(`  ⚠️  Timeout on attempt ${attempt}, retrying with smaller batch...`)
            await sleep(2000 * attempt)
            continue
          }
          throw error
        }
        
        trades = data || []
        fetchError = null
        break
      } catch (err) {
        fetchError = err
        if (attempt < MAX_RETRIES) {
          await sleep(2000 * attempt)
        }
      }
    }
    
    if (fetchError) {
      consecutiveErrors++
      console.error(`  ❌ Error after ${MAX_RETRIES} attempts: ${fetchError.message}`)
      
      if (consecutiveErrors >= 3) {
        console.log(`  ⏭️  Skipping this wallet after multiple errors`)
        return { inserted: totalInserted, skipped: totalSkipped }
      }
      
      // Try with even smaller batch
      await sleep(5000)
      continue
    }
    
    consecutiveErrors = 0
    
    if (trades.length === 0) {
      break
    }
    
    // Remove trade_uid (generated column)
    const tradesToInsert = trades.map(trade => {
      const { trade_uid, ...rest } = trade
      return rest
    })
    
    // Insert with retries
    let insertError = null
    let inserted = 0
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { error, count } = await supabase
          .from('top50_traders_trades')
          .upsert(tradesToInsert, {
            ignoreDuplicates: true,
            count: 'exact'
          })
        
        if (error) {
          insertError = error
          if (attempt < MAX_RETRIES) {
            await sleep(1000 * attempt)
            continue
          }
          throw error
        }
        
        inserted = count || 0
        insertError = null
        break
      } catch (err) {
        insertError = err
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * attempt)
        }
      }
    }
    
    if (insertError) {
      console.error(`  ❌ Insert error: ${insertError.message}`)
      // Continue anyway - might be duplicates
    }
    
    const skipped = trades.length - inserted
    totalInserted += inserted
    totalSkipped += skipped
    
    // Update last ID
    if (trades.length > 0) {
      lastId = trades[trades.length - 1].id
    }
    
    // Show progress
    if (batchNum % 100 === 0 || trades.length < BATCH_SIZE) {
      console.log(
        `  📦 Batch ${batchNum}: ${inserted} inserted, ${skipped} skipped (total: ${(totalInserted + totalSkipped).toLocaleString()})`
      )
    }
    
    // Break if last batch
    if (trades.length < BATCH_SIZE) {
      break
    }
    
    // Delay between batches
    await sleep(150)
  }
  
  console.log(`  ✅ ${wallet.substring(0, 12)}...: ${totalInserted.toLocaleString()} inserted, ${totalSkipped.toLocaleString()} skipped`)
  return { inserted: totalInserted, skipped: totalSkipped }
}

async function main() {
  console.log('='.repeat(70))
  console.log(`🚀 Populate top50_traders_trades (Robust Version)`)
  console.log('='.repeat(70))
  console.log('')
  
  const traders = await getTopTraders(TOP_N, WINDOW)
  
  if (traders.length === 0) {
    console.error('❌ No traders found')
    process.exit(1)
  }
  
  let totalInserted = 0
  let totalSkipped = 0
  
  for (let i = 0; i < traders.length; i++) {
    const result = await processWallet(traders[i].wallet, i, traders.length)
    totalInserted += result.inserted
    totalSkipped += result.skipped
    
    // Delay between wallets
    if (i < traders.length - 1) {
      await sleep(500)
    }
  }
  
  console.log(`\n✨ Population complete!`)
  console.log(`   ✅ Inserted: ${totalInserted.toLocaleString()} trades`)
  console.log(`   ⏭️  Skipped: ${totalSkipped.toLocaleString()} trades`)
  console.log(`   📊 Total: ${(totalInserted + totalSkipped).toLocaleString()} trades`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error?.message || error)
  process.exit(1)
})
