'use strict'

/**
 * Backfill realized PnL (daily) and wallet metrics for active traders using the Dome API.
 *
 * - Fetches daily cumulative realized PnL (`pnl_to_date`) and derives per-day deltas (`realized_pnl`).
 * - Uses a baseline day before the current data to compute the first delta.
 * - Upserts into public.wallet_realized_pnl_daily and updates trader metrics (volume, total_trades, markets_traded).
 *
 * Env:
 *   DOME_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/backfill-wallet-pnl.js
 */

const fs = require('fs')
const path = require('path')
let dotenv = null
try {
  dotenv = require('dotenv')
} catch (err) {
  if (err?.code !== 'MODULE_NOT_FOUND') {
    throw err
  }
}
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
if (dotenv && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const DOME_API_KEY = process.env.DOME_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DOME_API_KEY) throw new Error('Missing DOME_API_KEY')
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BASE_URL = 'https://api.domeapi.io/v1'
const SLEEP_MS = 250 // tune if hitting rate limits
const UPSERT_BATCH = 500
const MAX_RETRIES = 3
const HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000 // Jan 1 2023 UTC, adjust if you want deeper history

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const res = await fetch(url, options)
  if (res.ok) return res

  // Retry on 429/5xx with simple backoff
  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const delay = SLEEP_MS * attempt
    console.warn(`Retrying ${url} after ${delay}ms (status ${res.status})`)
    await sleep(delay)
    return fetchWithRetry(url, options, attempt + 1)
  }

  const body = await res.text()
  throw new Error(`Request failed (${res.status}): ${body || res.statusText}`)
}

function toDateString(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10) // YYYY-MM-DD in UTC
}

async function fetchLatestDateForWallet(wallet) {
  const { data, error } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('date')
    .eq('wallet_address', wallet)
    .order('date', { ascending: false })
    .limit(1)
  if (error) {
    console.error(`[${wallet}] failed to read latest date`, error)
    return null
  }
  return data && data.length > 0 ? data[0].date : null
}

async function fetchPnlSeries(wallet, startTime, endTime) {
  // Correct endpoint format per https://docs.domeapi.io/api-reference/endpoint/get-wallet-pnl
  // Wallet address goes in the path, not as query parameter
  const url = new URL(`${BASE_URL}/polymarket/wallet/pnl/${wallet}`)
  url.searchParams.set('granularity', 'day')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))

  try {
    const res = await fetchWithRetry(url.toString(), {
      headers: {
        'Authorization': `Bearer ${DOME_API_KEY}`
      }
    })

    const json = await res.json()
    const series = Array.isArray(json?.pnl_over_time) ? json.pnl_over_time : []
    // Each item expected: { timestamp: number, pnl_to_date: number }
    return series
  } catch (err) {
    // If endpoint doesn't exist (404) or other errors, return empty array
    // This allows the script to continue with metrics updates
    if (err.message?.includes('404') || err.message?.includes('route not found')) {
      return []
    }
    throw err
  }
}

function deriveRows(wallet, series) {
  const rows = []
  const sorted = [...series].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
  let prev = null

  for (const point of sorted) {
    const ts = Number(point.timestamp)
    const cumulative = Number(point.pnl_to_date ?? point.pnlToDate ?? NaN)
    if (!Number.isFinite(ts) || !Number.isFinite(cumulative)) {
      continue
    }
    if (prev === null) {
      prev = cumulative // baseline; no delta row yet
      continue
    }
    const realized = cumulative - prev
    prev = cumulative
    const date = toDateString(ts)
    if (!Number.isFinite(realized)) continue
    rows.push({
      wallet_address: wallet,
      date,
      realized_pnl: realized,
      pnl_to_date: cumulative,
      source: 'dome'
    })
  }

  return rows
}

async function upsertRows(rows) {
  let total = 0
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH)
    const { error, count } = await supabase
      .from('wallet_realized_pnl_daily')
      .upsert(chunk, { onConflict: 'wallet_address,date', count: 'exact' })
    if (error) throw error
    total += count ?? chunk.length
  }
  return total
}

async function updateTraderMetrics(wallet, metrics) {
  const volume = metrics?.volume ?? metrics?.vol ?? null
  const totalTrades = metrics?.total_trades ?? metrics?.totalTrades ?? null
  const marketsTraded = metrics?.markets_traded ?? metrics?.marketsTraded ?? null

  const { error } = await supabase
    .from('traders')
    .update({
      volume,
      total_trades: totalTrades,
      markets_traded: marketsTraded,
      updated_at: new Date().toISOString()
    })
    .eq('wallet_address', wallet)

  if (error) throw error
}

async function fetchMetrics(wallet) {
  const url = new URL(`${BASE_URL}/polymarket/wallet`)
  url.searchParams.set('eoa', wallet)
  url.searchParams.set('with_metrics', 'true')

  try {
    const res = await fetchWithRetry(url.toString(), {
      headers: { 'Authorization': `Bearer ${DOME_API_KEY}` }
    })
    const json = await res.json()
    
    // If wallet not found, return null (don't throw)
    if (json?.error && (json.message?.includes('No wallet mapping') || json.message?.includes('Not Found'))) {
      return null
    }
    
    return json?.metrics ?? null
  } catch (err) {
    // If 404 or "not found" errors, return null instead of throwing
    if (err.message?.includes('404') || err.message?.includes('Not Found') || err.message?.includes('No wallet mapping')) {
      return null
    }
    throw err
  }
}

async function backfillWallet(wallet) {
  const lower = wallet.toLowerCase()
  const latestDate = await fetchLatestDateForWallet(lower)
  const startTime = latestDate
    ? Math.floor((new Date(latestDate).getTime() - 24 * 3600 * 1000) / 1000) // one day before latest to get baseline
    : HISTORICAL_BASELINE
  const endTime = Math.floor(Date.now() / 1000)

  const series = await fetchPnlSeries(lower, startTime, endTime)
  const rows = deriveRows(lower, series)
  const upserted = rows.length ? await upsertRows(rows) : 0

  const metrics = await fetchMetrics(lower)
  if (metrics) {
    await updateTraderMetrics(lower, metrics)
  }

  return { upserted, hadData: rows.length > 0 }
}

async function loadActiveTraders() {
  const { data, error } = await supabase
    .from('traders')
    .select('wallet_address')
    .eq('is_active', true)
    .not('pnl', 'is', null)
    .order('pnl', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data || []).map((r) => r.wallet_address).filter(Boolean)
}

async function runBackfillWalletPnl() {
  const wallets = await loadActiveTraders()
  console.log(`Found ${wallets.length} active traders; starting backfill...`)

  let totalRows = 0
  let processed = 0

  for (const wallet of wallets) {
    try {
      const { upserted, hadData } = await backfillWallet(wallet)
      totalRows += upserted
      processed += 1
      console.log(`[${processed}/${wallets.length}] ${wallet} -> upserted ${upserted} rows${hadData ? '' : ' (no new data)'}`)
    } catch (err) {
      console.error(`[${wallet}] failed:`, err.message || err)
    }
    await sleep(SLEEP_MS)
  }

  console.log(`Backfill complete. Wallets processed: ${processed}, rows upserted: ${totalRows}.`)
  console.log('Reminder: run the 90d PnL/rank SQL to refresh ranks after backfill.')

  return { processed, totalRows }
}

module.exports = { runBackfillWalletPnl }

if (require.main === module) {
  runBackfillWalletPnl().catch((err) => {
    console.error('Backfill error:', err)
    process.exit(1)
  })
}
