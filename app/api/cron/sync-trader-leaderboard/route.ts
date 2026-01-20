import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase env vars missing for leaderboard sync (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

type PolymarketLeaderboardEntry = {
  rank?: string | number | null
  proxyWallet?: string | null
  userName?: string | null
  xUsername?: string | null
  verifiedBadge?: boolean | null
  vol?: number | string | null
  pnl?: number | string | null
  profileImage?: string | null
  marketsTraded?: number | string | null
  markets_traded?: number | string | null
  totalTrades?: number | string | null
  total_trades?: number | string | null
  winRate?: number | string | null
  win_rate?: number | string | null
  followerCount?: number | string | null
  follower_count?: number | string | null
  lastSeenAt?: number | string | null
  last_seen_at?: number | string | null
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000
const DEFAULT_PAGES = 1
const MAX_PAGES = 5

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toIsoTimestamp(value: unknown): string | null {
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

async function fetchLeaderboardPage(options: {
  timePeriod: string
  orderBy: string
  category: string
  limit: number
  offset: number
}): Promise<PolymarketLeaderboardEntry[]> {
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

async function fetchFollowerCounts(wallets: string[]): Promise<Map<string, number>> {
  if (wallets.length === 0) return new Map()
  const { data, error } = await supabase
    .from('follows')
    .select('trader_wallet')
    .in('trader_wallet', wallets)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data || []) {
    const wallet = row.trader_wallet?.toLowerCase()
    if (!wallet) continue
    counts.set(wallet, (counts.get(wallet) ?? 0) + 1)
  }
  return counts
}

function buildTraderRow(
  entry: PolymarketLeaderboardEntry,
  followerCount: number | null
): Record<string, string | number | boolean> | null {
  const wallet = entry.proxyWallet?.toLowerCase()
  if (!wallet) return null

  const row: Record<string, string | number | boolean> = {
    wallet_address: wallet,
    updated_at: new Date().toISOString()
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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const timePeriod = url.searchParams.get('timePeriod') || 'all'
  const orderBy = url.searchParams.get('orderBy') || 'VOL'
  const category = url.searchParams.get('category') || 'overall'
  const limitParam = toNumber(url.searchParams.get('limit'))
  const pageCountParam = toNumber(url.searchParams.get('pages'))

  const limit = limitParam ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT) : DEFAULT_LIMIT
  const pages = pageCountParam
    ? Math.min(Math.max(Math.trunc(pageCountParam), 1), MAX_PAGES)
    : DEFAULT_PAGES

  let totalUpserted = 0
  let totalFetched = 0

  for (let page = 0; page < pages; page += 1) {
    const offset = page * limit
    const entries = await fetchLeaderboardPage({ timePeriod, orderBy, category, limit, offset })
    totalFetched += entries.length

    const wallets = entries
      .map((entry) => entry.proxyWallet?.toLowerCase())
      .filter((wallet): wallet is string => Boolean(wallet))
    const followerCounts = await fetchFollowerCounts(wallets)

    const payload = entries
      .map((entry) => {
        const wallet = entry.proxyWallet?.toLowerCase() || null
        const followerCount = wallet ? followerCounts.get(wallet) ?? 0 : null
        return buildTraderRow(entry, followerCount)
      })
      .filter((row): row is Record<string, string | number | boolean> => Boolean(row))

    if (payload.length > 0) {
      const { error, count } = await supabase
        .from('traders')
        .upsert(payload, { onConflict: 'wallet_address', count: 'exact' })

      if (error) throw error
      totalUpserted += count ?? payload.length
    }

    if (entries.length < limit) {
      break
    }
  }

  return NextResponse.json({
    fetched: totalFetched,
    upserted: totalUpserted,
    timePeriod,
    orderBy,
    category,
    limit,
    pages
  })
}
