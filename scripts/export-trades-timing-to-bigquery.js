#!/usr/bin/env node
'use strict'

/**
 * Export trades with timing data to BigQuery for ML modeling.
 * 
 * This script:
 * 1. Queries trades_with_timing view in batches (computes timing on-demand)
 * 2. Exports to CSV/JSON files for BigQuery import
 * 3. Can also stream directly to BigQuery if credentials provided
 * 
 * Usage:
 *   node scripts/export-trades-timing-to-bigquery.js --format csv --output trades_timing.csv
 *   node scripts/export-trades-timing-to-bigquery.js --format json --output trades_timing.json
 *   node scripts/export-trades-timing-to-bigquery.js --format bigquery --project my-project --dataset polycopy
 *   node scripts/export-trades-timing-to-bigquery.js --wallet 0x... --format csv
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
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

// Configuration
const FORMAT = process.argv.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'csv'
const OUTPUT = process.argv.find(arg => arg.startsWith('--output='))?.split('=')[1] || `trades_timing_${Date.now()}.${FORMAT}`
const WALLET = process.argv.find(arg => arg.startsWith('--wallet='))?.split('=')[1]
const BATCH_SIZE = 10000
const BIGQUERY_PROJECT = process.argv.find(arg => arg.startsWith('--project='))?.split('=')[1]
const BIGQUERY_DATASET = process.argv.find(arg => arg.startsWith('--dataset='))?.split('=')[1]

let writeStream = null
let rowCount = 0
let batchCount = 0

function formatValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    // Escape quotes and wrap in quotes for CSV
    return `"${value.replace(/"/g, '""')}"`
  }
  return String(value)
}

function writeCSVHeader(columns) {
  if (rowCount === 0) {
    writeStream.write(columns.map(c => formatValue(c)).join(',') + '\n')
  }
}

function writeCSVRow(row, columns) {
  writeStream.write(columns.map(col => formatValue(row[col])).join(',') + '\n')
}

function writeJSONRow(row) {
  if (rowCount === 0) {
    writeStream.write('[\n')
  } else {
    writeStream.write(',\n')
  }
  writeStream.write(JSON.stringify(row))
}

function closeJSON() {
  if (rowCount > 0) {
    writeStream.write('\n]')
  }
}

async function exportToBigQuery(rows) {
  // This would require @google-cloud/bigquery package
  // For now, just log that BigQuery export would happen here
  console.log(`  📊 Would stream ${rows.length} rows to BigQuery: ${BIGQUERY_PROJECT}.${BIGQUERY_DATASET}.trades_timing`)
  // TODO: Implement BigQuery streaming if package is available
  throw new Error('BigQuery export requires @google-cloud/bigquery package. Export to CSV/JSON first, then import to BigQuery.')
}

async function processBatch(offset, columns) {
  let query = supabase
    .from('trades_with_timing')
    .select('*')
    .order('id', { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1)
  
  if (WALLET) {
    query = query.eq('wallet_address', WALLET.toLowerCase())
  }
  
  const { data, error } = await query
  
  if (error) throw error
  
  if (!data || data.length === 0) {
    return false // No more data
  }
  
  // Write rows
  for (const row of data) {
    if (FORMAT === 'csv') {
      writeCSVRow(row, columns)
    } else if (FORMAT === 'json') {
      writeJSONRow(row)
    } else if (FORMAT === 'bigquery') {
      // Would batch and stream to BigQuery
      await exportToBigQuery([row])
    }
    
    rowCount++
  }
  
  batchCount++
  return true // More data available
}

async function getColumns() {
  // Get column names from a sample query
  const { data, error } = await supabase
    .from('trades_with_timing')
    .select('*')
    .limit(1)
  
  if (error) throw error
  
  if (!data || data.length === 0) {
    throw new Error('No data in trades_with_timing view')
  }
  
  return Object.keys(data[0])
}

async function getTotalCount() {
  let query = supabase
    .from('trades_with_timing')
    .select('*', { count: 'exact', head: true })
  
  if (WALLET) {
    query = query.eq('wallet_address', WALLET.toLowerCase())
  }
  
  const { count, error } = await query
  
  if (error) throw error
  return count || 0
}

async function main() {
  console.log('='.repeat(60))
  console.log('📤 Exporting trades with timing data')
  console.log('='.repeat(60))
  console.log(`📊 Format: ${FORMAT}`)
  console.log(`📁 Output: ${OUTPUT}`)
  if (WALLET) {
    console.log(`👤 Wallet filter: ${WALLET}`)
  }
  console.log('')
  
  try {
    // Get total count
    const totalCount = await getTotalCount()
    console.log(`📊 Total rows to export: ${totalCount.toLocaleString()}`)
    
    if (totalCount === 0) {
      console.log('❌ No data to export')
      return
    }
    
    // Get columns
    const columns = await getColumns()
    console.log(`📋 Columns: ${columns.length}`)
    console.log('')
    
    // Open output file
    if (FORMAT === 'bigquery') {
      if (!BIGQUERY_PROJECT || !BIGQUERY_DATASET) {
        throw new Error('BigQuery export requires --project and --dataset parameters')
      }
      console.log(`🔗 BigQuery: ${BIGQUERY_PROJECT}.${BIGQUERY_DATASET}.trades_timing`)
    } else {
      writeStream = fs.createWriteStream(OUTPUT)
      console.log(`📝 Writing to: ${OUTPUT}`)
      
      if (FORMAT === 'csv') {
        writeCSVHeader(columns)
      }
    }
    
    // Process in batches
    let offset = 0
    const startTime = Date.now()
    
    while (true) {
      const hasMore = await processBatch(offset, columns)
      
      if (!hasMore) break
      
      const elapsed = Date.now() - startTime
      const rate = rowCount / (elapsed / 1000)
      const remaining = totalCount - rowCount
      const eta = remaining / rate
      
      console.log(`  ✅ Batch ${batchCount}: ${rowCount.toLocaleString()} / ${totalCount.toLocaleString()} rows (${((rowCount / totalCount) * 100).toFixed(2)}%)`)
      console.log(`     ⚡ Rate: ${rate.toFixed(0)} rows/sec`)
      if (eta > 0 && eta < Infinity) {
        console.log(`     ⏱️  ETA: ${Math.floor(eta / 60)}m ${Math.floor(eta % 60)}s`)
      }
      
      offset += BATCH_SIZE
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Close file
    if (writeStream) {
      if (FORMAT === 'json') {
        closeJSON()
      }
      writeStream.end()
    }
    
    const totalTime = Date.now() - startTime
    console.log('\n' + '='.repeat(60))
    console.log('✅ Export complete!')
    console.log('='.repeat(60))
    console.log(`✅ Total rows exported: ${rowCount.toLocaleString()}`)
    console.log(`⏱️  Total time: ${Math.floor(totalTime / 1000)}s`)
    console.log(`⚡ Average rate: ${(rowCount / (totalTime / 1000)).toFixed(0)} rows/sec`)
    
    if (FORMAT === 'csv' || FORMAT === 'json') {
      const stats = fs.statSync(OUTPUT)
      console.log(`📦 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
      console.log('')
      console.log('📝 Next steps for BigQuery:')
      console.log(`   1. Upload ${OUTPUT} to Google Cloud Storage`)
      console.log(`   2. Create table in BigQuery: trades_timing`)
      console.log(`   3. Load from GCS: bq load --source_format=${FORMAT.toUpperCase()} ${BIGQUERY_DATASET || 'polycopy'}.trades_timing gs://your-bucket/${OUTPUT}`)
    }
    
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    if (writeStream) {
      writeStream.end()
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
