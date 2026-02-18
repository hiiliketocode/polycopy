"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import {
  ManageBotModal,
  type BotSubscription,
} from "@/components/polycopy-v2/manage-bot-modal"
import {
  ArrowLeft,
  Loader2,
  Bot,
  TrendingUp,
  DollarSign,
  Activity,
  Pause,
  Play,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PerformanceData {
  strategy_id: string
  ft_wallet_id: string
  display_name: string
  is_active: boolean
  is_paused: boolean
  total_trades: number
  wins: number
  losses: number
  open_trades: number
  total_pnl: number
  win_rate: number
}

type TabId = "all" | "active" | "paused" | "inactive"

function formatSignedUSD(value: number): string {
  const abs = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(2)}`
}

export default function CopiedBotsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [subscriptions, setSubscriptions] = useState<BotSubscription[]>([])
  const [performanceMap, setPerformanceMap] = useState<
    Record<string, PerformanceData>
  >({})
  const [aggregate, setAggregate] = useState({
    total_trades: 0,
    wins: 0,
    losses: 0,
    total_pnl: 0,
  })
  const [activeTab, setActiveTab] = useState<TabId>("all")

  // Manage modal
  const [manageModalOpen, setManageModalOpen] = useState(false)
  const [manageTargetSub, setManageTargetSub] = useState<BotSubscription | null>(
    null
  )

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUser(data.user)
      else router.push("/v2")
    })
  }, [router])

  // Fetch data
  useEffect(() => {
    if (!user) return
    let cancelled = false

    async function fetchData() {
      setLoading(true)
      try {
        const [subRes, perfRes] = await Promise.all([
          fetch("/api/v2/bots/my-subscriptions"),
          fetch("/api/v2/bots/my-performance"),
        ])
        const [subData, perfData] = await Promise.all([
          subRes.json(),
          perfRes.json(),
        ])

        if (cancelled) return

        if (subData.success) {
          setSubscriptions(subData.subscriptions || [])
        }
        if (perfData.success) {
          const pMap: Record<string, PerformanceData> = {}
          for (const p of perfData.performance || []) {
            pMap[p.strategy_id] = p
          }
          setPerformanceMap(pMap)
          setAggregate(
            perfData.aggregate || {
              total_trades: 0,
              wins: 0,
              losses: 0,
              total_pnl: 0,
            }
          )
        }
      } catch (err) {
        console.error("Error fetching copied bots:", err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [user])

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
    { id: "inactive", label: "Inactive" },
  ]

  const filteredSubs = useMemo(() => {
    if (activeTab === "all") return subscriptions
    return subscriptions.filter((s) => {
      if (activeTab === "active") return s.is_active && !s.is_paused
      if (activeTab === "paused") return s.is_active && s.is_paused
      return !s.is_active
    })
  }, [subscriptions, activeTab])

  const activeBotCount = subscriptions.filter(
    (s) => s.is_active && !s.is_paused
  ).length
  const totalCapitalDeployed = subscriptions
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + Number(s.initial_capital || 0), 0)

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <button
            onClick={() => router.push("/v2/bots")}
            className="mb-4 inline-flex items-center gap-1.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:text-poly-black"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            BACK TO BOTS
          </button>
          <h1 className="mb-2 font-sans text-3xl font-black uppercase tracking-tight text-poly-black">
            YOUR COPIED BOTS
          </h1>
          <p className="font-body text-sm text-muted-foreground">
            Manage your active bot subscriptions and review performance.
          </p>
        </div>
      </div>

      {/* Aggregate Stats Bar */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-px bg-border sm:grid-cols-4">
          <div className="bg-card px-4 py-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Active Bots
              </p>
            </div>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-poly-black">
              {activeBotCount}
            </p>
          </div>
          <div className="bg-card px-4 py-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Capital Deployed
              </p>
            </div>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-poly-black">
              ${totalCapitalDeployed.toFixed(2)}
            </p>
          </div>
          <div className="bg-card px-4 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Total P&L
              </p>
            </div>
            <p
              className={cn(
                "mt-1 font-sans text-2xl font-bold tabular-nums",
                aggregate.total_pnl >= 0 ? "text-profit-green" : "text-loss-red"
              )}
            >
              {formatSignedUSD(aggregate.total_pnl)}
            </p>
          </div>
          <div className="bg-card px-4 py-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Total Trades
              </p>
            </div>
            <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-poly-black">
              {aggregate.total_trades}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-0 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "border-b-2 px-5 py-3 font-sans text-xs font-bold uppercase tracking-widest transition-colors",
                activeTab === tab.id
                  ? "border-poly-yellow text-poly-black"
                  : "border-transparent text-muted-foreground hover:text-poly-black"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-poly-yellow" />
            <p className="mt-3 font-body text-sm text-muted-foreground">
              Loading your bots...
            </p>
          </div>
        ) : filteredSubs.length === 0 ? (
          <div className="border border-border bg-card p-12 text-center">
            <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <h3 className="mb-1 font-sans text-sm font-bold uppercase text-poly-black">
              {activeTab === "all" || activeTab === "active"
                ? "No Copied Bots"
                : activeTab === "paused"
                  ? "No Paused Bots"
                  : "No Inactive Bots"}
            </h3>
            <p className="font-body text-sm text-muted-foreground">
              {activeTab === "all" || activeTab === "active" ? (
                <>
                  Start copying bots from the{" "}
                  <Link
                    href="/v2/bots"
                    className="font-medium text-poly-black underline-offset-2 hover:underline"
                  >
                    strategies page
                  </Link>
                  .
                </>
              ) : activeTab === "paused" ? (
                "Paused bots will appear here."
              ) : (
                "Previously cancelled subscriptions will appear here."
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredSubs.map((sub) => {
              const perf = performanceMap[sub.strategy_id]
              const available = Number(sub.available_cash) || 0
              const locked = Number(sub.locked_capital) || 0
              const total = Number(sub.initial_capital) || 0

              return (
                <div
                  key={sub.strategy_id}
                  className="border border-border bg-card"
                >
                  {/* Bot Header */}
                  <div className="flex items-start justify-between px-5 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                          {sub.display_name}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 font-sans text-[11px] font-bold uppercase tracking-widest",
                            !sub.is_active
                              ? "bg-muted text-muted-foreground"
                              : sub.is_paused
                                ? "bg-poly-yellow/20 text-poly-yellow"
                                : "bg-profit-green/20 text-profit-green"
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              !sub.is_active
                                ? "bg-muted-foreground"
                                : sub.is_paused
                                  ? "bg-poly-yellow"
                                  : "bg-profit-green"
                            )}
                          />
                          {!sub.is_active
                            ? "INACTIVE"
                            : sub.is_paused
                              ? "PAUSED"
                              : "ACTIVE"}
                        </span>
                      </div>
                      <p className="mt-0.5 font-body text-[11px] text-muted-foreground">
                        Subscribed{" "}
                        {new Date(sub.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/v2/bots/${sub.ft_wallet_id}`}
                        className="border border-border px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-poly-black hover:text-poly-black"
                      >
                        VIEW BOT
                      </Link>
                      {sub.is_active && (
                        <button
                          onClick={() => {
                            setManageTargetSub(sub)
                            setManageModalOpen(true)
                          }}
                          className="flex items-center gap-1.5 bg-poly-yellow px-3 py-2.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-colors hover:bg-poly-black hover:text-poly-yellow"
                        >
                          <Settings className="h-3 w-3" />
                          MANAGE
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Total Capital
                      </p>
                      <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-poly-black">
                        ${total.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Available
                      </p>
                      <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-profit-green">
                        ${available.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Locked
                      </p>
                      <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-poly-black">
                        ${locked.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        P&L
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 font-body text-sm font-semibold tabular-nums",
                          (perf?.total_pnl ?? 0) >= 0
                            ? "text-profit-green"
                            : "text-loss-red"
                        )}
                      >
                        {formatSignedUSD(perf?.total_pnl ?? 0)}
                      </p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Win Rate
                      </p>
                      <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-poly-black">
                        {perf?.win_rate?.toFixed(1) ?? "0.0"}%
                      </p>
                    </div>
                    <div className="bg-card px-3 py-3">
                      <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                        Trades
                      </p>
                      <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-poly-black">
                        {perf?.total_trades ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />

      {/* Manage Modal */}
      {manageTargetSub && (
        <ManageBotModal
          open={manageModalOpen}
          onOpenChange={setManageModalOpen}
          subscription={manageTargetSub}
          onUpdate={(updated) => {
            setManageTargetSub(updated)
            setSubscriptions((prev) =>
              prev.map((s) =>
                s.strategy_id === updated.strategy_id ? updated : s
              )
            )
          }}
          onUnsubscribe={(ftWalletId) => {
            setSubscriptions((prev) =>
              prev.map((s) =>
                s.ft_wallet_id === ftWalletId
                  ? { ...s, is_active: false, is_paused: false }
                  : s
              )
            )
          }}
        />
      )}
    </div>
  )
}
