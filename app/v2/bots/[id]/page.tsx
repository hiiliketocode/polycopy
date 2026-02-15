"use client"

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronLeft,
  Zap,
  Share2,
  Clock,
  Shield,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface FTOrder {
  order_id?: string
  wallet_id?: string
  market_title?: string
  condition_id?: string
  token_label?: string
  entry_price?: number
  size?: number
  pnl?: number
  outcome?: string
  trader_address?: string
  trader_name?: string | null
  order_time?: { value: string } | string
  resolved_time?: { value: string } | string
  current_price?: number | null
  unrealized_pnl?: number | null
  resolves_label?: string
  market_end_time?: string
}

interface DailyPnl {
  date: string
  trades: number
  won: number
  lost: number
  daily_pnl: number
  cumulative_pnl: number
}

interface CategoryPerf {
  category: string
  trades: number
  won: number
  lost: number
  win_rate: number | null
  total_pnl: number
}

interface WalletStats {
  total_trades: number
  open_positions: number
  won: number
  lost: number
  win_rate: number | null
  realized_pnl: number
  unrealized_pnl: number
  total_pnl: number
  open_exposure: number
  avg_entry_price: number | null
  avg_win: number | null
  avg_loss: number | null
  max_drawdown_pct: number
  sharpe_ratio: number | null
}

interface WalletData {
  wallet_id: string
  display_name: string
  description: string
  is_active: boolean
  starting_balance: number
  current_balance: number
  cash_available: number
  test_status: string
  market_categories?: string[] | null
  model_threshold?: number
  price_min?: number
  price_max?: number
  min_edge?: number
  allocation_method?: string
  start_date?: { value: string }
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function formatCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v)
}

function formatPnl(v: number): string {
  const f = formatCurrency(Math.abs(v))
  return v >= 0 ? `+${f}` : `-${f}`
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatDate(d: string | { value: string } | null | undefined): string {
  if (!d) return "-"
  const raw = typeof d === "string" ? d : d.value
  return new Date(raw).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatShortDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
}

function deriveRiskProfile(wallet: WalletData): { label: string; color: string } {
  const name = (wallet.display_name || "").toLowerCase()
  if (name.includes("conservative") || name.includes("steady") || name.includes("safe") || name.includes("favorite") || name.includes("heavy fav") || name.includes("arbitrage"))
    return { label: "LOW_VOLATILITY", color: "text-profit-green" }
  if (name.includes("aggressive") || name.includes("full send") || name.includes("storm") || name.includes("contrarian") || name.includes("underdog"))
    return { label: "HIGH_VOLATILITY", color: "text-loss-red" }
  return { label: "MODERATE_VOLATILITY", color: "text-poly-yellow" }
}

function timeRunning(startDate: string | { value: string } | null | undefined): string {
  if (!startDate) return "-"
  const raw = typeof startDate === "string" ? startDate : startDate.value
  const ms = Date.now() - new Date(raw).getTime()
  if (ms < 0) return "-"
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h`
  return "<1h"
}

/* ═══════════════════════════════════════════════════════
   Simple SVG Chart Component
   ═══════════════════════════════════════════════════════ */

function PerformanceChart({
  data,
  color,
}: {
  data: Array<{ date: string; value: number }>
  color: string
}) {
  if (!data.length) return null
  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 600
  const h = 200
  const pad = 8

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: pad + (h - 2 * pad) - ((d.value - min) / range) * (h - 2 * pad),
  }))

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`

  const labelStep = Math.max(1, Math.floor(data.length / 6))
  const labels = data.filter((_, i) => i % labelStep === 0 || i === data.length - 1)

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: "200px" }}>
        <defs>
          <linearGradient id="perf-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#perf-grad)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {labels.map((l, i) => (
          <span key={i} className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            {l.date}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════ */

type Tab = "analysis" | "trades" | "signal_log"

export default function BotDetailPage() {
  const params = useParams()
  const router = useRouter()
  const botId = params.id as string
  const [activeTab, setActiveTab] = useState<Tab>("analysis")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data from API
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [stats, setStats] = useState<WalletStats | null>(null)
  const [openPositions, setOpenPositions] = useState<FTOrder[]>([])
  const [recentTrades, setRecentTrades] = useState<FTOrder[]>([])
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([])
  const [categories, setCategories] = useState<CategoryPerf[]>([])

  useEffect(() => {
    async function fetchBotData() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/ft/wallets/${encodeURIComponent(botId)}`, { cache: "no-store" })
        const data = await res.json()

        if (data.success) {
          setWallet(data.wallet)
          setStats(data.stats)
          setOpenPositions(data.open_positions || [])
          setRecentTrades(data.recent_trades || [])
          setDailyPnl(data.daily_pnl || [])
          setCategories(data.performance_by_category || [])
        } else {
          setError(data.error || "Failed to load bot data")
        }
      } catch (err) {
        console.error("Error fetching bot data:", err)
        setError("Failed to load bot data")
      } finally {
        setLoading(false)
      }
    }

    if (botId) fetchBotData()
  }, [botId])

  // Derived data
  const roiPct = useMemo(() => {
    if (!wallet || !stats) return 0
    return wallet.starting_balance > 0
      ? ((wallet.current_balance - wallet.starting_balance) / wallet.starting_balance) * 100
      : 0
  }, [wallet, stats])

  const winRate = useMemo(() => {
    if (!stats) return 0
    return stats.win_rate != null ? stats.win_rate * 100 : 0
  }, [stats])

  const chartColor = useMemo(() => {
    return roiPct >= 0 ? "#22C55E" : "#EF4444"
  }, [roiPct])

  const chartData = useMemo(() => {
    return dailyPnl.map((d) => ({
      date: formatShortDate(d.date),
      value: d.cumulative_pnl,
    }))
  }, [dailyPnl])

  const volume = useMemo(() => {
    if (!stats) return "$0"
    return formatVolume((stats.total_trades || 0) * ((stats as any).avg_trade_size || 0))
  }, [stats])

  const riskProfile = useMemo(() => {
    return wallet ? deriveRiskProfile(wallet) : { label: "MODERATE", color: "text-poly-yellow" }
  }, [wallet])

  // Best performing trades last 7 days (resolved, sorted by PnL desc)
  const bestTrades7d = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return recentTrades
      .filter((t) => {
        const resolved = t.resolved_time
        if (!resolved) return false
        const raw = typeof resolved === "string" ? resolved : resolved.value
        return new Date(raw).getTime() >= sevenDaysAgo
      })
      .sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
      .slice(0, 5)
  }, [recentTrades])

  // Benchmarks derived from stats
  const benchmarks = useMemo(() => {
    if (!stats) return { alpha: "-", drawdown: "-", sharpe: "-" }
    return {
      alpha: stats.max_drawdown_pct < 5 ? "TOP 10%" : stats.max_drawdown_pct < 10 ? "TOP 25%" : "TOP 50%",
      drawdown: `${stats.max_drawdown_pct.toFixed(1)}%`,
      sharpe: stats.sharpe_ratio != null ? stats.sharpe_ratio.toFixed(2) : "-",
    }
  }, [stats])

  if (loading) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
          <p className="mt-3 font-body text-sm text-muted-foreground">Loading strategy data...</p>
        </div>
        <BottomNav />
      </div>
    )
  }

  if (error || !wallet || !stats) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h1 className="font-sans text-2xl font-bold text-poly-black">
            {error || "Bot not found"}
          </h1>
          <button
            onClick={() => router.push("/v2/bots")}
            className="mt-4 bg-poly-yellow px-6 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black"
          >
            Back to Bots
          </button>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      {/* ── Header ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <button
                onClick={() => router.push("/v2/bots")}
                className="mb-3 flex items-center gap-1 font-sans text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-3">
                <h1 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
                  {wallet.display_name}
                </h1>
              </div>
              <div className="mt-1.5 flex items-center gap-3 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  RUNNING_{timeRunning(wallet.start_date)}
                </span>
                <span>·</span>
                <span className={cn(
                  "px-1.5 py-0.5",
                  wallet.test_status === "ACTIVE"
                    ? "bg-profit-green/15 text-profit-green"
                    : "bg-muted text-muted-foreground"
                )}>
                  {wallet.test_status}
                </span>
              </div>
            </div>
            <div className="ml-6 flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-2 bg-poly-yellow px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-yellow/90"
              >
                <Zap className="h-3.5 w-3.5" />
                COPY_THIS_BOT
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-1">
            {(["analysis", "trades", "signal_log"] as Tab[]).map((tab) => {
              const isActive = activeTab === tab
              const label = tab === "signal_log" ? "SIGNAL_LOG" : tab.toUpperCase()
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "px-5 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-all",
                    isActive
                      ? "bg-poly-yellow text-poly-black"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* ────── ANALYSIS TAB ────── */}
        {activeTab === "analysis" && (
          <div className="flex flex-col gap-8">
            {/* Top row: Performance + Best Trades */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Performance Delta (2/3 width) */}
              <div className="border border-border bg-card p-6 lg:col-span-2">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                      PERFORMANCE DELTA
                    </h2>
                    <p className="mt-0.5 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      CUMULATIVE_P&L
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={cn(
                        "font-sans text-xl font-bold tabular-nums",
                        roiPct >= 0 ? "text-profit-green" : "text-loss-red"
                      )}
                    >
                      {roiPct >= 0 ? "+" : ""}
                      {roiPct.toFixed(1)}%
                    </span>
                    <span className="font-sans text-xl font-bold tabular-nums text-foreground">
                      {winRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {chartData.length > 1 ? (
                  <PerformanceChart data={chartData} color={chartColor} />
                ) : (
                  <div className="flex h-[200px] items-center justify-center text-muted-foreground font-body text-sm">
                    Not enough data for chart yet
                  </div>
                )}
              </div>

              {/* Best Performing Trades (7 Days) */}
              <div className="flex flex-col border border-border bg-poly-black p-5">
                <div className="mb-4">
                  <h2 className="flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wide text-white">
                    <TrendingUp className="h-4 w-4 text-poly-yellow" />
                    BEST TRADES (7D)
                  </h2>
                  <p className="mt-0.5 font-sans text-[9px] font-bold uppercase tracking-widest text-white/50">
                    TOP_PERFORMING_RESOLVED
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {bestTrades7d.length === 0 ? (
                    <p className="py-4 text-center font-body text-xs text-white/50">
                      No resolved trades in the last 7 days
                    </p>
                  ) : (
                    bestTrades7d.map((trade, i) => {
                      const pnl = trade.pnl || 0
                      const isWon = pnl >= 0
                      return (
                        <div key={i} className="border border-white/10 bg-white/5 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="font-sans text-[10px] font-bold uppercase leading-tight tracking-wide text-white line-clamp-2">
                              {trade.market_title || "Unknown Market"}
                            </p>
                            <span
                              className={cn(
                                "ml-2 shrink-0 font-sans text-[10px] font-bold tabular-nums",
                                isWon ? "text-profit-green" : "text-loss-red"
                              )}
                            >
                              {formatPnl(pnl)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 font-sans text-[8px] font-bold uppercase text-white",
                                  (trade.token_label || "YES").toUpperCase() === "YES"
                                    ? "bg-profit-green"
                                    : "bg-loss-red"
                                )}
                              >
                                {trade.token_label || "YES"}
                              </span>
                              <span className="font-body text-xs tabular-nums text-white/60">
                                @ {trade.entry_price ? `${(trade.entry_price * 100).toFixed(0)}¢` : "-"}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "font-sans text-[9px] font-bold uppercase",
                                isWon ? "text-profit-green" : "text-loss-red"
                              )}
                            >
                              {trade.outcome}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Middle row: Capital Allocation + Benchmarking + Stats */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Capital Allocation */}
              <div className="border border-border bg-card p-6">
                <h2 className="mb-5 font-sans text-base font-bold uppercase tracking-wide text-foreground">
                  CAPITAL ALLOCATION
                </h2>
                <div className="flex flex-col gap-4">
                  {categories.length === 0 ? (
                    <p className="py-4 text-center font-body text-sm text-muted-foreground">No data yet</p>
                  ) : (
                    categories.slice(0, 6).map((cat) => {
                      const total = categories.reduce((s, c) => s + c.trades, 0)
                      const pct = total > 0 ? Math.round((cat.trades / total) * 100) : 0
                      return (
                        <div key={cat.category}>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-foreground">
                              {cat.category}
                            </span>
                            <span className="font-body text-xs font-semibold tabular-nums text-foreground">
                              {pct}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted">
                            <div className="h-full bg-poly-black" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Industrial Benchmarking */}
              <div className="border border-border bg-card p-6">
                <h2 className="mb-5 font-sans text-base font-bold uppercase tracking-wide text-foreground">
                  INDUSTRIAL BENCHMARKING
                </h2>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      ALPHA GENERATION
                    </span>
                    <span className="bg-profit-green/15 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-widest text-profit-green">
                      {benchmarks.alpha}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      DRAWDOWN MAX
                    </span>
                    <span className="font-body text-sm font-semibold tabular-nums text-foreground">
                      {benchmarks.drawdown}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      SHARPE RATIO
                    </span>
                    <span className="font-body text-sm font-semibold tabular-nums text-foreground">
                      {benchmarks.sharpe}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right stats column */}
              <div className="flex flex-col gap-6">
                <div className="border border-border bg-card p-5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    TOTAL_TRADES
                  </p>
                  <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
                    {stats.total_trades.toLocaleString()}
                  </p>
                  <p className="mt-0.5 font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    LIFETIME_EXECUTION
                  </p>
                </div>
                <div className="border border-border bg-card p-5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    TOTAL_P&L
                  </p>
                  <p className={cn(
                    "mt-1 font-sans text-2xl font-bold tabular-nums",
                    stats.total_pnl >= 0 ? "text-profit-green" : "text-loss-red"
                  )}>
                    {formatPnl(stats.total_pnl)}
                  </p>
                  <p className="mt-0.5 font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    REALIZED + UNREALIZED
                  </p>
                </div>
                <div className="border border-border bg-card p-5">
                  <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    OPEN_POSITIONS
                  </p>
                  <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-info-blue">
                    {stats.open_positions}
                  </p>
                  <p className="mt-0.5 font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    EXPOSURE: {formatCurrency(stats.open_exposure)}
                  </p>
                </div>
              </div>
            </div>

            {/* Strategy Architecture */}
            <div className="border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-2">
                <Shield className="h-5 w-5 text-poly-yellow" />
                <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                  STRATEGY_ARCHITECTURE
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                  <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    DESCRIPTION
                  </p>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    {wallet.description || "No description available."}
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      RISK PROFILE
                    </span>
                    <span className={cn("font-sans text-xs font-bold uppercase tracking-widest", riskProfile.color)}>
                      {riskProfile.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      TARGET CATEGORIES
                    </span>
                    <span className="font-sans text-xs font-bold uppercase tracking-wide text-foreground">
                      {wallet.market_categories?.join(", ") || "ALL"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      ALLOCATION METHOD
                    </span>
                    <span className="font-body text-sm font-semibold text-foreground">
                      {wallet.allocation_method || "FIXED"}
                    </span>
                  </div>
                  {wallet.model_threshold != null && wallet.model_threshold > 0 && (
                    <div className="flex items-center justify-between border-t border-border pt-4">
                      <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        ML THRESHOLD
                      </span>
                      <span className="font-body text-sm font-semibold tabular-nums text-foreground">
                        {(wallet.model_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ────── TRADES TAB ────── */}
        {activeTab === "trades" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                  TRADE HISTORY
                </h2>
                <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {recentTrades.length} RESOLVED TRADES
                </p>
              </div>
            </div>

            {recentTrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  No resolved trades yet for this strategy.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        MARKET
                      </th>
                      <th className="px-3 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        SIDE
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        ENTRY
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        SIZE
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        P&L
                      </th>
                      <th className="px-3 py-3 text-center font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        OUTCOME
                      </th>
                      <th className="px-3 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        TRADER
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        RESOLVED
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.slice(0, 100).map((trade, i) => {
                      const pnl = trade.pnl || 0
                      return (
                        <tr key={i} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="max-w-[280px] truncate px-4 py-3 font-body text-sm text-foreground">
                            {trade.market_title || "-"}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase text-white",
                                (trade.token_label || "YES").toUpperCase() === "YES"
                                  ? "bg-profit-green"
                                  : "bg-loss-red"
                              )}
                            >
                              {trade.token_label || "YES"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                            {trade.entry_price ? `${(trade.entry_price * 100).toFixed(0)}¢` : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                            {trade.size ? formatCurrency(trade.size) : "-"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right font-body text-sm font-semibold tabular-nums",
                              pnl >= 0 ? "text-profit-green" : "text-loss-red"
                            )}
                          >
                            {formatPnl(pnl)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 font-sans text-[9px] font-bold uppercase",
                                trade.outcome === "WON"
                                  ? "bg-profit-green/15 text-profit-green"
                                  : "bg-loss-red/15 text-loss-red"
                              )}
                            >
                              {trade.outcome}
                            </span>
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-3 font-body text-xs text-muted-foreground">
                            {trade.trader_name || (trade.trader_address ? `${(trade.trader_address as string).slice(0, 6)}...` : "-")}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                            {formatDate(trade.resolved_time)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ────── SIGNAL LOG TAB ────── */}
        {activeTab === "signal_log" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
                  OPEN POSITIONS
                </h2>
                <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {openPositions.length} ACTIVE SIGNALS
                </p>
              </div>
            </div>

            {openPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  No open positions for this strategy.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        MARKET
                      </th>
                      <th className="px-3 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        SIDE
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        ENTRY
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        CURRENT
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        SIZE
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        UNREAL. P&L
                      </th>
                      <th className="px-3 py-3 text-left font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        TRADER
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        RESOLVES
                      </th>
                      <th className="px-3 py-3 text-right font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        ENTERED
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((pos, i) => {
                      const uPnl = pos.unrealized_pnl || 0
                      return (
                        <tr key={i} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="max-w-[280px] truncate px-4 py-3 font-body text-sm text-foreground">
                            {pos.market_title || "-"}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase text-white",
                                (pos.token_label || "YES").toUpperCase() === "YES"
                                  ? "bg-profit-green"
                                  : "bg-loss-red"
                              )}
                            >
                              {pos.token_label || "YES"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                            {pos.entry_price ? `${(pos.entry_price * 100).toFixed(0)}¢` : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                            {pos.current_price != null ? `${(pos.current_price * 100).toFixed(0)}¢` : "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                            {pos.size ? formatCurrency(pos.size) : "-"}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-3 text-right font-body text-sm font-semibold tabular-nums",
                              uPnl >= 0 ? "text-profit-green" : "text-loss-red"
                            )}
                          >
                            {pos.unrealized_pnl != null ? formatPnl(uPnl) : "-"}
                          </td>
                          <td className="max-w-[120px] truncate px-3 py-3 font-body text-xs text-muted-foreground">
                            {pos.trader_name || (pos.trader_address ? `${(pos.trader_address as string).slice(0, 6)}...` : "-")}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-xs text-muted-foreground whitespace-nowrap">
                            {pos.resolves_label || "-"}
                          </td>
                          <td className="px-3 py-3 text-right font-body text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                            {formatDate(pos.order_time)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />
    </div>
  )
}
