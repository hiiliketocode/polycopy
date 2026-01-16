#!/usr/bin/env node

/**
 * Quick script to test Supabase database connection
 */

// Load environment variables
try {
  require('dotenv').config({ path: '.env.local' })
} catch (err) {
  // dotenv not available, continue without it
}

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function testConnection() {
  console.log('🔍 Testing Supabase database connection...')
  console.log(`📍 URL: ${SUPABASE_URL}`)
  console.log(`🔑 Service Role Key: ${SUPABASE_SERVICE_ROLE_KEY ? SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...' : 'MISSING'}`)
  console.log('')

  try {
    // Test 1: Health check endpoint
    console.log('Test 1: Checking Supabase health endpoint...')
    try {
      const healthUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      })
      console.log(`   Status: ${response.status} ${response.statusText}`)
      if (!response.ok) {
        console.error(`   ❌ Health check failed: ${response.statusText}`)
      } else {
        console.log('   ✅ Health endpoint reachable')
      }
    } catch (fetchError) {
      console.error('   ❌ Network error:', fetchError.message)
    }
    console.log('')

    // Test 2: Simple query to check connection
    console.log('Test 2: Basic database query test...')
    const { data: testData, error: testError } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (testError) {
      console.error('❌ Connection failed:', testError.message)
      console.error('   Code:', testError.code)
      console.error('   Details:', testError.details)
      console.error('   Hint:', testError.hint)
      
      if (testError.code === 'PGRST002') {
        console.error('')
        console.error('⚠️  PGRST002 Error: Database schema cache issue')
        console.error('   This usually means:')
        console.error('   - Database is down or unreachable')
        console.error('   - Connection pool is exhausted')
        console.error('   - Network connectivity issues')
        console.error('   - Supabase project may be paused (free tier)')
      }
      process.exit(1)
    }
    
    console.log('✅ Basic connection successful')
    console.log('')

    // Test 2: Check a few key tables
    console.log('Test 2: Checking key tables...')
    const tables = ['profiles', 'traders', 'trades', 'markets']
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      
      if (error) {
        console.log(`   ⚠️  ${table}: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: ${count ?? 'unknown'} rows`)
      }
    }
    
    console.log('')
    console.log('✅ Database connection is healthy!')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message)
    console.error('   Stack:', error.stack)
    process.exit(1)
  }
}

testConnection()
