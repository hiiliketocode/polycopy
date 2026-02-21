"use client"

import React, { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Zap,
  ArrowRight,
  Bot,
  ExternalLink,
  UserPlus,
} from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Logo } from "@/components/polycopy-v2/logo"
import { TraderAvatar } from "@/components/ui/polycopy-avatar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { triggerLoggedOut } from "@/lib/auth/logout-events"
import { getOrRefreshSession } from "@/lib/auth/session"
import { useUpgrade } from "@/hooks/useUpgrade"

// --- Types ---

interface Trader {
  wallet: string
  displayName: string
  pnl: number
  roi: number
  volume: number
  rank: number
  profileImage?: string | null
}

interface BotSummary {
  id: string
  name: string
  tag: string
  description: string
  roi: string
  winRate: string
  trades: string
}

// --- Helpers ---

function formatCurrency(value: number) {
  if (Math.abs(value) >= 1000000) return `$${(Math.abs(value) / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `$${(Math.abs(value) / 1000).toFixed(1)}K`
  return `$${Math.abs(value).toFixed(0)}`
}

function formatSignedCurrency(value: number) {
  const sign = value >= 0 ? "+" : "-"
  return `${sign}${formatCurrency(value)}`
}

function getInitials(name: string) {
  if (name.startsWith("0x")) return name.slice(2, 4).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatDisplayName(name: string | null | undefined, wallet?: string): string {
  const candidate = (name ?? "").trim()
  if (!candidate || /^0x[a-fA-F0-9]{40}$/.test(candidate))
    return wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Trader"
  return candidate
}

// --- Static data ---

const FALLBACK_BOTS: BotSummary[] = [
  {
    id: "steady",
    name: "STEADY EDDIE",
    tag: "FREE",
    description: "CONSERVATIVE STRATEGY — HEAVY FAVORITES, HIGH WIN RATES",
    roi: "+12.4%",
    winRate: "78.2%",
    trades: "342",
  },
  {
    id: "balanced",
    name: "BALANCED PLAY",
    tag: "PREMIUM",
    description: "MODERATE RISK — DIVERSIFIED POSITIONS ACROSS MARKETS",
    roi: "+24.7%",
    winRate: "64.5%",
    trades: "518",
  },
  {
    id: "fullsend",
    name: "FULL SEND",
    tag: "PREMIUM",
    description: "AGGRESSIVE STRATEGY — HIGH-CONVICTION UNDERDOG PLAYS",
    roi: "+41.2%",
    winRate: "52.1%",
    trades: "891",
  },
]

const PREMIUM_FEATURES = [
  "ZERO FEES ON ALL TRADES",
  "UNLOCK ALL COPY BOT STRATEGIES",
  "AUTO-CLOSE POSITIONS WHEN COPIED TRADERS EXIT",
  "AI / ML TRADE INSIGHTS ON YOUR FEED",
  "ADVANCED PORTFOLIO ANALYTICS & RISK METRICS",
]

// --- Sub-components ---

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3 text-center md:mb-6">
      <p className="mb-1 text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 md:mb-1.5 md:text-[10px]">
        {subtitle}
      </p>
      <h2 className="font-sans text-xl font-black uppercase tracking-tight md:text-3xl">
        {title}
      </h2>
    </div>
  )
}


// --- Main Component ---

interface OnboardingFlowProps {
  isPreview?: boolean
}

export function OnboardingFlow({ isPreview = false }: OnboardingFlowProps) {
  const router = useRouter()
  const { upgrade, loading: upgradeLoading } = useUpgrade()
  const initialStep = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("step") || 0) : 0
  const [step, setStep] = useState(initialStep)
  const [selectedTraders, setSelectedTraders] = useState<string[]>([])
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [traders, setTraders] = useState<Trader[]>([])
  const [tradersLoading, setTradersLoading] = useState(true)
  const [tradersError, setTradersError] = useState<string | null>(null)
  const [bots, setBots] = useState<BotSummary[]>(FALLBACK_BOTS)
  // Auth check
  useEffect(() => {
    if (isPreview) {
      setUserId("preview-user-id")
      return
    }

    const checkAuth = async () => {
      const { session } = await getOrRefreshSession()
      if (!session?.user) {
        triggerLoggedOut("session_missing")
        router.push("/v2/login")
        return
      }
      setUserId(session.user.id)
    }
    checkAuth()
  }, [router, isPreview])

  // Fetch real traders
  useEffect(() => {
    const fetchTraders = async () => {
      setTradersLoading(true)
      setTradersError(null)
      try {
        const response = await fetch(
          "/api/polymarket/leaderboard?limit=50&orderBy=PNL&category=OVERALL&timePeriod=month"
        )
        if (!response.ok) throw new Error("Failed to fetch traders")
        const data = await response.json()
        const tradersWithROI = (data.traders || []).map((t: Trader, i: number) => ({
          ...t,
          roi: t.roi || (t.volume > 0 ? (t.pnl / t.volume) * 100 : 0),
          rank: i + 1,
        }))
        setTraders(tradersWithROI)
      } catch {
        setTradersError("Failed to load traders.")
      } finally {
        setTradersLoading(false)
      }
    }
    fetchTraders()
  }, [])

  // Fetch real bots (fallback to static)
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const res = await fetch("/api/v2/bots")
        if (!res.ok) return
        const data = await res.json()
        if (data.bots && data.bots.length >= 3) {
          const sorted = [...data.bots].sort(
            (a: any, b: any) => (b.roi ?? 0) - (a.roi ?? 0)
          )
          setBots(
            sorted.slice(0, 3).map((b: any, i: number) => ({
              id: b.id || String(i),
              name: (b.name || b.display_name || "").toUpperCase(),
              tag: b.is_premium ? "PREMIUM" : "FREE",
              description: (b.description || "Algorithmic Strategy").toUpperCase(),
              roi: `+${(b.roi ?? b.performance?.return_pct ?? 0).toFixed(1)}%`,
              winRate: `${(b.winRate ?? b.performance?.win_rate ?? 0).toFixed(1)}%`,
              trades: String(b.totalTrades ?? b.performance?.total_trades ?? 0),
            }))
          )
        }
      } catch {
        // keep fallback data
      }
    }
    fetchBots()
  }, [])


  const toggleTrader = useCallback((wallet: string) => {
    setSelectedTraders((prev) =>
      prev.includes(wallet) ? prev.filter((w) => w !== wallet) : [...prev, wallet]
    )
  }, [])

  const nextStep = () => {
    if (step < 4) setStep(step + 1)
  }

  const prevStep = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSkipFollowTop5 = async () => {
    if (!userId) return
    const top5 = traders.slice(0, 5).map((t) => t.wallet)

    if (!isPreview) {
      try {
        const follows = top5.map((wallet) => ({
          user_id: userId,
          trader_wallet: wallet.toLowerCase(),
        }))
        const { error } = await supabase.from("follows").insert(follows)
        if (error) console.error("Error auto-following:", error)
      } catch (e) {
        console.error("Skip follow error:", e)
      }
    }

    setSelectedTraders(top5)
    nextStep()
  }

  const handleGoToFeed = async () => {
    if (!userId) return
    setIsCompleting(true)

    if (isPreview) {
      await new Promise((r) => setTimeout(r, 1000))
      alert(
        `Preview Complete!\n\n` +
          `In production, this would:\n\n` +
          `1. Follow ${selectedTraders.length} traders\n` +
          `2. Mark onboarding as complete\n` +
          `3. Redirect to /v2/feed`
      )
      window.location.reload()
      return
    }

    try {
      if (selectedTraders.length > 0) {
        const follows = selectedTraders.map((wallet) => ({
          user_id: userId,
          trader_wallet: wallet.toLowerCase(),
        }))
        await supabase
          .from("follows")
          .upsert(follows, { onConflict: "user_id,trader_wallet", ignoreDuplicates: true })
      }

      await fetch("/api/onboarding/complete", { method: "POST" })
      router.push("/v2/feed")
    } catch {
      router.push("/v2/feed")
    }
  }

  const handlePremiumUpgrade = async () => {
    await upgrade()
  }

  // ────────── INLINE NAV ──────────

  const renderNav = () => {
    const showNext = step < 3
    const showSkip = step === 0
    const showBack = step > 0 && step !== 4

    return (
      <div className="flex items-center justify-between border-t border-black/5 pt-3 md:pt-4">
        <div className="flex items-center">
          {showBack ? (
            <button
              onClick={prevStep}
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest transition-colors hover:text-[#FDB022] md:gap-2 md:text-[10px]"
            >
              <ChevronLeft size={14} /> BACK
            </button>
          ) : (
            <div className="w-12 md:w-16" />
          )}
        </div>

        <div className="flex gap-1.5 md:gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1 transition-all duration-300 md:h-1.5 ${
                step === i ? "w-6 bg-[#FDB022] md:w-8" : "w-1.5 bg-zinc-200"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          {showSkip && (
            <button
              onClick={handleSkipFollowTop5}
              className="text-[8px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:text-black md:text-[10px]"
            >
              <span className="sm:hidden">SKIP</span>
              <span className="hidden sm:inline">SKIP, FOLLOW TOP 5</span>
            </button>
          )}
          {showNext ? (
            <Button
              onClick={nextStep}
              disabled={step === 0 && selectedTraders.length < 5}
              className={`h-8 rounded-none bg-[#FDB022] px-5 text-[9px] font-black uppercase tracking-widest text-black transition-all hover:bg-black hover:text-[#FDB022] md:h-10 md:px-8 md:text-[10px] ${
                step === 0 && selectedTraders.length < 5
                  ? "cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              NEXT <ChevronRight size={14} />
            </Button>
          ) : (
            <div className="w-12 md:w-16" />
          )}
        </div>
      </div>
    )
  }

  // ────────── STEP RENDERERS ──────────

  const renderTraderStep = () => (
    <div key="step-0" className="w-full">
      <StepHeader subtitle="Welcome! Let's get you set up." title="Follow 5+ Top Traders" />
      <div className="mb-3 text-center md:mb-4">
        <span
          className={`inline-block px-3 py-0.5 text-[9px] font-black uppercase tracking-widest transition-colors md:px-4 md:py-1.5 md:text-[10px] ${
            selectedTraders.length >= 5
              ? "bg-[#10B981] text-white"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {selectedTraders.length} OF 5 SELECTED
        </span>
      </div>

      {tradersLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin border-2 border-zinc-300 border-t-[#FDB022]" />
        </div>
      ) : tradersError ? (
        <div className="py-12 text-center">
          <p className="mb-2 text-sm text-red-500">{tradersError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-[10px] font-black uppercase tracking-widest text-[#FDB022] hover:underline"
          >
            TRY AGAIN
          </button>
        </div>
      ) : (
        <div
          className="no-scrollbar -mx-3 overflow-x-auto px-3 md:-mx-6 md:px-6"
        >
          <div
            className="grid auto-cols-[160px] grid-flow-col grid-rows-2 gap-2.5 md:auto-cols-[200px] md:gap-3"
          >
            {traders.slice(0, 30).map((trader) => {
              const isSelected = selectedTraders.includes(trader.wallet)
              const isPositive = trader.roi >= 0
              return (
                <div
                  key={trader.wallet}
                  className={`cursor-pointer border border-border bg-card p-3 transition hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)] md:p-4 ${
                    isSelected ? "ring-2 ring-black" : ""
                  }`}
                  onClick={() => toggleTrader(trader.wallet)}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <TraderAvatar
                      displayName={trader.displayName}
                      wallet={trader.wallet}
                      src={trader.profileImage}
                      size={28}
                      className="ring-2 ring-border md:[&]:h-9 md:[&]:w-9"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-[11px] font-bold text-foreground md:text-xs">
                        {formatDisplayName(trader.displayName, trader.wallet)}
                      </p>
                      <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground md:text-xs">
                        PnL_Growth
                      </p>
                    </div>
                  </div>

                  <p className={`mt-1 font-sans text-lg font-bold tabular-nums md:mt-2 md:text-2xl ${
                    isPositive ? "text-profit-green" : "text-loss-red"
                  }`}>
                    {isPositive ? "+" : ""}{trader.roi.toFixed(1)}%
                  </p>

                  <div className="mt-1 md:mt-2">
                    <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground md:text-[10px]">
                      Last 30 Days
                    </p>
                    <p className="font-body text-xs font-semibold tabular-nums text-foreground md:text-sm">
                      {formatSignedCurrency(trader.pnl)}
                    </p>
                  </div>

                  <div className="mt-1 flex justify-center md:mt-2">
                    <svg viewBox="0 0 160 36" className="h-7 w-28 md:h-9 md:w-40">
                      <path
                        d={isPositive
                          ? "M0 32 Q 40 32, 80 16 T 160 4"
                          : "M0 8 Q 40 8, 80 24 T 160 32"
                        }
                        fill="none"
                        stroke={isPositive ? "#10B981" : "#F04438"}
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <button
                    className={`mt-1.5 w-full py-1.5 font-sans text-[10px] font-bold uppercase tracking-wide transition md:mt-3 md:py-2.5 md:text-xs ${
                      isSelected
                        ? "bg-black text-[#FDB022]"
                        : "bg-poly-yellow text-poly-black hover:bg-poly-yellow/90"
                    }`}
                  >
                    {isSelected ? "Following" : "Follow Trader"}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  const renderTradeExplainer = () => (
    <div key="step-1" className="mx-auto my-auto max-w-2xl">
      <StepHeader subtitle="Core Mechanics" title="How to Copy Trades for Free" />
      <p className="mx-auto mb-4 max-w-lg text-center text-[11px] text-zinc-500 md:mb-6">
        Follow top traders and copy their moves manually — always free. Execute trades directly on
        the platform with Polycopy Premium.
      </p>

      <div className="mb-3 border-2 border-black bg-white p-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:mb-6 md:p-6">
        <div className="mb-3 flex items-center gap-2 md:mb-4">
          <div className="flex h-7 w-7 items-center justify-center border-2 border-black bg-[#FDB022] text-[10px] font-black">
            TW
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-tight">TRADERWIZ92</p>
            <p className="text-[8px] font-bold text-zinc-400">1H AGO</p>
          </div>
        </div>

        <div className="mb-3 flex items-center gap-2 md:mb-4">
          <div className="flex h-5 w-5 items-center justify-center border border-zinc-200 bg-zinc-100 text-[10px]">
            🏀
          </div>
          <p className="text-[11px] font-black uppercase tracking-tight">KINGS VS. CELTICS</p>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-2 md:mb-6 md:grid-cols-2 md:gap-4">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-300">OUTCOME</p>
            <p className="text-[12px] font-black">Kings</p>
          </div>
          <div className="md:text-right">
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-300">INVESTED</p>
            <p className="text-[12px] font-black">$1,678.27</p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-300">CONTRACTS</p>
            <p className="text-[12px] font-black">8,833.0</p>
          </div>
          <div className="md:text-right">
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-300">ENTRY</p>
            <p className="text-[12px] font-black">$0.19</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-3">
          <button className="flex items-center justify-center gap-1.5 border-2 border-black bg-[#FDB022] py-2.5 text-[9px] font-black uppercase tracking-widest transition-all hover:translate-y-[-1px] hover:shadow-[0_2px_0_0_rgba(0,0,0,1)] md:gap-2 md:py-3">
            <span className="flex h-3 w-3 items-center justify-center bg-black text-[7px] text-[#FDB022]">
              1
            </span>
            COPY TRADE <ExternalLink size={10} />
          </button>
          <button className="flex items-center justify-center gap-1.5 border-2 border-zinc-200 bg-white py-2.5 text-[9px] font-black uppercase tracking-widest transition-all hover:border-black md:gap-2 md:py-3">
            <span className="flex h-3 w-3 items-center justify-center bg-zinc-200 text-[7px] text-black">
              2
            </span>
            MARK COPIED
          </button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:mb-6 md:gap-3">
        <div className="relative overflow-hidden border border-white/10 bg-black p-3 text-white md:p-4">
          <h4 className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-[#FDB022] md:mb-1">STEP 1</h4>
          <p className="text-[9px] font-medium leading-snug text-zinc-400 md:leading-relaxed">
            Click &quot;Copy trade&quot; to open Polymarket and execute your trade.
          </p>
        </div>
        <div className="relative overflow-hidden border border-white/10 bg-black p-3 text-white md:p-4">
          <h4 className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-[#FDB022] md:mb-1">STEP 2</h4>
          <p className="text-[9px] font-medium leading-snug text-zinc-400 md:leading-relaxed">
            Return here, click &quot;Mark as copied&quot; and enter your trade details.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border border-[#FDB022]/30 bg-[#FDB022]/10 p-2.5 md:p-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#FDB022] md:h-8 md:w-8">
          <Zap size={14} fill="black" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-black uppercase tracking-tight">
            WANT TO TRADE DIRECTLY FROM POLYCOPY?
          </p>
          <p className="line-clamp-1 text-[9px] text-zinc-500">
            Premium members can execute trades right from the Polycopy platform.
          </p>
        </div>
      </div>
    </div>
  )

  const renderBotsStep = () => (
    <div key="step-2" className="my-auto">
      <StepHeader subtitle="Automation" title="Automate Your Alpha" />
      <p className="mx-auto mb-4 max-w-lg text-center text-[11px] text-zinc-500 md:mb-6">
        Copy trading bots execute trades automatically using proven strategies. Every account gets
        one free bot — unlock the full roster with Premium.
      </p>

      <div className="mx-auto max-w-2xl space-y-2 md:space-y-3">
        {bots.map((bot) => (
          <div
            key={bot.id}
            className="group flex cursor-pointer flex-row items-center gap-3 border border-white/10 bg-[#0F0F0F] p-3 text-white transition-colors hover:border-[#FDB022] md:gap-5 md:p-5"
          >
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/5 transition-all group-hover:border-[#FDB022]/30 group-hover:bg-[#FDB022]/10 md:flex md:h-14 md:w-14">
              <Bot size={28} className="text-zinc-500 transition-colors group-hover:text-[#FDB022]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2 md:mb-1 md:gap-3">
                <h3 className="truncate font-sans text-sm font-black tracking-tight md:text-lg">{bot.name}</h3>
                <span
                  className={`shrink-0 border px-1.5 py-0.5 text-[8px] font-black md:px-2 ${
                    bot.tag === "FREE"
                      ? "border-[#10B981] text-[#10B981]"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {bot.tag}
                </span>
              </div>
              <p className="hidden truncate text-[10px] font-bold uppercase tracking-widest text-zinc-500 md:block">
                {bot.description}
              </p>
            </div>
            <div className="flex shrink-0 gap-4 border-l border-white/10 pl-4 md:gap-8 md:pl-8">
              <div>
                <p className="mb-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-500 md:mb-1">
                  30D_ROI
                </p>
                <p className="font-sans text-[13px] font-black text-[#10B981] md:text-[14px]">{bot.roi}</p>
              </div>
              <div>
                <p className="mb-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-500 md:mb-1">
                  WIN_RATE
                </p>
                <p className="font-sans text-[13px] font-black md:text-[14px]">{bot.winRate}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderPremiumStep = () => (
    <div key="step-3" className="mx-auto my-auto w-full max-w-2xl">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-2 bg-[#FDB022] px-3 py-0.5 text-[9px] font-black uppercase tracking-widest text-black md:mb-4">
          <Zap size={12} fill="black" /> PREMIUM
        </div>
        <h2 className="mb-1 font-sans text-3xl font-black uppercase tracking-tight md:mb-2 md:text-5xl">
          WANT MORE?
        </h2>
        <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-zinc-400 md:mb-8">
          Upgrade to Polycopy Premium — $20/month
        </p>

        <div className="mb-5 w-full space-y-1.5 md:mb-8 md:space-y-2">
          {PREMIUM_FEATURES.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-3 border border-black/10 bg-white p-3 text-left md:p-4"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#FDB022] text-black">
                <Check size={12} strokeWidth={4} />
              </div>
              <span className="text-[9px] font-black uppercase leading-tight tracking-widest text-black md:text-[10px]">
                {feature}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-4 md:gap-5">
          <Button
            onClick={() => setShowPremiumModal(true)}
            className="h-12 rounded-none bg-[#FDB022] text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-black hover:text-[#FDB022] md:h-14"
          >
            GET PREMIUM <ArrowRight size={14} />
          </Button>
          <button
            onClick={nextStep}
            className="py-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 transition-colors hover:text-black"
          >
            MAYBE LATER
          </button>
        </div>
      </div>
    </div>
  )

  const renderCompleteStep = () => (
    <div key="step-4" className="my-auto flex flex-col items-center justify-center">
      <div className="relative mb-6 md:mb-8">
        <div className="flex h-20 w-20 items-center justify-center border-2 border-[#FDB022] p-1.5 md:h-24 md:w-24">
          <div className="flex h-full w-full items-center justify-center bg-[#FDB022] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <Check size={40} strokeWidth={4} className="md:hidden" />
            <Check size={48} strokeWidth={4} className="hidden md:block" />
          </div>
        </div>
      </div>

      <h2 className="mb-2 text-center font-sans text-2xl font-black uppercase tracking-tight md:mb-3 md:text-4xl">
        YOU&apos;RE ALL SET
      </h2>
      <p className="mb-6 max-w-sm text-center text-[11px] font-medium uppercase leading-relaxed tracking-tight text-zinc-500 md:mb-8">
        Your personalized feed is ready.
        <br />
        Start browsing trades and copying top performers.
      </p>

      <Button
        onClick={handleGoToFeed}
        disabled={isCompleting}
        className="group h-12 rounded-none bg-[#FDB022] px-8 text-[11px] font-black uppercase tracking-[0.3em] text-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:bg-black hover:text-[#FDB022] disabled:opacity-50 md:h-14 md:px-10"
      >
        {isCompleting ? (
          <>
            <div className="mr-2 h-4 w-4 animate-spin border-2 border-black/30 border-t-black" />
            SETTING UP...
          </>
        ) : (
          <>
            GO TO YOUR FEED{" "}
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </>
        )}
      </Button>
    </div>
  )

  const renderPremiumModal = () => (
    <AnimatePresence>
      {showPremiumModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPremiumModal(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto border border-white/10 bg-[#0F0F0F] p-6 text-white shadow-2xl md:p-10"
          >
            <button
              onClick={() => setShowPremiumModal(false)}
              className="absolute right-4 top-4 text-zinc-500 hover:text-white"
            >
              ✕
            </button>

            <div className="mb-5 text-center md:mb-8">
              <div className="mb-3 inline-flex items-center gap-2 bg-[#FDB022] px-4 py-1 text-[10px] font-black uppercase tracking-widest text-black md:mb-4">
                <Zap size={14} fill="black" /> PREMIUM
              </div>
              <h2 className="mb-1 font-sans text-2xl font-black uppercase md:mb-2 md:text-3xl">UNLOCK ALL FEATURES</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                The complete trading toolkit for serious Polymarket traders
              </p>
            </div>

            <div className="mb-5 border border-[#FDB022]/30 bg-white/5 p-5 text-center md:mb-8 md:p-8">
              <div className="font-sans text-4xl font-black md:text-5xl">
                $20<span className="text-sm text-zinc-500">/MONTH</span>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Billed monthly &bull; Cancel anytime
              </p>
            </div>

            <div className="mb-5 space-y-3 md:mb-8 md:space-y-4">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 md:mb-4">
                WHAT&apos;S INCLUDED
              </p>
              {[
                { title: "EXECUTE TRADES DIRECTLY", desc: "Copy trades in seconds with pre-filled slippage" },
                { title: "AUTO-CLOSE POSITIONS", desc: "Set trades to close when copied trader exits" },
                { title: "ADVANCED TRADE CONTROLS", desc: "Limit orders, custom slippage, and more" },
                { title: "PORTFOLIO TRACKING", desc: "Monitor your copy trading performance" },
                { title: "EARLY ACCESS", desc: "Get new features before everyone else" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 md:gap-4">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-[#FDB022] text-black">
                    <Check size={12} strokeWidth={4} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-tight">{item.title}</p>
                    <p className="text-[9px] text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              onClick={handlePremiumUpgrade}
              disabled={upgradeLoading}
              className="h-12 w-full rounded-none bg-[#FDB022] text-xs font-black uppercase tracking-[0.2em] text-black hover:bg-white hover:text-black disabled:opacity-50 md:h-14"
            >
              {upgradeLoading ? "LOADING..." : (
                <>
                  UPGRADE NOW <ArrowRight size={16} />
                </>
              )}
            </Button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  // ────────── Collect steps ──────────

  const steps = [
    renderTraderStep,
    renderTradeExplainer,
    renderBotsStep,
    renderPremiumStep,
    renderCompleteStep,
  ]

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`,
        }}
      />

      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 99999,
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          overflow: 'hidden',
          background: '#F9F8F1',
        }}
      >
        {/* Header */}
        <header className="flex justify-center border-b border-black/5 bg-[#F9F8F1] py-1 md:py-4">
          <div className="flex items-center justify-center">
            <span className="md:hidden [&_img]:!h-[50px] [&_img]:!w-auto"><Logo variant="poster" size="xs" /></span>
            <span className="hidden md:inline-flex [&_img]:!h-[60px] [&_img]:!w-auto"><Logo variant="poster" size="sm" /></span>
          </div>
        </header>

        {/* Main Content */}
        <main
          style={{ minHeight: 0, overflowY: 'auto' }}
          className="no-scrollbar flex w-full flex-col items-center justify-center px-3 pt-2 md:p-6"
        >
          <div className="mx-auto w-full max-w-5xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                {steps[step]()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        {/* Nav */}
        <div className="border-t border-black/5 bg-[#F9F8F1] px-3 pb-3 pt-2 md:px-6 md:pb-6">
          <div className="mx-auto w-full max-w-5xl">
            {renderNav()}
          </div>
        </div>
      </div>

      {/* Premium Modal */}
      {renderPremiumModal()}
    </>
  )
}
