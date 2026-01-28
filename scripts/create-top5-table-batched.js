#!/usr/bin/env node
'use strict'

/**
 * Create top5_traders_trades table in batches to avoid timeout
 * 1. Create empty table structure
 * 2. Insert trades in batches
 * 3. Add indexes
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

async function createTableStructure() {
  console.log('🏗️  Step 1: Creating table structure...')
  
  // Check if table exists
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .limit(0)
    
    if (!error) {
      console.log('✅ Table already exists')
      return true
    }
  } catch (e) {
    // Table doesn't exist, which is fine
  }
  
  // Table doesn't exist - provide SQL to create it
  console.log('\n📋 Table does not exist. Please run this SQL in Supabase SQL Editor:')
  console.log('   (File: scripts/create-table-structure-only.sql)')
  console.log('='.repeat(60))
  console.log(`DROP TABLE IF EXISTS public.${TABLE_NAME};`)
  console.log(`CREATE TABLE public.${TABLE_NAME} (LIKE public.trades INCLUDING ALL);`)
  console.log('='.repeat(60))
  console.log('\n⏳ Checking if table exists (will retry in 3 seconds)...')
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Check again if table exists now
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .limit(0)
    
    if (!error) {
      console.log('✅ Table exists! Proceeding with data insertion...')
      return true
    } else {
      console.log('⚠️  Table still does not exist.')
      console.log('   Please run the SQL above in Supabase SQL Editor, then re-run this script.')
      return false
    }
  } catch (e) {
    console.log('⚠️  Table still does not exist.')
    console.log('   Please run the SQL above in Supabase SQL Editor, then re-run this script.')
    return false
  }
}

async function insertTradesInBatches() {
  console.log('\n📥 Fetching and inserting trades in batches...')
  
  let offset = 0
  let totalInserted = 0
  let batchNumber = 0
  let hasMore = true
  
  while (hasMore) {
    batchNumber++
    console.log(`\n📦 Batch ${batchNumber}: Fetching trades (offset: ${offset.toLocaleString()})...`)
    
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', WALLETS)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (fetchError) {
      console.error(`❌ Error fetching trades: ${fetchError.message}`)
      throw fetchError
    }
    
    if (!trades || trades.length === 0) {
      console.log('✅ No more trades to insert')
      hasMore = false
      break
    }
    
    console.log(`  ✅ Fetched ${trades.length} trades`)
    
    // Insert batch
    console.log(`  💾 Inserting ${trades.length} trades...`)
    const { error: insertError, count } = await supabase
      .from(TABLE_NAME)
      .insert(trades, { count: 'exact' })
    
    if (insertError) {
      // If table doesn't exist, we need to create it first
      if (insertError.message && insertError.message.includes('does not exist')) {
        console.log('\n❌ Table does not exist. Please run the SQL from Step 1 first.')
        console.log('   Or the table structure needs to be created manually.')
        throw new Error('Table does not exist. Please create it first using the SQL provided.')
      }
      console.error(`❌ Error inserting trades: ${insertError.message}`)
      throw insertError
    }
    
    totalInserted += count || trades.length
    console.log(`  ✅ Inserted ${count || trades.length} trades (total: ${totalInserted.toLocaleString()})`)
    
    offset += BATCH_SIZE
    
    if (trades.length < BATCH_SIZE) {
      hasMore = false
    }
    
    // Small delay between batches to avoid rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  
  return totalInserted
}

async function addIndexes() {
  console.log('\n🔨 Adding indexes...')
  console.log('📋 Run this SQL in Supabase SQL Editor:')
  console.log('='.repeat(60))
  console.log(`
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_wallet_timestamp 
ON public.${TABLE_NAME} (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_condition_id 
ON public.${TABLE_NAME} (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_market_slug 
ON public.${TABLE_NAME} (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_${TABLE_NAME}_timestamp 
ON public.${TABLE_NAME} (timestamp DESC);

-- Add comment
COMMENT ON TABLE public.${TABLE_NAME} IS
  'Copy of trades table containing only top 5 traders by realized PnL rank (30-day window). Created for ML modeling and analysis.';
  `)
  console.log('='.repeat(60))
}

async function getStats() {
  console.log('\n📊 Getting final statistics...')
  
  const { count, error: countError } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
  
  if (countError) {
    console.log('⚠️  Could not get count:', countError.message)
    return
  }
  
  const { data: traderData, error: traderError } = await supabase
    .from(TABLE_NAME)
    .select('wallet_address')
    .limit(1000)
  
  const uniqueTraders = new Set((traderData || []).map(t => t.wallet_address?.toLowerCase())).size
  
  const { data: timeRange, error: timeError } = await supabase
    .from(TABLE_NAME)
    .select('timestamp')
    .order('timestamp', { ascending: true })
    .limit(1)
    .single()
  
  const { data: latestTrade, error: latestError } = await supabase
    .from(TABLE_NAME)
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Table created successfully!')
  console.log('='.repeat(60))
  console.log(`✅ Table name: ${TABLE_NAME}`)
  console.log(`✅ Total trades: ${count?.toLocaleString() || 'N/A'}`)
  console.log(`✅ Unique traders: ${uniqueTraders}`)
  if (timeRange) console.log(`✅ Earliest trade: ${new Date(timeRange.timestamp).toISOString()}`)
  if (latestTrade) console.log(`✅ Latest trade: ${new Date(latestTrade.timestamp).toISOString()}`)
  console.log('='.repeat(60))
}

async function main() {
  console.log('='.repeat(60))
  console.log('🔨 Creating top5_traders_trades table (batched)')
  console.log('='.repeat(60))
  console.log(`👥 Traders: ${WALLETS.length}`)
  WALLETS.forEach((w, i) => console.log(`  ${i + 1}. ${w}`))
  console.log('')
  
  try {
    // Step 1: Create table structure
    const tableExists = await createTableStructure()
    
    if (!tableExists) {
      console.log('\n⚠️  Table structure needs to be created first.')
      console.log('   Please run the SQL shown above in Supabase SQL Editor.')
      console.log('   Then re-run this script to insert the data.')
      process.exit(0)
    }
    
    // Step 2: Insert trades in batches
    const totalInserted = await insertTradesInBatches()
    
    console.log(`\n✅ Total trades inserted: ${totalInserted.toLocaleString()}`)
    
    // Step 3: Add indexes (provide SQL)
    await addIndexes()
    
    // Step 4: Get stats
    await getStats()
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.message.includes('does not exist')) {
      console.log('\n💡 Solution: Run the SQL from Step 1 to create the table structure first.')
    }
    process.exit(1)
  }
}

main()
