"use client"

import { useState, useEffect, useMemo, useRef, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase, ensureProfile } from "@/lib/supabase"
import { useAuthState } from "@/lib/auth/useAuthState"
import { triggerLoggedOut } from "@/lib/auth/logout-events"
import { TraderAvatar } from "@/components/ui/polycopy-avatar"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { Check, ChevronDown, Search, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

/* ───── Types ───── */

interface Trader {
  wallet: string
  displayName: string
  pnl: number
  winRate: number
  totalTrades: number
  volume: number
  rank: number
  followerCount: number
  roi?: number
  profileImage?: string | null
}

interface TrendingTraderRow {
  trader: Trader
  weekly: { last7: number; prev7: number }
  diff: number
  pctChange: number | null
}

interface BiggestTrade {
  tradeId: string
  wallet: string
  displayName: string | null
  profileImage: string | null
  marketTitle: string | null
  marketSlug: string | null
  conditionId: string | null
  outcome: string | null
  side: string | null
  price: number | null
  size: number | null
  notional: number | null
  tradeTimestamp: string
}

/* ───── Helpers ───── */

function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num)
  if (absNum >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (absNum >= 1_000) return `$${(num / 1_000).toFixed(1)}K`
  return `$${num.toFixed(0)}`
}

function formatSignedLargeNumber(num: number): string {
  const formatted = formatLargeNumber(num)
  return num > 0 ? `+${formatted}` : formatted
}

function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? "").trim()
  if (!candidate || /^0x[a-fA-F0-9]{40}$/.test(candidate)) return wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Trader"
  return candidate
}

function normalizeWallet(wallet: string) {
  return wallet.toLowerCase()
}

function computeWeeklyRealized(rows: { date: string; realized_pnl: number }[]) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => new Date(`${a.date}T00:00:00Z`).getTime() - new Date(`${b.date}T00:00:00Z`).getTime())
  const toDateObj = (s: string) => new Date(`${s}T00:00:00Z`)
  let anchorDate = toDateObj(sorted[sorted.length - 1].date)
  const todayStr = new Date().toISOString().slice(0, 10)
  if (sorted[sorted.length - 1].date === todayStr && sorted.length > 1) {
    anchorDate = toDateObj(sorted[sorted.length - 2].date)
  }
  const endOfLastWeek = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()))
  const startOfLastWeek = new Date(endOfLastWeek)
  startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 6)
  const endOfPrevWeek = new Date(startOfLastWeek)
  endOfPrevWeek.setUTCDate(endOfPrevWeek.getUTCDate() - 1)
  const startOfPrevWeek = new Date(endOfPrevWeek)
  startOfPrevWeek.setUTCDate(startOfPrevWeek.getUTCDate() - 6)
  const withinRange = (day: Date, start: Date, end: Date) => day.getTime() >= start.getTime() && day.getTime() <= end.getTime()
  let last7Sum = 0
  let prev7Sum = 0
  for (const row of sorted) {
    const day = toDateObj(row.date)
    if (withinRange(day, startOfLastWeek, endOfLastWeek)) last7Sum += row.realized_pnl
    else if (withinRange(day, startOfPrevWeek, endOfPrevWeek)) prev7Sum += row.realized_pnl
  }
  return { last7: last7Sum, prev7: prev7Sum }
}

function computePercentChange(weekly: { last7: number; prev7: number }) {
  if (weekly.prev7 === 0) return null
  return ((weekly.last7 - weekly.prev7) / Math.abs(weekly.prev7)) * 100
}

function formatPercentChange(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—"
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}%`
}

function computeWindowDays(rows: { date: string; realized_pnl: number }[], window: "30d" | "7d" | "all") {
  if (rows.length === 0) return { daysUp: 0, daysDown: 0 }
  const toDateObj = (s: string) => new Date(`${s}T00:00:00Z`)
  const lastIndex = rows.length - 1
  let anchorDate = toDateObj(rows[lastIndex].date)
  const todayStr = new Date().toISOString().slice(0, 10)
  if (rows[lastIndex].date === todayStr && lastIndex > 0) anchorDate = toDateObj(rows[lastIndex - 1].date)
  let startDate: Date | null = null
  if (window !== "all") {
    const days = window === "7d" ? 7 : 30
    const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()))
    start.setUTCDate(start.getUTCDate() - (days - 1))
    startDate = start
  }
  const windowRows = rows.filter((row) => {
    const day = toDateObj(row.date)
    return !startDate || day >= startDate
  })
  return {
    daysUp: windowRows.filter((r) => r.realized_pnl > 0).length,
    daysDown: windowRows.filter((r) => r.realized_pnl < 0).length,
  }
}

function getNormalizedCumulativeSeries(rows: { date: string; realized_pnl: number }[], limit = 30) {
  if (rows.length === 0) return []
  const sorted = [...rows].sort((a, b) => new Date(`${a.date}T00:00:00Z`).getTime() - new Date(`${b.date}T00:00:00Z`).getTime())
  const trimmed = sorted.slice(-limit)
  if (trimmed.length === 0) return []
  let cumulative = 0
  const series: number[] = []
  for (const row of trimmed) {
    cumulative += row.realized_pnl
    series.push(cumulative)
  }
  const baseline = series[0] ?? 0
  return series.map((v) => v - baseline)
}

/* ───── PnlSparkline ───── */

function PnlSparkline({ rows, limit, width = 90, height = 32 }: { rows: { date: string; realized_pnl: number }[]; limit?: number; width?: number; height?: number }) {
  const data = useMemo(() => getNormalizedCumulativeSeries(rows, limit), [rows, limit])
  if (data.length === 0) return <span className="text-[11px] text-muted-foreground">—</span>
  const minValue = Math.min(...data)
  const maxValue = Math.max(...data)
  const range = Math.max(maxValue - minValue, 1)
  const points = data.map((value, index) => ({
    x: data.length === 1 ? width / 2 : (index / (data.length - 1)) * width,
    y: height - ((value - minValue) / range) * height,
  }))
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ")
  const netChange = data[data.length - 1]
  const strokeColor = netChange > 0 ? "#16a34a" : netChange < 0 ? "#dc2626" : "#94a3b8"
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={path} stroke={strokeColor} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ───── Constants ───── */

const categoryMap: Record<string, string> = {
  All: "OVERALL",
  Sports: "SPORTS",
  Politics: "POLITICS",
  Crypto: "CRYPTO",
  "Pop Culture": "CULTURE",
}

const categories = ["All", "Sports", "Politics", "Crypto", "Pop Culture"]

const sortMetricOptions: Array<{ value: "roi" | "pnl" | "volume"; label: string }> = [
  { value: "pnl", label: "PNL" },
  { value: "roi", label: "ROI" },
  { value: "volume", label: "Volume" },
]

/* ───── Main Component ───── */

function DiscoverPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthState({ requireAuth: false })

  // Core state
  const [traders, setTraders] = useState<Trader[]>([])
  const [loadingTraders, setLoadingTraders] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("OVERALL")
  const [sortMetric, setSortMetric] = useState<"roi" | "pnl" | "volume">("pnl")
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(5)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)

  // Follows
  const [followedWallets, setFollowedWallets] = useState<Set<string>>(new Set())

  // Insights data
  const [realizedDailyMap, setRealizedDailyMap] = useState<Record<string, { date: string; realized_pnl: number }[]>>({})
  const [yesterdayWinners, setYesterdayWinners] = useState<Array<{ wallet: string; pnl: number; displayName: string | null }>>([])
  const [mostActiveFromPublicTrades, setMostActiveFromPublicTrades] = useState<Array<{ wallet: string; displayName: string | null }>>([])
  const [loadingMostActive, setLoadingMostActive] = useState(true)
  const [biggestTrades, setBiggestTrades] = useState<BiggestTrade[]>([])

  // Signal feed
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({})

  // Init category from URL
  useEffect(() => {
    const cat = searchParams.get("category")
    if (cat) setSelectedCategory(cat)
  }, [searchParams])

  // Fetch follows
  useEffect(() => {
    if (!user) { setFollowedWallets(new Set()); return }
    ensureProfile(user.id, user.email!)
    supabase.from("follows").select("trader_wallet").eq("user_id", user.id).then(({ data }) => {
      setFollowedWallets(new Set(data?.map((f) => f.trader_wallet.toLowerCase()) ?? []))
    })
  }, [user])

  // Fetch traders
  useEffect(() => {
    setLoadingTraders(true)
    fetch(`/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=${selectedCategory}&timePeriod=month`)
      .then((r) => (r.ok ? r.json() : { traders: [] }))
      .then((data) => {
        const withROI = (data.traders || []).map((t: any) => ({ ...t, roi: t.volume > 0 ? (t.pnl / t.volume) * 100 : 0 }))
        setTraders(withROI)
      })
      .catch(() => setTraders([]))
      .finally(() => setLoadingTraders(false))
  }, [selectedCategory])

  // Fetch yesterday winners
  useEffect(() => {
    let cancelled = false
    fetch("/api/realized-pnl/top?window=1D&limit=10", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!cancelled) setYesterdayWinners(Array.isArray(p?.traders) ? p.traders : []) })
      .catch(() => { if (!cancelled) setYesterdayWinners([]) })
    return () => { cancelled = true }
  }, [])

  // Fetch most active
  useEffect(() => {
    let cancelled = false
    setLoadingMostActive(true)
    fetch("/api/public-trades/most-active?hours=24&limit=10", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setMostActiveFromPublicTrades(Array.isArray(data?.traders) ? data.traders : [])
      })
      .catch(() => { if (!cancelled) setMostActiveFromPublicTrades([]) })
      .finally(() => { if (!cancelled) setLoadingMostActive(false) })
    return () => { cancelled = true }
  }, [])

  // Fetch biggest trades for signal feed
  useEffect(() => {
    let cancelled = false
    fetch("/api/public-trades/biggest?hours=1&limit=24", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && Array.isArray(data?.trades)) setBiggestTrades(data.trades) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Sorted / filtered traders
  const rankedTraders = useMemo(() => {
    const sorters: Record<"roi" | "pnl" | "volume", (a: Trader, b: Trader) => number> = {
      roi: (a, b) => (b.roi || 0) - (a.roi || 0),
      pnl: (a, b) => b.pnl - a.pnl,
      volume: (a, b) => b.volume - a.volume,
    }
    return [...traders].sort(sorters[sortMetric])
  }, [traders, sortMetric])

  const visibleTraders = rankedTraders.slice(0, visibleCount)

  // Trending traders
  const trendingTraders = useMemo(() => {
    const entries: TrendingTraderRow[] = []
    for (const trader of rankedTraders) {
      const rows = realizedDailyMap[normalizeWallet(trader.wallet)]
      if (!rows || rows.length === 0) continue
      const weekly = computeWeeklyRealized(rows)
      if (!weekly) continue
      entries.push({ trader, weekly, diff: weekly.last7 - weekly.prev7, pctChange: computePercentChange(weekly) })
    }
    return entries.sort((a, b) => b.diff - a.diff).slice(0, 4)
  }, [rankedTraders, realizedDailyMap])

  // Most consistent
  const mostConsistentEntries = useMemo(() => {
    return [...traders]
      .map((t) => ({ trader: t, daysUp: computeWindowDays(realizedDailyMap[normalizeWallet(t.wallet)] ?? [], "30d").daysUp }))
      .sort((a, b) => b.daysUp !== a.daysUp ? b.daysUp - a.daysUp : (b.trader.winRate || 0) - (a.trader.winRate || 0))
      .slice(0, 5)
  }, [traders, realizedDailyMap])

  const sortedYesterdayWinners = useMemo(() => [...yesterdayWinners].sort((a, b) => b.pnl - a.pnl).slice(0, 5), [yesterdayWinners])
  const mostActiveTraders = useMemo(() => mostActiveFromPublicTrades.slice(0, 5), [mostActiveFromPublicTrades])

  // Fetch realized daily PnL for wallets
  useEffect(() => {
    const walletSet = new Set<string>()
    rankedTraders.slice(0, 50).forEach((t) => walletSet.add(normalizeWallet(t.wallet)))
    const walletsToFetch = Array.from(walletSet).filter((w) => !(w in realizedDailyMap))
    if (walletsToFetch.length === 0) return

    let cancelled = false
    const BATCH_SIZE = 5
    const loadRealized = async () => {
      for (let i = 0; i < walletsToFetch.length; i += BATCH_SIZE) {
        if (cancelled) return
        const batch = walletsToFetch.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map(async (wallet) => {
            try {
              const response = await fetch(`/api/trader/${wallet}/realized-pnl`, { cache: "no-store" })
              if (!response.ok) return [wallet, []] as [string, { date: string; realized_pnl: number }[]]
              const payload = await response.json()
              const rows = Array.isArray(payload?.daily)
                ? payload.daily.map((r: any) => ({ date: r.date, realized_pnl: Number(r.realized_pnl ?? 0) }))
                : []
              return [wallet, rows] as [string, { date: string; realized_pnl: number }[]]
            } catch {
              return [wallet, []] as [string, { date: string; realized_pnl: number }[]]
            }
          })
        )
        if (!cancelled) {
          setRealizedDailyMap((prev) => {
            const next = { ...prev }
            for (const [w, rows] of results) next[w] = rows
            return next
          })
        }
      }
    }
    loadRealized()
    return () => { cancelled = true }
  }, [rankedTraders, realizedDailyMap])

  // Close sort menu on outside click
  useEffect(() => {
    if (!isSortMenuOpen) return
    const handle = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setIsSortMenuOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [isSortMenuOpen])

  // Search handler
  const handleSearch = async () => {
    const query = searchQuery.trim()
    if (!query) return
    setIsSearching(true)
    try {
      if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
        router.push(`/v2/trader/${query}`)
      } else {
        alert("Please enter a valid wallet address (starts with 0x, 42 characters).")
      }
    } finally {
      setIsSearching(false)
    }
  }

  // Follow handler
  const handleFollowChange = async (wallet: string, isNowFollowing: boolean) => {
    if (!user) { triggerLoggedOut("session_missing"); router.push("/login"); return }
    const walletLower = wallet.toLowerCase()
    try {
      if (isNowFollowing) {
        await supabase.from("follows").upsert({ user_id: user.id, trader_wallet: wallet }, { onConflict: "user_id,trader_wallet" })
        setFollowedWallets((prev) => new Set(prev).add(walletLower))
      } else {
        await supabase.from("follows").delete().eq("user_id", user.id).eq("trader_wallet", wallet)
        setFollowedWallets((prev) => { const n = new Set(prev); n.delete(walletLower); return n })
      }
    } catch (err) {
      console.error("Error toggling follow:", err)
    }
  }

  // Signal feed trades
  const signalFeedTrades = useMemo(() => {
    return biggestTrades
      .filter((t) => t.notional && t.notional >= 10 && t.price && t.price > 0)
      .slice(0, 12)
  }, [biggestTrades])

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      {/* ─── LIVE SIGNAL FEED ─── */}
      {signalFeedTrades.length > 0 && (
        <div className="border-b border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-poly-yellow" />
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Live_Signal_Feed
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {signalFeedTrades.map((trade) => {
                const roi = trade.price && trade.price > 0 ? ((marketPrices[trade.conditionId || trade.marketSlug || ""] ?? trade.price) - trade.price) / trade.price * 100 : 0
                return (
                  <div
                    key={trade.tradeId}
                    className="flex min-w-[220px] flex-shrink-0 items-stretch border border-border bg-card"
                  >
                    <div className="w-1 bg-poly-yellow flex-shrink-0" />
                    <div className="flex-1 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-sans text-[10px] font-bold uppercase tracking-wide text-foreground truncate max-w-[120px]">
                          {formatDisplayName(trade.displayName, trade.wallet)}
                        </p>
                        <span className="font-body text-[10px] font-semibold tabular-nums text-muted-foreground">
                          {trade.notional ? formatLargeNumber(trade.notional) : "—"}
                        </span>
                      </div>
                      <p className="mt-0.5 font-body text-[9px] text-muted-foreground truncate">
                        {(trade.marketTitle || "Unknown Market").slice(0, 30)}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="font-body text-[10px] tabular-nums text-muted-foreground">
                          ${(trade.price ?? 0).toFixed(2)}
                        </span>
                        <span className={cn("font-body text-[10px] font-semibold tabular-nums", roi > 0 ? "text-profit-green" : roi < 0 ? "text-loss-red" : "text-muted-foreground")}>
                          {roi > 0 ? "+" : ""}{roi.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ─── HERO: FIND YOUR EDGE ─── */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="relative overflow-hidden bg-poly-black px-6 py-14 md:px-16 md:py-20">
          {/* Decorative arrows */}
          <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-1 opacity-30">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 17 7" /><polyline points="7 7 17 7 17 17" /></svg>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 17 7" /><polyline points="7 7 17 7 17 17" /></svg>
          </div>

          <div className="mx-auto max-w-xl text-center">
            <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-widest text-white/40">
              Search_Database_V2.0_Polymarket
            </p>
            <h1 className="font-sans text-4xl font-bold uppercase tracking-tight text-white md:text-5xl lg:text-6xl">
              Find Your Edge.
            </h1>
            <div className="mt-8 relative mx-auto max-w-md">
              <div className="flex items-center border-2 border-white/20 bg-white">
                <Search className="ml-4 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Enter wallet address (0x...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch() }}
                  className="h-11 flex-1 bg-transparent px-3 font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="mr-1.5 h-8 bg-poly-yellow px-5 font-sans text-xs font-bold uppercase tracking-wide text-poly-black transition hover:bg-poly-yellow/90 disabled:opacity-50"
                >
                  {isSearching ? "..." : "Search"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── TRENDING TRADERS ─── */}
      <div className="bg-card border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                Trending Traders
              </h2>
              <p className="font-sans text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Most improved by realized PnL week-over-week
              </p>
            </div>
            <Link href="/discover" className="font-sans text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition">
              View All Trending
            </Link>
          </div>

          {trendingTraders.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[260px] border border-border bg-accent animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {trendingTraders.map((entry, index) => {
                const trader = entry.trader
                const rows = realizedDailyMap[normalizeWallet(trader.wallet)] || []
                const isFollowing = followedWallets.has(trader.wallet.toLowerCase())
                const changeColor = entry.pctChange !== null
                  ? entry.pctChange > 0 ? "text-profit-green" : entry.pctChange < 0 ? "text-loss-red" : "text-foreground"
                  : "text-muted-foreground"
                return (
                  <div
                    key={trader.wallet}
                    className="border border-border bg-card p-4 cursor-pointer transition hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]"
                    onClick={() => router.push(`/v2/trader/${trader.wallet}?tab=trades`)}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <TraderAvatar displayName={trader.displayName} wallet={trader.wallet} src={trader.profileImage} size={36} className="ring-2 ring-border" />
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-xs font-bold text-foreground truncate">{formatDisplayName(trader.displayName, trader.wallet)}</p>
                        <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">PnL_Growth</p>
                      </div>
                    </div>
                    <p className={cn("mt-2 font-sans text-2xl font-bold tabular-nums", changeColor)}>
                      {formatPercentChange(entry.pctChange)}
                    </p>
                    <div className="mt-2">
                      <p className="font-sans text-[8px] font-bold uppercase tracking-widest text-muted-foreground">Last 7 Days</p>
                      <p className="font-body text-sm font-semibold tabular-nums text-foreground">{formatSignedLargeNumber(entry.weekly.last7)}</p>
                    </div>
                    <div className="mt-2 flex justify-center">
                      <PnlSparkline rows={rows} limit={14} width={160} height={36} />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFollowChange(trader.wallet, !isFollowing) }}
                      className="mt-3 w-full bg-poly-yellow py-2 font-sans text-[10px] font-bold uppercase tracking-wide text-poly-black transition hover:bg-poly-yellow/90"
                    >
                      {isFollowing ? "Following" : "Follow Trader"}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── TOP TRADERS TABLE ─── */}
      <div className="bg-card border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                Top Traders By
              </h2>
              <div ref={sortMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsSortMenuOpen((p) => !p)}
                  className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 font-sans text-sm font-bold uppercase tracking-wide text-profit-green transition hover:bg-accent"
                >
                  {sortMetricOptions.find((o) => o.value === sortMetric)?.label || "PNL"}
                  <ChevronDown className="h-4 w-4" />
                </button>
                {isSortMenuOpen && (
                  <div className="absolute left-0 z-10 mt-1 w-36 border border-border bg-card shadow-lg">
                    {sortMetricOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setSortMetric(opt.value); setIsSortMenuOpen(false) }}
                        className={cn(
                          "w-full px-4 py-2 text-left font-sans text-xs font-bold uppercase tracking-wide transition",
                          sortMetric === opt.value ? "bg-poly-yellow/20 text-foreground" : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {categories.map((cat) => {
                const val = categoryMap[cat]
                const isActive = selectedCategory === val
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(val)}
                    className={cn(
                      "px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-wide transition whitespace-nowrap border",
                      isActive
                        ? "bg-poly-black text-white border-poly-black"
                        : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {loadingTraders ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 border border-border bg-accent animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="border border-border bg-card">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[60px_1fr_100px_100px_120px_100px_120px] items-center border-b border-border px-4 py-3">
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">Rank</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Trader</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">ROI</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">P&L</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">Trend</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">Volume</span>
                <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground text-center">Action</span>
              </div>
              {/* Table rows */}
              {visibleTraders.map((trader, index) => {
                const isFollowing = followedWallets.has(trader.wallet.toLowerCase())
                return (
                  <div
                    key={trader.wallet}
                    className="grid grid-cols-[60px_1fr_100px_100px_120px_100px_120px] items-center border-b border-border px-4 py-2.5 transition hover:bg-accent/50"
                  >
                    <div className="text-center font-body text-sm font-semibold tabular-nums text-muted-foreground">{index + 1}</div>
                    <Link href={`/v2/trader/${trader.wallet}`} className="flex items-center gap-2.5 min-w-0">
                      <TraderAvatar displayName={trader.displayName} wallet={trader.wallet} src={trader.profileImage} size={32} className="ring-1 ring-border" />
                      <p className="font-sans text-sm font-bold text-foreground truncate">{formatDisplayName(trader.displayName, trader.wallet)}</p>
                    </Link>
                    <div className={cn("text-center font-body text-sm font-semibold tabular-nums", (trader.roi ?? 0) > 0 ? "text-profit-green" : (trader.roi ?? 0) < 0 ? "text-loss-red" : "text-foreground")}>
                      {(trader.roi ?? 0) > 0 ? "+" : ""}{(trader.roi ?? 0).toFixed(1)}%
                    </div>
                    <div className={cn("text-center font-body text-sm font-semibold tabular-nums", trader.pnl > 0 ? "text-profit-green" : trader.pnl < 0 ? "text-loss-red" : "text-foreground")}>
                      {formatLargeNumber(trader.pnl)}
                    </div>
                    <div className="flex justify-center">
                      <PnlSparkline rows={realizedDailyMap[normalizeWallet(trader.wallet)] ?? []} />
                    </div>
                    <div className="text-center font-body text-sm font-semibold tabular-nums text-foreground">
                      {formatLargeNumber(trader.volume)}
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => handleFollowChange(trader.wallet, !isFollowing)}
                        className="bg-poly-yellow px-4 py-1.5 font-sans text-[10px] font-bold uppercase tracking-wide text-poly-black transition hover:bg-poly-yellow/90"
                      >
                        {isFollowing ? <Check className="h-3.5 w-3.5 mx-auto" /> : "Follow"}
                      </button>
                    </div>
                  </div>
                )
              })}
              {/* Load more */}
              {rankedTraders.length > visibleCount && (
                <div className="flex justify-center border-t border-border px-4 py-4">
                  <button
                    onClick={() => setVisibleCount((p) => Math.min(p + 10, rankedTraders.length))}
                    className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition"
                  >
                    Load_More_Records_001
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── BOTTOM 3 COLUMNS ─── */}
      <div className="bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Most Consistent */}
            <div className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-foreground">Most Consistent</h3>
                <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Days up in last 30</p>
              </div>
              <div className="divide-y divide-border">
                {mostConsistentEntries.length === 0 ? (
                  <div className="px-4 py-6 text-center font-body text-sm text-muted-foreground">No traders yet</div>
                ) : (
                  mostConsistentEntries.map((entry, i) => (
                    <Link
                      key={entry.trader.wallet}
                      href={`/v2/trader/${entry.trader.wallet}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-accent"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <TraderAvatar displayName={entry.trader.displayName} wallet={entry.trader.wallet} src={entry.trader.profileImage} size={24} showRing={false} />
                        <p className="font-body text-sm text-foreground truncate">
                          {formatDisplayName(entry.trader.displayName, entry.trader.wallet)}
                        </p>
                      </div>
                      <span className="font-body text-sm font-semibold tabular-nums text-foreground flex-shrink-0">{entry.daysUp}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Biggest Winners */}
            <div className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-foreground">Biggest Winners</h3>
                <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">By realized gain yesterday</p>
              </div>
              <div className="divide-y divide-border">
                {sortedYesterdayWinners.length === 0 ? (
                  <div className="px-4 py-6 text-center font-body text-sm text-muted-foreground">No winners yet</div>
                ) : (
                  sortedYesterdayWinners.map((trader, i) => (
                    <Link
                      key={trader.wallet}
                      href={`/v2/trader/${trader.wallet}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-accent"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-body text-xs font-semibold tabular-nums text-muted-foreground w-4 text-center flex-shrink-0">{i + 1}</span>
                        <p className="font-body text-sm text-foreground truncate">
                          {formatDisplayName(trader.displayName, trader.wallet)}
                        </p>
                      </div>
                      <span className={cn("font-body text-sm font-semibold tabular-nums flex-shrink-0", trader.pnl > 0 ? "text-profit-green" : "text-loss-red")}>
                        {formatLargeNumber(trader.pnl)}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Most Active */}
            <div className="border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-foreground">Most Active</h3>
                <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Trades in the last 24h</p>
              </div>
              <div className="divide-y divide-border">
                {loadingMostActive ? (
                  <div className="px-4 py-8 text-center">
                    <div className="inline-block h-5 w-5 animate-spin border-2 border-poly-yellow border-r-transparent" />
                  </div>
                ) : mostActiveTraders.length === 0 ? (
                  <div className="px-4 py-6 text-center font-body text-sm text-muted-foreground">No active traders yet</div>
                ) : (
                  mostActiveTraders.map((trader, i) => (
                    <Link
                      key={trader.wallet}
                      href={`/v2/trader/${trader.wallet}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-accent"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-body text-xs font-semibold tabular-nums text-muted-foreground w-4 text-center flex-shrink-0">{i + 1}</span>
                        <p className="font-body text-sm text-foreground truncate">
                          {formatDisplayName(trader.displayName, trader.wallet)}
                        </p>
                      </div>
                      <span className="font-sans text-[9px] font-bold uppercase tracking-wide text-muted-foreground flex-shrink-0">Trader</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <V2Footer />
      <BottomNav />
    </div>
  )
}

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-poly-cream flex items-center justify-center">
          <div className="text-center">
            <div className="h-12 w-12 animate-spin border-4 border-poly-yellow border-r-transparent mx-auto mb-4" />
            <p className="font-body text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <DiscoverPageContent />
    </Suspense>
  )
}
