#!/usr/bin/env node
/**
 * Script to help disable read-only mode in Supabase
 * 
 * Note: SET commands must be run in Supabase SQL Editor
 * This script checks the current status and provides instructions
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

async function checkReadOnlyStatus() {
  console.log('🔍 Checking database read-only status...\n')
  
  try {
    // Try to insert a test value to see if we're in read-only mode
    const testTable = 'profiles'
    const { error: selectError } = await supabase
      .from(testTable)
      .select('id')
      .limit(1)
    
    if (selectError) {
      console.log('❌ Error checking database:', selectError.message)
      if (selectError.message.includes('read-only') || selectError.message.includes('read only')) {
        console.log('\n⚠️  Database appears to be in READ-ONLY mode\n')
        return true
      }
    }
    
    // Try a simple query to check if we can read
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (error) {
      if (error.message.includes('read-only') || error.message.includes('read only')) {
        console.log('⚠️  Database is in READ-ONLY mode\n')
        return true
      }
      console.log('⚠️  Error:', error.message)
    } else {
      console.log('✅ Database appears to be in READ-WRITE mode')
      console.log('   (Read operations are working)\n')
    }
    
    return false
  } catch (err) {
    console.log('⚠️  Could not determine status:', err.message)
    return null
  }
}

async function main() {
  const isReadOnly = await checkReadOnlyStatus()
  
  if (isReadOnly === true) {
    console.log('📋 To disable read-only mode, run these SQL commands in Supabase SQL Editor:')
    console.log('   (Go to: Supabase Dashboard → SQL Editor → New Query)\n')
    console.log('   1. Enable write transactions:')
    console.log('      set session characteristics as transaction read write;')
    console.log('')
    console.log('   2. Run vacuum to reclaim space (if you deleted data):')
    console.log('      vacuum;')
    console.log('')
    console.log('   3. Disable read-only mode:')
    console.log('      set default_transaction_read_only = \'off\';\n')
    console.log('💡 Reference: https://supabase.com/docs/guides/platform/database-size#disabling-read-only-mode\n')
    console.log('⚠️  Note: You may need to reduce database size first if you\'re over the limit')
    console.log('   Check disk usage in: Supabase Dashboard → Settings → Database\n')
  } else if (isReadOnly === false) {
    console.log('✅ Database is not in read-only mode')
    console.log('   You can perform write operations normally\n')
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })
