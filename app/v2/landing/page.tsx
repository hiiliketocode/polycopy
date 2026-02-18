"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Activity,
  Users,
  Zap,
  Bot,
  Wallet,
  Check,
  TrendingUp,
  ShieldCheck,
  Target,
  UserPlus,
  MousePointerClick,
} from "lucide-react"
import { LandingNav } from "@/components/polycopy-v2/landing-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

interface LeaderboardTrader {
  wallet: string
  displayName: string
  pnl: number
  volume: number
  winRate: number
  totalTrades: number
  roi: number
  profileImage?: string | null
}

interface BotSummary {
  id: string
  name: string
  description: string
  roi: number
  winRate: number
  totalTrades: number
  sparkline: number[]
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function formatCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

function formatSignedCurrency(v: number): string {
  const f = formatCurrency(Math.abs(v))
  return v >= 0 ? `+${f}` : `-${f}`
}

function generateSparkline(seed: number, length = 20): number[] {
  const data: number[] = []
  let val = 50
  let s = seed
  for (let i = 0; i < length; i++) {
    s = (s * 16807) % 2147483647
    const r = (s / 2147483647) * 2 - 1
    val += r * 3
    data.push(Math.max(0, val))
  }
  return data
}

/* ═══════════════════════════════════════════════════════
   Mini Sparkline SVG
   ═══════════════════════════════════════════════════════ */

function MiniSparkline({ data, color = "#22C55E" }: { data: number[]; color?: string }) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 200
  const h = 60
  const pad = 4
  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: pad + (h - 2 * pad) - ((v - min) / range) * (h - 2 * pad),
  }))
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`
  const gid = `sp-${Math.random().toString(36).slice(2, 6)}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════
   Mobile Feed Mockup (hero illustration)
   Ported from Figma's MobileFeedMockup component
   ═══════════════════════════════════════════════════════ */

const feedItems = [
  { user: "kch123", action: "BOUGHT", market: "ETH ABOVE $3000?", amount: "$2,400", time: "2m ago", pnl: "+$12.4K", color: "bg-orange-500" },
  { user: "beachboy4", action: "SOLD", market: "BTC NEW ATH?", amount: "$12,000", time: "5m ago", pnl: "+$45.2K", color: "bg-blue-500" },
  { user: "feather_l", action: "BOUGHT", market: "TRUMP WINS?", amount: "$5,500", time: "12m ago", pnl: "+$2.1K", color: "bg-green-500" },
  { user: "whale_0x", action: "BOUGHT", market: "SOL ABOVE $200?", amount: "$150K", time: "15m ago", pnl: "+$1.2M", color: "bg-zinc-800" },
  { user: "alpha_j", action: "SOLD", market: "FED CUTS RATE?", amount: "$8,200", time: "22m ago", pnl: "+$8.9K", color: "bg-purple-500" },
]

function HeroMockCard() {
  return (
    <div className="relative mx-auto w-[280px] h-[580px] md:w-[320px] md:h-[660px]">
      {/* ── Phone Frame ── */}
      <div className="absolute inset-0 overflow-hidden rounded-[48px] border-[8px] border-[#1A1A1A] bg-[#0A0A0A] shadow-2xl ring-1 ring-white/10">
        {/* Screen Content */}
        <div className="flex h-full flex-col bg-[#0A0A0A]">
          {/* Notch Area */}
          <div className="flex h-8 w-full items-start justify-center pt-2">
            <div className="h-5 w-20 rounded-full bg-black" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div className="flex h-8 w-8 items-center justify-center bg-[#FDB022] font-sans text-[10px] font-black text-black">P</div>
            <div className="h-2 w-16 rounded-full bg-white/10" />
            <div className="h-6 w-6 rounded-full border border-white/10" />
          </div>

          {/* Feed Content (scrollable) */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
            {feedItems.map((item, i) => (
              <div key={i} className="space-y-3 border border-white/5 bg-white/5 p-4">
                {/* Row 1: avatar + name + time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`flex h-6 w-6 items-center justify-center text-[8px] font-black text-white ${item.color}`}>
                      {item.user.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-sans text-[10px] font-black uppercase text-white">{item.user}</span>
                  </div>
                  <span className="font-sans text-[8px] font-bold uppercase text-zinc-500">{item.time}</span>
                </div>
                {/* Row 2: action + market */}
                <div>
                  <p className="font-sans text-[8px] font-black uppercase tracking-widest text-[#FDB022]">{item.action}</p>
                  <p className="font-sans text-xs font-black uppercase leading-tight text-white">{item.market}</p>
                </div>
                {/* Row 3: stats */}
                <div className="flex items-end justify-between border-t border-white/5 pt-2">
                  <div>
                    <p className="font-sans text-[7px] font-black uppercase text-zinc-500">POSITION_SIZE</p>
                    <p className="font-sans text-[10px] font-black text-white">{item.amount}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-sans text-[7px] font-black uppercase text-zinc-500">USER_PNL</p>
                    <p className="font-sans text-[10px] font-black text-[#10B981]">{item.pnl}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation Bar */}
          <div className="flex h-16 items-center justify-around border-t border-white/10 px-4">
            <div className="h-5 w-5 bg-[#FDB022] opacity-50" />
            <div className="h-5 w-5 border border-white/20" />
            <div className="h-5 w-5 border border-white/20" />
            <div className="h-5 w-5 border border-white/20" />
          </div>
        </div>
      </div>

      {/* ── Decorative blur elements ── */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FDB022]/10 blur-3xl" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[#10B981]/10 blur-3xl" />

      {/* ── Floating: Live Signal card (top-right, rotated +3deg) ── */}
      <div className="absolute -right-12 top-20 z-10 rotate-3 bg-[#FDB022] p-4 shadow-2xl md:-right-20">
        <p className="mb-1 font-sans text-[9px] font-black uppercase tracking-[0.2em] text-black">LIVE_FEED</p>
        <p className="font-sans text-sm font-black uppercase leading-tight text-black">
          Alpha detected<br />on &lsquo;YES&rsquo;
        </p>
      </div>

      {/* ── Floating: Aggregated ROI card (bottom-left, rotated -3deg) ── */}
      <div className="absolute -left-12 bottom-32 z-10 -rotate-3 border border-white/10 bg-black p-5 shadow-2xl md:-left-20">
        <p className="mb-1 font-sans text-[8px] font-black uppercase tracking-widest text-zinc-500">AGGREGATED_ROI</p>
        <p className="font-sans text-2xl font-black uppercase leading-none text-[#10B981]">+312.4%</p>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════ */

export default function LandingPage() {
  const [traders, setTraders] = useState<LeaderboardTrader[]>([])
  const [tradersLoading, setTradersLoading] = useState(true)
  const [bots, setBots] = useState<BotSummary[]>([])

  // Fetch top 10 traders — mirrors components/landing/top-traders.tsx
  // Includes retry logic for intermittent Polymarket API failures
  useEffect(() => {
    const fetchTraders = async (retries = 2) => {
      try {
        const response = await fetch("/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=OVERALL&timePeriod=month")
        if (!response.ok) {
          // Retry on 5xx errors
          if (response.status >= 500 && retries > 0) {
            console.warn(`Leaderboard API returned ${response.status}, retrying in 2s... (${retries} retries left)`)
            await new Promise((r) => setTimeout(r, 2000))
            return fetchTraders(retries - 1)
          }
          console.error("Leaderboard API error:", response.status)
          return
        }
        const data = await response.json()
        const tradersWithROI = (data.traders || []).map((t: any) => ({
          ...t,
          roi: t.volume > 0 ? (t.pnl / t.volume) * 100 : 0,
        }))
        // Sort by ROI descending, same as existing homepage
        const sorted = tradersWithROI.sort((a: any, b: any) => (b.roi || 0) - (a.roi || 0))
        setTraders(sorted.slice(0, 10))
      } catch (err) {
        if (retries > 0) {
          console.warn("Leaderboard fetch failed, retrying...", err)
          await new Promise((r) => setTimeout(r, 2000))
          return fetchTraders(retries - 1)
        }
        console.error("Error fetching traders:", err)
      } finally {
        setTradersLoading(false)
      }
    }
    fetchTraders()
  }, [])

  // Fetch top 10 bots by performance (public endpoint — no admin auth needed)
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const res = await fetch("/api/ft/wallets/public", { cache: "no-store" })
        if (!res.ok) {
          console.error("Bots API error:", res.status)
          return
        }
        const data = await res.json()
        if (!data.success || !data.wallets) return
        const sorted = [...data.wallets]
          .filter((w: any) => w.total_trades > 0)
          .sort((a: any, b: any) => {
            const aRoi = a.starting_balance > 0 ? ((a.current_balance - a.starting_balance) / a.starting_balance) * 100 : 0
            const bRoi = b.starting_balance > 0 ? ((b.current_balance - b.starting_balance) / b.starting_balance) * 100 : 0
            return bRoi - aRoi
          })
          .slice(0, 10)
          .map((w: any) => ({
            id: w.wallet_id,
            name: (w.display_name || w.wallet_id).toUpperCase(),
            description: w.description || "",
            roi: w.starting_balance > 0 ? ((w.current_balance - w.starting_balance) / w.starting_balance) * 100 : 0,
            winRate: (w.won + w.lost) > 0 ? (w.won / (w.won + w.lost)) * 100 : 0,
            totalTrades: w.total_trades || 0,
            sparkline: generateSparkline(w.wallet_id?.length || 1),
          }))
        setBots(sorted)
      } catch (err) {
        console.error("Error fetching bots:", err)
      }
    }
    fetchBots()
  }, [])

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <LandingNav />

      {/* ─────────────────────────────────────────────────
          HERO SECTION
          ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-[#F9F8F1]/30 pt-12 pb-24 md:pt-20 md:pb-32">
        {/* Background Grid */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-16 px-4 md:px-8 lg:grid-cols-2">
          <div className="space-y-10">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-black px-3 py-1 text-xs font-black uppercase tracking-widest text-[#FDB022]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10B981]" />
                SYSTEMS_LIVE_V2.0
              </div>
              <h1 className="font-sans text-7xl font-black uppercase leading-[0.85] tracking-tighter text-poly-black md:text-8xl">
                The Home for<br />
                <span className="text-[#FDB022]">Copy Trading</span>{" "}
                <span className="whitespace-nowrap">on Polymarket</span>
              </h1>
              <p className="max-w-lg pt-2 text-xl font-medium leading-relaxed text-zinc-500">
                The ultimate command center for Polymarket copy trading. Automate your alpha, mirror your favorite traders, and copy proprietary algorithms in two clicks.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href="/v2/discover" className="group inline-flex items-center justify-center gap-4 bg-black px-12 py-5 font-sans text-sm font-black uppercase tracking-[0.3em] text-[#FDB022] shadow-2xl transition-all hover:bg-[#FDB022] hover:text-black">
                Discover Traders <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/v2/bots" className="inline-flex items-center justify-center gap-4 border-2 border-black px-12 py-5 font-sans text-sm font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-black hover:text-white">
                Explore Bots <Bot className="h-5 w-5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-8 pt-4 md:grid-cols-3">
              <div className="flex flex-col border-l border-black/5 py-2 pl-6">
                <span className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400">TRADERS_TRACKED</span>
                <span className="font-sans text-2xl font-black tracking-tighter">50,000+</span>
              </div>
              <div className="flex flex-col border-l border-black/5 py-2 pl-6">
                <span className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400">TRADING_STRATEGIES</span>
                <span className="font-sans text-2xl font-black tracking-tighter">25+</span>
              </div>
              <div className="hidden flex-col border-l border-black/5 py-2 pl-6 md:flex">
                <span className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400">MARKETS_COVERED</span>
                <span className="font-sans text-2xl font-black tracking-tighter">ALL</span>
              </div>
            </div>
          </div>

          <div className="relative flex justify-center pr-0 lg:justify-end lg:pr-12">
            <HeroMockCard />
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          PRODUCT ECOSYSTEM
          ───────────────────────────────────────────────── */}
      <section id="features" className="border-b border-black/5 py-24">
        <div className="mx-auto max-w-[1400px] space-y-20 px-4 md:px-8">
          <div className="flex flex-col items-end justify-between gap-8 md:flex-row">
            <div className="space-y-2">
              <h2 className="text-xs font-black uppercase tracking-[0.5em] text-[#FDB022]">Product_Ecosystem</h2>
              <h3 className="font-sans text-5xl font-black uppercase tracking-tighter">Engineered for Alpha</h3>
            </div>
            <p className="max-w-md text-sm font-medium leading-relaxed text-zinc-500">
              Polycopy translates complex Polymarket data into actionable strategies. Whether you copy moves by the top performers or copy ML bots, we provide the platform.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              { icon: Activity, title: "Copy Feed", desc: "Real-time terminal of every move from the traders you follow. See the signals before they start trending.", cta: "Enter Feed", href: "/v2/feed" },
              { icon: Users, title: "Copy Traders", desc: "Copy the moves of top traders you follow in two clicks. Connect your wallet and execute trades from within the Polycopy platform.", cta: "Explore Traders", href: "/v2/discover" },
              { icon: Zap, title: "Copy Bots", desc: "Copy the proprietary Polycopy algorithms. From conservative arbitrage to high-frequency volatility strategies.", cta: "Explore Bots", href: "/v2/bots" },
            ].map((card) => (
              <div key={card.title} className="group border border-black/5 bg-white p-8 shadow-sm transition-all hover:border-black">
                <div className="mb-6 flex h-12 w-12 items-center justify-center border border-black/5 bg-[#F9F8F1] transition-all group-hover:bg-[#FDB022] group-hover:text-black">
                  <card.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 font-sans text-xl font-black uppercase leading-none tracking-tight transition-colors group-hover:text-[#FDB022]">{card.title}</h3>
                <p className="mb-6 text-sm font-medium leading-relaxed text-zinc-500">{card.desc}</p>
                <Link href={card.href} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest transition-all group-hover:gap-3">
                  {card.cta} <ArrowRight className="h-3.5 w-3.5 text-[#FDB022]" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          SEE WHO YOU COULD BE FOLLOWING
          ───────────────────────────────────────────────── */}
      <section className="overflow-hidden bg-[#F9F8F1]/50 py-24">
        <div className="mx-auto max-w-[1400px] px-4 md:px-8">
          <div className="mb-12 flex flex-col items-end justify-between gap-8 md:flex-row">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-black px-3 py-1 text-xs font-black uppercase tracking-widest text-[#FDB022]">
                <TrendingUp className="h-3 w-3" />
                POLYMARKET_LEADERBOARD
              </div>
              <h3 className="font-sans text-5xl font-black uppercase tracking-tighter">See who you could be following</h3>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Top Traders by ROI (Last 30 Days)</p>
            </div>
            <Link
              href="/v2/discover"
              className="flex items-center gap-3 bg-black px-8 py-4 text-sm font-black uppercase tracking-[0.3em] text-[#FDB022] transition-all hover:bg-[#FDB022] hover:text-black"
            >
              Discover Traders <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </div>

          {/* Horizontal scroll */}
          <div className="relative">
            <div className="flex gap-6 overflow-x-auto pb-8 pl-4" style={{ scrollbarWidth: "none" }}>
              {tradersLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="min-w-[300px] animate-pulse border border-black/5 bg-white p-6">
                      <div className="mb-6 flex items-center gap-4">
                        <div className="h-12 w-12 bg-zinc-200" />
                        <div>
                          <div className="mb-2 h-4 w-24 bg-zinc-200" />
                          <div className="h-3 w-16 bg-zinc-200" />
                        </div>
                      </div>
                      <div className="mb-6 grid grid-cols-3 gap-4 border-y border-black/5 py-4">
                        <div className="h-8 bg-zinc-100" />
                        <div className="h-8 bg-zinc-100" />
                        <div className="h-8 bg-zinc-100" />
                      </div>
                      <div className="h-12 bg-zinc-100" />
                    </div>
                  ))
                : traders.map((t) => {
                    const isPositive = t.roi >= 0
                    const initials = (t.displayName || t.wallet || "??").slice(0, 2).toUpperCase()
                    const displayName = (t.displayName && t.displayName.startsWith("0x") && t.displayName.length > 20)
                      ? `${t.wallet.slice(0, 6)}...${t.wallet.slice(-4)}`
                      : (t.displayName || `${t.wallet.slice(0, 6)}...${t.wallet.slice(-4)}`)
                    const walletShort = t.wallet ? `${t.wallet.slice(0, 6).toUpperCase()}...${t.wallet.slice(-4).toUpperCase()}` : ""
                    return (
                      <div key={t.wallet} className="group min-w-[300px] border border-black/5 bg-white p-6 transition-all hover:border-[#FDB022]">
                        {/* Trader header */}
                        <div className="mb-6 flex items-center gap-4">
                          {t.profileImage ? (
                            <img src={t.profileImage} alt={displayName} className="h-12 w-12 shrink-0 object-cover" />
                          ) : (
                            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center font-black text-lg text-white", isPositive ? "bg-orange-500" : "bg-zinc-800")}>
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="truncate font-sans font-black uppercase leading-none tracking-tight">{displayName}</h4>
                            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-400">{walletShort}</p>
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="mb-6 grid grid-cols-3 gap-4 border-y border-black/5 py-4">
                          <div className="text-center">
                            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">ROI</p>
                            <p className={cn("text-sm font-black", isPositive ? "text-[#10B981]" : "text-red-500")}>
                              {isPositive ? "+" : ""}{t.roi.toFixed(0)}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">P&L</p>
                            <p className="text-sm font-black text-black">{formatSignedCurrency(t.pnl)}</p>
                          </div>
                          <div className="text-center">
                            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">VOL</p>
                            <p className="text-sm font-black text-black">{formatCurrency(t.volume)}</p>
                          </div>
                        </div>

                        {/* CTA */}
                        <Link
                          href={`/v2/trader/${t.wallet}`}
                          className="flex w-full items-center justify-center border border-[#FDB022]/20 bg-[#FDB022]/10 py-4 text-xs font-black uppercase tracking-[0.2em] text-[#FDB022] transition-all hover:bg-[#FDB022] hover:text-black"
                        >
                          View Profile
                        </Link>
                      </div>
                    )
                  })}
            </div>
          </div>
        </div>

      {/* ─────────────────────────────────────────────────
          PROPRIETARY POLYCOPY BOTS
          ───────────────────────────────────────────────── */}
        <div className="mx-auto max-w-[1400px] px-4 pt-12 md:px-8">
          <div className="mb-12 flex flex-col items-end justify-between gap-8 md:flex-row">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-black px-3 py-1 text-xs font-black uppercase tracking-widest text-[#FDB022]">
                <Bot className="h-3 w-3" />
                ALGORITHMIC_STRATEGIES
              </div>
              <h3 className="font-sans text-5xl font-black uppercase tracking-tighter">Proprietary Copy Trading Bots</h3>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Polycopy&#39;s Top Performing ML Algorithms</p>
            </div>
            <Link
              href="/v2/bots"
              className="flex items-center gap-3 bg-black px-8 py-4 text-sm font-black uppercase tracking-[0.3em] text-[#FDB022] transition-all hover:bg-[#FDB022] hover:text-black"
            >
              Explore the Bots <ArrowRight className="h-[18px] w-[18px]" />
            </Link>
          </div>

          <div className="relative">
            <div className="flex gap-6 overflow-x-auto pb-8 pl-4" style={{ scrollbarWidth: "none" }}>
              {bots.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="min-w-[300px] animate-pulse border border-white/5 bg-black p-6 text-white">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="h-10 w-10 bg-white/10" />
                        <div className="h-5 w-24 bg-white/10" />
                      </div>
                      <div className="mb-2 h-6 w-32 bg-white/10" />
                      <div className="mb-6 h-3 w-20 bg-white/10" />
                      <div className="mb-3 h-4 w-full bg-white/5" />
                      <div className="mb-3 h-4 w-full bg-white/5" />
                      <div className="h-4 w-full bg-white/5" />
                    </div>
                  ))
                : bots.map((bot) => {
                    const isPositive = bot.roi >= 0
                    return (
                      <div key={bot.id} className="group min-w-[300px] border border-white/5 bg-black p-6 text-white transition-all hover:border-[#FDB022]">
                        <div className="mb-6 flex items-center justify-between">
                          <div className="flex h-10 w-10 items-center justify-center border border-white/10 bg-white/10 text-[#FDB022]">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div className="border border-[#10B981]/20 bg-[#10B981]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#10B981]">
                            ACTIVE_DEPLOY
                          </div>
                        </div>
                        <div className="mb-6">
                          <h4 className="font-sans text-xl font-black uppercase leading-none tracking-tighter text-[#FDB022]">{bot.name}</h4>
                          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-zinc-500">{bot.description || "Algorithmic Strategy"}</p>
                        </div>
                        <div className="mb-8 space-y-3">
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[11px] font-black uppercase text-zinc-500">30D_PERFORMANCE</span>
                            <span className={cn("text-sm font-black", isPositive ? "text-[#10B981]" : "text-red-500")}>
                              {isPositive ? "+" : ""}{bot.roi.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[11px] font-black uppercase text-zinc-500">TOTAL_TRADES</span>
                            <span className="text-sm font-black text-white">{bot.totalTrades.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[11px] font-black uppercase text-zinc-500">WIN_RATE</span>
                            <span className="text-sm font-black text-white">{bot.winRate.toFixed(1)}%</span>
                          </div>
                        </div>
                        <Link
                          href={`/v2/bots/${bot.id}`}
                          className="flex w-full items-center justify-center bg-white py-4 text-xs font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-[#FDB022]"
                        >
                          Analyze Bot
                        </Link>
                      </div>
                    )
                  })}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          GET STARTED IN 3 SIMPLE STEPS
          ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="border-y border-black/5 bg-white py-24">
        <div className="mx-auto max-w-[1400px] px-4 md:px-8">
          <div className="mb-16 space-y-4 text-center">
            <h3 className="font-sans text-5xl font-black uppercase tracking-tighter">Get started in 3 simple steps</h3>
            <p className="font-medium text-zinc-500">No experience required. Start copying winning trades in minutes.</p>
          </div>

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 md:grid-cols-3">
            {/* Connecting Line (Desktop Only) */}
            <div className="absolute left-0 top-1/2 hidden h-[1px] w-full -translate-y-12 bg-black/5 md:block" />

            {[
              { num: "01", icon: Wallet, title: "Connect", desc: "Link your Polymarket account securely in seconds" },
              { num: "02", icon: UserPlus, title: "Find", desc: "Browse and follow the highest performing traders" },
              { num: "03", icon: MousePointerClick, title: "Copy", desc: "Mirror their trades automatically or manually" },
            ].map((step) => (
              <div key={step.num} className="relative z-10 flex flex-col items-center space-y-6 text-center">
                <div className="relative flex h-20 w-20 items-center justify-center border border-black/5 bg-[#F9F8F1] shadow-sm">
                  <div className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center bg-[#FDB022] text-xs font-black italic text-black">
                    {step.num}
                  </div>
                  <step.icon className="h-8 w-8" strokeWidth={1.5} />
                </div>
                <div>
                  <h4 className="mb-2 font-sans text-xl font-black uppercase tracking-tight">{step.title}</h4>
                  <p className="max-w-[200px] text-sm font-medium text-zinc-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/v2/login?mode=signup"
              className="inline-flex items-center gap-2 bg-[#FDB022] px-12 py-5 text-sm font-black uppercase tracking-[0.3em] text-black shadow-xl transition-all hover:bg-black hover:text-[#FDB022]"
            >
              Sign Up Free <ArrowRight className="ml-2 inline h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          START FREE, UPGRADE WHEN READY
          ───────────────────────────────────────────────── */}
      <section id="pricing" className="bg-zinc-50 py-24">
        <div className="mx-auto max-w-[1400px] px-4 md:px-8">
          <div className="mb-16 space-y-4 text-center">
            <div className="inline-flex items-center gap-2 bg-black px-3 py-1 text-xs font-black uppercase tracking-widest text-[#FDB022]">
              SUBSCRIPTION_PLANS
            </div>
            <h3 className="font-sans text-5xl font-black uppercase tracking-tighter">Start free, upgrade when ready</h3>
            <p className="mx-auto max-w-2xl text-sm font-medium leading-relaxed text-zinc-500">
              Connect your wallet and start copy trading for free. Upgrade to Premium to unlock every bot strategy, zero trading fees, and AI-powered recommendations.
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-0 pb-12 md:grid-cols-2">
            {/* Free Tier */}
            <div className="flex flex-col border-2 border-black/5 bg-white p-8 transition-all hover:border-black">
              <div className="mb-8">
                <h4 className="mb-2 text-xs font-black uppercase tracking-[0.4em] text-[#FDB022]">Free Tier</h4>
                <div className="flex items-baseline gap-1">
                  <span className="font-sans text-5xl font-black tracking-tighter">$0</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">/ Month</span>
                </div>
              </div>
              <div className="mb-10 flex-grow space-y-4">
                {[
                  "Connect wallet & quick trade",
                  "1 Copy bot strategy",
                  "Real-time signal feed",
                  "Unlimited trader following",
                  "Portfolio & performance tracking",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center border border-black/5 text-[#10B981]">
                      <Check className="h-3 w-3" strokeWidth={4} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-tight text-zinc-600">{f}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/v2/login?mode=signup"
                className="mt-auto flex w-full items-center justify-center bg-black py-5 text-[12px] font-black uppercase tracking-[0.3em] text-white transition-all hover:bg-zinc-800"
              >
                Start For Free
              </Link>
            </div>

            {/* Premium Tier */}
            <div className="relative z-10 flex flex-col border-2 border-[#FDB022] bg-[#FDB022] p-8 shadow-2xl md:scale-105">
              <div className="mb-4 self-end bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#FDB022]">
                Popular Choice
              </div>
              <div className="mb-8">
                <h4 className="mb-2 text-xs font-black uppercase tracking-[0.4em] text-black/60">Premium</h4>
                <div className="flex items-baseline gap-1">
                  <span className="font-sans text-5xl font-black tracking-tighter">$20</span>
                  <span className="text-xs font-bold uppercase tracking-widest text-black/60">/ Month</span>
                </div>
              </div>
              <div className="mb-10 flex-grow space-y-4">
                {[
                  "Zero fees on all trades",
                  "All copy bot strategies",
                  "Auto-close positions",
                  "AI / ML trade recommendations",
                  "Priority support",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center border border-black/20 text-black">
                      <Check className="h-3 w-3" strokeWidth={4} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-tight text-black">{f}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/pricing"
                className="mt-auto flex w-full items-center justify-center bg-black py-5 text-sm font-black uppercase tracking-[0.3em] text-[#FDB022] transition-all hover:bg-zinc-900"
              >
                Upgrade to Premium
              </Link>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xl font-black uppercase tracking-tighter text-black">
              Sign Up Free - No Credit Card Required
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          CTA BANNER
          ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-black py-24 text-white">
        <div className="relative z-10 mx-auto max-w-4xl space-y-12 text-center">
          <h3 className="font-sans text-5xl font-black uppercase leading-tight tracking-tighter md:text-6xl">
            Polymarket data is noisy.<br />
            <span className="text-[#FDB022]">Polycopy is the filter.</span>
          </h3>

          <div className="grid grid-cols-1 gap-12 pt-8 text-left md:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[#10B981]">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-widest">INDUSTRIAL_SECURITY</span>
              </div>
              <p className="font-medium leading-relaxed text-zinc-400">
                Non-custodial execution. Your keys, your capital. We only provide the intelligence and automation layer for your Polymarket deployment.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-[#FDB022]">
                <Target className="h-5 w-5" />
                <span className="text-xs font-black uppercase tracking-widest">PRECISION_DATAFEED</span>
              </div>
              <p className="font-medium leading-relaxed text-zinc-400">
                We track over 50,000 Polymarket traders in real time. When a top trader makes a move, you see it instantly on your feed and can copy the trade in seconds.
              </p>
            </div>
          </div>

          <div className="pt-12">
            <Link
              href="/v2/login?mode=signup"
              className="inline-flex px-16 py-6 text-sm font-black uppercase tracking-[0.4em] text-black bg-white transition-all hover:bg-[#FDB022]"
            >
              Sign Up Now
            </Link>
          </div>
        </div>
      </section>

      <V2Footer />
      <BottomNav />
    </div>
  )
}
