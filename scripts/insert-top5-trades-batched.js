#!/usr/bin/env node
'use strict'

/**
 * Insert trades into top5_traders_trades table in batches
 * Assumes the table structure already exists
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

const BATCH_SIZE = 1000 // Supabase default limit
const TABLE_NAME = 'top5_traders_trades'

async function main() {
  console.log('='.repeat(60))
  console.log('📥 Inserting trades into top5_traders_trades (batched)')
  console.log('='.repeat(60))
  
  // Check if table exists
  try {
    const { error } = await supabase.from(TABLE_NAME).select('*').limit(0)
    if (error) {
      console.error('❌ Table does not exist!')
      console.log('\n📋 Please run this SQL first:')
      console.log('='.repeat(60))
      console.log(`DROP TABLE IF EXISTS public.${TABLE_NAME};`)
      console.log(`CREATE TABLE public.${TABLE_NAME} (LIKE public.trades INCLUDING ALL);`)
      console.log('='.repeat(60))
      process.exit(1)
    }
  } catch (e) {
    console.error('❌ Table does not exist!')
    process.exit(1)
  }
  
  // Check if table already has data
  const { count: existingCount } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
  
  if (existingCount && existingCount > 0) {
    console.log(`⚠️  Table already has ${existingCount.toLocaleString()} trades.`)
    console.log('   Continuing to insert remaining trades...')
    // Don't exit, just continue
  }
  
  console.log('\n📦 Starting batch insertion...\n')
  
  let offset = 0
  let totalInserted = 0
  let batchNumber = 0
  let hasMore = true
  
  while (hasMore) {
    batchNumber++
    process.stdout.write(`Batch ${batchNumber}: Fetching (offset: ${offset.toLocaleString()})... `)
    
    const { data: trades, error: fetchError } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', WALLETS)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
      .limit(BATCH_SIZE)
    
    if (fetchError) {
      console.error(`\n❌ Error: ${fetchError.message}`)
      throw fetchError
    }
    
    if (!trades || trades.length === 0) {
      console.log('Done! No more trades to fetch.')
      hasMore = false
      break
    }
    
    process.stdout.write(`Fetched ${trades.length}, inserting... `)
    
    // Remove trade_uid from trades since it's a generated column
    const tradesToInsert = trades.map(trade => {
      const { trade_uid, ...rest } = trade
      return rest
    })
    
    // Use upsert to handle duplicates (on conflict, do nothing)
    const { error: insertError, count } = await supabase
      .from(TABLE_NAME)
      .upsert(tradesToInsert, { 
        onConflict: 'id',
        ignoreDuplicates: true,
        count: 'exact'
      })
    
    if (insertError) {
      console.error(`\n❌ Error: ${insertError.message}`)
      throw insertError
    }
    
    const inserted = count || 0
    totalInserted += inserted
    console.log(`✅ ${inserted} new trades inserted (total processed: ${totalInserted.toLocaleString()})`)
    
    offset += BATCH_SIZE
    
    // Continue if we got a full batch, stop if we got fewer
    if (trades.length < BATCH_SIZE) {
      console.log(`   (Got ${trades.length} trades, less than batch size ${BATCH_SIZE}, done!)`)
      hasMore = false
    } else {
      // Got a full batch, might have more
      hasMore = true
    }
    
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Insertion complete!')
  console.log('='.repeat(60))
  console.log(`✅ Total trades inserted: ${totalInserted.toLocaleString()}`)
  console.log('='.repeat(60))
  
  // Get final stats
  const { count } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n📊 Final count: ${count?.toLocaleString() || 'N/A'} trades`)
}

main().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
