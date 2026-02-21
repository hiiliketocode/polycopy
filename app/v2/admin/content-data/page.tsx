"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ArrowLeft, Loader2, RefreshCw, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default function ContentDataPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUser(data.user)
      else router.push("/v2")
    })
  }, [router])

  const fetchReport = useCallback(async (force: boolean) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const url = force
        ? "/api/admin/content-data?force=1"
        : "/api/admin/content-data"
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const data = await res.json()
      const text = buildTextReport(data)
      setReport(text)
      setLastUpdated(data.lastUpdated || new Date().toLocaleString())
    } catch (err: any) {
      setError(err.message || "Failed to load report")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchReport(false)
  }, [user, fetchReport])

  const handleCopy = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* noop */
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-poly-cream">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <button
          onClick={() => router.push("/v2/admin")}
          className="mb-6 inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          BACK TO ADMIN
        </button>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black">
              CONTENT DATA
            </h1>
            {lastUpdated && (
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchReport(true)}
              disabled={refreshing}
              className={cn(
                "flex items-center gap-1.5 border border-border px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-widest transition-colors",
                refreshing
                  ? "text-muted-foreground cursor-wait"
                  : "text-poly-black hover:bg-poly-black hover:text-poly-cream"
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              {refreshing ? "REFRESHING..." : "REFRESH"}
            </button>
            <button
              onClick={handleCopy}
              disabled={!report}
              className="flex items-center gap-1.5 bg-poly-yellow px-4 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black hover:text-poly-yellow disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  COPIED
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  COPY ALL
                </>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center border border-border bg-card py-20">
            <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
            <p className="mt-3 font-body text-sm text-muted-foreground">
              Loading report data... This may take up to a minute on first load.
            </p>
          </div>
        ) : error ? (
          <div className="border border-loss-red/30 bg-loss-red/5 p-8 text-center">
            <p className="font-sans text-sm font-bold text-loss-red">{error}</p>
            <button
              onClick={() => fetchReport(true)}
              className="mt-4 border border-poly-black px-6 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black hover:bg-poly-black hover:text-poly-cream"
            >
              RETRY
            </button>
          </div>
        ) : report ? (
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-border bg-card p-6 font-mono text-xs leading-relaxed text-foreground">
            {report}
          </pre>
        ) : null}
      </div>
    </div>
  )
}

function buildTextReport(data: any): string {
  const lines: string[] = []
  const { sectionA, sectionB } = data

  lines.push("═══════════════════════════════════════════════")
  lines.push("POLYCOPY CONTENT DATA DASHBOARD")
  lines.push(`Last Updated: ${data.lastUpdated}`)
  lines.push("═══════════════════════════════════════════════")
  lines.push("")

  // Section A
  lines.push("═══════════════════════════════════════════════")
  lines.push("SECTION A: POLYMARKET TRADER DATA")
  lines.push("═══════════════════════════════════════════════")
  lines.push("")

  // Top 30
  if (sectionA?.topTraders?.length > 0) {
    lines.push("🏆 TOP 30 TRADERS (SORTED BY ROI)")
    lines.push("───────────────────────────────────────────────")
    const byROI = [...sectionA.topTraders].sort((a: any, b: any) => b.roi - a.roi)
    byROI.forEach((t: any, i: number) => {
      const status = t.active_status === "ACTIVE" ? "🟢" : t.active_status === "RECENT" ? "🟡" : t.active_status === "INACTIVE" ? "🔴" : ""
      const last = t.days_since_last_trade != null ? ` [${t.days_since_last_trade}d]` : ""
      lines.push(`${i + 1}. ${t.displayName} (${t.wallet}) — P&L: ${t.pnl_formatted} | ROI: ${t.roi_formatted} | Vol: ${t.volume_formatted} | Trades: ${t.marketsTraded} ${status}${last}`)
    })
    lines.push("")
  }

  // Category leaderboards
  if (sectionA?.categoryLeaderboards) {
    const cats = Object.entries(sectionA.categoryLeaderboards)
    if (cats.length > 0) {
      lines.push("📊 CATEGORY LEADERBOARDS (TOP 10)")
      lines.push("───────────────────────────────────────────────")
      for (const [cat, traders] of cats) {
        lines.push(`\n🏆 ${cat.toUpperCase()}`)
        ;(traders as any[]).slice(0, 10).forEach((t: any, i: number) => {
          lines.push(`  ${i + 1}. ${t.displayName} — P&L: ${t.pnl_formatted} | ROI: ${t.roi_formatted}`)
        })
      }
      lines.push("")
    }
  }

  // Trader analytics
  if (sectionA?.traderAnalytics?.length > 0) {
    lines.push("🔬 TRADER ANALYTICS")
    lines.push("───────────────────────────────────────────────")
    for (const t of sectionA.traderAnalytics) {
      const wow = t.wow_status === "heating_up" ? "🔥" : t.wow_status === "cooling_down" ? "❄️" : t.wow_status === "new" ? "🆕" : "➡️"
      lines.push(`\n${t.trader_username} (${t.trader_wallet})`)
      lines.push(`  ${wow} ${t.wow_status?.toUpperCase()} | WR: ${t.win_rate_formatted} (${t.wins}W/${t.losses}L) | Spec: ${t.primary_category}`)
      lines.push(`  Avg Pos: ${t.avg_position_formatted} | Freq: ${t.trades_per_day_formatted} | Trades: ${t.total_trades}`)
      if (t.wow_pnl_change_formatted) lines.push(`  WoW: P&L ${t.wow_pnl_change_formatted} | Rank ${t.wow_rank_change_formatted}`)
      if (t.recent_wins?.length > 0) {
        lines.push("  🏆 Wins:")
        t.recent_wins.forEach((w: any) => lines.push(`    ${w.market_title.slice(0, 50)} | ${w.roi_formatted}`))
      }
      if (t.narrative_hook) lines.push(`  💬 "${t.narrative_hook}"`)
      lines.push(`  📈 ${t.profile_url}`)
    }
    lines.push("")
  }

  // Top performers
  const metrics = [
    { key: "topByPnl", label: "💰 TOP 5 BY P&L", field: "pnl_formatted" },
    { key: "topByRoi", label: "📊 TOP 5 BY ROI", field: "roi_formatted" },
    { key: "topByVolume", label: "🐋 TOP 5 WHALES", field: "volume_formatted" },
    { key: "topByTradeCount", label: "⚡ TOP 5 MOST ACTIVE", field: "marketsTraded" },
  ]
  for (const m of metrics) {
    if (sectionA?.[m.key]?.length > 0) {
      lines.push(`${m.label}`)
      sectionA[m.key].forEach((t: any, i: number) => {
        const val = m.field === "marketsTraded" ? `${t[m.field]} trades` : t[m.field]
        lines.push(`  ${i + 1}. ${t.displayName} — ${val}`)
      })
    }
  }
  lines.push("")

  // Top markets
  if (sectionA?.topCurrentMarkets?.length > 0) {
    lines.push("🔥 TOP CURRENT MARKETS")
    lines.push("───────────────────────────────────────────────")
    sectionA.topCurrentMarkets.forEach((m: any, i: number) => {
      lines.push(`${i + 1}. ${m.market_title}`)
      lines.push(`   24h: ${m.volume_24h_formatted} | Total: ${m.total_volume_formatted} | ${m.category}`)
    })
    lines.push("")
  }

  // Story of the week
  if (sectionA?.storyOfTheWeek) {
    const s = sectionA.storyOfTheWeek
    lines.push("📰 STORY OF THE WEEK")
    lines.push("───────────────────────────────────────────────")
    if (s.biggest_mover) lines.push(`🚀 Biggest Mover: ${s.biggest_mover.story}`)
    if (s.new_entrant_watch) lines.push(`👀 New Entrant: ${s.new_entrant_watch.story}`)
    if (s.unusual_pattern) lines.push(`🔍 Pattern: ${s.unusual_pattern.description}`)
    lines.push("")
  }

  // Section B
  lines.push("═══════════════════════════════════════════════")
  lines.push("SECTION B: POLYCOPY PLATFORM DATA")
  lines.push("═══════════════════════════════════════════════")
  lines.push("")

  // Platform stats
  if (sectionB?.platformStats) {
    const p = sectionB.platformStats
    lines.push("📈 PLATFORM STATS")
    lines.push(`  Traders: ${p.uniqueTraders} | Copies: ${p.totalCopies} | Users: ${p.activeUsers}`)
    lines.push(`  Avg ROI: ${p.avgRoi_formatted} | Win Rate: ${p.winRate_formatted}`)
    lines.push("")
  }

  // Most copied traders
  if (sectionB?.mostCopiedTraders?.length > 0) {
    lines.push("📊 MOST COPIED TRADERS (7D)")
    sectionB.mostCopiedTraders.forEach((t: any, i: number) => {
      lines.push(`  ${i + 1}. ${t.trader_username} — ${t.copy_count} copies`)
    })
    lines.push("")
  }

  // Most copied markets
  if (sectionB?.mostCopiedMarkets?.length > 0) {
    lines.push("🔥 MOST COPIED MARKETS (7D)")
    sectionB.mostCopiedMarkets.forEach((m: any, i: number) => {
      const roi = m.avg_roi_formatted ? ` (ROI: ${m.avg_roi_formatted})` : ""
      lines.push(`  ${i + 1}. ${m.market_title_truncated} — ${m.copy_count} copies${roi}`)
    })
    lines.push("")
  }

  // Recent activity
  if (sectionB?.recentActivity?.length > 0) {
    lines.push("⏱️ RECENT ACTIVITY")
    sectionB.recentActivity.forEach((a: any) => {
      lines.push(`  [${a.time_formatted}] ${a.trader_username} → ${a.market_title_truncated} (${a.outcome})`)
    })
    lines.push("")
  }

  // Fastest growing
  if (sectionB?.fastestGrowingTraders?.length > 0) {
    lines.push("🚀 FASTEST GROWING (BY FOLLOWERS)")
    sectionB.fastestGrowingTraders.forEach((t: any, i: number) => {
      lines.push(`  ${i + 1}. ${t.trader_username} — ${t.growth_rate} | Total: ${t.total_followers}`)
    })
    lines.push("")
  }

  // Copier performance
  if (sectionB?.copierPerformance?.length > 0) {
    lines.push("👥 TOP COPIER PERFORMANCE")
    sectionB.copierPerformance.forEach((c: any, i: number) => {
      lines.push(`  ${i + 1}. ${c.user_email} — ROI: ${c.avg_roi_formatted} | WR: ${c.win_rate_formatted} | ${c.total_copies} trades`)
    })
    lines.push("")
  }

  // Errors
  const errors = [...(sectionA?.apiErrors || []), ...(sectionB?.dbErrors || [])]
  if (errors.length > 0) {
    lines.push("⚠️ ERRORS")
    errors.forEach((e: string) => lines.push(`  • ${e}`))
    lines.push("")
  }

  lines.push("═══════════════════════════════════════════════")
  lines.push("END OF REPORT")
  lines.push("═══════════════════════════════════════════════")

  return lines.join("\n")
}
