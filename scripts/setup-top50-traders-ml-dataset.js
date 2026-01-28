#!/usr/bin/env node
'use strict'

/**
 * Master script to set up the complete top 50 traders ML dataset.
 * 
 * This script orchestrates:
 * 1. Backfilling trades for top 50 traders
 * 2. Backfilling markets with outcome prices
 * 3. Creating the top50_traders_trades table
 * 4. Exporting to CSV
 * 
 * Usage:
 *   node scripts/setup-top50-traders-ml-dataset.js
 *   node scripts/setup-top50-traders-ml-dataset.js --skip-backfill --skip-outcome-prices
 */

require('dotenv').config({ path: '.env.local' })
const { execSync } = require('child_process')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SKIP_BACKFILL = process.argv.includes('--skip-backfill')
const SKIP_OUTCOME_PRICES = process.argv.includes('--skip-outcome-prices')
const SKIP_TABLE_CREATE = process.argv.includes('--skip-table-create')
const SKIP_EXPORT = process.argv.includes('--skip-export')

async function runStep(name, fn) {
  console.log('\n' + '='.repeat(70))
  console.log(`📋 Step: ${name}`)
  console.log('='.repeat(70))
  try {
    await fn()
    console.log(`✅ ${name} completed`)
  } catch (error) {
    console.error(`❌ ${name} failed:`, error.message)
    throw error
  }
}

async function backfillTrades() {
  if (SKIP_BACKFILL) {
    console.log('⏭️  Skipping trade backfill (--skip-backfill)')
    return
  }
  
  console.log('Running: node scripts/backfill-top50-traders-trades.js')
  execSync('node scripts/backfill-top50-traders-trades.js', {
    stdio: 'inherit',
    cwd: process.cwd()
  })
}

async function backfillOutcomePrices() {
  if (SKIP_OUTCOME_PRICES) {
    console.log('⏭️  Skipping outcome prices backfill (--skip-outcome-prices)')
    return
  }
  
  console.log('Running: node scripts/backfill-top50-markets-outcome-prices.js')
  execSync('node scripts/backfill-top50-markets-outcome-prices.js', {
    stdio: 'inherit',
    cwd: process.cwd()
  })
}

async function createTable() {
  if (SKIP_TABLE_CREATE) {
    console.log('⏭️  Skipping table creation (--skip-table-create)')
    return
  }
  
  console.log('Creating top50_traders_trades table...')
  
  // Read the migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260127_create_top50_traders_trades.sql')
  const fs = require('fs')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  // Execute via Supabase (split by semicolons for individual statements)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))
  
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })
        if (error) {
          // Try direct query if RPC doesn't work
          console.log('  ⚠️  RPC failed, trying direct execution...')
          // Note: Supabase JS client doesn't support DDL directly
          // User will need to run this manually or we use a workaround
          console.log('  ℹ️  Please run the migration manually in Supabase SQL editor:')
          console.log(`     ${migrationPath}`)
          break
        }
      } catch (e) {
        console.log('  ⚠️  SQL execution note: Some DDL statements may need manual execution')
        console.log('  ℹ️  Please run the migration manually in Supabase SQL editor:')
        console.log(`     ${migrationPath}`)
        break
      }
    }
  }
  
  // Check if table exists
  const { data, error } = await supabase
    .from('top50_traders_trades')
    .select('*', { count: 'exact', head: true })
  
  if (error && error.code !== 'PGRST116') {
    console.log('  ⚠️  Table may not exist yet. Please run the migration manually:')
    console.log(`     ${migrationPath}`)
  } else {
    console.log(`  ✅ Table exists with ${data?.length || 0} rows`)
  }
}

async function exportCSV() {
  if (SKIP_EXPORT) {
    console.log('⏭️  Skipping CSV export (--skip-export)')
    return
  }
  
  const outputFile = `top50_ml_full_${Date.now()}.csv`
  console.log(`Running: node scripts/export-top50-ml-csv.js --output=${outputFile}`)
  execSync(`node scripts/export-top50-ml-csv.js --output=${outputFile}`, {
    stdio: 'inherit',
    cwd: process.cwd()
  })
  console.log(`\n✅ CSV exported to: ${outputFile}`)
}

async function populateExistingTrades() {
  if (process.argv.includes('--skip-populate')) {
    console.log('⏭️  Skipping existing trades population (--skip-populate)')
    return
  }
  
  console.log('Running: node scripts/populate-top50-traders-trades.js')
  execSync('node scripts/populate-top50-traders-trades.js', {
    stdio: 'inherit',
    cwd: process.cwd()
  })
}

async function main() {
  console.log('='.repeat(70))
  console.log('🚀 Top 50 Traders ML Dataset Setup')
  console.log('='.repeat(70))
  console.log('\nThis script will:')
  console.log('  1. Create top50_traders_trades table')
  console.log('  2. Populate table with existing trades')
  console.log('  3. Backfill new trades for top 50 traders')
  console.log('  4. Backfill markets with outcome prices')
  console.log('  5. Export to CSV for ML training')
  console.log('\nUse --skip-* flags to skip steps')
  
  try {
    await runStep('Create Table', createTable)
    await runStep('Populate Existing Trades', populateExistingTrades)
    await runStep('Backfill New Trades', backfillTrades)
    await runStep('Backfill Outcome Prices', backfillOutcomePrices)
    await runStep('Export CSV', exportCSV)
    
    console.log('\n' + '='.repeat(70))
    console.log('✨ Setup Complete!')
    console.log('='.repeat(70))
    console.log('\nNext steps:')
    console.log('  1. Verify the top50_traders_trades table in Supabase')
    console.log('  2. Check the exported CSV file')
    console.log('  3. Use the CSV for ML training')
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  process.exit(1)
})
