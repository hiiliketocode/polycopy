#!/usr/bin/env node

/**
 * Sync all wallet addresses from Supabase traders table to BigQuery traders table
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { execSync } = require('child_process')
const fs = require('fs')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PROJECT_ID = 'gen-lang-client-0299056258'
const DATASET = 'polycopy_v1'
const TABLE = 'traders'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('='.repeat(60))
  console.log('🔄 Syncing traders from Supabase to BigQuery')
  console.log('='.repeat(60))
  
  try {
    // Fetch all wallet addresses from Supabase traders table
    console.log('\n📊 Fetching wallet addresses from Supabase...')
    const { data: traders, error } = await supabase
      .from('traders')
      .select('wallet_address')
      .not('wallet_address', 'is', null)
    
    if (error) {
      console.error('❌ Error fetching traders:', error.message)
      process.exit(1)
    }
    
    if (!traders || traders.length === 0) {
      console.log('⚠️  No traders found in Supabase')
      return
    }
    
    // Extract unique wallet addresses
    const wallets = [...new Set(traders.map(t => t.wallet_address?.toLowerCase().trim()).filter(Boolean))]
    console.log(`✅ Found ${wallets.length} unique wallet addresses`)
    
    if (wallets.length === 0) {
      console.log('⚠️  No valid wallet addresses found')
      return
    }
    
    // Check existing wallets in BigQuery
    console.log('\n📊 Checking existing wallets in BigQuery...')
    const checkQuery = `SELECT wallet_address FROM \\\`${PROJECT_ID}.${DATASET}.${TABLE}\\\``
    let existingWallets = new Set()
    
    try {
      const checkResult = execSync(
        `bq query --use_legacy_sql=false --format=json --project_id=${PROJECT_ID} '${checkQuery}'`,
        { encoding: 'utf-8' }
      )
      const existing = JSON.parse(checkResult)
      if (existing && existing.length > 0) {
        existingWallets = new Set(existing.map(row => row.wallet_address?.toLowerCase()))
      }
    } catch (e) {
      // Table might not exist or be empty, that's okay
      console.log('ℹ️  No existing wallets found (or table is empty)')
    }
    
    // Filter out wallets that already exist
    const newWallets = wallets.filter(w => !existingWallets.has(w.toLowerCase()))
    console.log(`📊 New wallets to insert: ${newWallets.length}`)
    console.log(`📊 Already in BigQuery: ${wallets.length - newWallets.length}`)
    
    if (newWallets.length === 0) {
      console.log('\n✅ All wallets already synced to BigQuery!')
      return
    }
    
    // Insert in batches of 1000 (BigQuery limit)
    const BATCH_SIZE = 1000
    let inserted = 0
    
    // Write wallets to JSON file for bq load
    const fs = require('fs')
    const tempFile = '/tmp/traders_wallets.json'
    
    for (let i = 0; i < newWallets.length; i += BATCH_SIZE) {
      const batch = newWallets.slice(i, i + BATCH_SIZE)
      // NEWLINE_DELIMITED_JSON requires one JSON object per line
      const jsonLines = batch.map(w => JSON.stringify({ wallet_address: w })).join('\n')
      
      // Write batch to JSON file (one object per line)
      fs.writeFileSync(tempFile, jsonLines)
      
      console.log(`\n📤 Inserting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} wallets)...`)
      
      try {
        // Use bq load to insert from JSON file
        execSync(
          `bq load --source_format=NEWLINE_DELIMITED_JSON --project_id=${PROJECT_ID} --replace=false ${PROJECT_ID}:${DATASET}.${TABLE} ${tempFile} wallet_address:STRING`,
          { encoding: 'utf-8', stdio: 'inherit' }
        )
        inserted += batch.length
        console.log(`✅ Inserted ${batch.length} wallets (${inserted}/${newWallets.length} total)`)
      } catch (e) {
        console.error(`❌ Error inserting batch:`, e.message)
        throw e
      }
    }
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile)
    } catch (e) {
      // Ignore cleanup errors
    }
    
    console.log('\n' + '='.repeat(60))
    console.log(`✅ Successfully synced ${inserted} wallet addresses to BigQuery!`)
    console.log(`📊 Total wallets in BigQuery: ${wallets.length}`)
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

main()
