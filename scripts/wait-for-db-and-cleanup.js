#!/usr/bin/env node

/**
 * Wait for database to come back online, then run cleanup
 * This script will keep checking and alert you when database is accessible
 */

// Load environment variables
try {
  require('dotenv').config({ path: '.env.local' })
} catch (err) {
  // dotenv not available, continue without it
}

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const CHECK_INTERVAL_MS = 30000 // Check every 30 seconds
const MAX_WAIT_MINUTES = 60 // Stop after 60 minutes

let startTime = Date.now()

async function checkDatabase() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1)
    
    if (error) {
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

async function waitForDatabase() {
  console.log('⏳ Waiting for database to come back online...')
  console.log(`📍 Checking: ${SUPABASE_URL}`)
  console.log(`⏰ Will check for up to ${MAX_WAIT_MINUTES} minutes`)
  console.log('')
  
  let checkCount = 0
  
  while (true) {
    checkCount++
    const elapsed = (Date.now() - startTime) / 1000 / 60
    
    if (elapsed > MAX_WAIT_MINUTES) {
      console.log(`\n⏰ Stopped after ${MAX_WAIT_MINUTES} minutes`)
      console.log('💡 Database still not accessible. Contact Supabase support.')
      process.exit(1)
    }
    
    process.stdout.write(`\r[${checkCount}] Checking... (${elapsed.toFixed(1)} min elapsed)`)
    
    const isOnline = await checkDatabase()
    
    if (isOnline) {
      console.log('\n\n✅ DATABASE IS BACK ONLINE!')
      console.log('')
      console.log('🚨 ACTION REQUIRED:')
      console.log('1. Go to Supabase Dashboard → SQL Editor')
      console.log('2. Run the cleanup script: scripts/smart-trades-cleanup.sql')
      console.log('3. Do this IMMEDIATELY - database may go down again!')
      console.log('')
      console.log('📋 Quick cleanup SQL (copy this):')
      console.log('---')
      
      // Read and display the cleanup script
      const cleanupScript = path.join(__dirname, 'smart-trades-cleanup.sql')
      if (fs.existsSync(cleanupScript)) {
        const script = fs.readFileSync(cleanupScript, 'utf8')
        console.log(script.substring(0, 500) + '...')
        console.log('---')
        console.log(`Full script at: ${cleanupScript}`)
      }
      
      // Make a sound/notification if possible
      console.log('\n🔔 Database is accessible - run cleanup NOW!')
      
      process.exit(0)
    }
    
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS))
  }
}

waitForDatabase().catch(err => {
  console.error('\n❌ Error:', err.message)
  process.exit(1)
})
