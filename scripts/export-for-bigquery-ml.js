#!/usr/bin/env node
'use strict'

/**
 * Export trades and markets separately for BigQuery ML modeling.
 * 
 * This approach:
 * 1. Exports trades table (raw data)
 * 2. Exports markets table (timing data)
 * 3. Provides BigQuery SQL to join and compute timing
 * 
 * This is faster than computing timing in Supabase for 15M+ rows.
 * BigQuery can handle the join and computation efficiently.
 * 
 * Usage:
 *   node scripts/export-for-bigquery-ml.js --output-dir ./bigquery-export
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

const OUTPUT_DIR = process.argv.find(arg => arg.startsWith('--output-dir='))?.split('=')[1] || './bigquery-export'
const TABLE_NAME = process.argv.find(arg => arg.startsWith('--table='))?.split('=')[1] || 'trades'
const BATCH_SIZE = 50000 // Larger batches for raw data export

async function exportTable(tableName, outputFile, filter = null) {
  console.log(`\n📤 Exporting ${tableName}...`)
  
  const writeStream = fs.createWriteStream(outputFile)
  let rowCount = 0
  let offset = 0
  let columns = null
  
  // Get total count
  let countQuery = supabase.from(tableName).select('*', { count: 'exact', head: true })
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      countQuery = countQuery.eq(key, value)
    })
  }
  const { count } = await countQuery
  const totalCount = count || 0
  
  console.log(`  📊 Total rows: ${totalCount.toLocaleString()}`)
  
  while (true) {
    let query = supabase
      .from(tableName)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (filter) {
      Object.entries(filter).forEach(([key, value]) => {
        query = query.eq(key, value)
      })
    }
    
    const { data, error } = await query
    
    if (error) throw error
    if (!data || data.length === 0) break
    
    // Get columns from first batch
    if (!columns) {
      columns = Object.keys(data[0])
      // Write CSV header
      writeStream.write(columns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n')
    }
    
    // Write rows
    for (const row of data) {
      const values = columns.map(col => {
        const val = row[col]
        if (val === null || val === undefined) return ''
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
        return `"${String(val).replace(/"/g, '""')}"`
      })
      writeStream.write(values.join(',') + '\n')
      rowCount++
    }
    
    console.log(`  ✅ ${rowCount.toLocaleString()} / ${totalCount.toLocaleString()} rows (${((rowCount / totalCount) * 100).toFixed(2)}%)`)
    
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) break
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  writeStream.end()
  console.log(`  ✅ Exported ${rowCount.toLocaleString()} rows to ${outputFile}`)
  
  return { rowCount, columns }
}

async function createBigQuerySQL(tradesColumns, marketsColumns) {
  const sql = `
-- BigQuery SQL to create trades_with_timing table
-- Run this after importing trades.csv and markets.csv

CREATE OR REPLACE TABLE \`your-project.polycopy.trades_with_timing\` AS
WITH timing_calc AS (
  SELECT 
    t.*,
    m.game_start_time,
    m.close_time,
    -- Calculate seconds before game start (positive = before, negative = after)
    CASE 
      WHEN m.game_start_time IS NOT NULL 
      THEN TIMESTAMP_DIFF(m.game_start_time, t.timestamp, SECOND)
      ELSE NULL
    END AS seconds_before_game_start,
    -- Calculate seconds before market close (positive = before, negative = after)
    CASE 
      WHEN m.close_time IS NOT NULL 
      THEN TIMESTAMP_DIFF(m.close_time, t.timestamp, SECOND)
      ELSE NULL
    END AS seconds_before_market_end,
    -- Determine timing category
    CASE
      WHEN m.game_start_time IS NOT NULL THEN
        CASE
          WHEN TIMESTAMP_DIFF(m.game_start_time, t.timestamp, SECOND) > 0 THEN 'pre-game'
          WHEN TIMESTAMP_DIFF(m.game_start_time, t.timestamp, SECOND) <= 0 
            AND (m.close_time IS NULL OR TIMESTAMP_DIFF(m.close_time, t.timestamp, SECOND) > 0) 
            THEN 'during-game'
          ELSE 'post-game'
        END
      WHEN m.close_time IS NOT NULL THEN
        CASE
          WHEN TIMESTAMP_DIFF(m.close_time, t.timestamp, SECOND) > 0 THEN 'during-market'
          ELSE 'post-market'
        END
      ELSE 'unknown'
    END AS trade_timing_category
  FROM \`your-project.polycopy.trades\` t
  LEFT JOIN \`your-project.polycopy.markets\` m 
    ON m.condition_id = t.condition_id
  WHERE t.condition_id IS NOT NULL
)
SELECT * FROM timing_calc;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trades_timing_category 
ON \`your-project.polycopy.trades_with_timing\` (trade_timing_category);

CREATE INDEX IF NOT EXISTS idx_trades_wallet_timestamp 
ON \`your-project.polycopy.trades_with_timing\` (wallet_address, timestamp DESC);

-- Example queries:
-- 1. Trades by timing category
-- SELECT trade_timing_category, COUNT(*) as count
-- FROM \`your-project.polycopy.trades_with_timing\`
-- GROUP BY trade_timing_category;

-- 2. Pre-game vs during-game performance
-- SELECT 
--   trade_timing_category,
--   COUNT(*) as trade_count,
--   AVG(price) as avg_price,
--   SUM(shares_normalized) as total_shares
-- FROM \`your-project.polycopy.trades_with_timing\`
-- WHERE trade_timing_category IN ('pre-game', 'during-game')
-- GROUP BY trade_timing_category;

-- 3. Time distribution before game start
-- SELECT 
--   CASE
--     WHEN seconds_before_game_start > 3600 THEN '>1 hour before'
--     WHEN seconds_before_game_start > 1800 THEN '30min-1hr before'
--     WHEN seconds_before_game_start > 600 THEN '10-30min before'
--     WHEN seconds_before_game_start > 0 THEN '<10min before'
--     ELSE 'after game start'
--   END AS time_bucket,
--   COUNT(*) as count
-- FROM \`your-project.polycopy.trades_with_timing\`
-- WHERE seconds_before_game_start IS NOT NULL
-- GROUP BY time_bucket
-- ORDER BY MIN(seconds_before_game_start) DESC;
`
  
  return sql
}

async function main() {
  console.log('='.repeat(60))
  console.log('📤 Exporting trades and markets for BigQuery ML')
  console.log('='.repeat(60))
  console.log(`📁 Output directory: ${OUTPUT_DIR}`)
  console.log(`📋 Table: ${TABLE_NAME}`)
  console.log('')
  
  try {
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    }
    
    // Export trades (from specified table, default: trades)
    const tradesFile = path.join(OUTPUT_DIR, `${TABLE_NAME}.csv`)
    const tradesResult = await exportTable(TABLE_NAME, tradesFile)
    
    // Export markets
    const marketsFile = path.join(OUTPUT_DIR, 'markets.csv')
    const marketsResult = await exportTable('markets', marketsFile)
    
    // Create BigQuery SQL
    const sql = await createBigQuerySQL(tradesResult.columns, marketsResult.columns)
    const sqlFile = path.join(OUTPUT_DIR, 'create_trades_with_timing.sql')
    fs.writeFileSync(sqlFile, sql)
    
    // Create README
    const readme = `# BigQuery ML Export

## Files
- \`${TABLE_NAME}.csv\`: Trades from ${TABLE_NAME} table (${tradesResult.rowCount.toLocaleString()} rows)
- \`markets.csv\`: All markets (${marketsResult.rowCount.toLocaleString()} rows)
- \`create_trades_with_timing.sql\`: BigQuery SQL to create enriched table

## Import Steps

1. **Upload to Google Cloud Storage:**
   \`\`\`bash
   gsutil cp ${TABLE_NAME}.csv gs://your-bucket/polycopy/
   gsutil cp markets.csv gs://your-bucket/polycopy/
   \`\`\`

2. **Create tables in BigQuery:**
   \`\`\`bash
   bq load --source_format=CSV --skip_leading_rows=1 \\
     your-project:polycopy.trades \\
     gs://your-bucket/polycopy/${TABLE_NAME}.csv
   
   bq load --source_format=CSV --skip_leading_rows=1 \\
     your-project:polycopy.markets \\
     gs://your-bucket/polycopy/markets.csv
   \`\`\`

3. **Run the SQL to create trades_with_timing:**
   \`\`\`bash
   bq query --use_legacy_sql=false < create_trades_with_timing.sql
   \`\`\`

4. **Verify:**
   \`\`\`sql
   SELECT COUNT(*) FROM \`your-project.polycopy.trades_with_timing\`;
   SELECT trade_timing_category, COUNT(*) 
   FROM \`your-project.polycopy.trades_with_timing\`
   GROUP BY trade_timing_category;
   \`\`\`

## Timing Columns

- \`seconds_before_game_start\`: Seconds before game start (positive = before, negative = after)
- \`seconds_before_market_end\`: Seconds before market closes (positive = before, negative = after)
- \`trade_timing_category\`: 'pre-game', 'during-game', 'post-game', 'during-market', 'post-market', or 'unknown'

## ML Features

Use these columns for ML modeling:
- Timing features: seconds_before_game_start, seconds_before_market_end, trade_timing_category
- Trade features: price, shares_normalized, side
- Market features: volume_total, status, winning_side
- Temporal features: timestamp (can extract hour, day_of_week, etc.)
`
    
    const readmeFile = path.join(OUTPUT_DIR, 'README.md')
    fs.writeFileSync(readmeFile, readme)
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Export complete!')
    console.log('='.repeat(60))
    console.log(`✅ ${TABLE_NAME}: ${tradesResult.rowCount.toLocaleString()} rows`)
    console.log(`✅ Markets: ${marketsResult.rowCount.toLocaleString()} rows`)
    console.log(`✅ SQL file: ${sqlFile}`)
    console.log(`✅ README: ${readmeFile}`)
    console.log('')
    console.log('📝 Next steps:')
    console.log('   1. Upload CSV files to Google Cloud Storage')
    console.log('   2. Import to BigQuery tables')
    console.log('   3. Run create_trades_with_timing.sql to compute timing')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
