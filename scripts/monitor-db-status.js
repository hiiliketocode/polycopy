#!/usr/bin/env node

/**
 * Monitor Supabase database status and alert when it comes back online
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

async function checkStatus() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (error) {
      console.log(`❌ [${new Date().toISOString()}] Database still down: ${error.message}`)
      return false
    }
    
    console.log(`✅ [${new Date().toISOString()}] Database is back online!`)
    return true
  } catch (error) {
    console.log(`❌ [${new Date().toISOString()}] Error: ${error.message}`)
    return false
  }
}

async function monitor() {
  console.log('🔍 Starting database monitoring...')
  console.log(`📍 URL: ${SUPABASE_URL}`)
  console.log('Press Ctrl+C to stop\n')
  
  let checkCount = 0
  const interval = 30000 // Check every 30 seconds
  
  while (true) {
    checkCount++
    const isOnline = await checkStatus()
    
    if (isOnline) {
      console.log('✅ Database is operational. Exiting monitor.')
      process.exit(0)
    }
    
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

monitor().catch(err => {
  console.error('Monitor error:', err)
  process.exit(1)
})
