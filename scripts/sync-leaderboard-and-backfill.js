#!/usr/bin/env node
'use strict'
/**
 * One-off script to:
 * 1. Fetch top 1000 traders from Polymarket leaderboard
 * 2. Add missing ones to traders table
 * 3. Backfill realized PnL for new wallets
 *
 * Usage: node scripts/sync-leaderboard-and-backfill.js
 */

const fs = require('fs')
const path = require('path')
let dotenv = null
try {
  dotenv = require('dotenv')
} catch (e) {
  if (e?.code !== 'MODULE_NOT_FOUND') throw e
}
const envPath = path.resolve(process.cwd(), '.env.local')
if (dotenv && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}
if (!DOME_API_KEY) {
  throw new Error('Missing DOME_API_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BASE_URL = 'https://api.domeapi.io/v1'
const SLEEP_MS = 250

function toNumber(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toIsoTimestamp(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return null
}

async function fetchLeaderboardPage(options) {
  const { timePeriod, orderBy, category, limit, offset } = options
  const url = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=${timePeriod}&orderBy=${orderBy}&limit=${limit}&offset=${offset}&category=${category}`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Polymarket leaderboard error ${response.status}: ${text}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

async function fetchFollowerCounts(wallets) {
  if (wallets.length === 0) return new Map()
  const { data, error } = await supabase
    .from('follows')
    .select('trader_wallet')
    .in('trader_wallet', wallets)

  if (error) throw error

  const counts = new Map()
  for (const row of data || []) {
    const wallet = row.trader_wallet?.toLowerCase()
    if (!wallet) continue
    counts.set(wallet, (counts.get(wallet) ?? 0) + 1)
  }
  return counts
}

function buildTraderRow(entry, followerCount) {
  const wallet = entry.proxyWallet?.toLowerCase()
  if (!wallet) return null

  const row = {
    wallet_address: wallet,
    updated_at: new Date().toISOString(),
    is_active: true
  }

  if (entry.userName) row.display_name = entry.userName
  if (entry.profileImage) row.profile_image = entry.profileImage
  if (entry.xUsername) row.x_username = entry.xUsername
  if (entry.verifiedBadge !== null && entry.verifiedBadge !== undefined) {
    row.verified_badge = entry.verifiedBadge
  }

  const pnl = toNumber(entry.pnl)
  if (pnl !== null) row.pnl = pnl

  const volume = toNumber(entry.vol)
  if (volume !== null) row.volume = volume

  const rank = toNumber(entry.rank)
  if (rank !== null) row.rank = Math.trunc(rank)

  if (pnl !== null && volume !== null && volume > 0) {
    row.roi = Math.round((pnl / volume) * 10000) / 100
  }

  const marketsTraded = toNumber(entry.marketsTraded ?? entry.markets_traded)
  if (marketsTraded !== null) row.markets_traded = Math.trunc(marketsTraded)

  const totalTrades = toNumber(entry.totalTrades ?? entry.total_trades)
  if (totalTrades !== null) row.total_trades = Math.trunc(totalTrades)

  const winRate = toNumber(entry.winRate ?? entry.win_rate)
  if (winRate !== null) row.win_rate = winRate

  const lastSeenAt = toIsoTimestamp(entry.lastSeenAt ?? entry.last_seen_at)
  if (lastSeenAt) row.last_seen_at = lastSeenAt

  if (followerCount !== null) row.follower_count = followerCount

  return row
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toDateString(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10)
}

async function fetchPnlSeries(wallet, startTime, endTime) {
  const url = new URL(`${BASE_URL}/polymarket/wallet/pnl/${wallet}`)
  url.searchParams.set('granularity', 'day')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${DOME_API_KEY}` }
    })

    if (!res.ok) {
      if (res.status === 404) return []
      throw new Error(`Dome API error ${res.status}`)
    }

    const json = await res.json()
    return Array.isArray(json?.pnl_over_time) ? json.pnl_over_time : []
  } catch (err) {
    if (err.message?.includes('404')) return []
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
    if (!Number.isFinite(ts) || !Number.isFinite(cumulative)) continue
    if (prev === null) {
      prev = cumulative
      prevDate = toDateString(ts)
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
    prevDate = date
  }

  return rows
}

async function backfillWallet(wallet) {
  const lower = wallet.toLowerCase()
  const HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000
  const startTime = HISTORICAL_BASELINE
  const endTime = Math.floor(Date.now() / 1000)

  const series = await fetchPnlSeries(lower, startTime, endTime)
  const rows = deriveRows(lower, series)

  if (rows.length > 0) {
    const { error } = await supabase
      .from('wallet_realized_pnl_daily')
      .upsert(rows, { onConflict: 'wallet_address,date' })
    if (error) throw error
  }

  return rows.length
}

async function main() {
  console.log('📊 Fetching top 1000 traders from Polymarket leaderboard...\n')

  const limit = 200
  const pages = 5
  const allEntries = []
  const allWallets = new Set()

  // Fetch all pages
  for (let page = 0; page < pages; page += 1) {
    const offset = page * limit
    console.log(`  Fetching page ${page + 1}/${pages} (offset ${offset})...`)
    const entries = await fetchLeaderboardPage({
      timePeriod: 'all',
      orderBy: 'VOL',
      category: 'overall',
      limit,
      offset
    })
    allEntries.push(...entries)
    for (const entry of entries) {
      const wallet = entry.proxyWallet?.toLowerCase()
      if (wallet) allWallets.add(wallet)
    }
    if (entries.length < limit) break
  }

  console.log(`\n✅ Fetched ${allEntries.length} traders from leaderboard`)

  // Check which are missing
  const { data: existing } = await supabase
    .from('traders')
    .select('wallet_address')
    .in('wallet_address', Array.from(allWallets))

  const existingWallets = new Set()
  for (const row of existing || []) {
    if (row.wallet_address) existingWallets.add(row.wallet_address.toLowerCase())
  }

  const newWallets = []
  for (const wallet of allWallets) {
    if (!existingWallets.has(wallet)) {
      newWallets.push(wallet)
    }
  }

  console.log(`\n📋 Found ${newWallets.length} new wallets to add`)

  if (newWallets.length === 0) {
    console.log('✅ All leaderboard traders already in traders table')
    return
  }

  // Build payload and upsert
  const wallets = Array.from(allWallets)
  const followerCounts = await fetchFollowerCounts(wallets)

  const payload = allEntries
    .map((entry) => {
      const wallet = entry.proxyWallet?.toLowerCase() || null
      const followerCount = wallet ? followerCounts.get(wallet) ?? 0 : null
      return buildTraderRow(entry, followerCount)
    })
    .filter((row) => Boolean(row))

  console.log(`\n💾 Upserting ${payload.length} traders into traders table...`)
  const { error: upsertError, count } = await supabase
    .from('traders')
    .upsert(payload, { onConflict: 'wallet_address', count: 'exact' })

  if (upsertError) throw upsertError
  console.log(`✅ Upserted ${count ?? payload.length} traders`)

  // Backfill PnL for new wallets
  console.log(`\n📊 Backfilling realized PnL for ${newWallets.length} new wallets...\n`)
  let backfilled = 0
  let totalRows = 0

  for (let i = 0; i < newWallets.length; i += 1) {
    const wallet = newWallets[i]
    try {
      const rows = await backfillWallet(wallet)
      totalRows += rows
      backfilled += 1
      console.log(`[${i + 1}/${newWallets.length}] ${wallet} -> ${rows} rows`)
    } catch (err) {
      console.error(`[${i + 1}/${newWallets.length}] ${wallet} -> ERROR: ${err.message}`)
    }
    await sleep(SLEEP_MS)
  }

  console.log(`\n✅ Backfill complete:`)
  console.log(`   Wallets backfilled: ${backfilled}/${newWallets.length}`)
  console.log(`   Total rows upserted: ${totalRows}`)
}

main().catch((err) => {
  console.error('❌ Error:', err)
  process.exit(1)
})
