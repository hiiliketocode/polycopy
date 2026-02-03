'use strict'

/**
 * Backfill the top 1000 Polymarket traders into public.traders.
 *
 * Usage:
 *   node scripts/backfill-traders-leaderboard.js [--limit=1000] [--orderBy=VOL] [--timePeriod=all]
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

function parseArg(name, fallback) {
  const prefix = `--${name}=`
  const found = process.argv.find((arg) => arg.startsWith(prefix))
  if (!found) return fallback
  return found.slice(prefix.length)
}

async function fetchLeaderboard({ limit, orderBy, timePeriod, category, offset }) {
  const url = new URL('https://data-api.polymarket.com/v1/leaderboard')
  url.searchParams.set('timePeriod', timePeriod)
  url.searchParams.set('orderBy', orderBy)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset || 0))
  url.searchParams.set('category', category)

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Polycopy Leaderboard Backfill' },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Leaderboard API returned ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error('Unexpected leaderboard payload (not an array)')
  }
  return data
}

async function main() {
  const limit = parseInt(parseArg('limit', '1000'), 10)
  const orderBy = parseArg('orderBy', 'VOL')
  const timePeriod = parseArg('timePeriod', 'all')
  const category = parseArg('category', 'overall')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Fetching leaderboard: limit=${limit} orderBy=${orderBy} timePeriod=${timePeriod} category=${category}`)
  const pageSize = Math.min(limit, 50)
  let offset = 0
  let all = []

  while (all.length < limit) {
    const page = await fetchLeaderboard({
      limit: pageSize,
      orderBy,
      timePeriod,
      category,
      offset,
    })

    if (page.length === 0) break
    all = all.concat(page)
    offset += pageSize
    if (page.length < pageSize) break
  }

  const traders = all.slice(0, limit)
  console.log(`Fetched ${traders.length} traders (offset paging)`)

  const now = new Date().toISOString()
  const rows = traders.map((t) => ({
    wallet_address: (t.proxyWallet || '').toLowerCase(),
    display_name: t.userName || null,
    profile_image: t.profileImage || null,
    pnl: t.pnl ?? null,
    volume: t.vol ?? null,
    roi: t.vol ? (t.pnl / t.vol) * 100 : null,
    rank: t.rank ? parseInt(t.rank, 10) : null,
    markets_traded: t.marketsTraded || t.markets_traded || null,
    total_trades: t.totalTrades || null,
    win_rate: t.winRate || null,
    follower_count: t.followerCount || null,
    x_username: t.xUsername || null,
    verified_badge: typeof t.verifiedBadge === 'boolean' ? t.verifiedBadge : null,
    last_seen_at: now,
    updated_at: now,
    is_active: true,
  })).filter((row) => row.wallet_address)

  const { error, count } = await supabase
    .from('traders')
    .upsert(rows, { onConflict: 'wallet_address', ignoreDuplicates: false, count: 'exact' })

  if (error) {
    throw new Error(`Upsert failed: ${error.message}`)
  }

  console.log(`Upserted ${count ?? rows.length} traders`)
}

main().catch((err) => {
  console.error('Backfill failed:', err.message || err)
  process.exit(1)
})
