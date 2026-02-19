"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { PolycopyAvatar } from "@/components/ui/polycopy-avatar"
import {
  RefreshCw,
  Copy,
  Share2,
  ChevronDown,
  ChevronUp,
  Info,
  Clock,
  Loader2,
  Zap,
  ExternalLink,
  Check,
  X,
  Bot,
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

interface PortfolioStats {
  totalPnl: number
  realizedPnl: number
  unrealizedPnl: number
  totalVolume: number
  roi: number
  winRate: number
  totalTrades: number
  openTrades: number
  closedTrades: number
  winningPositions?: number
  losingPositions?: number
}

interface CopiedTrade {
  id: string
  order_id?: string
  copied_trade_id?: string
  trader_wallet?: string
  trader_username?: string
  trader_profile_image_url?: string
  market_id?: string
  market_title: string
  market_slug?: string
  market_avatar_url?: string
  outcome: string
  price_when_copied: number
  entry_size?: number
  amount_invested?: number
  created_at: string
  copied_at?: string
  current_price?: number | null
  market_resolved?: boolean
  market_resolved_at?: string | null
  roi?: number | null
  user_closed_at?: string | null
  user_exit_price?: number | null
  resolved_outcome?: string | null
  trade_method?: string
  side?: string | null
  pnl_usd?: number | null
  lt_strategy_id?: string | null
}

interface RealizedPnlRow {
  date: string
  realized_pnl: number
  pnl_to_date: number | null
}

interface TopTrader {
  trader_id: string
  trader_name: string
  trader_wallet: string
  copy_count: number
  total_invested: number
  pnl: number
  roi: number
  win_rate: number
}

interface CategoryDistribution {
  category: string
  count: number
  percentage: number
  color: string
}

type ProfileTab = "trades" | "performance"
type PnlWindow = "1D" | "7D" | "30D" | "1Y" | "ALL"

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

const formatSignedCurrency = (amount: number, decimals = 2) => {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(amount))
  if (amount > 0) return `+${formatted}`
  if (amount < 0) return `-${formatted}`
  return formatted
}

const formatCompactCurrency = (value: number) => {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`
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

const formatRelativeTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  const weeks = Math.floor(days / 7)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (weeks < 4) return `${weeks}w ago`
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
  if (
    t.match(
      /trump|biden|harris|election|president|congress|senate|governor|democrat|republican|political|vote|campaign|white house|administration|policy|parliament|prime minister/
    )
  )
    return "Politics"
  if (
    t.match(
      /\svs\s|\svs\.|spread:|o\/u\s|over\/under|moneyline|nfl|nba|nhl|mlb|soccer|football|basketball|baseball|hockey|tennis|golf|mma|ufc|boxing|olympics|world cup|super bowl|playoffs|championship|game|match|score|tournament|league|premier league|fifa|celtics|lakers|warriors|chiefs|bills|bengals|ravens|cowboys|eagles|packers|yankees|red sox|dodgers/
    )
  )
    return "Sports"
  if (
    t.match(
      /bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|solana|sol|dogecoin|doge|token|coin/
    )
  )
    return "Crypto"
  if (
    t.match(
      /movie|film|music|song|album|celebrity|actor|oscar|grammy|emmy|tv show|netflix|disney|streaming|youtube|tiktok/
    )
  )
    return "Culture"
  if (
    t.match(
      /stock|s&p|nasdaq|dow|market|ipo|shares|wall street|earnings|revenue|acquisition|merger|sec/
    )
  )
    return "Finance"
  if (
    t.match(
      /gdp|inflation|recession|unemployment|interest rate|fed|federal reserve|cpi|economy|economic|jobs report/
    )
  )
    return "Economics"
  if (
    t.match(
      /ai|artificial intelligence|tech|technology|apple|google|microsoft|amazon|meta|tesla|spacex|nvidia|openai|chatgpt/
    )
  )
    return "Tech"
  if (t.match(/temperature|weather|climate|hurricane|storm|tornado|flood|drought/))
    return "Weather"
  return "Other"
}

const PNL_WINDOW_OPTIONS: { key: PnlWindow; label: string; shortLabel: string; days: number | null }[] = [
  { key: "1D", label: "1 Day", shortLabel: "1D", days: 1 },
  { key: "7D", label: "7 Days", shortLabel: "7D", days: 7 },
  { key: "30D", label: "30 Days", shortLabel: "30D", days: 30 },
  { key: "1Y", label: "1 Year", shortLabel: "1Y", days: 365 },
  { key: "ALL", label: "All Time", shortLabel: "ALL", days: null },
]

/* ═══════════════════════════════════════════════════════
   Donut Chart Component
   ═══════════════════════════════════════════════════════ */

function DonutChart({
  data,
  size = 200,
  strokeWidth = 36,
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
            className="transition-all duration-300"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-body text-xs uppercase tracking-wide text-muted-foreground">
          Trades
        </span>
        <span className="font-sans text-2xl font-bold text-poly-black">{total}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════ */

export default function PortfolioPage() {
  const router = useRouter()

  /* ── Auth & profile ── */
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [polymarketUsername, setPolymarketUsername] = useState<string | null>(null)
  const [followingCount, setFollowingCount] = useState(0)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)

  /* ── Portfolio stats ── */
  const [stats, setStats] = useState<PortfolioStats | null>(null)

  /* ── Trades ── */
  const [copiedTrades, setCopiedTrades] = useState<CopiedTrade[]>([])
  const [loadingTrades, setLoadingTrades] = useState(true)

  /* ── Realized P&L ── */
  const [realizedPnlRows, setRealizedPnlRows] = useState<RealizedPnlRow[]>([])
  const [loadingRealizedPnl, setLoadingRealizedPnl] = useState(true)
  const [pnlWindow, setPnlWindow] = useState<PnlWindow>("30D")
  const [pnlView, setPnlView] = useState<"daily" | "cumulative">("daily")

  /* ── Top traders ── */
  const [topTradersStats, setTopTradersStats] = useState<TopTrader[]>([])
  const [showAllTraders, setShowAllTraders] = useState(false)

  /* ── UI ── */
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<ProfileTab>("trades")
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [tradeFilter, setTradeFilter] = useState<"all" | "open" | "closed" | "resolved" | "bot">("open")
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null)
  const [closingTradeId, setClosingTradeId] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null)

  /* ── Refs for dedup ── */
  const hasLoadedProfile = useRef(false)
  const hasLoadedTrades = useRef(false)
  const hasLoadedRealizedPnl = useRef(false)
  const hasLoadedTopTraders = useRef(false)

  /* ═══════════════════════════════════════════════════════
     Auth Check
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/login")
        return
      }

      setUser(user)
    }
    checkAuth()
  }, [router])

  /* ═══════════════════════════════════════════════════════
     Fetch Profile Data
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user || hasLoadedProfile.current) return
    hasLoadedProfile.current = true

    const fetchProfile = async () => {
      try {
        // Following count
        const { count, error: followError } = await supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
        if (!followError) setFollowingCount(count || 0)

        // Profile data
        const { data: profileData } = await supabase
          .from("profiles")
          .select("is_premium, is_admin, profile_image_url, polymarket_username")
          .eq("id", user.id)
          .single()

        if (profileData) {
          setProfileImageUrl(profileData.profile_image_url || null)
          if (profileData.polymarket_username) {
            setPolymarketUsername(profileData.polymarket_username)
          }
        }

        // Wallet data
        const { data: walletData } = await supabase
          .from("turnkey_wallets")
          .select("polymarket_account_address, eoa_address")
          .eq("user_id", user.id)
          .maybeSingle()

        setProfile({
          ...profileData,
          trading_wallet_address:
            walletData?.polymarket_account_address || walletData?.eoa_address || null,
        })

        // Fetch Polymarket username if we have a wallet but no username yet
        const walletAddress =
          walletData?.polymarket_account_address || walletData?.eoa_address
        if (walletAddress && !profileData?.polymarket_username) {
          try {
            const response = await fetch(
              `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=VOL&limit=1&offset=0&category=overall&user=${walletAddress}`
            )
            if (response.ok) {
              const data = await response.json()
              if (Array.isArray(data) && data.length > 0 && data[0].userName) {
                setPolymarketUsername(data[0].userName)
              }
            }
          } catch {
            // Ignore
          }
        }
      } catch (err) {
        console.error("Error fetching profile:", err)
      }
    }

    fetchProfile()

    return () => { hasLoadedProfile.current = false }
  }, [user])

  /* ═══════════════════════════════════════════════════════
     Fetch Portfolio Stats
     ═══════════════════════════════════════════════════════ */
  const fetchStats = useCallback(async () => {
    if (!user) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
      console.log("[v2/portfolio] Fetching portfolio stats for user:", user.id)
      const res = await fetch(`/api/portfolio/stats?userId=${user.id}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      console.log("[v2/portfolio] Stats response status:", res.status)
      if (res.ok) {
        const data = await res.json()
        console.log("[v2/portfolio] Stats received:", {
          totalPnl: data.totalPnl,
          totalVolume: data.totalVolume,
          totalTrades: data.totalTrades,
          cached: data.cached,
        })
        if (data.totalPnl !== undefined || data.totalTrades !== undefined) {
          setStats({
            totalPnl: Number(data.totalPnl ?? 0),
            realizedPnl: Number(data.realizedPnl ?? 0),
            unrealizedPnl: Number(data.unrealizedPnl ?? 0),
            totalVolume: Number(data.totalVolume ?? 0),
            roi: Number(data.roi ?? 0),
            winRate: Number(data.winRate ?? 0),
            totalTrades: Number(data.totalTrades ?? 0),
            openTrades: Number(data.openTrades ?? 0),
            closedTrades: Number(data.closedTrades ?? 0),
            winningPositions: data.winningPositions != null ? Number(data.winningPositions) : undefined,
            losingPositions: data.losingPositions != null ? Number(data.losingPositions) : undefined,
          })
        }
      } else {
        console.error("[v2/portfolio] Stats fetch failed:", res.status, await res.text())
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("[v2/portfolio] Error fetching portfolio stats:", err)
      } else {
        console.warn("[v2/portfolio] Stats fetch timed out after 30s")
      }
    } finally {
      clearTimeout(timeout)
    }
  }, [user])

  /* ═══════════════════════════════════════════════════════
     Fetch Trades (paginated)
     ═══════════════════════════════════════════════════════ */
  const fetchTrades = useCallback(async () => {
    if (!user) return
    setLoadingTrades(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const mapEnrichedTrade = (t: any): CopiedTrade => ({
      id: t.id || t.copied_trade_id || t.order_id,
      order_id: t.order_id,
      copied_trade_id: t.copied_trade_id,
      trader_wallet: t.trader_wallet,
      trader_username: t.trader_username,
      trader_profile_image_url: t.trader_profile_image_url,
      market_id: t.market_id,
      market_title: t.market_title || "Unknown Market",
      market_slug: t.market_slug,
      market_avatar_url: t.market_avatar_url,
      outcome: t.outcome || "Unknown",
      price_when_copied: Number(t.price_when_copied || 0),
      entry_size: t.entry_size != null ? Number(t.entry_size) : undefined,
      amount_invested: t.amount_invested != null ? Number(t.amount_invested) : undefined,
      created_at: t.created_at || t.copied_at,
      copied_at: t.copied_at,
      current_price: t.current_price != null ? Number(t.current_price) : null,
      market_resolved: Boolean(t.market_resolved),
      market_resolved_at: t.market_resolved_at,
      roi: t.roi != null ? Number(t.roi) : null,
      user_closed_at: t.user_closed_at,
      user_exit_price: t.user_exit_price != null ? Number(t.user_exit_price) : null,
      resolved_outcome: t.resolved_outcome,
      trade_method: t.trade_method,
      side: t.side,
      pnl_usd: t.pnl_usd != null ? Number(t.pnl_usd) : null,
      lt_strategy_id: t.lt_strategy_id ?? null,
    })

    const mapOrderTrade = (o: any): CopiedTrade => {
      // Determine resolved status from multiple signals in the orders response
      const closedActivities = new Set(["redeemed", "lost", "canceled", "expired", "failed"])
      const isResolved =
        Boolean(o.marketResolved) ||
        o.marketIsOpen === false ||
        o.positionState === "closed" ||
        closedActivities.has(o.activity)

      return {
        id: o.orderId,
        market_id: o.marketId,
        market_title: o.marketTitle || "Unknown Market",
        market_slug: o.marketSlug,
        market_avatar_url: o.marketImageUrl,
        outcome: o.outcome || "Unknown",
        price_when_copied: Number(o.priceOrAvgPrice || 0),
        entry_size: o.filledSize != null ? Number(o.filledSize) : undefined,
        amount_invested:
          o.filledSize && o.priceOrAvgPrice
            ? Number(o.filledSize) * Number(o.priceOrAvgPrice)
            : undefined,
        created_at: o.createdAt,
        current_price: o.currentPrice != null ? Number(o.currentPrice) : null,
        market_resolved: isResolved,
        roi: null,
        user_closed_at: null,
        pnl_usd: o.pnlUsd != null ? Number(o.pnlUsd) : null,
        side: o.side,
        trader_wallet: o.copiedTraderWallet || o.traderWallet,
        trader_username: o.traderName,
        trader_profile_image_url: o.traderAvatarUrl,
        lt_strategy_id: o.ltStrategyId ?? null,
      }
    }

    try {
      // Fetch first page of enriched trades AND all orders in parallel for speed
      const [firstPageResult, ordersResult] = await Promise.all([
        fetch(
          `/api/portfolio/trades?userId=${user.id}&page=1&pageSize=50`,
          { cache: "no-store", signal: controller.signal }
        ).then(async (res) => {
          if (!res.ok) return { trades: [] as any[], hasMore: false }
          const data = await res.json()
          return { trades: data.trades || [], hasMore: data.hasMore === true }
        }).catch(() => ({ trades: [] as any[], hasMore: false })),

        fetch("/api/orders", { cache: "no-store", signal: controller.signal })
          .then(async (res) => {
            if (!res.ok) return []
            const data = await res.json()
            return data.orders || []
          })
          .catch(() => []),
      ])

      // Build initial trade list from both sources immediately
      const tradeMap = new Map<string, CopiedTrade>()

      // Orders from /api/orders (by trader_id - catches ALL positions)
      for (const o of ordersResult) {
        if (!o.orderId) continue
        // Only include buy-side filled orders for the portfolio view
        const side = String(o.side ?? "").toLowerCase()
        const filled = Number(o.filledSize ?? 0)
        if (side === "sell" || filled <= 0) continue
        const trade = mapOrderTrade(o)
        tradeMap.set(trade.id, trade)
      }

      // Enriched trades overlay (has better metadata: trader names, avatars, pnl)
      for (const t of firstPageResult.trades) {
        const trade = mapEnrichedTrade(t)
        tradeMap.set(trade.id, trade) // Enriched data overwrites basic order data
      }

      // Show data immediately from the first batch
      const sortTrades = (trades: CopiedTrade[]) =>
        trades.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setCopiedTrades(sortTrades(Array.from(tradeMap.values())))
      setLoadingTrades(false) // Unblock trades section early

      // Fetch remaining pages in background to get complete enriched data
      if (firstPageResult.hasMore) {
        let page = 2
        let hasMore = true
        while (hasMore && page <= 10) {
          try {
            const res = await fetch(
              `/api/portfolio/trades?userId=${user.id}&page=${page}&pageSize=50`,
              { cache: "no-store", signal: controller.signal }
            )
            if (!res.ok) break
            const data = await res.json()
            const trades = data.trades || []
            for (const t of trades) {
              const trade = mapEnrichedTrade(t)
              tradeMap.set(trade.id, trade)
            }
            hasMore = data.hasMore === true
            page++
          } catch {
            break
          }
        }
        // Update with full dataset
        setCopiedTrades(sortTrades(Array.from(tradeMap.values())))
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        console.error("Error fetching trades:", err)
      } else {
        console.warn("[v2/portfolio] Trades fetch timed out after 30s")
      }
    } finally {
      clearTimeout(timeout)
      setLoadingTrades(false)
    }
  }, [user])

  /* ═══════════════════════════════════════════════════════
     Fetch Realized P&L
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user || hasLoadedRealizedPnl.current) return
    hasLoadedRealizedPnl.current = true

    const loadRealizedPnl = async () => {
      setLoadingRealizedPnl(true)
      try {
        const res = await fetch(`/api/portfolio/realized-pnl?userId=${user.id}`, {
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const daily = Array.isArray(data?.daily)
          ? data.daily
              .map((row: any) => ({
                date: row?.date,
                realized_pnl: Number(row?.realized_pnl ?? 0),
                pnl_to_date:
                  row?.pnl_to_date != null ? Number(row.pnl_to_date) : null,
              }))
              .filter(
                (row: RealizedPnlRow) =>
                  row.date && Number.isFinite(row.realized_pnl)
              )
              .sort(
                (a: RealizedPnlRow, b: RealizedPnlRow) =>
                  new Date(a.date).getTime() - new Date(b.date).getTime()
              )
          : []
        setRealizedPnlRows(daily)
      } catch (err) {
        console.error("Error fetching realized PnL:", err)
        setRealizedPnlRows([])
      } finally {
        setLoadingRealizedPnl(false)
      }
    }

    loadRealizedPnl()

    return () => { hasLoadedRealizedPnl.current = false }
  }, [user])

  /* ═══════════════════════════════════════════════════════
     Fetch Top Traders
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user || hasLoadedTopTraders.current) return
    hasLoadedTopTraders.current = true

    const loadTopTraders = async () => {
      try {
        const res = await fetch("/api/portfolio/top-traders", { cache: "no-store" })
        if (!res.ok) return
        const data = await res.json()
        setTopTradersStats(Array.isArray(data.traders) ? data.traders : [])
      } catch (err) {
        console.error("Error fetching top traders:", err)
      }
    }

    loadTopTraders()

    return () => { hasLoadedTopTraders.current = false }
  }, [user])

  /* ═══════════════════════════════════════════════════════
     Initial Load — Stats (independent, like v1)
     ═══════════════════════════════════════════════════════ */
  const [loadingStats, setLoadingStats] = useState(true)
  const hasLoadedStats = useRef(false)

  useEffect(() => {
    if (!user || hasLoadedStats.current) return
    hasLoadedStats.current = true

    const load = async () => {
      setLoadingStats(true)
      try {
        await fetchStats()
      } finally {
        setLoadingStats(false)
      }
    }
    load()

    return () => { hasLoadedStats.current = false }
  }, [user, fetchStats])

  /* ═══════════════════════════════════════════════════════
     Initial Load — Trades (independent, like v1)
     ═══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!user || hasLoadedTrades.current) return
    hasLoadedTrades.current = true
    fetchTrades()

    return () => { hasLoadedTrades.current = false }
  }, [user, fetchTrades])

  /* ═══════════════════════════════════════════════════════
     Refresh Handler
     ═══════════════════════════════════════════════════════ */
  const handleRefresh = async () => {
    setRefreshing(true)
    // Fire both independently - neither blocks the other
    const statsPromise = fetchStats()
    const tradesPromise = fetchTrades()
    await Promise.allSettled([statsPromise, tradesPromise])
    setRefreshing(false)
  }

  /* ═══════════════════════════════════════════════════════
     Copy Wallet Address
     ═══════════════════════════════════════════════════════ */
  const handleCopyAddress = useCallback(() => {
    if (!profile?.trading_wallet_address) return
    navigator.clipboard.writeText(profile.trading_wallet_address)
    setCopiedAddress(true)
    setTimeout(() => setCopiedAddress(false), 2000)
  }, [profile?.trading_wallet_address])

  /* ═══════════════════════════════════════════════════════
     Trade Filters
     ═══════════════════════════════════════════════════════ */
  const filteredTrades = useMemo(() => {
    return copiedTrades.filter((trade) => {
      if (tradeFilter === "all") return true
      if (tradeFilter === "open") return !trade.user_closed_at && !trade.market_resolved
      if (tradeFilter === "closed") return Boolean(trade.user_closed_at)
      if (tradeFilter === "resolved") return trade.market_resolved
      if (tradeFilter === "bot") return Boolean(trade.lt_strategy_id)
      return true
    })
  }, [copiedTrades, tradeFilter])

  /* ═══════════════════════════════════════════════════════
     Sell / Mark as Sold Handlers
     ═══════════════════════════════════════════════════════ */
  const handleSellOnPolymarket = useCallback(
    (trade: CopiedTrade) => {
      const slug = trade.market_slug
      if (slug) {
        window.open(`https://polymarket.com/market/${slug}`, "_blank")
      }
    },
    []
  )

  const handleMarkAsSold = useCallback(
    async (trade: CopiedTrade) => {
      if (closingTradeId) return
      setClosingTradeId(trade.id)
      try {
        const exitPrice = trade.current_price ?? trade.price_when_copied
        const { error } = await supabase
          .from("copied_trades")
          .update({
            user_closed_at: new Date().toISOString(),
            user_exit_price: exitPrice,
          })
          .eq("id", trade.id)

        if (error) throw error

        setCloseSuccess("Position marked as sold")
        setTimeout(() => setCloseSuccess(null), 3000)
        await fetchTrades()
      } catch (err: unknown) {
        console.error("Failed to mark as sold:", err)
      } finally {
        setClosingTradeId(null)
      }
    },
    [closingTradeId, fetchTrades]
  )

  const handleUnmarkAsSold = useCallback(
    async (trade: CopiedTrade) => {
      if (closingTradeId) return
      setClosingTradeId(trade.id)
      try {
        const { error } = await supabase
          .from("copied_trades")
          .update({
            user_closed_at: null,
            user_exit_price: null,
          })
          .eq("id", trade.id)

        if (error) throw error

        setCloseSuccess("Position reopened")
        setTimeout(() => setCloseSuccess(null), 3000)
        await fetchTrades()
      } catch (err: unknown) {
        console.error("Failed to unmark as sold:", err)
      } finally {
        setClosingTradeId(null)
      }
    },
    [closingTradeId, fetchTrades]
  )

  /* ═══════════════════════════════════════════════════════
     Derived Data
     ═══════════════════════════════════════════════════════ */

  // Client-side fallback stats from copiedTrades (matches v1 logic)
  const fallbackStats = useMemo((): PortfolioStats => {
    if (copiedTrades.length === 0) {
      return { totalPnl: 0, realizedPnl: 0, unrealizedPnl: 0, totalVolume: 0, roi: 0, winRate: 0, totalTrades: 0, openTrades: 0, closedTrades: 0 }
    }

    const invested = (trade: CopiedTrade) => {
      if (trade.amount_invested != null) return trade.amount_invested
      if (trade.entry_size && trade.price_when_copied) return trade.entry_size * trade.price_when_copied
      return 0
    }

    const pnlValue = (trade: CopiedTrade) => {
      if (trade.pnl_usd != null) return trade.pnl_usd
      const entryPrice = trade.price_when_copied || null
      const exitPrice = trade.user_exit_price ?? trade.current_price ?? null
      const size = trade.entry_size ?? null
      if (entryPrice !== null && exitPrice !== null && size !== null) return (exitPrice - entryPrice) * size
      if (trade.roi != null) return invested(trade) * (trade.roi / 100)
      return 0
    }

    const openTrades = copiedTrades.filter(t => !t.user_closed_at && !t.market_resolved)
    const closedTrades = copiedTrades.filter(t => t.user_closed_at || t.market_resolved)
    const realizedPnl = closedTrades.reduce((sum, t) => sum + pnlValue(t), 0)
    const unrealizedPnl = openTrades.reduce((sum, t) => sum + pnlValue(t), 0)
    const totalPnl = realizedPnl + unrealizedPnl
    const totalVolume = copiedTrades.reduce((sum, t) => sum + invested(t), 0)
    const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0
    const winningTrades = closedTrades.filter(t => pnlValue(t) > 0).length
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0

    return {
      totalPnl, realizedPnl, unrealizedPnl, totalVolume, roi,
      winRate: Math.round(winRate),
      totalTrades: copiedTrades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
    }
  }, [copiedTrades])

  // Use API stats when available, fall back to client-side calculation from trades
  const userStats: PortfolioStats = stats ?? fallbackStats

  // Filter P&L rows by window
  const sortedPnlRows = useMemo(
    () =>
      [...realizedPnlRows].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    [realizedPnlRows]
  )

  const realizedWindowRows = useMemo(() => {
    if (sortedPnlRows.length === 0) return []
    const option = PNL_WINDOW_OPTIONS.find((o) => o.key === pnlWindow) || PNL_WINDOW_OPTIONS[2]

    if (option.key === "ALL" || option.days === null) return sortedPnlRows

    let anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 1].date)
    const todayStr = new Date().toISOString().slice(0, 10)
    if (
      sortedPnlRows[sortedPnlRows.length - 1].date === todayStr &&
      sortedPnlRows.length > 1
    ) {
      anchorDate = toDateObj(sortedPnlRows[sortedPnlRows.length - 2].date)
    }

    const start = new Date(
      Date.UTC(
        anchorDate.getUTCFullYear(),
        anchorDate.getUTCMonth(),
        anchorDate.getUTCDate()
      )
    )
    start.setUTCDate(start.getUTCDate() - (option.days - 1))

    return sortedPnlRows.filter((row) => {
      const day = toDateObj(row.date)
      return day >= start
    })
  }, [sortedPnlRows, pnlWindow])

  // Build chart series
  const realizedChartSeries = useMemo(() => {
    let running = 0
    return realizedWindowRows.map((row) => {
      running += row.realized_pnl
      return {
        date: row.date,
        dailyPnl: row.realized_pnl,
        cumulativePnl: running,
      }
    })
  }, [realizedWindowRows])

  // Summary stats for P&L section
  const pnlSummary = useMemo(() => {
    const windowTotal = realizedWindowRows.reduce((s, r) => s + r.realized_pnl, 0)
    const allTimeTotal = sortedPnlRows.reduce((s, r) => s + r.realized_pnl, 0)
    return {
      allTime: allTimeTotal,
      windowTotal,
      openTrades: userStats.openTrades,
      profitable: userStats.winningPositions ?? Math.round(userStats.closedTrades * (userStats.winRate / 100)),
      losing: userStats.losingPositions ?? (userStats.closedTrades - Math.round(userStats.closedTrades * (userStats.winRate / 100))),
    }
  }, [realizedWindowRows, sortedPnlRows, userStats])

  // Category distribution from trades
  const categoryDistribution = useMemo(() => {
    if (copiedTrades.length === 0) return []
    const categoryMap: Record<string, number> = {}
    copiedTrades.forEach((trade) => {
      const category = categorizeMarketTitle(trade.market_title)
      categoryMap[category] = (categoryMap[category] || 0) + 1
    })
    const total = copiedTrades.length
    return Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: (count / total) * 100,
        color: categoryColors[category] || "#94A3B8",
      }))
      .sort((a, b) => b.count - a.count)
  }, [copiedTrades])

  // Top performing trades (closed/resolved, sorted by ROI)
  const topPerformingTrades = useMemo(() => {
    return copiedTrades
      .filter((t) => t.user_closed_at || t.market_resolved)
      .sort((a, b) => (b.roi || 0) - (a.roi || 0))
      .slice(0, 5)
  }, [copiedTrades])

  // Determine trade status for display
  const getTradeStatus = (trade: CopiedTrade) => {
    if (trade.market_resolved) return "Resolved"
    if (trade.user_closed_at) return "Sold"
    return "Open"
  }

  const getTradeStatusClass = (status: string) => {
    switch (status) {
      case "Open":
        return "bg-profit-green/10 text-profit-green border-profit-green/20"
      case "Resolved":
        return "bg-loss-red/10 text-loss-red border-loss-red/20"
      case "Sold":
        return "bg-neutral-grey/10 text-neutral-grey border-neutral-grey/20"
      default:
        return "bg-neutral-grey/10 text-neutral-grey border-neutral-grey/20"
    }
  }

  /* ═══════════════════════════════════════════════════════
     Render: Loading
     ═══════════════════════════════════════════════════════ */

  if (!user) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="mx-auto max-w-6xl px-4 py-6">
          {/* Skeleton header */}
          <div className="mb-8 flex items-center gap-6">
            <div className="h-16 w-16 animate-pulse bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-48 animate-pulse bg-gray-200" />
              <div className="h-4 w-64 animate-pulse bg-gray-200" />
            </div>
          </div>
          {/* Skeleton stats */}
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse bg-gray-200" />
            ))}
          </div>
          {/* Skeleton content */}
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse bg-gray-200" />
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

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
          <div className="relative">
            <PolycopyAvatar
              src={profileImageUrl || undefined}
              alt={polymarketUsername || user?.email || "User"}
              className="h-16 w-16 border-2 border-poly-yellow"
            />
            {profile?.trading_wallet_address && (
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center bg-poly-black">
                <Zap className="h-3.5 w-3.5 text-poly-yellow" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <h1 className="font-sans text-2xl font-bold uppercase tracking-wide text-poly-black md:text-3xl">
              {polymarketUsername || user?.email?.split("@")[0] || "You"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {profile?.trading_wallet_address && (
                <span className="font-body">
                  {truncateAddress(profile.trading_wallet_address)}
                </span>
              )}
              <Link
                href="/v2/following"
                className="font-body underline-offset-2 hover:underline"
              >
                {followingCount} Traders Following
              </Link>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {profile?.trading_wallet_address && (
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2 border border-poly-black px-6 py-3 font-sans text-sm font-bold uppercase tracking-wide text-poly-black transition-colors hover:bg-poly-black hover:text-poly-cream"
              >
                <Copy className="h-4 w-4" />
                {copiedAddress ? "Copied!" : "Copy Wallet"}
              </button>
            )}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 bg-poly-black px-6 py-3 font-sans text-sm font-bold uppercase tracking-wide text-poly-cream transition-colors hover:bg-poly-black/90"
            >
              <Share2 className="h-4 w-4" />
              Share Profile
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            Stats Row
            ───────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {loadingStats && !stats && copiedTrades.length === 0 ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex h-28 items-center justify-center border border-border bg-poly-paper">
                  <div className="h-8 w-24 animate-pulse bg-gray-200" />
                </div>
              ))}
            </>
          ) : (
            <>
              {/* Total PnL */}
              <div className="border border-border bg-poly-paper p-4 text-center">
                <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Total_PnL
                </p>
                <p
                  className={cn(
                    "font-sans text-2xl font-bold tabular-nums md:text-3xl",
                    userStats.totalPnl >= 0 ? "text-profit-green" : "text-loss-red"
                  )}
                >
                  {formatSignedCurrency(userStats.totalPnl)}
                </p>
                <p className="mt-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Net Performance
                </p>
              </div>

              {/* ROI */}
              <div className="border border-border bg-poly-paper p-4 text-center">
                <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  ROI_Percent
                </p>
                <p
                  className={cn(
                    "font-sans text-2xl font-bold tabular-nums md:text-3xl",
                    userStats.roi >= 0 ? "text-profit-green" : "text-loss-red"
                  )}
                >
                  {formatPercent(userStats.roi, true)}
                </p>
                <p className="mt-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Total Return
                </p>
              </div>

              {/* Volume */}
              <div className="border border-border bg-poly-paper p-4 text-center">
                <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Traded_Vol
                </p>
                <p className="font-sans text-2xl font-bold tabular-nums text-poly-black md:text-3xl">
                  {Math.abs(userStats.totalVolume) >= 1000
                    ? `$${(userStats.totalVolume / 1000).toFixed(2)}K`
                    : `$${userStats.totalVolume.toFixed(2)}`}
                </p>
                <p className="mt-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Total Exposure
                </p>
              </div>

              {/* Win Rate */}
              <div className="border border-border bg-poly-paper p-4 text-center">
                <p className="mb-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Win_Rate
                </p>
                <p className="font-sans text-2xl font-bold tabular-nums text-poly-black md:text-3xl">
                  {userStats.winRate.toFixed(1)}%
                </p>
                <p className="mt-2 font-body text-xs uppercase tracking-widest text-muted-foreground">
                  Trade Success
                </p>
              </div>
            </>
          )}
        </div>

        {/* ─────────────────────────────────────────────
            Tab Switcher
            ───────────────────────────────────────────── */}
        <div className="mb-8 flex items-center gap-2">
          {(["trades", "performance"] as ProfileTab[]).map((tab) => {
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

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="ml-auto flex h-9 items-center gap-1.5 px-3 text-muted-foreground transition-all hover:text-poly-black"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span className="font-sans text-xs font-bold uppercase tracking-widest">Refresh</span>
          </button>
        </div>

        {/* ═════════════════════════════════════════════
            TRADES TAB
            ═════════════════════════════════════════════ */}
        {activeTab === "trades" && (
          <div className="space-y-3">
            {/* ── Filter buttons ── */}
            <div className="flex flex-wrap items-center gap-2">
              {(["open", "all", "closed", "resolved", "bot"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setTradeFilter(filter)}
                  className={cn(
                    "px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-all",
                    tradeFilter === filter
                      ? "bg-poly-black text-poly-cream"
                      : "border border-border text-muted-foreground hover:text-poly-black hover:border-poly-black"
                  )}
                >
                  {filter}
                </button>
              ))}
              <span className="ml-auto font-body text-xs tabular-nums text-muted-foreground">
                {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* ── Success toast ── */}
            {closeSuccess && (
              <div className="flex items-center gap-2 border border-profit-green/30 bg-profit-green/10 px-4 py-2">
                <Check className="h-4 w-4 text-profit-green" />
                <span className="font-sans text-xs font-bold text-profit-green">{closeSuccess}</span>
              </div>
            )}

            {loadingTrades ? (
              <div className="border border-border bg-poly-paper p-12 text-center">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
                <p className="font-body text-sm text-muted-foreground">
                  Loading trades…
                </p>
              </div>
            ) : filteredTrades.length === 0 ? (
              <div className="border border-border bg-poly-paper p-16 text-center">
                <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-wide text-muted-foreground">
                  {copiedTrades.length === 0 ? "No Trades Yet" : "No Trades Match Filter"}
                </h3>
                <p className="font-body text-sm text-muted-foreground">
                  {copiedTrades.length === 0
                    ? "Start copying traders to see your trade history here"
                    : `No ${tradeFilter} trades found. Try a different filter.`}
                </p>
              </div>
            ) : (
              <>
                {/* Trade Cards */}
                {filteredTrades.map((trade) => {
                  const status = getTradeStatus(trade)
                  const isOpen = !trade.user_closed_at && !trade.market_resolved
                  const isSold = Boolean(trade.user_closed_at)
                  const entryPrice = trade.price_when_copied
                  const currentPrice = trade.current_price ?? entryPrice
                  const invested = trade.amount_invested || (trade.entry_size && entryPrice ? trade.entry_size * entryPrice : null)
                  const isExpanded = expandedTradeId === trade.id
                  const isClosing = closingTradeId === trade.id
                  const hasWallet = Boolean(profile?.trading_wallet_address)

                  // Always compute both ROI and PnL so every card shows them
                  const computedPnl =
                    trade.pnl_usd ??
                    (trade.entry_size != null && entryPrice > 0 && currentPrice != null
                      ? (currentPrice - entryPrice) * trade.entry_size
                      : null)
                  const computedRoi =
                    trade.roi ??
                    (entryPrice > 0 && currentPrice != null
                      ? ((currentPrice - entryPrice) / entryPrice) * 100
                      : null)

                  return (
                    <div
                      key={trade.id}
                      className="border border-border bg-poly-paper transition-colors hover:bg-poly-paper/80"
                    >
                      <div className="flex items-start gap-3 p-4">
                        {/* Market avatar */}
                        <div className="h-10 w-10 shrink-0 overflow-hidden bg-accent">
                          {trade.market_avatar_url ? (
                            <img
                              src={trade.market_avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-sans text-xs font-bold text-muted-foreground">
                              {trade.market_title.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        {/* Trade info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {trade.market_slug ? (
                                <a
                                  href={`https://polymarket.com/market/${trade.market_slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-sans text-sm font-bold text-poly-black hover:underline line-clamp-2"
                                >
                                  {trade.market_title}
                                  <ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" />
                                </a>
                              ) : (
                                <p className="font-sans text-sm font-bold text-poly-black line-clamp-2">
                                  {trade.market_title}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {/* Status badge */}
                                <span
                                  className={cn(
                                    "inline-flex items-center border px-1.5 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wide",
                                    getTradeStatusClass(status)
                                  )}
                                >
                                  {status}
                                </span>
                                {/* Outcome badge */}
                                <span className="inline-flex items-center border border-border bg-accent px-2 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wide text-foreground">
                                  {trade.outcome}
                                </span>
                                {/* Trader name */}
                                {trade.trader_username && (
                                  <span className="font-body text-xs text-muted-foreground">
                                    via{" "}
                                    {trade.trader_wallet ? (
                                      <Link
                                        href={`/v2/trader/${trade.trader_wallet}`}
                                        className="font-medium hover:text-poly-black"
                                      >
                                        {trade.trader_username}
                                      </Link>
                                    ) : (
                                      trade.trader_username
                                    )}
                                  </span>
                                )}
                                {/* Bot badge */}
                                {trade.lt_strategy_id && (
                                  <span className="inline-flex items-center gap-1 bg-poly-black px-1.5 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wide text-poly-yellow">
                                    <Bot className="h-2.5 w-2.5" />
                                    BOT
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* ROI / P&L on right */}
                            <div className="shrink-0 text-right">
                              {computedRoi != null && (
                                <p
                                  className={cn(
                                    "font-sans text-sm font-bold tabular-nums",
                                    computedRoi >= 0 ? "text-profit-green" : "text-loss-red"
                                  )}
                                >
                                  {computedRoi >= 0 ? "+" : ""}
                                  {computedRoi.toFixed(1)}%
                                </p>
                              )}
                              {computedPnl != null && (
                                <p
                                  className={cn(
                                    "font-body text-xs tabular-nums",
                                    computedPnl >= 0
                                      ? "text-profit-green"
                                      : "text-loss-red"
                                  )}
                                >
                                  {formatSignedCurrency(computedPnl)}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Price & detail row + Sell button */}
                          <div className="mt-2 flex items-center gap-4 font-body text-xs text-muted-foreground">
                            <span className="tabular-nums whitespace-nowrap">
                              ${entryPrice.toFixed(2)}{" "}
                              <span className="text-muted-foreground/60">→</span>{" "}
                              ${(currentPrice ?? 0).toFixed(2)}
                            </span>
                            {invested != null && (
                              <span className="tabular-nums">
                                ${invested.toFixed(2)} invested
                              </span>
                            )}
                            <span>{formatRelativeTime(trade.created_at)}</span>
                            {isOpen && hasWallet && trade.market_slug && (
                              <button
                                type="button"
                                onClick={() => handleSellOnPolymarket(trade)}
                                className="ml-auto inline-flex items-center gap-1 bg-loss-red px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-loss-red/90"
                              >
                                Sell
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Action buttons row ── */}
                      <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5">
                        {isSold && (
                          <button
                            type="button"
                            onClick={() => handleUnmarkAsSold(trade)}
                            disabled={isClosing}
                            className={cn(
                              "inline-flex items-center gap-1.5 border border-border px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black hover:border-poly-black",
                              isClosing && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {isClosing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                            Reopen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                          className="ml-auto inline-flex items-center gap-1 py-2 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
                        >
                          Details
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      {/* ── Expanded details drawer ── */}
                      {isExpanded && (
                        <div className="border-t border-border/50 bg-accent/30 px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Entry Price
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
                                ${entryPrice.toFixed(4)}
                              </p>
                            </div>
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Current Price
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
                                ${(currentPrice ?? 0).toFixed(4)}
                              </p>
                            </div>
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Invested
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
                                {invested != null ? `$${invested.toFixed(2)}` : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Shares
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
                                {invested != null && entryPrice > 0
                                  ? Math.round(invested / entryPrice)
                                  : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Side
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold text-foreground">
                                {trade.side || "Buy"}
                              </p>
                            </div>
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Method
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold text-foreground">
                                {trade.trade_method === "quick" ? "Quick Trade" : "Manual"}
                              </p>
                            </div>
                            <div>
                              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                Copied At
                              </p>
                              <p className="mt-0.5 font-body text-sm font-semibold text-foreground">
                                {new Date(trade.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            {trade.user_closed_at && (
                              <div>
                                <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                  Closed At
                                </p>
                                <p className="mt-0.5 font-body text-sm font-semibold text-foreground">
                                  {new Date(trade.user_closed_at).toLocaleDateString()}
                                </p>
                              </div>
                            )}
                            {trade.user_exit_price != null && (
                              <div>
                                <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                  Exit Price
                                </p>
                                <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
                                  ${trade.user_exit_price.toFixed(4)}
                                </p>
                              </div>
                            )}
                            {trade.resolved_outcome && (
                              <div>
                                <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                                  Resolution
                                </p>
                                <p className="mt-0.5 font-body text-sm font-semibold text-foreground">
                                  {trade.resolved_outcome}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Actions row: View on Polymarket + Mark as Sold */}
                          <div className="mt-3 flex items-center gap-4 pt-3 border-t border-border/50">
                            {trade.market_slug && (
                              <a
                                href={`https://polymarket.com/market/${trade.market_slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
                              >
                                View on Polymarket
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {isOpen && (
                              <button
                                type="button"
                                onClick={() => handleMarkAsSold(trade)}
                                disabled={isClosing}
                                className={cn(
                                  "inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black",
                                  isClosing && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {isClosing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Mark as Sold
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════
            PERFORMANCE TAB
            ═════════════════════════════════════════════ */}
        {activeTab === "performance" && (
          <div className="space-y-8">
            {/* ── Realized P&L Section ── */}
            <div className="border border-border bg-poly-paper p-6">
              {/* Header */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-sans text-xl font-bold uppercase tracking-wide text-poly-black">
                      Realized P&L
                    </h2>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-1 font-body text-xs uppercase tracking-wide text-muted-foreground">
                    Aggregate profit and loss over time
                  </p>
                </div>

                {/* Window toggles */}
                <div className="flex items-center gap-1">
                  {PNL_WINDOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setPnlWindow(opt.key)}
                      className={cn(
                        "px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-all",
                        pnlWindow === opt.key
                          ? "bg-poly-black text-poly-cream"
                          : "text-muted-foreground hover:text-poly-black"
                      )}
                    >
                      {opt.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary stats */}
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <p
                    className={cn(
                      "font-sans text-xl font-bold tabular-nums",
                      pnlSummary.allTime >= 0
                        ? "text-profit-green"
                        : "text-loss-red"
                    )}
                  >
                    {formatSignedCurrency(pnlSummary.allTime)}
                  </p>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                    All Time
                  </p>
                </div>
                <div>
                  <p
                    className={cn(
                      "font-sans text-xl font-bold tabular-nums",
                      pnlSummary.windowTotal >= 0
                        ? "text-profit-green"
                        : "text-loss-red"
                    )}
                  >
                    {formatSignedCurrency(pnlSummary.windowTotal)}
                  </p>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                    {pnlWindow} PnL
                  </p>
                </div>
                <div>
                  <p className="font-sans text-xl font-bold tabular-nums text-poly-black">
                    {String(pnlSummary.openTrades).padStart(2, "0")}
                  </p>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Open Trades
                  </p>
                </div>
                <div>
                  <p className="font-sans text-xl font-bold tabular-nums text-profit-green">
                    {String(pnlSummary.profitable).padStart(2, "0")}
                  </p>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Profitable
                  </p>
                </div>
                <div>
                  <p className="font-sans text-xl font-bold tabular-nums text-loss-red">
                    {String(pnlSummary.losing).padStart(2, "0")}
                  </p>
                  <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                    Losing
                  </p>
                </div>
              </div>

              {/* Daily / Cumulative toggle */}
              <div className="mb-4 flex items-center gap-1">
                {(["daily", "cumulative"] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setPnlView(view)}
                    className={cn(
                      "px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-all",
                      pnlView === view
                        ? "bg-poly-black text-poly-cream"
                        : "border border-poly-black text-poly-black hover:bg-poly-black/5"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>

              {/* Chart */}
              {loadingRealizedPnl && realizedChartSeries.length === 0 ? (
                <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading realized P&L...
                </div>
              ) : realizedChartSeries.length > 0 ? (
                <div className="h-72 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    {pnlView === "daily" ? (
                      <BarChart
                        data={realizedChartSeries}
                        barSize={Math.max(4, Math.min(24, 600 / realizedChartSeries.length))}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                        />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                          tickFormatter={(value) =>
                            new Date(`${value}T00:00:00Z`).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", timeZone: "UTC" }
                            )
                          }
                          tickMargin={10}
                          minTickGap={32}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={60}
                          tickMargin={10}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                          tickCount={6}
                          domain={[
                            (min: number) => Math.min(min, 0),
                            (max: number) => Math.max(max, 0),
                          ]}
                          tickFormatter={(value) => formatCompactCurrency(value)}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 0,
                            borderColor: "var(--color-border)",
                            background: "var(--color-poly-paper)",
                            fontSize: 12,
                          }}
                          formatter={(value: any) =>
                            formatSignedCurrency(Number(value), 2)
                          }
                          labelFormatter={(label) =>
                            new Date(`${label}T00:00:00Z`).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }
                            )
                          }
                        />
                        <ReferenceLine y={0} stroke="var(--color-border)" />
                        <Bar
                          dataKey="dailyPnl"
                          name="Daily PnL"
                          minPointSize={2}
                          radius={[0, 0, 0, 0]}
                          isAnimationActive
                          animationDuration={600}
                        >
                          {realizedChartSeries.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={
                                entry.dailyPnl >= 0
                                  ? "var(--color-profit-green)"
                                  : "var(--color-loss-red)"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <AreaChart data={realizedChartSeries}>
                        <defs>
                          <linearGradient id="pnlCumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-poly-black)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="var(--color-poly-black)" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                        />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          interval="preserveStartEnd"
                          tickFormatter={(value) =>
                            new Date(`${value}T00:00:00Z`).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", timeZone: "UTC" }
                            )
                          }
                          tickMargin={10}
                          minTickGap={32}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={60}
                          tickMargin={10}
                          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                          tickFormatter={(value) => formatCompactCurrency(value)}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 0,
                            borderColor: "var(--color-border)",
                            background: "var(--color-poly-paper)",
                            fontSize: 12,
                          }}
                          formatter={(value: any) =>
                            formatSignedCurrency(Number(value), 2)
                          }
                          labelFormatter={(label) =>
                            new Date(`${label}T00:00:00Z`).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }
                            )
                          }
                        />
                        <ReferenceLine y={0} stroke="var(--color-border)" />
                        <Area
                          type="monotone"
                          dataKey="cumulativePnl"
                          name="Cumulative PnL"
                          stroke="var(--color-poly-black)"
                          strokeWidth={2}
                          fill="url(#pnlCumulativeGrad)"
                          isAnimationActive
                          animationDuration={600}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground sm:h-80">
                  <p>No realized P&L data available yet</p>
                </div>
              )}
            </div>

            {/* ── Two‑column: Top Traders Copied + Trading Categories ── */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* Top Traders Copied */}
              <div className="border border-border bg-poly-paper p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                    Top Traders Copied
                  </h3>
                  {topTradersStats.length > 5 && (
                    <button
                      onClick={() => setShowAllTraders(!showAllTraders)}
                      className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
                    >
                      {showAllTraders
                        ? "Show Top 5"
                        : `Show All (${topTradersStats.length})`}
                    </button>
                  )}
                </div>

                {topTradersStats.length === 0 ? (
                  <p className="py-8 text-center font-body text-sm text-muted-foreground">
                    No trader data available yet
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="py-2 pr-2 text-left font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Trader
                          </th>
                          <th className="px-2 py-2 text-right font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Copied
                          </th>
                          <th className="px-2 py-2 text-right font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            PnL
                          </th>
                          <th className="px-2 py-2 text-right font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            ROI
                          </th>
                          <th className="pl-2 py-2 text-right font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Win
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllTraders
                          ? topTradersStats
                          : topTradersStats.slice(0, 5)
                        ).map((trader) => (
                          <tr
                            key={trader.trader_wallet}
                            className="border-b border-border/50 transition-colors hover:bg-accent/50"
                          >
                            <td className="py-2.5 pr-2">
                              <Link
                                href={`/v2/trader/${trader.trader_wallet}`}
                                className="font-body text-sm font-medium text-poly-black hover:underline"
                              >
                                {trader.trader_name}
                              </Link>
                            </td>
                            <td className="px-2 py-2.5 text-right font-body text-sm tabular-nums text-poly-black">
                              {trader.copy_count}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-2.5 text-right font-body text-sm font-semibold tabular-nums",
                                trader.pnl >= 0
                                  ? "text-profit-green"
                                  : "text-loss-red"
                              )}
                            >
                              {formatSignedCurrency(trader.pnl)}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-2.5 text-right font-body text-sm tabular-nums",
                                trader.roi >= 0
                                  ? "text-profit-green"
                                  : "text-loss-red"
                              )}
                            >
                              {formatPercent(trader.roi, true)}
                            </td>
                            <td className="py-2.5 pl-2 text-right font-body text-sm tabular-nums text-poly-black">
                              {trader.win_rate.toFixed(0)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Trading Categories */}
              <div className="border border-border bg-poly-paper p-6">
                <h3 className="mb-4 font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                  Trading Categories
                </h3>

                {categoryDistribution.length === 0 ? (
                  <p className="py-8 text-center font-body text-sm text-muted-foreground">
                    No category data available yet
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <DonutChart data={categoryDistribution} size={180} strokeWidth={32} />

                    <div className="flex flex-col gap-2">
                      {categoryDistribution.map((cat) => (
                        <div
                          key={cat.category}
                          className="flex items-center gap-3"
                        >
                          <div
                            className="h-3 w-3 shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
                            {cat.category}
                          </span>
                          <span className="font-body text-xs tabular-nums text-muted-foreground">
                            {cat.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Top Performing Trades ── */}
            <div className="border border-border bg-poly-paper p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-sans text-base font-bold uppercase tracking-wide text-poly-black">
                  Top Performing Trades
                </h3>
              </div>

              {topPerformingTrades.length === 0 ? (
                <p className="py-8 text-center font-body text-sm text-muted-foreground">
                  No closed trades yet. Close positions to see top performers!
                </p>
              ) : (
                <div className="space-y-3">
                  {topPerformingTrades.map((trade) => (
                    <div
                      key={trade.id}
                      className="flex items-center justify-between gap-4 border border-border bg-poly-cream p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm font-bold text-poly-black line-clamp-2">
                          {trade.market_title}
                        </p>
                        <p className="mt-1 font-body text-xs text-muted-foreground">
                          {formatRelativeTime(trade.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={cn(
                            "inline-flex items-center border px-2 py-0.5 font-sans text-[11px] font-bold uppercase",
                            trade.outcome?.toUpperCase() === "YES"
                              ? "border-profit-green/20 bg-profit-green/10 text-profit-green"
                              : "border-loss-red/20 bg-loss-red/10 text-loss-red"
                          )}
                        >
                          {trade.outcome}
                        </span>
                        <p
                          className={cn(
                            "font-sans text-base font-bold tabular-nums",
                            (trade.roi || 0) >= 0
                              ? "text-profit-green"
                              : "text-loss-red"
                          )}
                        >
                          {(trade.roi || 0) >= 0 ? "+" : ""}
                          {(trade.roi || 0).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />

      {/* Share Card Modal */}
      {profile?.trading_wallet_address && (
        <ShareCardModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          walletAddress={profile.trading_wallet_address}
          variant="user"
        />
      )}
    </div>
  )
}
