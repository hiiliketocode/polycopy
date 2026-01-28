#!/usr/bin/env node
'use strict'

/**
 * Automatically create top5_traders_trades table by inserting data in batches
 * Step 1: Run the quick SQL to create empty table (fast, won't timeout)
 * Step 2: This script will automatically insert all data in batches
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

const WALLETS = [
  '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
  '0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b',
  '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e',
  '0xdc876e6873772d38716fda7f2452a78d426d7ab6',
  '0x16b29c50f2439faf627209b2ac0c7bbddaa8a881'
].map(w => w.toLowerCase())

const BATCH_SIZE = 5000
const TABLE_NAME = 'top5_traders_trades'

async function waitForTable(maxRetries = 10) {
  console.log('⏳ Waiting for table to be created...')
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .limit(0)
      
      if (!error) {
        console.log('✅ Table exists!')
        return true
      }
    } catch (e) {
      // Table doesn't exist yet
    }
    
    if (i < maxRetries - 1) {
      process.stdout.write(`  Retry ${i + 1}/${maxRetries}... `)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
  
  return false
}

async function insertTradesInBatches() {
  console.log('\n📥 Step 2: Inserting trades in batches...\n')
  
  let offset = 0
  let totalInserted = 0
  let batchNumber = 0
  let hasMore = true
  
  while (hasMore) {
    batchNumber++
    process.stdout.write(`📦 Batch ${batchNumber}: Fetching (offset: ${offset.toLocaleString()})... `)
    
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', WALLETS)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (fetchError) {
      console.error(`\n❌ Error fetching: ${fetchError.message}`)
      throw fetchError
    }
    
    if (!trades || trades.length === 0) {
      console.log('Done!')
      hasMore = false
      break
    }
    
    process.stdout.write(`Fetched ${trades.length}, inserting... `)
    
    const { error: insertError, count } = await supabase
      .from(TABLE_NAME)
      .insert(trades, { count: 'exact' })
    
    if (insertError) {
      if (insertError.message && insertError.message.includes('does not exist')) {
        console.error('\n❌ Table does not exist!')
        console.log('\n📋 Please run this SQL in Supabase SQL Editor first:')
        console.log('='.repeat(60))
        console.log(`DROP TABLE IF EXISTS public.${TABLE_NAME};`)
        console.log(`CREATE TABLE public.${TABLE_NAME} (LIKE public.trades INCLUDING ALL);`)
        console.log('='.repeat(60))
        throw new Error('Table does not exist')
      }
      console.error(`\n❌ Error: ${insertError.message}`)
      throw insertError
    }
    
    totalInserted += count || trades.length
    console.log(`✅ Inserted ${count || trades.length} (total: ${totalInserted.toLocaleString()})`)
    
    offset += BATCH_SIZE
    
    if (trades.length < BATCH_SIZE) {
      hasMore = false
    }
    
    // Small delay between batches
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  
  return totalInserted
}

async function getStats() {
  const { count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
  
  const { data: traderData } = await supabase
    .from(TABLE_NAME)
    .select('wallet_address')
    .limit(1000)
  
  const uniqueTraders = new Set((traderData || []).map(t => t.wallet_address?.toLowerCase())).size
  
  const { data: timeRange } = await supabase
    .from(TABLE_NAME)
    .select('timestamp')
    .order('timestamp', { ascending: true })
    .limit(1)
    .single()
  
  const { data: latestTrade } = await supabase
    .from(TABLE_NAME)
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Table populated successfully!')
  console.log('='.repeat(60))
  console.log(`✅ Total trades: ${count?.toLocaleString() || 'N/A'}`)
  console.log(`✅ Unique traders: ${uniqueTraders}`)
  if (timeRange) console.log(`✅ Earliest: ${new Date(timeRange.timestamp).toISOString().split('T')[0]}`)
  if (latestTrade) console.log(`✅ Latest: ${new Date(latestTrade.timestamp).toISOString().split('T')[0]}`)
  console.log('='.repeat(60))
  
  console.log('\n📋 Step 3: Add indexes (run this SQL):')
  console.log('='.repeat(60))
  console.log(`
CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_wallet_timestamp 
ON public.${TABLE_NAME} (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_condition_id 
ON public.${TABLE_NAME} (condition_id) WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_market_slug 
ON public.${TABLE_NAME} (market_slug) WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_timestamp 
ON public.${TABLE_NAME} (timestamp DESC);

COMMENT ON TABLE public.${TABLE_NAME} IS
  'Copy of trades table containing only top 5 traders by realized PnL rank (30-day window).';
  `)
  console.log('='.repeat(60))
}

async function main() {
  console.log('='.repeat(60))
  console.log('🔨 Creating top5_traders_trades table (automated)')
  console.log('='.repeat(60))
  
  console.log('\n📋 Step 1: First, run this SQL in Supabase SQL Editor:')
  console.log('='.repeat(60))
  console.log(`DROP TABLE IF EXISTS public.${TABLE_NAME};`)
  console.log(`CREATE TABLE public.${TABLE_NAME} (LIKE public.trades INCLUDING ALL);`)
  console.log('='.repeat(60))
  console.log('\n⏳ Waiting for table to be created (checking every 2 seconds)...')
  console.log('   (Run the SQL above, then this script will automatically continue)\n')
  
  const tableExists = await waitForTable(30) // Wait up to 60 seconds
  
  if (!tableExists) {
    console.log('\n❌ Table was not created in time.')
    console.log('   Please run the SQL above, then re-run this script.')
    process.exit(1)
  }
  
  try {
    const totalInserted = await insertTradesInBatches()
    await getStats()
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
