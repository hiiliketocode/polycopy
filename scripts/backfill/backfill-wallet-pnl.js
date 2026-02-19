'use strict'

/**
 * Backfill realized PnL (daily) and wallet metrics using free Polymarket APIs.
 *
 * Uses:
 * - Polymarket closed-positions API for daily realized P&L
 * - Polymarket leaderboard API for trader metrics (volume, total_trades)
 *
 * Wallet list: traders + follows (active) + distinct trader_wallet from trades_public
 * + distinct copied_trader_wallet from orders. Ensures we don't miss realized PnL
 * for discover/feed/trader-page or copy-trade wallets.
 *
 * Env:
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const POLYMARKET_DATA_API = 'https://data-api.polymarket.com'
const SLEEP_MS = 250
const UPSERT_BATCH = 500
const TRADER_PAGE_SIZE = 1000
const MAX_RETRIES = 3
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

function toDateString(tsMs) {
  const date = new Date(tsMs)
  return date.toISOString().slice(0, 10) // YYYY-MM-DD in UTC
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

async function fetchAllClosedPositions(wallet) {
  const PAGE_SIZE = 50
  const MAX_OFFSET = 5000
  const BATCH_SIZE = 6
  const allPositions = []
  let exhausted = false

  for (let batchStart = 0; batchStart <= MAX_OFFSET && !exhausted; batchStart += PAGE_SIZE * BATCH_SIZE) {
    const offsets = Array.from(
      { length: BATCH_SIZE },
      (_, i) => batchStart + i * PAGE_SIZE
    ).filter((o) => o <= MAX_OFFSET)

    const results = await Promise.all(
      offsets.map(async (offset) => {
        const url = `${POLYMARKET_DATA_API}/closed-positions?user=${wallet}&limit=${PAGE_SIZE}&offset=${offset}&sortBy=TIMESTAMP&sortDirection=DESC`
        try {
          const res = await fetchWithRetry(url, {})
          const data = await res.json()
          return { offset, data: Array.isArray(data) ? data : [] }
        } catch {
          return { offset, data: [] }
        }
      })
    )

    results.sort((a, b) => a.offset - b.offset)
    for (const { data } of results) {
      if (data.length === 0) {
        exhausted = true
        break
      }
      allPositions.push(...data)
      if (data.length < PAGE_SIZE) {
        exhausted = true
        break
      }
    }
  }

  return allPositions
}

function deriveRows(wallet, closedPositions) {
  if (closedPositions.length === 0) return []

  const dailyMap = new Map()
  for (const pos of closedPositions) {
    let ts = Number(pos.timestamp)
    if (!Number.isFinite(ts)) continue
    if (ts < 10000000000) ts = ts * 1000
    const date = toDateString(ts)
    const pnl = Number(pos.realizedPnl ?? 0)
    if (!Number.isFinite(pnl)) continue
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + pnl)
  }

  const sortedDates = Array.from(dailyMap.keys()).sort()
  const rows = []
  let cumulative = 0

  for (const date of sortedDates) {
    const dailyPnl = dailyMap.get(date) ?? 0
    cumulative += dailyPnl
    rows.push({
      wallet_address: wallet,
      date,
      realized_pnl: dailyPnl,
      pnl_to_date: cumulative,
      source: 'polymarket'
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
  const url = `${POLYMARKET_DATA_API}/leaderboard?window=all&limit=1&address=${wallet}`
  try {
    const res = await fetchWithRetry(url, {})
    const data = await res.json()
    const entry = Array.isArray(data) && data.length > 0 ? data[0] : null
    if (!entry) return null
    return {
      volume: entry.vol ?? entry.volume ?? null,
      total_trades: entry.numTrades ?? entry.total_trades ?? null,
      markets_traded: entry.marketsTraded ?? entry.markets_traded ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Sync per-order realized PnL in the `orders` table using closed positions.
 * Replaces the separate sync-polymarket-pnl cron job.
 */
async function syncOrderPnl(wallet, closedPositions) {
  if (closedPositions.length === 0) return 0

  const { data: orders } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, amount_invested, copy_user_id')
    .or(`copied_trader_wallet.eq.${wallet},copied_trader_wallet.eq.${wallet.toLowerCase()}`)
    .limit(1000)

  // Also check orders owned by users whose polymarket_account_address matches
  const { data: credRows } = await supabase
    .from('clob_credentials')
    .select('user_id')
    .eq('polymarket_account_address', wallet)
    .limit(1)

  let allOrders = orders || []
  if (credRows && credRows.length > 0) {
    const userId = credRows[0].user_id
    const { data: userOrders } = await supabase
      .from('orders')
      .select('order_id, market_id, outcome, side, amount_invested, copy_user_id')
      .eq('copy_user_id', userId)
      .limit(1000)
    if (userOrders && userOrders.length > 0) {
      const seen = new Set(allOrders.map((o) => o.order_id))
      for (const o of userOrders) {
        if (!seen.has(o.order_id)) allOrders.push(o)
      }
    }
  }

  if (allOrders.length === 0) return 0

  const normalize = (v) => (v || '').trim().toLowerCase()
  const now = new Date().toISOString()
  const pendingUpdates = []

  for (const position of closedPositions) {
    const matchingOrders = allOrders.filter((o) =>
      o.market_id === position.conditionId &&
      normalize(o.outcome) === normalize(position.outcome) &&
      (o.side || '').toLowerCase() === 'buy'
    )
    if (matchingOrders.length === 0) continue

    const totalInvested = matchingOrders.reduce((sum, o) =>
      sum + Number(o.amount_invested || 0), 0)

    for (const order of matchingOrders) {
      const proportion = totalInvested > 0
        ? Number(order.amount_invested || 0) / totalInvested
        : 1 / matchingOrders.length

      pendingUpdates.push({
        order_id: order.order_id,
        payload: {
          polymarket_realized_pnl: Number(position.realizedPnl || 0) * proportion,
          polymarket_avg_price: Number(position.avgPrice || 0),
          polymarket_total_bought: Number(position.totalBought || 0),
          polymarket_synced_at: now,
        },
      })
    }
  }

  let updatedCount = 0
  const ORDER_BATCH = 25
  for (let i = 0; i < pendingUpdates.length; i += ORDER_BATCH) {
    const batch = pendingUpdates.slice(i, i + ORDER_BATCH)
    const results = await Promise.allSettled(
      batch.map(({ order_id, payload }) =>
        supabase.from('orders').update(payload).eq('order_id', order_id)
      )
    )
    updatedCount += results.filter(
      (r) => r.status === 'fulfilled' && !r.value?.error
    ).length
  }

  return updatedCount
}

async function backfillWallet(wallet, options = {}) {
  const lower = wallet.toLowerCase()
  const latestDate = await fetchLatestDateForWallet(lower)
  if (options.skipIfExisting && latestDate) {
    return { upserted: 0, hadData: false, skipped: true, reason: 'has-data', latestDate, ordersSynced: 0 }
  }
  if (options.skipIfUpToDate && latestDate && isUpToDate(latestDate)) {
    return { upserted: 0, hadData: false, skipped: true, reason: 'up-to-date', latestDate, ordersSynced: 0 }
  }

  const closedPositions = await fetchAllClosedPositions(lower)
  const rows = deriveRows(lower, closedPositions)
  const upserted = rows.length ? await upsertRows(rows) : 0

  // Sync per-order PnL using the same closed positions data (replaces sync-polymarket-pnl)
  const ordersSynced = await syncOrderPnl(lower, closedPositions)

  const metrics = await fetchMetrics(lower)
  if (metrics) {
    await updateTraderMetrics(lower, metrics)
  }

  return { upserted, hadData: rows.length > 0, skipped: false, ordersSynced }
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
  let totalOrdersSynced = 0
  let processed = 0

  for (const wallet of wallets) {
    try {
      const { upserted, hadData, skipped, reason, latestDate, ordersSynced } = await backfillWallet(wallet, {
        skipIfExisting: SKIP_EXISTING_WALLETS,
        skipIfUpToDate: SKIP_UP_TO_DATE_WALLETS
      })
      totalRows += upserted
      totalOrdersSynced += ordersSynced || 0
      processed += 1
      if (skipped) {
        if (reason === 'up-to-date') {
          console.log(`[${processed}/${wallets.length}] ${wallet} -> skipped (up to date: ${latestDate})`)
        } else {
          console.log(`[${processed}/${wallets.length}] ${wallet} -> skipped (already has PnL history)`)
        }
      } else {
        const orderNote = ordersSynced > 0 ? `, ${ordersSynced} orders synced` : ''
        console.log(`[${processed}/${wallets.length}] ${wallet} -> upserted ${upserted} rows${hadData ? '' : ' (no new data)'}${orderNote}`)
      }
    } catch (err) {
      console.error(`[${wallet}] failed:`, err.message || err)
    }
    await sleep(SLEEP_MS)
  }

  console.log(`Backfill complete. Wallets: ${processed}, PnL rows: ${totalRows}, orders synced: ${totalOrdersSynced}.`)

  return { processed, totalRows, totalOrdersSynced }
}

module.exports = { runBackfillWalletPnl }

if (require.main === module) {
  runBackfillWalletPnl().catch((err) => {
    console.error('Backfill error:', err)
    process.exit(1)
  })
}
