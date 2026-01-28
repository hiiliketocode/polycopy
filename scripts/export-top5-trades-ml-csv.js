#!/usr/bin/env node
'use strict'

/**
 * Export ML-ready top5 trades dataset to CSV.
 *
 * Source: public.top5_trades_ml (VIEW)
 *
 * Usage:
 *   node scripts/export-top5-trades-ml-csv.js --output=top5_trades_ml_sample.csv --limit=500
 *   node scripts/export-top5-trades-ml-csv.js --output=top5_trades_ml_full.csv
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VIEW = 'top5_trades_ml'
const OUTPUT = process.argv.find((a) => a.startsWith('--output='))?.split('=')[1] || `top5_trades_ml_${Date.now()}.csv`
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || '') || null
const BATCH_SIZE = 1000 // PostgREST default max rows

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`
  }
  const s = String(value)
  // Quote if needed
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function getColumns() {
  const { data, error } = await supabase.from(VIEW).select('*').limit(1)
  if (error) throw error
  if (!data || data.length === 0) throw new Error(`No rows in ${VIEW}`)
  return Object.keys(data[0])
}

async function getTotalCount() {
  const { count, error } = await supabase.from(VIEW).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count || 0
}

async function main() {
  console.log('='.repeat(60))
  console.log('📤 Exporting top5_trades_ml to CSV')
  console.log('='.repeat(60))
  console.log(`📁 Output: ${OUTPUT}`)
  if (LIMIT) console.log(`🔢 Limit: ${LIMIT.toLocaleString()}`)
  console.log('')

  const total = await getTotalCount()
  const target = LIMIT ? Math.min(LIMIT, total) : total
  console.log(`📊 Rows available: ${total.toLocaleString()}`)
  console.log(`📊 Rows exporting: ${target.toLocaleString()}`)

  const columns = await getColumns()
  console.log(`📋 Columns: ${columns.length}`)

  const out = fs.createWriteStream(OUTPUT)
  out.write(columns.map(csvEscape).join(',') + '\n')

  let offset = 0
  let written = 0
  const start = Date.now()

  while (written < target) {
    const remaining = target - written
    const thisBatch = Math.min(BATCH_SIZE, remaining)

    const { data, error } = await supabase
      .from(VIEW)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + thisBatch - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    for (const row of data) {
      out.write(columns.map((c) => csvEscape(row[c])).join(',') + '\n')
      written++
      if (written >= target) break
    }

    offset += data.length

    const elapsed = (Date.now() - start) / 1000
    const rate = elapsed > 0 ? written / elapsed : 0
    console.log(`  ✅ ${written.toLocaleString()} / ${target.toLocaleString()} rows (${((written / target) * 100).toFixed(1)}%) @ ${rate.toFixed(0)} rows/s`)

    if (data.length < thisBatch) break
    await new Promise((r) => setTimeout(r, 75))
  }

  out.end()
  console.log('\n✅ Export complete:', OUTPUT)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err?.message || err)
  process.exit(1)
})

