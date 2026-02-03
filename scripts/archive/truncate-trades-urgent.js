#!/usr/bin/env node
/**
 * Urgently truncate trades_public table via Supabase API
 * No confirmation - runs immediately
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
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
    console.log('🚨 Urgent: Truncating trades_public table...')
    
    // First check count
    const { count: initialCount } = await supabase
      .from('trades_public')
      .select('*', { count: 'exact', head: true })
    
    console.log(`📊 Found ${initialCount || 0} rows`)
    
    if (initialCount === 0) {
      console.log('✅ Table is already empty')
      return
    }
    
    // Try to use RPC function if it exists (fastest)
    console.log('⚡ Attempting fast truncate via RPC...')
    const { data: rpcResult, error: rpcError } = await supabase.rpc('truncate_trades_public')
    
    if (!rpcError && rpcResult) {
      console.log('✅ Truncated via RPC function')
      return
    }
    
    // Fallback: Delete in large batches
    console.log('⚡ Using batch delete (this may take a moment)...')
    let deleted = 0
    const batchSize = 5000 // Larger batches
    
    while (true) {
      // Get a batch of trade_ids
      const { data: batch, error: fetchError } = await supabase
        .from('trades_public')
        .select('trade_id')
        .limit(batchSize)
      
      if (fetchError || !batch || batch.length === 0) break
      
      const tradeIds = batch.map(r => r.trade_id).filter(Boolean)
      
      if (tradeIds.length === 0) break
      
      // Delete this batch
      const { error: deleteError } = await supabase
        .from('trades_public')
        .delete()
        .in('trade_id', tradeIds)
      
      if (deleteError) {
        console.error('❌ Error:', deleteError.message)
        throw deleteError
      }
      
      deleted += tradeIds.length
      const percent = ((deleted / initialCount) * 100).toFixed(1)
      console.log(`   Deleted ${deleted}/${initialCount} rows (${percent}%)...`)
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    console.log(`✅ Successfully deleted ${deleted} rows from trades_public`)
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('')
    console.error('💡 If this fails, create an RPC function in Supabase SQL Editor:')
    console.error('   CREATE OR REPLACE FUNCTION truncate_trades_public()')
    console.error('   RETURNS void AS $$')
    console.error('   BEGIN')
    console.error('     TRUNCATE TABLE trades_public CASCADE;')
    console.error('   END;')
    console.error('   $$ LANGUAGE plpgsql SECURITY DEFINER;')
    throw error
  }
}

truncateTradesPublic()
  .then(() => {
    console.log('✅ Done! Database should be responsive now.')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Failed:', err.message)
    process.exit(1)
  })


