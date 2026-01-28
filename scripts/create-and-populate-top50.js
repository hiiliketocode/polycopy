#!/usr/bin/env node
'use strict'

/**
 * Create top50_traders_trades table structure and populate it.
 * This script creates the table structure first, then populates it.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function createTableStructure() {
  console.log('📋 Creating table structure...')
  console.log('⚠️  Note: DDL operations may need to be run manually in Supabase SQL editor')
  console.log('')
  console.log('Please run this SQL in Supabase SQL editor:')
  console.log('='.repeat(70))
  
  const sqlPath = path.join(__dirname, 'create-top50-table-structure.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  console.log(sql)
  console.log('='.repeat(70))
  console.log('')
  console.log('After running the SQL, press Enter to continue with population...')
  
  // Wait for user confirmation (in automated mode, we'll just check if table exists)
  // For now, let's just check if it exists and proceed
  const { data, error } = await supabase
    .from('top50_traders_trades')
    .select('*', { count: 'exact', head: true })
  
  if (error && error.code === 'PGRST116') {
    console.log('❌ Table does not exist yet. Please run the SQL above first.')
    process.exit(1)
  } else if (error) {
    console.log('❌ Error checking table:', error.message)
    process.exit(1)
  }
  
  console.log('✅ Table exists, proceeding with population...')
}

async function main() {
  console.log('='.repeat(70))
  console.log('🚀 Create and Populate top50_traders_trades')
  console.log('='.repeat(70))
  console.log('')
  
  await createTableStructure()
  
  // Now run the populate script
  console.log('\n🔄 Running populate script...\n')
  const { execSync } = require('child_process')
  execSync('node scripts/populate-top50-traders-trades.js', {
    stdio: 'inherit',
    cwd: process.cwd()
  })
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  process.exit(1)
})
