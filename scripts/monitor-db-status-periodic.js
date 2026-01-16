#!/usr/bin/env node

/**
 * Monitor database status every 5 minutes and report
 * Runs continuously until stopped (Ctrl+C)
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
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let checkCount = 0
let startTime = Date.now()

function getTimestamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: true,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

async function checkDatabase() {
  const timestamp = getTimestamp()
  checkCount++
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  
  console.log(`\n${'='.repeat(60)}`)
  console.log(`[Check #${checkCount}] ${timestamp} (${elapsed} min elapsed)`)
  console.log(`${'='.repeat(60)}`)
  
  try {
    // Test 1: Health endpoint
    console.log('🔍 Testing health endpoint...')
    let healthStatus = 'unknown'
    try {
      const healthUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      healthStatus = `${response.status} ${response.statusText}`
      if (response.ok) {
        console.log(`   ✅ Health endpoint: ${healthStatus}`)
      } else {
        console.log(`   ❌ Health endpoint: ${healthStatus}`)
      }
    } catch (fetchError) {
      healthStatus = `Error: ${fetchError.message}`
      console.log(`   ❌ Health endpoint: ${healthStatus}`)
    }
    
    // Test 2: Database query
    console.log('🔍 Testing database query...')
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (error) {
      console.log(`   ❌ Database query failed:`)
      console.log(`      Code: ${error.code || 'N/A'}`)
      console.log(`      Message: ${error.message}`)
      console.log(`      Details: ${error.details || 'N/A'}`)
      console.log(`   📊 Status: DATABASE DOWN`)
      return false
    }
    
    console.log(`   ✅ Database query successful`)
    console.log(`   📊 Status: DATABASE ONLINE! 🎉`)
    console.log(`\n🚨 ACTION REQUIRED:`)
    console.log(`   1. Go to Supabase Dashboard → SQL Editor`)
    console.log(`   2. Run cleanup script: scripts/smart-trades-cleanup.sql`)
    console.log(`   3. Do this IMMEDIATELY!`)
    return true
    
  } catch (error) {
    console.log(`   ❌ Unexpected error: ${error.message}`)
    console.log(`   📊 Status: DATABASE DOWN`)
    return false
  }
}

async function monitor() {
  console.log('🚀 Starting database monitoring...')
  console.log(`📍 URL: ${SUPABASE_URL}`)
  console.log(`⏰ Checking every 5 minutes`)
  console.log(`Press Ctrl+C to stop\n`)
  
  // Initial check
  const isOnline = await checkDatabase()
  
  if (isOnline) {
    console.log('\n✅ Database is already online! Run cleanup script now!')
    process.exit(0)
  }
  
  // Continue monitoring
  while (true) {
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS))
    
    const isOnline = await checkDatabase()
    
    if (isOnline) {
      console.log('\n✅ Database came back online! Run cleanup script immediately!')
      // Keep running to confirm it stays online
      console.log('   (Continuing to monitor - database is online)')
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Monitoring stopped by user')
  console.log(`   Total checks: ${checkCount}`)
  console.log(`   Total time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`)
  process.exit(0)
})

monitor().catch(err => {
  console.error('\n❌ Monitor error:', err.message)
  process.exit(1)
})
