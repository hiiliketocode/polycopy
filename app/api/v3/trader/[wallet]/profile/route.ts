import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeaderboardEntry {
  rank: string
  proxyWallet: string
  userName?: string
  xUsername?: string
  verifiedBadge?: boolean
  vol: number
  pnl: number
  profileImage?: string
}

interface PolymarketPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  size: number
  avgPrice: number
  initialValue: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  totalBought: number
  realizedPnl: number
  percentRealizedPnl: number
  curPrice: number
  redeemable: boolean
  mergeable: boolean
  title: string
  slug: string
  icon: string
  eventId?: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  oppositeOutcome: string
  oppositeAsset: string
  endDate: string
  negativeRisk: boolean
}

interface ClosedPosition {
  proxyWallet: string
  asset: string
  conditionId: string
  avgPrice: number
  totalBought: number
  realizedPnl: number
  curPrice: number
  timestamp: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  outcomeIndex: number
  oppositeOutcome: string
  oppositeAsset: string
  endDate: string
}

interface ActivityTrade {
  proxyWallet: string
  timestamp: number
  conditionId: string
  type: string
  size: number
  usdcSize: number
  transactionHash: string
  price: number
  asset: string
  side: 'BUY' | 'SELL'
  outcomeIndex: number
  title: string
  slug: string
  icon: string
  eventSlug: string
  outcome: string
  name?: string
  pseudonym?: string
  bio?: string
  profileImage?: string
  profileImageOptimized?: string
}

interface PublicProfile {
  createdAt: string | null
  proxyWallet: string | null
  profileImage: string | null
  displayUsernamePublic: boolean | null
  bio: string | null
  pseudonym: string | null
  name: string | null
  xUsername: string | null
  verifiedBadge: boolean | null
  users?: { id: string; creator: boolean; mod: boolean }[]
}

interface PerformancePeriod {
  pnl: number
  volume: number
  rank: number
}

interface DailyPnlRow {
  date: string
  realized_pnl: number
  pnl_to_date: number
}

interface TraderProfileResponse {
  profile: {
    wallet: string
    displayName: string
    pseudonym: string | null
    bio: string | null
    profileImage: string | null
    xUsername: string | null
    verifiedBadge: boolean
    accountCreated: string | null
  }
  performance: {
    day: PerformancePeriod | null
    week: PerformancePeriod | null
    month: PerformancePeriod | null
    all: PerformancePeriod | null
  }
  positions: {
    open: PolymarketPosition[]
    closed: ClosedPosition[]
  }
  trades: ActivityTrade[]
  dailyPnl: DailyPnlRow[]
  tradingDaysActive: number
  winRate: number | null
  followerCount: number
  hasStats: boolean
  totalTradeCount: number
  tradeCountCapped: boolean
}

// ---------------------------------------------------------------------------
// In-memory cache (60-second TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { data: TraderProfileResponse; timestamp: number }>()

function getCached(wallet: string): TraderProfileResponse | null {
  const entry = cache.get(wallet)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(wallet)
    return null
  }
  return entry.data
}

function setCache(wallet: string, data: TraderProfileResponse) {
  cache.set(wallet, { data, timestamp: Date.now() })

  // Evict old entries periodically to prevent memory leaks
  if (cache.size > 500) {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (now - entry.timestamp > CACHE_TTL_MS) {
        cache.delete(key)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abbreviateWallet(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function parseLeaderboardEntry(data: LeaderboardEntry[] | null): PerformancePeriod | null {
  if (!data || !Array.isArray(data) || data.length === 0) return null
  const entry = data[0]
  return {
    pnl: entry.pnl ?? 0,
    volume: entry.vol ?? 0,
    rank: parseInt(String(entry.rank), 10) || 0,
  }
}

async function fetchAllActivityTrades(wallet: string): Promise<{ trades: ActivityTrade[]; capped: boolean }> {
  const PAGE_SIZE = 100
  const MAX_OFFSET = 3000
  const BATCH_SIZE = 6
  const allTrades: ActivityTrade[] = []
  let exhausted = false

  for (let batchStart = 0; batchStart <= MAX_OFFSET && !exhausted; batchStart += PAGE_SIZE * BATCH_SIZE) {
    const offsets = Array.from(
      { length: BATCH_SIZE },
      (_, i) => batchStart + i * PAGE_SIZE
    ).filter((o) => o <= MAX_OFFSET)

    const results = await Promise.all(
      offsets.map((offset) =>
        fetchJson<ActivityTrade[]>(
          `https://data-api.polymarket.com/activity?user=${wallet}&type=TRADE&limit=${PAGE_SIZE}&offset=${offset}`
        ).then((data) => ({ offset, data: data ?? [] }))
      )
    )

    results.sort((a, b) => a.offset - b.offset)
    for (const { data } of results) {
      if (data.length === 0) {
        exhausted = true
        break
      }
      allTrades.push(...data)
      if (data.length < PAGE_SIZE) {
        exhausted = true
        break
      }
    }
  }

  return { trades: allTrades, capped: !exhausted && allTrades.length >= MAX_OFFSET }
}

async function fetchAllClosedPositions(wallet: string): Promise<ClosedPosition[]> {
  // Closed positions endpoint: max 50 per page, paginate by offset
  const PAGE_SIZE = 50
  const MAX_OFFSET = 5000
  const allPositions: ClosedPosition[] = []

  // Fetch pages in batches of 6 for parallelism
  const BATCH_SIZE = 6
  let exhausted = false

  for (let batchStart = 0; batchStart <= MAX_OFFSET && !exhausted; batchStart += PAGE_SIZE * BATCH_SIZE) {
    const offsets = Array.from(
      { length: BATCH_SIZE },
      (_, i) => batchStart + i * PAGE_SIZE
    ).filter((o) => o <= MAX_OFFSET)

    const results = await Promise.all(
      offsets.map((offset) =>
        fetchJson<ClosedPosition[]>(
          `https://data-api.polymarket.com/closed-positions?user=${wallet}&limit=${PAGE_SIZE}&offset=${offset}&sortBy=TIMESTAMP&sortDirection=DESC`
        ).then((data) => ({ offset, data: data ?? [] }))
      )
    )

    // Process in offset order
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

function computeDailyPnl(
  closedPositions: ClosedPosition[],
  openPositions: PolymarketPosition[]
): DailyPnlRow[] {
  const dailyMap = new Map<string, number>()

  // Closed positions grouped by the day they were closed
  for (const pos of closedPositions) {
    let ts = pos.timestamp
    if (ts < 10000000000) ts = ts * 1000
    const date = new Date(ts).toISOString().slice(0, 10)
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + (pos.realizedPnl ?? 0))
  }

  // Unredeemed resolved positions: markets resolved against the trader but
  // shares haven't been redeemed yet.  They sit in the positions API with
  // redeemable=true and curPrice~0.  Attribute their loss to the market's
  // endDate (the resolution date).
  for (const pos of openPositions) {
    if (!pos.redeemable || pos.curPrice > 0.01) continue
    const date = pos.endDate?.slice(0, 10)
    if (!date || date === '1970-01-01') continue
    const loss = -(pos.initialValue ?? pos.totalBought ?? 0)
    if (loss === 0) continue
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + loss)
  }

  if (dailyMap.size === 0) return []

  const sortedDates = Array.from(dailyMap.keys()).sort()
  let cumulative = 0
  const rows: DailyPnlRow[] = sortedDates.map((date) => {
    const dailyPnl = dailyMap.get(date) ?? 0
    cumulative += dailyPnl
    return { date, realized_pnl: dailyPnl, pnl_to_date: cumulative }
  })

  return rows
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
  }

  const normalizedWallet = wallet.toLowerCase()

  // Check cache
  const cached = getCached(normalizedWallet)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    // ----- Fetch all data sources in parallel -----
    const [
      lbDayResult,
      lbWeekResult,
      lbMonthResult,
      lbAllResult,
      positionsResult,
      allClosedPositionsResult,
      activityResult,
      publicProfileResult,
      followerResult,
    ] = await Promise.allSettled([
      // 1-4: Leaderboard by time period
      fetchJson<LeaderboardEntry[]>(
        `https://data-api.polymarket.com/v1/leaderboard?timePeriod=day&limit=1&user=${wallet}`
      ),
      fetchJson<LeaderboardEntry[]>(
        `https://data-api.polymarket.com/v1/leaderboard?timePeriod=week&limit=1&user=${wallet}`
      ),
      fetchJson<LeaderboardEntry[]>(
        `https://data-api.polymarket.com/v1/leaderboard?timePeriod=month&limit=1&user=${wallet}`
      ),
      fetchJson<LeaderboardEntry[]>(
        `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&limit=1&user=${wallet}`
      ),
      // 5: Open positions
      fetchJson<PolymarketPosition[]>(
        `https://data-api.polymarket.com/positions?user=${wallet}&limit=50&sortBy=CASHPNL&sortDirection=DESC`
      ),
      // 6: ALL closed positions (paginated — used for daily P&L computation)
      fetchAllClosedPositions(wallet),
      // 7: All trade activity (paginated)
      fetchAllActivityTrades(wallet),
      // 8: Public profile
      fetchJson<PublicProfile>(
        `https://gamma-api.polymarket.com/public-profile?address=${wallet}`
      ),
      // 9: Follower count from Supabase
      (async () => {
        try {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          )
          const { count, error } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('trader_wallet', normalizedWallet)
          if (error) return 0
          return count ?? 0
        } catch {
          return 0
        }
      })(),
    ])

    // ----- Extract results (default to null/0 on failure) -----
    const lbDay = lbDayResult.status === 'fulfilled' ? lbDayResult.value : null
    const lbWeek = lbWeekResult.status === 'fulfilled' ? lbWeekResult.value : null
    const lbMonth = lbMonthResult.status === 'fulfilled' ? lbMonthResult.value : null
    const lbAll = lbAllResult.status === 'fulfilled' ? lbAllResult.value : null
    const openPositions = (positionsResult.status === 'fulfilled' ? positionsResult.value : null) ?? []
    const allClosedPositions = (allClosedPositionsResult.status === 'fulfilled' ? allClosedPositionsResult.value : null) ?? []
    // First 50 closed positions for display; full set for daily P&L
    const closedPositions = allClosedPositions.slice(0, 50)
    const activityData = activityResult.status === 'fulfilled' ? activityResult.value : null
    const activityTrades = activityData?.trades ?? []
    const tradeCountCapped = activityData?.capped ?? false
    const publicProfile = publicProfileResult.status === 'fulfilled' ? publicProfileResult.value : null
    const followerCount = followerResult.status === 'fulfilled' ? followerResult.value : 0

    // ----- Parse leaderboard data -----
    const perfDay = parseLeaderboardEntry(lbDay)
    const perfWeek = parseLeaderboardEntry(lbWeek)
    const perfMonth = parseLeaderboardEntry(lbMonth)
    const perfAll = parseLeaderboardEntry(lbAll)

    // At least one leaderboard period returned data
    const hasLeaderboardStats = !!(perfDay || perfWeek || perfMonth || perfAll)

    // ----- Build display name (priority: leaderboard > public-profile > activity > abbreviation) -----
    let displayName = abbreviateWallet(wallet)
    let profileImage: string | null = null
    let xUsername: string | null = null
    let verifiedBadge = false

    // Try leaderboard first (any period will have the same username)
    const firstLeaderboard = lbAll?.[0] ?? lbDay?.[0] ?? lbWeek?.[0] ?? lbMonth?.[0]
    if (firstLeaderboard?.userName) {
      displayName = firstLeaderboard.userName
      profileImage = firstLeaderboard.profileImage ?? null
      xUsername = firstLeaderboard.xUsername ?? null
      verifiedBadge = firstLeaderboard.verifiedBadge ?? false
    }

    // Enrich from public profile (more complete data)
    if (publicProfile) {
      if (publicProfile.name && !firstLeaderboard?.userName) {
        displayName = publicProfile.name
      }
      if (publicProfile.profileImage) {
        profileImage = publicProfile.profileImage
      }
      if (publicProfile.xUsername) {
        xUsername = publicProfile.xUsername
      }
      if (publicProfile.verifiedBadge) {
        verifiedBadge = true
      }
    }

    // Last resort: get name from activity
    if (displayName === abbreviateWallet(wallet) && activityTrades.length > 0 && activityTrades[0].name) {
      displayName = activityTrades[0].name
    }

    // ----- Fallback P&L from positions if leaderboard is completely empty -----
    let hasStats = hasLeaderboardStats
    let fallbackPerformance: PerformancePeriod | null = null

    if (!hasLeaderboardStats && (openPositions.length > 0 || closedPositions.length > 0)) {
      const openPnl = openPositions.reduce((sum, p) => sum + (p.cashPnl ?? 0), 0)
      const closedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl ?? 0), 0)
      const totalVolume = openPositions.reduce((sum, p) => sum + (p.totalBought ?? 0), 0) +
        closedPositions.reduce((sum, p) => sum + (p.totalBought ?? 0), 0)

      fallbackPerformance = {
        pnl: openPnl + closedPnl,
        volume: totalVolume,
        rank: 0,
      }
      hasStats = true
    }

    // ----- Compute daily P&L from closed + unredeemed resolved positions -----
    const dailyPnl = computeDailyPnl(allClosedPositions, Array.isArray(openPositions) ? openPositions : [])

    // ----- Compute win rate from all closed positions -----
    let winRate: number | null = null
    if (allClosedPositions.length > 0) {
      const wins = allClosedPositions.filter((p) => (p.realizedPnl ?? 0) > 0).length
      winRate = (wins / allClosedPositions.length) * 100
    }

    // ----- Compute trading days active from trade activity -----
    const safeActivityTrades = Array.isArray(activityTrades) ? activityTrades : []
    const tradingDaysActive = new Set(
      safeActivityTrades.map((t) => {
        let ts = t.timestamp
        if (ts < 10000000000) ts *= 1000
        return new Date(ts).toISOString().slice(0, 10)
      })
    ).size

    // ----- Build response -----
    const response: TraderProfileResponse = {
      profile: {
        wallet,
        displayName,
        pseudonym: publicProfile?.pseudonym ?? null,
        bio: publicProfile?.bio ?? null,
        profileImage,
        xUsername,
        verifiedBadge,
        accountCreated: publicProfile?.createdAt ?? null,
      },
      performance: {
        day: perfDay,
        week: perfWeek,
        month: perfMonth,
        all: perfAll ?? fallbackPerformance,
      },
      positions: {
        open: Array.isArray(openPositions) ? openPositions : [],
        closed: Array.isArray(closedPositions) ? closedPositions : [],
      },
      trades: safeActivityTrades,
      dailyPnl,
      tradingDaysActive,
      winRate,
      followerCount,
      hasStats,
      totalTradeCount: safeActivityTrades.length,
      tradeCountCapped,
    }

    // Cache and return
    setCache(normalizedWallet, response)

    return NextResponse.json(response)
  } catch (error) {
    console.error('[v3/trader/profile] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trader profile', details: String(error) },
      { status: 500 }
    )
  }
}
