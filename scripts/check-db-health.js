#!/usr/bin/env node
/**
 * Check database health and identify issues
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

async function checkTableSize(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      return { error: error.message }
    }
    
    return { count: count || 0 }
  } catch (error) {
    return { error: error.message }
  }
}

async function checkDatabaseHealth() {
  console.log('🔍 Checking database health...\n')
  
  const tables = [
    'trades_public',
    'positions_current',
    'positions_closed',
    'wallet_poll_state',
    'follows',
    'profiles',
    'traders',
    'orders',
    'clob_credentials',
    'user_clob_orders'
  ]
  
  const results = {}
  
  for (const table of tables) {
    process.stdout.write(`Checking ${table}... `)
    const result = await checkTableSize(table)
    if (result.error) {
      console.log(`❌ Error: ${result.error}`)
      results[table] = { error: result.error, count: 0 }
    } else {
      const count = result.count || 0
      console.log(`✅ ${count.toLocaleString()} rows`)
      results[table] = { count }
    }
  }
  
  console.log('\n📊 Summary:')
  console.log('─'.repeat(60))
  
  const largeTables = Object.entries(results)
    .filter(([_, data]) => data.count > 10000)
    .sort(([_, a], [__, b]) => (b.count || 0) - (a.count || 0))
  
  if (largeTables.length > 0) {
    console.log('\n⚠️  Large tables (potential performance issues):')
    largeTables.forEach(([table, data]) => {
      console.log(`   ${table}: ${data.count.toLocaleString()} rows`)
    })
  } else {
    console.log('\n✅ No unusually large tables found')
  }
  
  // Check for specific issues
  console.log('\n🔍 Potential Issues:')
  
  if (results.trades_public?.count > 100000) {
    console.log('   ⚠️  trades_public has >100k rows - may need cleanup')
  }
  
  if (results.positions_current?.count > 50000) {
    console.log('   ⚠️  positions_current has >50k rows - may need cleanup')
  }
  
  if (results.positions_closed?.count > 100000) {
    console.log('   ⚠️  positions_closed has >100k rows - may need cleanup')
  }
  
  if (results.wallet_poll_state?.count > 10000) {
    console.log('   ⚠️  wallet_poll_state has >10k rows - many wallets being tracked')
  }
  
  console.log('\n💡 Recommendations:')
  console.log('   1. Check slow queries in Supabase Dashboard → Database → Query Performance')
  console.log('   2. Check for missing indexes on frequently queried columns')
  console.log('   3. Consider archiving old data from trades_public and positions_closed')
  console.log('   4. Check database connection pool usage')
}

checkDatabaseHealth()
  .then(() => {
    console.log('\n✅ Health check complete')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })
