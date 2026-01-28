#!/usr/bin/env node
'use strict'

/**
 * Export a ML-ready dataset for top50_traders_trades as CSV (joined + timing).
 * 
 * It:
 * - Reads trades from public.top50_traders_trades in batches
 * - Fetches corresponding markets rows from public.markets (by condition_id per batch)
 * - Computes timing fields:
 *    - seconds_before_game_start = game_start_time - trade.timestamp (seconds; + before)
 *    - seconds_before_market_end = close_time - trade.timestamp (seconds; + before)
 *    - trade_timing_category per existing calculate_trade_timing logic
 * - Streams a single joined CSV file.
 * 
 * Usage:
 *   node scripts/export-top50-ml-csv.js --output=top50_ml_full.csv
 *   node scripts/export-top50-ml-csv.js --output=top50_ml_sample.csv --limit=1000
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

const OUTPUT = process.argv.find((a) => a.startsWith('--output='))?.split('=')[1] || `top50_ml_${Date.now()}.csv`
const LIMIT_RAW = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]
const LIMIT = LIMIT_RAW ? Number(LIMIT_RAW) : null
const MARKET_CHUNK = 200
const BATCH_SIZE = 1000 // PostgREST max rows per request

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toMs(dateLike) {
  if (!dateLike) return null
  const d = new Date(dateLike)
  const t = d.getTime()
  return Number.isFinite(t) ? t : null
}

function secondsDiffMs(aMs, bMs) {
  if (aMs === null || bMs === null) return null
  return Math.round((aMs - bMs) / 1000)
}

function computeCategory(secondsBeforeGameStart, secondsBeforeMarketEnd, hasGameStart, hasMarketEnd) {
  if (hasGameStart) {
    if (secondsBeforeGameStart === null) return 'unknown'
    if (secondsBeforeGameStart > 0) return 'pre-game'
    // during-game: after game start, before market close (or no close_time)
    if (secondsBeforeGameStart <= 0 && (!hasMarketEnd || (secondsBeforeMarketEnd !== null && secondsBeforeMarketEnd > 0))) {
      return 'during-game'
    }
    return 'post-game'
  }

  if (hasMarketEnd) {
    if (secondsBeforeMarketEnd === null) return 'unknown'
    if (secondsBeforeMarketEnd > 0) return 'during-market'
    return 'post-market'
  }

  return 'unknown'
}

async function fetchMarketsByIds(conditionIds) {
  const marketMap = new Map()
  for (let i = 0; i < conditionIds.length; i += MARKET_CHUNK) {
    const chunk = conditionIds.slice(i, i + MARKET_CHUNK)
    const { data, error } = await supabase
      .from('markets')
      .select('*')
      .in('condition_id', chunk)
    if (error) throw error
    for (const row of data || []) {
      if (row?.condition_id) marketMap.set(row.condition_id, row)
    }
  }
  return marketMap
}

async function getTradeColumns() {
  const { data, error } = await supabase.from('top50_traders_trades').select('*').limit(1)
  if (error) throw error
  if (!data || data.length === 0) throw new Error('No rows in top50_traders_trades')
  return Object.keys(data[0])
}

async function getMarketColumns() {
  const { data, error } = await supabase.from('markets').select('*').limit(1)
  if (error) throw error
  if (!data || data.length === 0) return []
  return Object.keys(data[0])
}

async function getTotalTrades() {
  const { count, error } = await supabase
    .from('top50_traders_trades')
    .select('*', { count: 'exact', head: true })
  if (error) throw error
  return count || 0
}

async function main() {
  console.log('='.repeat(60))
  console.log('📤 Exporting top50 ML CSV (joined + timing)')
  console.log('='.repeat(60))
  console.log(`📁 Output: ${OUTPUT}`)
  if (LIMIT) console.log(`🔢 Limit: ${LIMIT.toLocaleString()}`)
  console.log('')

  const total = await getTotalTrades()
  const target = LIMIT ? Math.min(LIMIT, total) : total
  console.log(`📊 Rows available: ${total.toLocaleString()}`)
  console.log(`📊 Rows exporting: ${target.toLocaleString()}`)

  const tradeCols = await getTradeColumns()
  const marketCols = await getMarketColumns()
  const columns = [
    ...tradeCols,
    ...marketCols.map((c) => `market_${c}`),
    'seconds_before_game_start',
    'seconds_before_market_end',
    'trade_timing_category',
  ]

  const out = fs.createWriteStream(OUTPUT)
  out.write(columns.map(csvEscape).join(',') + '\n')

  let offset = 0
  let written = 0
  const start = Date.now()

  while (written < target) {
    const remaining = target - written
    const thisBatch = Math.min(BATCH_SIZE, remaining)

    const { data: trades, error: tradesError } = await supabase
      .from('top50_traders_trades')
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + thisBatch - 1)

    if (tradesError) throw tradesError
    if (!trades || trades.length === 0) break

    const conditionIds = Array.from(new Set(trades.map((t) => t.condition_id).filter(Boolean)))
    const marketMap = await fetchMarketsByIds(conditionIds)

    for (const t of trades) {
      const m = t.condition_id ? marketMap.get(t.condition_id) : null

      const tradeTsMs = toMs(t.timestamp)
      const gameStartMs = toMs(m?.game_start_time)
      const closeTimeMs = toMs(m?.close_time)

      const seconds_before_game_start = secondsDiffMs(gameStartMs, tradeTsMs)
      const seconds_before_market_end = secondsDiffMs(closeTimeMs, tradeTsMs)

      const hasGameStart = gameStartMs !== null
      const hasMarketEnd = closeTimeMs !== null

      const trade_timing_category = computeCategory(
        seconds_before_game_start,
        seconds_before_market_end,
        hasGameStart,
        hasMarketEnd
      )

      // Write row in consistent column order
      const rowValues = []

      for (const c of tradeCols) rowValues.push(csvEscape(t[c]))
      for (const c of marketCols) rowValues.push(csvEscape(m ? m[c] : null))
      rowValues.push(csvEscape(seconds_before_game_start))
      rowValues.push(csvEscape(seconds_before_market_end))
      rowValues.push(csvEscape(trade_timing_category))

      out.write(rowValues.join(',') + '\n')
      written++
      if (written >= target) break
    }

    offset += trades.length

    const elapsed = (Date.now() - start) / 1000
    const rate = elapsed > 0 ? written / elapsed : 0
    console.log(
      `  ✅ ${written.toLocaleString()} / ${target.toLocaleString()} rows ` +
        `(${((written / target) * 100).toFixed(1)}%) @ ${rate.toFixed(0)} rows/s`
    )

    if (trades.length < thisBatch) break
    await new Promise((r) => setTimeout(r, 75))
  }

  out.end()
  console.log('\n✅ Export complete:', OUTPUT)
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err?.message || err)
  process.exit(1)
})
