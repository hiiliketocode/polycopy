/**
 * Force backfill PnL for a specific wallet, ignoring skip flags
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DOME_API_KEY = process.env.DOME_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DOME_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node force-backfill-wallet-pnl.js <wallet_address>')
  process.exit(1)
}

const BASE_URL = 'https://api.domeapi.io/v1'
const HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000 // Jan 1 2023 UTC

function toDateString(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDays(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  return Math.floor((end - start) / (24 * 3600 * 1000))
}

async function fetchPnlSeries(wallet, startTime, endTime) {
  const url = new URL(`${BASE_URL}/polymarket/wallet/pnl/${wallet}`)
  url.searchParams.set('granularity', 'day')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))

  console.log(`  📡 Fetching from: ${url.toString()}`)
  
  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${DOME_API_KEY}`
    }
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Dome API error ${response.status}: ${text}`)
  }

  const json = await response.json()
  const series = Array.isArray(json?.pnl_over_time) ? json.pnl_over_time : []
  return series
}

function deriveRows(wallet, series) {
  const rows = []
  const sorted = [...series].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
  let prev = null
  let prevDate = null

  for (const point of sorted) {
    const ts = Number(point.timestamp)
    const cumulative = Number(point.pnl_to_date ?? point.pnlToDate ?? NaN)
    if (!Number.isFinite(ts) || !Number.isFinite(cumulative)) {
      continue
    }
    if (prev === null) {
      prev = cumulative // baseline; no delta row yet
      prevDate = toDateString(ts)
      continue
    }
    const realized = cumulative - prev
    prev = cumulative
    const date = toDateString(ts)
    if (prevDate && date !== prevDate) {
      const gapDays = diffDays(prevDate, date) - 1
      if (gapDays > 0) {
        for (let i = 1; i <= gapDays; i += 1) {
          const gapDate = addDays(prevDate, i)
          rows.push({
            wallet_address: wallet,
            date: gapDate,
            realized_pnl: 0,
            pnl_to_date: cumulative - realized,
            source: 'dome'
          })
        }
      }
    }
    if (!Number.isFinite(realized)) continue
    rows.push({
      wallet_address: wallet,
      date,
      realized_pnl: realized,
      pnl_to_date: cumulative,
      source: 'dome'
    })
    prevDate = date
  }

  return rows
}

async function upsertRows(rows) {
  if (rows.length === 0) return 0
  
  const BATCH_SIZE = 500
  let totalUpserted = 0
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error, count } = await supabase
      .from('wallet_realized_pnl_daily')
      .upsert(batch, { onConflict: 'wallet_address,date', count: 'exact' })
    
    if (error) throw error
    totalUpserted += count ?? batch.length
  }
  
  return totalUpserted
}

async function forceBackfill() {
  console.log(`🚀 Force backfilling PnL for: ${wallet}\n`)
  
  const startTime = HISTORICAL_BASELINE
  const endTime = Math.floor(Date.now() / 1000)
  
  console.log(`📅 Fetching from ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}\n`)
  
  const series = await fetchPnlSeries(wallet, startTime, endTime)
  console.log(`✅ Got ${series.length} data points from Dome API\n`)
  
  if (series.length === 0) {
    console.log('⚠️  No data returned from Dome API')
    return
  }
  
  const rows = deriveRows(wallet, series)
  console.log(`🔨 Derived ${rows.length} rows to upsert\n`)
  
  if (rows.length > 0) {
    console.log(`💾 Upserting ${rows.length} rows...`)
    const upserted = await upsertRows(rows)
    console.log(`✅ Upserted ${upserted} rows\n`)
    
    // Show summary
    const latestRow = rows[rows.length - 1]
    console.log('📊 Summary:')
    console.log(`   Latest date: ${latestRow.date}`)
    console.log(`   Latest pnl_to_date: $${latestRow.pnl_to_date.toFixed(2)}`)
    console.log(`   Total realized_pnl sum: $${rows.reduce((sum, r) => sum + (r.realized_pnl || 0), 0).toFixed(2)}`)
  }
}

forceBackfill().catch(console.error)
