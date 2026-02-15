"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BotCard } from "@/components/polycopy-v2/bot-card"
import { cn } from "@/lib/utils"
import type { BotData } from "@/components/polycopy-v2/bot-card"

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function generateSparkline(seed: number, length = 30): number[] {
  const data: number[] = []
  let val = 50
  // Deterministic pseudo-random from seed
  let s = seed
  for (let i = 0; i < length; i++) {
    s = (s * 16807) % 2147483647
    const r = (s / 2147483647) * 2 - 1
    val += r * 3
    data.push(Math.max(0, val))
  }
  return data
}

function deriveRiskLevel(wallet: any): "LOW" | "MEDIUM" | "HIGH" {
  const name = (wallet.display_name || "").toLowerCase()
  const desc = (wallet.description || "").toLowerCase()

  if (
    name.includes("conservative") || name.includes("steady") || name.includes("safe") ||
    name.includes("favorite") || name.includes("heavy fav") || name.includes("arbitrage") ||
    desc.includes("conservative") || desc.includes("low risk")
  ) return "LOW"

  if (
    name.includes("aggressive") || name.includes("full send") || name.includes("storm") ||
    name.includes("contrarian") || name.includes("underdog") ||
    desc.includes("high-risk") || desc.includes("aggressive") || desc.includes("contrarian")
  ) return "HIGH"

  return "MEDIUM"
}

function deriveChartColor(riskLevel: string, isPremium: boolean): string {
  if (riskLevel === "HIGH") return "#F87171"
  if (isPremium) return "#818CF8"
  return "#22C55E"
}

function formatVolume(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

/** Derive a user-facing "category" from wallet config */
function deriveCategory(wallet: any): string {
  const name = (wallet.display_name || "").toLowerCase()
  const desc = (wallet.description || "").toLowerCase()
  const cats = wallet.market_categories

  if (name.includes("ml") || name.includes("alpha") || desc.includes("machine learning") || desc.includes("neural"))
    return "ML_POWERED"
  if (name.includes("sports") || (Array.isArray(cats) && cats.some((c: string) => ["SPORTS", "NBA", "NFL", "MLB"].includes(c)) && !cats.includes("POLITICS")))
    return "SPORTS"
  if (name.includes("politics") || name.includes("contrarian") || (Array.isArray(cats) && cats.includes("POLITICS") && !cats.includes("SPORTS")))
    return "POLITICS"
  if (name.includes("arbitrage") || desc.includes("arbitrage"))
    return "ARBITRAGE"

  return "ALL"
}

const FREE_BOT_NAMES = ["Steady Eddie", "Balanced Play", "Full Send"]

function transformWalletToBot(wallet: any): BotData {
  const pnlPct = wallet.starting_balance > 0
    ? ((wallet.current_balance - wallet.starting_balance) / wallet.starting_balance) * 100
    : 0
  const winRate = (wallet.won + wallet.lost) > 0
    ? (wallet.won / (wallet.won + wallet.lost)) * 100
    : 0
  const isFree = FREE_BOT_NAMES.some(n => wallet.display_name?.includes(n))
  const riskLevel = deriveRiskLevel(wallet)

  return {
    id: wallet.wallet_id,
    name: (wallet.display_name || wallet.wallet_id).toUpperCase(),
    description: wallet.description || "AI-powered copy trading strategy",
    performance: {
      return_pct: Math.round(pnlPct * 10) / 10,
      win_rate: Math.round(winRate * 10) / 10,
      total_trades: wallet.total_trades || 0,
      sparkline_data: generateSparkline(wallet.wallet_id?.length || 1),
    },
    risk_level: riskLevel,
    volume: formatVolume(
      (wallet.avg_trade_size || 0) * (wallet.total_trades || 0)
    ),
    is_premium: !isFree,
    is_active: wallet.is_active || false,
    chartColor: deriveChartColor(riskLevel, !isFree),
  }
}

/* ═══════════════════════════════════════════════════════
   Filter Buttons
   ═══════════════════════════════════════════════════════ */

const FILTERS = [
  { id: "ALL", label: "ALL" },
  { id: "CONSERVATIVE", label: "CONSERVATIVE" },
  { id: "MODERATE", label: "MODERATE" },
  { id: "AGGRESSIVE", label: "AGGRESSIVE" },
  { id: "ML_POWERED", label: "ML POWERED" },
  { id: "SPORTS", label: "SPORTS" },
  { id: "POLITICS", label: "POLITICS" },
  { id: "FREE", label: "FREE" },
] as const

type FilterId = (typeof FILTERS)[number]["id"]

/* ═══════════════════════════════════════════════════════
   Page Component
   ═══════════════════════════════════════════════════════ */

export default function BotsPage() {
  const router = useRouter()
  const [bots, setBots] = useState<BotData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<FilterId>("ALL")
  const [walletCategoryMap, setWalletCategoryMap] = useState<Record<string, string>>({})

  // Fetch real data from /api/ft/wallets
  useEffect(() => {
    async function fetchBots() {
      setLoading(true)
      try {
        const res = await fetch("/api/ft/wallets", { cache: "no-store" })
        const data = await res.json()

        if (data.success && data.wallets?.length > 0) {
          const transformed = data.wallets
            .filter((w: any) => w.test_status === "ACTIVE" || w.total_trades > 0)
            .map((w: any) => transformWalletToBot(w))

          // Build category map for filtering
          const catMap: Record<string, string> = {}
          data.wallets.forEach((w: any) => {
            catMap[w.wallet_id] = deriveCategory(w)
          })
          setWalletCategoryMap(catMap)
          setBots(transformed)
        }
      } catch (err) {
        console.error("Error fetching bots:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchBots()
  }, [])

  // Filter bots
  const filteredBots = useMemo(() => {
    if (activeFilter === "ALL") return bots

    return bots.filter((bot) => {
      switch (activeFilter) {
        case "CONSERVATIVE":
          return bot.risk_level === "LOW"
        case "MODERATE":
          return bot.risk_level === "MEDIUM"
        case "AGGRESSIVE":
          return bot.risk_level === "HIGH"
        case "FREE":
          return !bot.is_premium
        case "ML_POWERED":
        case "SPORTS":
        case "POLITICS":
          return walletCategoryMap[bot.id] === activeFilter
        default:
          return true
      }
    })
  }, [bots, activeFilter, walletCategoryMap])

  const onlineCount = bots.length

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      {/* ── Hero Section ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-poly-yellow" />
                <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  POLYCOPY_V2_CORE
                </span>
              </div>
              <h1 className="mb-3 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
                COPY TRADING
                <br />
                BOTS
              </h1>
              <p className="max-w-md font-body text-sm leading-relaxed text-muted-foreground">
                Automate your portfolio with proprietary Polycopy algorithms.
                Deploy high-frequency strategies across the Polymarket
                ecosystem in seconds.
              </p>
            </div>
            <div className="ml-6 hidden shrink-0 items-center gap-2 border border-border px-4 py-2.5 md:flex">
              <span className="h-2 w-2 rounded-full bg-profit-green" />
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-foreground">
                {onlineCount} STRATEGIES ONLINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Buttons ── */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-3 scrollbar-hide">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={cn(
                "shrink-0 px-4 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                activeFilter === f.id
                  ? "bg-poly-yellow text-poly-black"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bot Cards Grid ── */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
            <p className="mt-3 font-body text-sm text-muted-foreground">Loading strategies...</p>
          </div>
        ) : filteredBots.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {filteredBots.map((bot) => (
              <BotCard
                key={bot.id}
                bot={bot}
                onActivate={() => console.log("Activate:", bot.id)}
                onAnalysis={() => router.push(`/v2/bots/${bot.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="font-body text-sm text-muted-foreground">
              No strategies found for this filter.
            </p>
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />
    </div>
  )
}
