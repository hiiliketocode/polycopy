#!/usr/bin/env node
/**
 * Truncate trades_public table via Supabase API
 * Usage: node scripts/truncate-trades.js
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function truncateTradesPublic() {
  try {
    console.log('🗑️  Deleting all rows from trades_public...')
    
    // First, get count of rows
    const { count: initialCount } = await supabase
      .from('trades_public')
      .select('*', { count: 'exact', head: true })
    
    console.log(`📊 Found ${initialCount || 0} rows to delete`)
    
    if (initialCount === 0) {
      console.log('✅ Table is already empty')
      return
    }
    
    // Delete in batches (PostgREST requires a filter, so we'll delete in chunks)
    // We'll use a workaround: delete rows where trade_id is not null (all rows)
    let deleted = 0
    let batchSize = 1000
    
    while (deleted < initialCount) {
      // Get a batch of trade_ids
      const { data: batch } = await supabase
        .from('trades_public')
        .select('trade_id')
        .limit(batchSize)
      
      if (!batch || batch.length === 0) break
      
      const tradeIds = batch.map(r => r.trade_id)
      
      // Delete this batch
      const { error } = await supabase
        .from('trades_public')
        .delete()
        .in('trade_id', tradeIds)
      
      if (error) {
        console.error('❌ Error deleting batch:', error.message)
        throw error
      }
      
      deleted += batch.length
      console.log(`   Deleted ${deleted}/${initialCount} rows...`)
    }
    
    console.log(`✅ Successfully deleted ${deleted} rows from trades_public`)
  } catch (error) {
    console.error('❌ Error truncating trades_public:', error.message)
    console.error('')
    console.error('💡 For faster truncate, use Supabase Dashboard SQL Editor:')
    console.error('   TRUNCATE TABLE trades_public CASCADE;')
    throw error
  }
}

// Confirm before deleting
const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question('⚠️  This will delete ALL rows from trades_public. Continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
    truncateTradesPublic()
      .then(() => {
        console.log('✅ Done!')
        process.exit(0)
      })
      .catch(err => {
        console.error('Error:', err)
        process.exit(1)
      })
  } else {
    console.log('❌ Cancelled')
    process.exit(0)
  }
  rl.close()
})

