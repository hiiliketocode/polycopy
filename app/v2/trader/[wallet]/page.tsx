"use client"

import { use, useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { TradeCard, type TradeData } from "@/components/polycopy-v2/trade-card"
import { PolycopyAvatar } from "@/components/ui/polycopy-avatar"
import {
  RefreshCw,
  Copy,
  Share2,
  Check,
  Info,
  Loader2,
  Filter,
  LayoutList,
  LayoutGrid,
  ExternalLink,
} from "lucide-react"
import { ShareCardModal } from "@/components/polycopy-v2/share-card-modal"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from "recharts"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface TraderProfile {
  wallet: string
  displayName: string
  pnl: number
  volume: number
  followerCount: number
  profileImage?: string | null
  roi?: number
  tradesCount?: number
  winRate?: number | null
  hasStats?: boolean
}

interface RealizedPnlRow {
  date: string
  realized_pnl: number
  pnl_to_date: number | null
}

interface PnlSummary {
  label: string
  days: number | null
  pnl: number
  returnPct: number | null
  cumulative: number | null
}

interface PnlRanking {
  rank: number | null
  total: number | null
  delta: number | null
  previousRank: number | null
}

interface MyTradeStats {
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  totalVolume: number
  roi: number
  winRate: number
  totalTrades: number
  openTrades: number
  closedTrades: number
  winningTrades: number
  losingTrades: number
}

interface CategoryDistribution {
  category: string
  count: number
  percentage: number
  color: string
}

type ProfileTab = "trades" | "performance"
type PnlWindow = "1D" | "7D" | "30D" | "3M" | "6M" | "ALL"

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

const formatSignedCurrency = (amount: number, decimals = 2) => {
  const abs = Math.abs(amount)
  let formatted: string
  if (abs >= 1_000_000) formatted = `$${(abs / 1_000_000).toFixed(1)}M`
  else if (abs >= 1000) formatted = `$${(abs / 1000).toFixed(abs >= 10000 ? 1 : 2)}K`
  else
    formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(abs)
  if (amount > 0) return `+${formatted}`
  if (amount < 0) return `-${formatted}`
  return formatted
}

const formatCompactCurrency = (value: number) => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

const formatPercent = (value: number, signed = false) => {
  const abs = Math.abs(value).toFixed(1)
  if (signed) return value > 0 ? `+${abs}%` : value < 0 ? `-${abs}%` : `${abs}%`
  return `${abs}%`
}

const truncateAddress = (address: string) => {
  if (!address) return ""
  return `${address.slice(0, 6)}...${address.slice(-4)}`.toUpperCase()
}

const formatRelativeTime = (dateStr: string | number | null | undefined) => {
  if (!dateStr) return ""
  const date = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`)

const categoryColors: Record<string, string> = {
  Sports: "#FDB022",
  Politics: "#6366F1",
  Crypto: "#F97316",
  Culture: "#EC4899",
  Finance: "#10B981",
  Economics: "#14B8A6",
  Tech: "#3B82F6",
  Weather: "#06B6D4",
  Other: "#94A3B8",
}

const categorizeMarketTitle = (title: string): string => {
  const t = title.toLowerCase()
  if (t.match(/trump|biden|harris|election|president|congress|senate|democrat|republican|political|vote/))
    return "Politics"
  if (t.match(/\svs\s|\svs\.|nfl|nba|nhl|mlb|soccer|football|basketball|baseball|hockey|tennis|golf|mma|ufc|boxing|game|match|score|tournament|league/))
    return "Sports"
  if (t.match(/bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|solana|sol|token|coin/))
    return "Crypto"
  if (t.match(/movie|film|music|celebrity|oscar|grammy|netflix|streaming|youtube|tiktok/))
    return "Culture"
  if (t.match(/stock|nasdaq|dow|market|ipo|shares|wall street|earnings/))
    return "Finance"
  if (t.match(/gdp|inflation|recession|unemployment|interest rate|fed|economy/))
    return "Economics"
  if (t.match(/ai|artificial intelligence|tech|apple|google|microsoft|meta|tesla|nvidia|openai/))
    return "Tech"
  if (t.match(/temperature|weather|climate|hurricane|storm/))
    return "Weather"
  return "Other"
}

const PNL_WINDOW_OPTIONS: { key: PnlWindow; label: string; shortLabel: string; days: number | null }[] = [
  { key: "1D", label: "Yesterday", shortLabel: "1D", days: 1 },
  { key: "7D", label: "7 Days", shortLabel: "7D", days: 7 },
  { key: "30D", label: "30 Days", shortLabel: "30D", days: 30 },
  { key: "3M", label: "3 Months", shortLabel: "3M", days: 90 },
  { key: "6M", label: "6 Months", shortLabel: "6M", days: 180 },
  { key: "ALL", label: "All Time", shortLabel: "ALL", days: null },
]

/* ═══════════════════════════════════════════════════════
   Donut Chart Component
   ═══════════════════════════════════════════════════════ */

function DonutChart({
  data,
  size = 160,
  strokeWidth = 28,
}: {
  data: CategoryDistribution[]
  size?: number
  strokeWidth?: number
}) {
  const center = size / 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const total = data.reduce((sum, d) => sum + d.count, 0)

  let cumulativePercent = 0
  const segments = data.map((d) => {
    const percent = d.count / total
    const offset = cumulativePercent * circumference
    const length = percent * circumference
    cumulativePercent += percent
    return { ...d, offset, length }
  })

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${seg.length} ${circumference - seg.length}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans text-xl font-bold text-poly-black">{total}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function TraderProfilePage({
  params,
}: {
  params: Promise<{ wallet: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { wallet } = use(params)

  /* ── Auth ── */
  const [user, setUser] = useState<any>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

  /* ── Trader data ── */
  const [trader, setTrader] = useState<TraderProfile | null>(null)
  const [loading, setLoading] = useState(true)

  /* ── Follow ── */
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  /* ── Trades ── */
  const [trades, setTrades] = useState<any[]>([])
  const [tradeCards, setTradeCards] = useState<TradeData[]>([])
  const [loadingTrades, setLoadingTrades] = useState(true)
  const [tradesToShow, setTradesToShow] = useState(15)

  /* ── Realized P&L ── */
  const [realizedPnlRows, setRealizedPnlRows] = useState<RealizedPnlRow[]>([])
  const [pnlSummaries, setPnlSummaries] = useState<PnlSummary[]>([])
  const [pnlRankings, setPnlRankings] = useState<Record<string, PnlRanking>>({})
  const [loadingRealizedPnl, setLoadingRealizedPnl] = useState(true)
  const [pnlWindow, setPnlWindow] = useState<PnlWindow>("30D")
  const [pnlView, setPnlView] = useState<"daily" | "cumulative">("daily")
  const [traderVolume, setTraderVolume] = useState<number | null>(null)

  /* ── My copy stats ── */
  const [myStats, setMyStats] = useState<MyTradeStats | null>(null)
  const [myStatsLoading, setMyStatsLoading] = useState(false)

  /* ── UI ── */
  const initialTab = searchParams.get("tab") === "trades" ? "trades" : "performance"
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab)
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  /* ── Refs ── */
  const hasLoadedRealizedPnl = useRef(false)
  const hasLoadedMyStats = useRef(false)
  const hasLoadedTrades = useRef(false)

  /* ═══════════════════════════════════════════════════════
     Auth Check
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }
      setUser(user)

      // Get user's wallet
      const { data: walletData } = await supabase
        .from("turnkey_wallets")
        .select("polymarket_account_address, eoa_address")
        .eq("user_id", user.id)
        .maybeSingle()
      if (walletData) {
        setWalletAddress(walletData.polymarket_account_address || walletData.eoa_address || null)
      }
    }
    checkAuth()
  }, [router])

  /* ═══════════════════════════════════════════════════════
     Fetch Trader Profile + Trades + Performance (V3 endpoint)
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user) return
    let cancelled = false

    const fetchAll = async () => {
      setLoading(true)
      setLoadingTrades(true)
      setLoadingRealizedPnl(true)

      try {
        // Single aggregated fetch replaces 3 separate endpoints
        const res = await fetch(`/api/v3/trader/${wallet}/profile`)
        if (res.ok) {
          const data = await res.json()
          if (cancelled) return

          // 1. Populate trader profile
          const allPerf = data.performance?.all
          setTrader({
            wallet: data.profile.wallet,
            displayName: data.profile.displayName,
            pnl: allPerf?.pnl ?? 0,
            volume: allPerf?.volume ?? 0,
            followerCount: data.followerCount ?? 0,
            profileImage: data.profile.profileImage,
            roi: allPerf && allPerf.volume > 0 ? (allPerf.pnl / allPerf.volume) * 100 : 0,
            winRate: data.winRate != null ? data.winRate / 100 : null,
            hasStats: data.hasStats,
          })
          setTraderVolume(allPerf?.volume ?? 0)

          // 2. Populate trades from activity data
          const rawTrades = Array.isArray(data.trades) ? data.trades : []
          setTrades(rawTrades)

          // Transform to TradeData for TradeCard component
          const displayName = data.profile.displayName || "Trader"
          const transformed: TradeData[] = rawTrades.slice(0, 50).map((t: any) => ({
            id: t.transactionHash || `${t.conditionId}-${t.timestamp}`,
            trader: {
              name: displayName,
              wallet: wallet,
              avatar: data.profile.profileImage ?? undefined,
              isPremium: false,
            },
            market: {
              title: t.title || "Unknown Market",
              token: (t.outcome || t.side || "YES").toUpperCase() === "YES" || (t.side || "").toUpperCase() === "BUY" ? "YES" : "NO",
              condition_id: t.conditionId || "",
            },
            side: ((t.side || "BUY").toUpperCase() as "BUY" | "SELL"),
            entry_price: Number(t.price || 0),
            size_usd: Number(t.size || 0) * Number(t.price || 1),
            conviction: 1.0,
            timestamp: t.timestamp || new Date().toISOString(),
            polyscore: undefined,
          }))
          setTradeCards(transformed)

          // 3. Populate P&L summaries from performance periods
          const perfMap: Record<string, { pnl: number; volume: number; rank: number } | null> = {
            "1D": data.performance?.day ?? null,
            "7D": data.performance?.week ?? null,
            "30D": data.performance?.month ?? null,
            "ALL": data.performance?.all ?? null,
          }

          const summaries: PnlSummary[] = Object.entries(perfMap)
            .filter(([, perf]) => perf !== null)
            .map(([label, perf]) => ({
              label,
              days: label === "ALL" ? null : label === "1D" ? 1 : label === "7D" ? 7 : 30,
              pnl: perf!.pnl,
              returnPct: perf!.volume > 0 ? (perf!.pnl / perf!.volume) * 100 : null,
              cumulative: null,
            }))
          setPnlSummaries(summaries)

          // 4. Populate rankings from performance periods
          const rankings: Record<string, PnlRanking> = {}
          for (const [label, perf] of Object.entries(perfMap)) {
            if (perf) {
              rankings[label] = { rank: perf.rank || null, total: null, delta: null, previousRank: null }
            }
          }
          setPnlRankings(rankings)

          // Populate daily P&L rows for the chart
          if (Array.isArray(data.dailyPnl) && data.dailyPnl.length > 0) {
            setRealizedPnlRows(data.dailyPnl.map((row: any) => ({
              date: row.date,
              realized_pnl: Number(row.realized_pnl ?? 0),
              pnl_to_date: row.pnl_to_date != null ? Number(row.pnl_to_date) : null,
            })))
          }
        }

        // Check follow status (still from Supabase)
        const { data: followData } = await supabase
          .from("follows")
          .select("*")
          .eq("user_id", user.id)
          .eq("trader_wallet", wallet)
          .maybeSingle()
        if (!cancelled) setIsFollowing(!!followData)
      } catch (err) {
        console.error("Error fetching trader:", err)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingTrades(false)
          setLoadingRealizedPnl(false)
        }
      }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [user, wallet])

  /* ═══════════════════════════════════════════════════════
     Fetch My Copy Stats
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user || hasLoadedMyStats.current) return
    // Don't fetch if viewing own profile
    if (walletAddress && walletAddress.toLowerCase() === wallet.toLowerCase()) return
    hasLoadedMyStats.current = true

    const load = async () => {
      setMyStatsLoading(true)
      try {
        const res = await fetch(`/api/trader/${wallet}/my-stats`, { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          if (data?.trader) setMyStats(data.trader)
        }
      } catch {
        // Ignore
      } finally {
        setMyStatsLoading(false)
      }
    }
    load()
  }, [user, wallet, walletAddress])

  /* ═══════════════════════════════════════════════════════
     Follow Toggle
     ═══════════════════════════════════════════════════════ */
  const handleFollowToggle = async () => {
    if (!user || followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowing) {
        await supabase.from("follows").delete().eq("user_id", user.id).eq("trader_wallet", wallet)
        setIsFollowing(false)
      } else {
        await supabase.from("follows").insert({ user_id: user.id, trader_wallet: wallet })
        setIsFollowing(true)
      }
    } catch (err) {
      console.error("Error toggling follow:", err)
    } finally {
      setFollowLoading(false)
    }
  }

  /* ═══════════════════════════════════════════════════════
     Copy Address
     ═══════════════════════════════════════════════════════ */
  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(wallet)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }, [wallet])

  /* ═══════════════════════════════════════════════════════
     Derived Data
     ═══════════════════════════════════════════════════════ */

  // Filter P&L rows by window
  const sortedPnlRows = useMemo(
    () => [...realizedPnlRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [realizedPnlRows]
  )

  const realizedWindowRows = useMemo(() => {
    if (sortedPnlRows.length === 0) return []
    const option = PNL_WINDOW_OPTIONS.find((o) => o.key === pnlWindow) || PNL_WINDOW_OPTIONS[2]
    if (option.key === "ALL" || option.days === null) return sortedPnlRows

    let anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 1].date)
    const todayStr = new Date().toISOString().slice(0, 10)
    if (sortedPnlRows[sortedPnlRows.length - 1].date === todayStr && sortedPnlRows.length > 1) {
      anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 2].date)
    }
    const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()))
    start.setUTCDate(start.getUTCDate() - (option.days - 1))

    return sortedPnlRows.filter((row) => toDateObj(row.date) >= start)
  }, [sortedPnlRows, pnlWindow])

  const realizedChartSeries = useMemo(() => {
    let running = 0
    return realizedWindowRows.map((row) => {
      running += row.realized_pnl
      return { date: row.date, dailyPnl: row.realized_pnl, cumulativePnl: running }
    })
  }, [realizedWindowRows])

  // Window summary stats
  const windowSummary = useMemo(() => {
    const summaryForWindow = pnlSummaries.find((s) => s.label === pnlWindow)
    const totalPnl = summaryForWindow?.pnl ?? realizedWindowRows.reduce((s, r) => s + r.realized_pnl, 0)
    const daysActive = realizedWindowRows.length
    const daysUp = realizedWindowRows.filter((r) => r.realized_pnl > 0).length
    const daysDown = realizedWindowRows.filter((r) => r.realized_pnl < 0).length
    const avgDaily = daysActive > 0 ? totalPnl / daysActive : 0
    const ranking = pnlRankings[pnlWindow] || pnlRankings["ALL"]

    const volume = traderVolume ?? trader?.volume ?? 0
    const roi = volume > 0 ? (totalPnl / volume) * 100 : 0

    return { totalPnl, avgDaily, rank: ranking?.rank, daysActive, daysUp, daysDown, roi }
  }, [pnlSummaries, realizedWindowRows, pnlRankings, pnlWindow, traderVolume, trader?.volume])

  // Category distribution from trades
  const categoryDistribution = useMemo(() => {
    if (trades.length === 0) return []
    const categoryMap: Record<string, number> = {}
    trades.forEach((t: any) => {
      const title = t.market || t.title || t.question || ""
      const category = categorizeMarketTitle(title)
      categoryMap[category] = (categoryMap[category] || 0) + 1
    })
    const total = trades.length
    return Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / total) * 100,
        color: categoryColors[category] || "#94A3B8",
      }))
      .sort((a, b) => b.count - a.count)
  }, [trades])

  // Top performing trades (best ROI)
  const topPerformingTrades = useMemo(() => {
    return trades
      .filter((t: any) => t.currentPrice != null || t.current_price != null)
      .map((t: any) => {
        const entry = Number(t.price || t.entry_price || 0)
        const current = Number(t.currentPrice || t.current_price || entry)
        const roi = entry > 0 ? ((current - entry) / entry) * 100 : 0
        return { ...t, _roi: roi }
      })
      .sort((a: any, b: any) => b._roi - a._roi)
      .slice(0, 5)
  }, [trades])

  // Size distribution from trade data
  const sizeDistribution = useMemo(() => {
    const sizes = trades
      .map((t: any) => Number(t.size || t.amount || 0) * Number(t.price || 1))
      .filter((s) => s > 0)
    if (sizes.length === 0) return []
    const buckets = [
      { label: "<$10", min: 0, max: 10, count: 0, color: "#9CA3AF" },
      { label: "$10–50", min: 10, max: 50, count: 0, color: "#FDB022" },
      { label: "$50–200", min: 50, max: 200, count: 0, color: "#0D9488" },
      { label: "$200–1K", min: 200, max: 1000, count: 0, color: "#4F46E5" },
      { label: "$1K+", min: 1000, max: Infinity, count: 0, color: "#EF4444" },
    ]
    sizes.forEach((s) => {
      const bucket = buckets.find((b) => s >= b.min && s < b.max)
      if (bucket) bucket.count++
    })
    const total = sizes.length
    return buckets
      .filter((b) => b.count > 0)
      .map((b) => ({ ...b, percentage: (b.count / total) * 100 }))
  }, [trades])

  // Rank badge text
  const rankBadge = useMemo(() => {
    const allRank = pnlRankings["ALL"]
    if (!allRank?.rank || !allRank?.total) return null
    const pct = (allRank.rank / allRank.total) * 100
    if (pct <= 0.1) return "TOP 0.1% TRADER"
    if (pct <= 1) return "TOP 1% TRADER"
    if (pct <= 5) return "TOP 5% TRADER"
    if (pct <= 10) return "TOP 10% TRADER"
    return null
  }, [pnlRankings])

  /* ═══════════════════════════════════════════════════════
     Render: Loading
     ═══════════════════════════════════════════════════════ */

  if (!user || loading) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="mb-8 flex items-center gap-6">
            <div className="h-16 w-16 animate-pulse bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-48 animate-pulse bg-gray-200" />
              <div className="h-4 w-64 animate-pulse bg-gray-200" />
            </div>
          </div>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse bg-gray-200" />
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  if (!trader) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <h2 className="mb-2 font-sans text-xl font-bold uppercase tracking-wide text-muted-foreground">
              Trader Not Found
            </h2>
            <p className="font-body text-sm text-muted-foreground">
              This trader does not exist or has no data
            </p>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  const displayName = trader.displayName || "Anonymous Trader"
  const traderPnl = trader.pnl ?? 0
  const traderRoi = trader.roi ?? 0
  const traderVolDisplay = traderVolume ?? trader.volume ?? 0
  const traderWinRate = trader.winRate != null ? trader.winRate * 100 : 0

  /* ═══════════════════════════════════════════════════════
     Render: Page
     ═══════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* ─────────────────────────────────────────────
            Profile Header
            ───────────────────────────────────────────── */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Avatar */}
          <PolycopyAvatar
            src={trader.profileImage || undefined}
            alt={displayName}
            className="h-16 w-16 border-2 border-poly-yellow"
          />

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-2xl font-bold uppercase tracking-wide text-poly-black md:text-3xl">
              {displayName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1 font-body transition-colors hover:text-poly-black"
              >
                {copiedAddress ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {truncateAddress(wallet)}
              </button>
              {rankBadge && (
                <span className="flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">
                  <span className="inline-block h-1.5 w-1.5 bg-poly-yellow" />
                  {rankBadge}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleFollowToggle}
              disabled={followLoading}
              className={cn(
                "flex items-center gap-2 px-6 py-3 font-sans text-sm font-bold uppercase tracking-wide transition-colors",
                isFollowing
                  ? "border border-poly-black bg-transparent text-poly-black hover:bg-poly-black/5"
                  : "bg-poly-black text-poly-cream hover:bg-poly-black/90"
              )}
            >
              {isFollowing && <Check className="h-4 w-4" />}
              {isFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 bg-poly-black px-6 py-3 font-sans text-sm font-bold uppercase tracking-wide text-poly-cream transition-colors hover:bg-poly-black/90"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            Tab Switcher
            ───────────────────────────────────────────── */}
        <div className="mb-8 flex items-center gap-2">
          {(["performance", "trades"] as ProfileTab[]).map((tab) => {
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-all",
                  isActive
                    ? "bg-poly-black text-poly-cream"
                    : "text-muted-foreground hover:text-poly-black"
                )}
              >
                {tab}
              </button>
            )
          })}
        </div>

        {/* ═════════════════════════════════════════════
            TRADES TAB
            ═════════════════════════════════════════════ */}
        {activeTab === "trades" && (
          <div className="space-y-4">
            {/* Trading History header */}
            <div className="border border-border bg-poly-paper p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                  Trading History
                </h2>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1.5 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black">
                    <Filter className="h-3.5 w-3.5" />
                    Filter_By_Type
                  </button>
                  <div className="flex items-center border border-border">
                    <button className="p-1.5 text-poly-black">
                      <LayoutList className="h-4 w-4" />
                    </button>
                    <button className="p-1.5 text-muted-foreground">
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Trade Cards */}
            {loadingTrades ? (
              <div className="border border-border bg-poly-paper p-16 text-center">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  Loading trades...
                </p>
              </div>
            ) : tradeCards.length === 0 ? (
              <div className="border border-border bg-poly-paper p-16 text-center">
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-wide text-muted-foreground">
                  No Trades Yet
                </h3>
                <p className="font-body text-sm text-muted-foreground">
                  This trader hasn&apos;t made any trades
                </p>
              </div>
            ) : (
              <>
                {tradeCards.slice(0, tradesToShow).map((trade, idx) => (
                  <TradeCard
                    key={`${trade.id}-${idx}`}
                    trade={trade}
                    onCopy={() => console.log("Copy trade:", trade.id)}
                    isWalletConnected={Boolean(walletAddress)}
                  />
                ))}
                {tradesToShow < tradeCards.length && (
                  <button
                    onClick={() => setTradesToShow((p) => p + 15)}
                    className="w-full border border-border bg-poly-paper py-3 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
                  >
                    Load More ({tradeCards.length - tradesToShow} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════
            PERFORMANCE TAB
            ═════════════════════════════════════════════ */}
        {activeTab === "performance" && (
          <div className="space-y-8">
            {/* ── Core Alpha Metrics ── */}
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                Core Alpha Metrics
              </h3>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Total_P&L
                  </p>
                  <p className={cn("mt-1 font-sans text-2xl font-bold tabular-nums md:text-3xl", traderPnl >= 0 ? "text-profit-green" : "text-loss-red")}>
                    {formatSignedCurrency(traderPnl)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    ROI(All_Time)
                  </p>
                  <p className={cn("mt-1 font-sans text-2xl font-bold tabular-nums md:text-3xl", traderRoi >= 0 ? "text-profit-green" : "text-loss-red")}>
                    {formatPercent(traderRoi, true)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Cum_Volume
                  </p>
                  <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-poly-black md:text-3xl">
                    {formatCompactCurrency(traderVolDisplay)}
                  </p>
                </div>
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Win_Rate
                  </p>
                  <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-poly-black md:text-3xl">
                    {traderWinRate > 0 ? `${traderWinRate.toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Two‑column layout: P&L left, Copied Performance right */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* ── Realized P&L Section (2/3 width) ── */}
              <div className="border border-border bg-poly-paper p-6 lg:col-span-2">
                {/* Header */}
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black">
                        Realized P&L
                      </h2>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-1 font-body text-xs uppercase tracking-wide text-muted-foreground">
                      Historical Revenue Matrix_V2
                    </p>
                  </div>

                  {/* Daily / Cumulative toggle */}
                  <div className="flex items-center gap-1">
                    {(["daily", "cumulative"] as const).map((view) => (
                      <button
                        key={view}
                        onClick={() => setPnlView(view)}
                        className={cn(
                          "px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                          pnlView === view
                            ? "bg-poly-black text-poly-cream"
                            : "border border-poly-black text-poly-black hover:bg-poly-black/5"
                        )}
                      >
                        {view === "daily" ? "Daily_Change" : "Accumulated"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time period selector */}
                <div className="mb-4 flex items-center gap-1">
                  {PNL_WINDOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setPnlWindow(opt.key)}
                      className={cn(
                        "px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                        pnlWindow === opt.key
                          ? "bg-poly-black text-poly-cream"
                          : "text-muted-foreground hover:text-poly-black"
                      )}
                    >
                      {opt.shortLabel}
                    </button>
                  ))}
                </div>

                {/* Stats grid */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Total_PnL
                    </p>
                    <p className={cn("mt-1 font-sans text-xl font-bold tabular-nums", windowSummary.totalPnl >= 0 ? "text-profit-green" : "text-loss-red")}>
                      {formatSignedCurrency(windowSummary.totalPnl)}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Last {PNL_WINDOW_OPTIONS.find((o) => o.key === pnlWindow)?.label || "30 Days"}
                    </p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      ROI
                    </p>
                    <p className={cn("mt-1 font-sans text-xl font-bold tabular-nums", windowSummary.roi >= 0 ? "text-profit-green" : "text-loss-red")}>
                      {windowSummary.roi !== 0 ? `${windowSummary.roi > 0 ? '+' : ''}${windowSummary.roi.toFixed(1)}%` : "—"}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Return on Volume
                    </p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      P&L_Rank
                    </p>
                    <p className="mt-1 font-sans text-xl font-bold tabular-nums text-poly-black">
                      {windowSummary.rank ? `#${windowSummary.rank}` : "—"}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Global Leaderboard
                    </p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Win_Rate
                    </p>
                    <p className="mt-1 font-sans text-xl font-bold tabular-nums text-poly-black">
                      {traderWinRate > 0 ? `${traderWinRate.toFixed(1)}%` : "—"}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Closed Positions
                    </p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Days_Up
                    </p>
                    <p className="mt-1 font-sans text-xl font-bold tabular-nums text-profit-green">
                      {windowSummary.daysUp}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Profitable
                    </p>
                  </div>
                  <div className="border border-border p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Days_Down
                    </p>
                    <p className="mt-1 font-sans text-xl font-bold tabular-nums text-loss-red">
                      {windowSummary.daysDown}
                    </p>
                    <p className="font-body text-[9px] uppercase tracking-widest text-muted-foreground">
                      Losses
                    </p>
                  </div>
                </div>

                {/* Chart */}
                {loadingRealizedPnl && realizedChartSeries.length === 0 ? (
                  <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading realized P&L...
                  </div>
                ) : realizedChartSeries.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {pnlView === "daily" ? (
                        <BarChart data={realizedChartSeries} barSize={Math.max(4, Math.min(24, 600 / realizedChartSeries.length))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} tickMargin={10} minTickGap={32} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                          <YAxis tickLine={false} axisLine={false} width={60} tickMargin={10} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickCount={6} domain={[(min: number) => Math.min(min, 0), (max: number) => Math.max(max, 0)]} tickFormatter={(v) => formatCompactCurrency(v)} />
                          <RechartsTooltip contentStyle={{ borderRadius: 0, borderColor: "var(--color-border)", background: "var(--color-poly-paper)", fontSize: 12 }} formatter={(v: any) => formatSignedCurrency(Number(v), 2)} labelFormatter={(l) => new Date(`${l}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} />
                          <ReferenceLine y={0} stroke="var(--color-border)" />
                          <Bar dataKey="dailyPnl" name="Daily PnL" minPointSize={2} radius={[0, 0, 0, 0]} isAnimationActive animationDuration={600}>
                            {realizedChartSeries.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={entry.dailyPnl >= 0 ? "var(--color-profit-green)" : "var(--color-loss-red)"} />
                            ))}
                          </Bar>
                        </BarChart>
                      ) : (
                        <AreaChart data={realizedChartSeries}>
                          <defs>
                            <linearGradient id="traderPnlGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-poly-black)" stopOpacity={0.25} />
                              <stop offset="100%" stopColor="var(--color-poly-black)" stopOpacity={0.03} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(v) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} tickMargin={10} minTickGap={32} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                          <YAxis tickLine={false} axisLine={false} width={60} tickMargin={10} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => formatCompactCurrency(v)} />
                          <RechartsTooltip contentStyle={{ borderRadius: 0, borderColor: "var(--color-border)", background: "var(--color-poly-paper)", fontSize: 12 }} formatter={(v: any) => formatSignedCurrency(Number(v), 2)} labelFormatter={(l) => new Date(`${l}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} />
                          <ReferenceLine y={0} stroke="var(--color-border)" />
                          <Area type="monotone" dataKey="cumulativePnl" name="Cumulative PnL" stroke="var(--color-poly-black)" strokeWidth={2} fill="url(#traderPnlGrad)" isAnimationActive animationDuration={600} />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    No realized P&L data available
                  </div>
                )}
              </div>

              {/* ── Your Copied Performance (1/3 width) ── */}
              <div className="flex flex-col gap-8">
                {/* My Copy Stats Card */}
                <div className="bg-poly-black p-6 text-poly-cream">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">
                      ⚡ Your Copied Performance
                    </span>
                  </div>
                  <p className="mb-4 font-body text-[10px] uppercase tracking-widest text-poly-cream/60">
                    Real-time execution snapshot
                  </p>

                  {myStatsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-poly-cream/40" />
                    </div>
                  ) : myStats ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                            Open Positions
                          </p>
                          <p className="font-sans text-2xl font-bold tabular-nums text-poly-cream">
                            {myStats.openTrades}
                          </p>
                        </div>
                        <div>
                          <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                            Total_P&L
                          </p>
                          <p className={cn("font-sans text-2xl font-bold tabular-nums", myStats.totalPnl >= 0 ? "text-profit-green" : "text-loss-red")}>
                            {formatSignedCurrency(myStats.totalPnl)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                            Realized
                          </p>
                          <p className={cn("font-sans text-lg font-bold tabular-nums", myStats.realizedPnl >= 0 ? "text-profit-green" : "text-loss-red")}>
                            {formatSignedCurrency(myStats.realizedPnl)}
                          </p>
                        </div>
                        <div>
                          <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                            Unrealized
                          </p>
                          <p className={cn("font-sans text-lg font-bold tabular-nums", myStats.unrealizedPnl >= 0 ? "text-profit-green" : "text-loss-red")}>
                            {formatSignedCurrency(myStats.unrealizedPnl)}
                          </p>
                        </div>
                      </div>
                      <div className="border-t border-poly-cream/10 pt-3">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="font-sans text-lg font-bold tabular-nums text-poly-cream">
                              {myStats.totalTrades}
                            </p>
                            <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                              Trades
                            </p>
                          </div>
                          <div>
                            <p className="font-sans text-lg font-bold tabular-nums text-profit-green">
                              {myStats.winningTrades}
                            </p>
                            <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                              Win
                            </p>
                          </div>
                          <div>
                            <p className="font-sans text-lg font-bold tabular-nums text-loss-red">
                              {myStats.losingTrades}
                            </p>
                            <p className="font-body text-[9px] uppercase tracking-widest text-poly-cream/50">
                              Losses
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="py-4 text-center font-body text-xs text-poly-cream/40">
                      Start copying this trader to see your performance
                    </p>
                  )}
                </div>

                {/* Best Copies */}
                <div className="border border-border bg-poly-paper p-6">
                  <h3 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                    Best Copies
                  </h3>
                  {topPerformingTrades.length === 0 ? (
                    <p className="py-4 text-center font-body text-xs text-muted-foreground">
                      No closed trades yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {topPerformingTrades.map((t: any, i: number) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-sans text-sm font-bold text-poly-black line-clamp-1">
                              {t.market || t.title || t.question || "Unknown"}
                            </p>
                            <p className="font-body text-[10px] text-muted-foreground">
                              {formatRelativeTime(t.timestamp || t.created_at)}
                            </p>
                          </div>
                          <p className={cn("shrink-0 font-sans text-sm font-bold tabular-nums", t._roi >= 0 ? "text-profit-green" : "text-loss-red")}>
                            {t._roi >= 0 ? "+" : ""}
                            {t._roi.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* ── Active Categories + Size Distribution ── */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Active Categories */}
              <div className="border border-border bg-poly-paper p-6">
                <h3 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                  Active Categories
                </h3>
                {categoryDistribution.length === 0 ? (
                  <p className="py-8 text-center font-body text-sm text-muted-foreground">
                    No category data available
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <DonutChart data={categoryDistribution} size={160} strokeWidth={28} />
                    <div className="flex flex-col gap-2">
                      {categoryDistribution.map((cat) => (
                        <div key={cat.category} className="flex items-center gap-3">
                          <div className="h-3 w-3 shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black">
                            {cat.category}
                          </span>
                          <span className="font-body text-xs tabular-nums text-muted-foreground">
                            {cat.percentage.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Size Distribution */}
              <div className="border border-border bg-poly-paper p-6">
                <h3 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                  Size Distribution
                </h3>
                {sizeDistribution.length === 0 ? (
                  <p className="py-8 text-center font-body text-sm text-muted-foreground">
                    No trade size data available
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sizeDistribution.map((bucket) => (
                      <div key={bucket.label} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black">
                          {bucket.label}
                        </span>
                        <div className="relative h-5 flex-1 bg-border/30">
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${Math.max(bucket.percentage, 2)}%`,
                              backgroundColor: bucket.color,
                            }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right font-body text-xs tabular-nums text-muted-foreground">
                          {bucket.percentage.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />

      {/* Share Card Modal */}
      <ShareCardModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        walletAddress={wallet}
        variant="trader"
      />
    </div>
  )
}
