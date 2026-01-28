#!/usr/bin/env node
'use strict'

/**
 * Backfill trade timing data in the trade_timing table for all trades.
 * 
 * Note: Uses separate trade_timing table (not columns on trades table) to avoid
 * ALTER TABLE on the huge 15M+ row trades table.
 * 
 * This script processes trades in batches to handle millions of rows efficiently.
 * Uses the calculate_trade_timing() function to compute values from the markets table.
 * 
 * Usage: 
 *   node scripts/backfill-trade-timing.js
 *   node scripts/backfill-trade-timing.js --batch-size 10000
 *   node scripts/backfill-trade-timing.js --resume
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Configuration
const DEFAULT_BATCH_SIZE = 10000
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || DEFAULT_BATCH_SIZE)
const RESUME = process.argv.includes('--resume')
const PROGRESS_FILE = path.join(__dirname, 'backfill-trade-timing-progress.json')

// Load or initialize progress
let progress = {
  totalProcessed: 0,
  totalUpdated: 0,
  lastTradeId: null,
  startTime: null,
  lastUpdate: null,
  errors: [],
}

if (RESUME && fs.existsSync(PROGRESS_FILE)) {
  try {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
    console.log(`📂 Resuming from progress file: ${progress.totalProcessed} trades processed`)
  } catch (err) {
    console.error('⚠️  Could not load progress file, starting fresh:', err.message)
    progress = {
      totalProcessed: 0,
      totalUpdated: 0,
      lastTradeId: null,
      startTime: new Date().toISOString(),
      lastUpdate: null,
      errors: [],
    }
  }
} else {
  progress.startTime = new Date().toISOString()
}

function saveProgress() {
  progress.lastUpdate = new Date().toISOString()
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

async function getTotalTradesCount() {
  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
  
  if (error) throw error
  return count || 0
}

async function getTradesNeedingUpdate(limit, lastId = null) {
  let query = supabase
    .from('trades')
    .select('id, timestamp, condition_id')
    .not('condition_id', 'is', null)
    .order('id', { ascending: true })
    .limit(limit)
  
  if (lastId) {
    query = query.gt('id', lastId)
  }
  
  const { data, error } = await query
  
  if (error) throw error
  return data || []
}

async function updateTradeTimingBatch(tradeIds) {
  // Use the cache function to populate cache for these trades
  const { data: rpcData, error: rpcError } = await supabase.rpc('cache_trade_timing', {
    p_trade_ids: tradeIds
  })
  
  if (!rpcError && rpcData !== null && rpcData !== undefined) {
    return typeof rpcData === 'number' ? rpcData : (rpcData || 0)
  }
  
  // If RPC function doesn't exist or fails, fall back to individual updates
  if (rpcError && (rpcError.message.includes('function') || rpcError.message.includes('does not exist'))) {
    console.log('   ⚠️  Cache function not available, using fallback method...')
    return await updateTradeTimingBatchFallback(tradeIds)
  }
  
  // If other error, throw it
  if (rpcError) {
    throw rpcError
  }
  
  return 0
}

async function updateTradeTimingBatchFallback(tradeIds) {
  // Fallback: update trades one by one using the calculate_trade_timing function
  let updated = 0
  
  for (const tradeId of tradeIds) {
    // Get the trade
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('timestamp, condition_id')
      .eq('id', tradeId)
      .single()
    
    if (tradeError || !trade) continue
    
    // Calculate timing using the function
    const { data: timing, error: timingError } = await supabase.rpc('calculate_trade_timing', {
      p_trade_timestamp: trade.timestamp,
      p_condition_id: trade.condition_id
    })
    
    if (timingError || !timing || timing.length === 0) continue
    
    const timingData = timing[0]
    
    // Insert or update in trade_timing_cache table
    const { error: upsertError } = await supabase
      .from('trade_timing_cache')
      .upsert({
        trade_id: tradeId,
        seconds_before_game_start: timingData.seconds_before_game_start,
        seconds_before_market_end: timingData.seconds_before_market_end,
        trade_timing_category: timingData.trade_timing_category,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'trade_id'
      })
    
    if (!upsertError) {
      updated++
    }
  }
  
  return updated
}

async function main() {
  console.log('='.repeat(60))
  console.log('🚀 Starting trade timing backfill')
  console.log('='.repeat(60))
  console.log(`📦 Batch size: ${BATCH_SIZE}`)
  console.log(`📂 Progress file: ${PROGRESS_FILE}`)
  console.log('')
  
  try {
    // Get total count
    const totalTrades = await getTotalTradesCount()
    console.log(`📊 Total trades in database: ${totalTrades.toLocaleString()}`)
    console.log('')
    
    const startTime = Date.now()
    let batchNumber = 0
    
    while (true) {
      batchNumber++
      
      // Get next batch of trades
      const trades = await getTradesNeedingUpdate(BATCH_SIZE, progress.lastTradeId)
      
      if (trades.length === 0) {
        console.log('\n✅ No more trades to process!')
        break
      }
      
      const tradeIds = trades.map(t => t.id)
      const lastTradeId = trades[trades.length - 1].id
      
      console.log(`📦 Batch ${batchNumber}: Processing ${trades.length} trades (IDs: ${tradeIds[0]}..${lastTradeId})...`)
      
      try {
        const updated = await updateTradeTimingBatch(tradeIds)
        
        progress.totalProcessed += trades.length
        progress.totalUpdated += updated
        progress.lastTradeId = lastTradeId
        saveProgress()
        
        const elapsed = Date.now() - startTime
        const rate = progress.totalProcessed / (elapsed / 1000)
        const remaining = totalTrades - progress.totalProcessed
        const eta = remaining / rate
        
        console.log(`   ✅ Updated ${updated} trades`)
        console.log(`   📊 Progress: ${progress.totalProcessed.toLocaleString()} / ${totalTrades.toLocaleString()} (${((progress.totalProcessed / totalTrades) * 100).toFixed(2)}%)`)
        console.log(`   ⚡ Rate: ${rate.toFixed(0)} trades/sec`)
        if (eta > 0 && eta < Infinity) {
          console.log(`   ⏱️  ETA: ${formatDuration(eta * 1000)}`)
        }
        console.log('')
        
      } catch (error) {
        console.error(`   ❌ Error processing batch:`, error.message)
        progress.errors.push({
          batch: batchNumber,
          error: error.message,
          timestamp: new Date().toISOString(),
        })
        saveProgress()
        
        // Continue to next batch instead of failing completely
        progress.lastTradeId = lastTradeId
        saveProgress()
      }
    }
    
    const totalTime = Date.now() - startTime
    console.log('='.repeat(60))
    console.log('🎉 Backfill complete!')
    console.log('='.repeat(60))
    console.log(`✅ Total processed: ${progress.totalProcessed.toLocaleString()} trades`)
    console.log(`✅ Total updated: ${progress.totalUpdated.toLocaleString()} trades`)
    console.log(`⏱️  Total time: ${formatDuration(totalTime)}`)
    console.log(`⚡ Average rate: ${(progress.totalProcessed / (totalTime / 1000)).toFixed(0)} trades/sec`)
    if (progress.errors.length > 0) {
      console.log(`⚠️  Errors: ${progress.errors.length}`)
    }
    console.log('='.repeat(60))
    
    // Clean up progress file on success
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE)
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    saveProgress()
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
