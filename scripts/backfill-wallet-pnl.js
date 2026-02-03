'use strict'

/**
 * Backfill realized PnL (daily) and wallet metrics using the Dome API.
 *
 * Wallet list: traders + follows (active) + distinct trader_wallet from trades_public
 * + distinct copied_trader_wallet from orders. Ensures we don't miss realized PnL
 * for discover/feed/trader-page or copy-trade wallets.
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
 *   WALLET=0x... node scripts/backfill-wallet-pnl.js   # backfill only this wallet (debug)
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
const TRADER_PAGE_SIZE = 1000
const MAX_RETRIES = 3
const HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000 // Jan 1 2023 UTC, adjust if you want deeper history
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.FETCH_TIMEOUT_MS, 10) || 60000
const SKIP_EXISTING_WALLETS = ['1', 'true', 'yes'].includes(
  String(process.env.SKIP_EXISTING_WALLETS || '').toLowerCase()
)
const SKIP_UP_TO_DATE_WALLETS = ['1', 'true', 'yes'].includes(
  String(process.env.SKIP_UP_TO_DATE_WALLETS ?? 'true').toLowerCase()
)

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
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
  } catch (err) {
    if (err?.name === 'AbortError' && attempt < MAX_RETRIES) {
      const delay = SLEEP_MS * attempt
      console.warn(`Retrying ${url} after ${delay}ms (timeout)`)
      await sleep(delay)
      return fetchWithRetry(url, options, attempt + 1)
    }
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

function toDateString(tsSeconds) {
  // Dome API timestamps are one day behind - the timestamp represents the previous day's data
  // So if timestamp is Feb 3 00:00 UTC, it actually means data for Feb 2
  // We need to subtract 1 day to get the correct date
  const date = new Date(tsSeconds * 1000)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
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

function isUpToDate(latestDate) {
  if (!latestDate) return false
  const parsed = Date.parse(`${latestDate}T00:00:00Z`)
  if (Number.isNaN(parsed)) return false
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const cutoff = Date.UTC(
    yesterday.getUTCFullYear(),
    yesterday.getUTCMonth(),
    yesterday.getUTCDate()
  )
  return parsed >= cutoff
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

async function backfillWallet(wallet, options = {}) {
  const lower = wallet.toLowerCase()
  const latestDate = await fetchLatestDateForWallet(lower)
  if (options.skipIfExisting && latestDate) {
    return { upserted: 0, hadData: false, skipped: true, reason: 'has-data', latestDate }
  }
  if (options.skipIfUpToDate && latestDate && isUpToDate(latestDate)) {
    return { upserted: 0, hadData: false, skipped: true, reason: 'up-to-date', latestDate }
  }
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

  return { upserted, hadData: rows.length > 0, skipped: false }
}

/** Load all trader wallet_addresses (no is_active filter). */
async function loadTraderWallets() {
  const wallets = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('traders')
      .select('wallet_address')
      .order('wallet_address', { ascending: true })
      .range(offset, offset + TRADER_PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break

    wallets.push(...data)
    if (data.length < TRADER_PAGE_SIZE) break
    offset += TRADER_PAGE_SIZE
  }

  return wallets.map((r) => r.wallet_address).filter(Boolean)
}

/** Load distinct trader_wallet from follows where active = true. */
async function loadFollowedWallets() {
  const { data, error } = await supabase
    .from('follows')
    .select('trader_wallet')
    .eq('active', true)

  if (error) throw error
  const raw = (data || []).map((r) => r.trader_wallet).filter(Boolean)
  return [...new Set(raw.map((w) => w.toLowerCase()))]
}

/** Distinct trader_wallet from trades_public (RPC). */
async function loadWalletsFromTradesPublic() {
  const { data, error } = await supabase.rpc('get_distinct_trader_wallets_from_trades_public')
  if (error) {
    console.warn('get_distinct_trader_wallets_from_trades_public failed:', error.message)
    return []
  }
  const raw = (data || []).map((r) => (r && r.wallet) || r).filter(Boolean)
  return [...new Set(raw.map((w) => String(w).toLowerCase()))]
}

/** Distinct copied_trader_wallet from orders (RPC). */
async function loadWalletsFromOrdersCopiedTraders() {
  const { data, error } = await supabase.rpc('get_distinct_copied_trader_wallets_from_orders')
  if (error) {
    console.warn('get_distinct_copied_trader_wallets_from_orders failed:', error.message)
    return []
  }
  const raw = (data || []).map((r) => (r && r.wallet) || r).filter(Boolean)
  return [...new Set(raw.map((w) => String(w).toLowerCase()))]
}

/**
 * Wallets to backfill: traders + follows (active) + trades_public.trader_wallet
 * + orders.copied_trader_wallet. Deduped and lowercased.
 */
async function loadWalletsForBackfill() {
  const [traderWallets, followedWallets, tradesWallets, ordersWallets] = await Promise.all([
    loadTraderWallets(),
    loadFollowedWallets(),
    loadWalletsFromTradesPublic(),
    loadWalletsFromOrdersCopiedTraders()
  ])

  const seen = new Set()
  const result = []

  for (const w of traderWallets) {
    const lower = w.toLowerCase()
    if (!lower || seen.has(lower)) continue
    seen.add(lower)
    result.push(lower)
  }

  for (const w of followedWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  for (const w of tradesWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  for (const w of ordersWallets) {
    if (!w || seen.has(w)) continue
    seen.add(w)
    result.push(w)
  }

  result.sort()
  return result
}

async function runBackfillWalletPnl() {
  const single = process.env.WALLET ? String(process.env.WALLET).trim().toLowerCase() : null
  const wallets = single ? [single] : await loadWalletsForBackfill()
  if (single) {
    console.log(`Single-wallet mode: ${single}`)
  }
  if (SKIP_EXISTING_WALLETS) {
    console.log('Skipping wallets that already have PnL history.')
  }
  if (SKIP_UP_TO_DATE_WALLETS) {
    console.log('Skipping wallets that are up to date (latest date is today or yesterday).')
  }
  console.log(`Found ${wallets.length} wallets (traders + follows + trades_public + orders); starting backfill...`)

  let totalRows = 0
  let processed = 0

  for (const wallet of wallets) {
    try {
      const { upserted, hadData, skipped, reason, latestDate } = await backfillWallet(wallet, {
        skipIfExisting: SKIP_EXISTING_WALLETS,
        skipIfUpToDate: SKIP_UP_TO_DATE_WALLETS
      })
      totalRows += upserted
      processed += 1
      if (skipped) {
        if (reason === 'up-to-date') {
          console.log(`[${processed}/${wallets.length}] ${wallet} -> skipped (up to date: ${latestDate})`)
        } else {
          console.log(`[${processed}/${wallets.length}] ${wallet} -> skipped (already has PnL history)`)
        }
      } else {
        console.log(`[${processed}/${wallets.length}] ${wallet} -> upserted ${upserted} rows${hadData ? '' : ' (no new data)'}`)
      }
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
