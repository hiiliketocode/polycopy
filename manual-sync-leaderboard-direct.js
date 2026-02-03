/**
 * Manually run the sync-trader-leaderboard logic directly
 * (without HTTP request - calls the logic directly)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

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
  
  // Batch queries to avoid Supabase limits (max ~1000 items per query)
  const BATCH_SIZE = 500
  const counts = new Map()
  
  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('follows')
      .select('trader_wallet')
      .in('trader_wallet', batch)

    if (error) {
      console.error(`  ⚠️  Error fetching follower counts for batch ${i / BATCH_SIZE + 1}:`, error.message)
      continue
    }

    for (const row of data || []) {
      const wallet = row.trader_wallet?.toLowerCase()
      if (!wallet) continue
      counts.set(wallet, (counts.get(wallet) ?? 0) + 1)
    }
  }
  
  return counts
}

function buildTraderRow(entry, followerCount) {
  const wallet = entry.proxyWallet?.toLowerCase()
  if (!wallet) return null

  const row = {
    wallet_address: wallet,
    updated_at: new Date().toISOString(),
    is_active: true // Leaderboard traders are active
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

async function syncLeaderboard() {
  const DEFAULT_LIMIT = 50 // Polymarket API max limit per request
  const DEFAULT_PAGES = 20 // Top 1000 traders (20 pages × 50)
  
  const timePeriod = 'all'
  const orderBy = 'VOL'
  const category = 'overall'
  const limit = DEFAULT_LIMIT
  const pages = DEFAULT_PAGES

  let totalUpserted = 0
  let totalFetched = 0
  const allWallets = new Set()
  const allEntries = []

  console.log('📊 Fetching top 1000 traders from Polymarket leaderboard...\n')

  // Fetch all leaderboard pages
  for (let page = 0; page < pages; page += 1) {
    const offset = page * limit
    console.log(`  📄 Page ${page + 1}/${pages} (offset ${offset})...`)
    const entries = await fetchLeaderboardPage({ timePeriod, orderBy, category, limit, offset })
    totalFetched += entries.length
    allEntries.push(...entries)

    for (const entry of entries) {
      const wallet = entry.proxyWallet?.toLowerCase()
      if (wallet) allWallets.add(wallet)
    }

    if (entries.length < limit) {
      console.log(`     Reached end (got ${entries.length} < ${limit})`)
      break
    }
    
    // Small delay to avoid rate limiting
    if (page < pages - 1) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  console.log(`\n✅ Fetched ${totalFetched} traders\n`)

  // Check which wallets are already in traders
  const existingWallets = new Set()
  if (allWallets.size > 0) {
    console.log('🔍 Checking existing traders in database...')
    const { data: existing } = await supabase
      .from('traders')
      .select('wallet_address')
      .in('wallet_address', Array.from(allWallets))

    for (const row of existing || []) {
      if (row.wallet_address) existingWallets.add(row.wallet_address.toLowerCase())
    }
  }

  const newWallets = new Set()
  for (const wallet of allWallets) {
    if (!existingWallets.has(wallet)) {
      newWallets.add(wallet)
    }
  }

  console.log(`📋 Found ${newWallets.size} new wallets to add\n`)

  // Build payload and upsert
  const wallets = Array.from(allWallets)
  console.log('📊 Fetching follower counts...')
  const followerCounts = await fetchFollowerCounts(wallets)

  console.log('🔨 Building trader rows...')
  const payload = allEntries
    .map((entry) => {
      const wallet = entry.proxyWallet?.toLowerCase() || null
      const followerCount = wallet ? followerCounts.get(wallet) ?? 0 : null
      return buildTraderRow(entry, followerCount)
    })
    .filter((row) => Boolean(row))

  if (payload.length > 0) {
    console.log(`\n💾 Upserting ${payload.length} traders into traders table...`)
    const { error, count } = await supabase
      .from('traders')
      .upsert(payload, { onConflict: 'wallet_address', count: 'exact' })

    if (error) throw error
    totalUpserted += count ?? payload.length
    console.log(`✅ Upserted ${totalUpserted} traders\n`)
  }

  // Trigger PnL backfill for new wallets (optional - will be picked up by daily cron)
  if (newWallets.size > 0) {
    console.log(`📊 Note: ${newWallets.size} new wallets will be backfilled by the daily cron job`)
    console.log(`   (Skipping individual triggers to avoid rate limits)\n`)
  }

  return {
    fetched: totalFetched,
    upserted: totalUpserted,
    newWallets: newWallets.size,
    newWalletList: Array.from(newWallets).slice(0, 10),
    timePeriod,
    orderBy,
    category,
    limit,
    pages
  }
}

async function main() {
  try {
    console.log('='.repeat(60))
    console.log('🚀 MANUAL SYNC: Top 1000 Traders Leaderboard')
    console.log('='.repeat(60))
    console.log()

    const result = await syncLeaderboard()

    console.log('='.repeat(60))
    console.log('✅ SYNC COMPLETED SUCCESSFULLY')
    console.log('='.repeat(60))
    console.log()
    console.log('📊 Results:')
    console.log(`   Fetched: ${result.fetched} traders`)
    console.log(`   Upserted: ${result.upserted} traders`)
    console.log(`   New wallets: ${result.newWallets}`)
    if (result.newWalletList && result.newWalletList.length > 0) {
      console.log(`\n   Sample new wallets:`)
      result.newWalletList.forEach((wallet, idx) => {
        console.log(`     ${idx + 1}. ${wallet}`)
      })
    }
    console.log()

  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  }
}

main()
