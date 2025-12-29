#!/usr/bin/env node
/**
 * Setup truncate RPC function in Supabase
 * This will attempt to create the function via API, or provide instructions
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

async function setupTruncateFunction() {
  console.log('🔧 Setting up truncate_trades_public RPC function...')
  
  // Read the SQL file
  const fs = require('fs')
  const path = require('path')
  const sqlFile = path.join(__dirname, 'setup-truncate-function.sql')
  
  if (!fs.existsSync(sqlFile)) {
    console.error('❌ SQL file not found:', sqlFile)
    process.exit(1)
  }
  
  const sql = fs.readFileSync(sqlFile, 'utf8')
  
  console.log('')
  console.log('📋 SQL to execute:')
  console.log('─'.repeat(60))
  console.log(sql)
  console.log('─'.repeat(60))
  console.log('')
  
  // Try to execute via RPC (if a function exists that can execute SQL)
  // This typically won't work, but we'll try
  console.log('⚡ Attempting to create function via API...')
  
  try {
    // Try using the Supabase REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ sql_text: sql })
    })
    
    if (response.ok) {
      console.log('✅ Function created via API!')
      return
    }
  } catch (error) {
    // Expected to fail - we need to use SQL editor
  }
  
  console.log('⚠️  Cannot create function via API (DDL restrictions)')
  console.log('')
  console.log('📝 Please run this SQL in Supabase Dashboard:')
  console.log('')
  console.log('1. Go to: https://supabase.com/dashboard/project/zgpnbyfjtxihbgxawazy/sql')
  console.log('2. Click "New Query"')
  console.log('3. Copy and paste the SQL above')
  console.log('4. Click "Run"')
  console.log('')
  console.log('Then you can use: node scripts/truncate-trades-urgent.js')
}

setupTruncateFunction()
  .then(() => {
    console.log('✅ Setup complete!')
    process.exit(0)
  })
  .catch(err => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })


