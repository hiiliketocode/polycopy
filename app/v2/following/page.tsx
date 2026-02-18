"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"
import { PolycopyAvatar } from "@/components/ui/polycopy-avatar"
import { ArrowLeft, Loader2, UserMinus } from "lucide-react"

interface FollowedTrader {
  wallet: string
  displayName: string
  pnl: number
  winRate: number
  totalTrades: number
  volume: number
  roi: number
  profileImage?: string | null
}

function formatUSD(value: number): string {
  const abs = Math.abs(value)
  const sign = value >= 0 ? "+" : "-"
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

function truncateWallet(wallet: string): string {
  if (wallet.length <= 12) return wallet
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
}

function formatDisplayName(name: string, wallet: string): string {
  if (name.startsWith("0x") && name.length > 20) {
    return truncateWallet(wallet)
  }
  return name
}

export default function V2FollowingPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [traders, setTraders] = useState<FollowedTrader[]>([])
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [loadingTraders, setLoadingTraders] = useState(true)
  const [expectedCount, setExpectedCount] = useState(0)
  const [unfollowingWallet, setUnfollowingWallet] = useState<string | null>(null)

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
      setLoadingAuth(false)
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    if (!user) return

    const fetchFollowed = async () => {
      setLoadingTraders(true)
      try {
        const { data: follows, error } = await supabase
          .from("follows")
          .select("trader_wallet")
          .eq("user_id", user.id)

        if (error) throw error
        if (!follows || follows.length === 0) {
          setTraders([])
          setExpectedCount(0)
          setLoadingTraders(false)
          return
        }

        const wallets = follows.map((f) => f.trader_wallet)
        setExpectedCount(wallets.length)
        setLoadingTraders(false)

        const results = await Promise.allSettled(
          wallets.map(async (wallet) => {
            try {
              const res = await fetch(`/api/v3/trader/${wallet}/profile`)
              if (!res.ok) return null
              const data = await res.json()
              const allPerf = data.performance?.all
              const pnl = allPerf?.pnl ?? 0
              const volume = allPerf?.volume ?? 0
              return {
                wallet,
                displayName: data.profile?.displayName || wallet,
                pnl,
                winRate: data.winRate != null ? data.winRate / 100 : 0,
                totalTrades: Array.isArray(data.trades) ? data.trades.length : 0,
                volume,
                roi: volume > 0 ? (pnl / volume) * 100 : 0,
                profileImage: data.profile?.profileImage || null,
              } as FollowedTrader
            } catch {
              return null
            }
          })
        )

        const loaded = results
          .filter(
            (r): r is PromiseFulfilledResult<FollowedTrader> =>
              r.status === "fulfilled" && r.value !== null
          )
          .map((r) => r.value)

        const unique = Array.from(
          new Map(loaded.map((t) => [t.wallet.toLowerCase(), t])).values()
        ).sort((a, b) => b.pnl - a.pnl)

        setTraders(unique)
      } catch (err) {
        console.error("Error fetching followed traders:", err)
        setTraders([])
        setLoadingTraders(false)
      }
    }

    fetchFollowed()
  }, [user])

  const handleUnfollow = async (wallet: string) => {
    if (!user) return
    const walletLower = wallet.toLowerCase()
    setUnfollowingWallet(walletLower)

    try {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("user_id", user.id)
        .ilike("trader_wallet", walletLower)

      if (error) throw error

      setTraders((prev) =>
        prev.filter((t) => t.wallet.toLowerCase() !== walletLower)
      )
      setExpectedCount((prev) => Math.max(prev - 1, 0))
    } catch (err) {
      console.error("Error unfollowing trader:", err)
    } finally {
      setUnfollowingWallet(null)
    }
  }

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/v2/portfolio"
            className="flex h-10 w-10 items-center justify-center border border-border bg-poly-paper transition-colors hover:bg-poly-cream"
          >
            <ArrowLeft className="h-5 w-5 text-poly-black" />
          </Link>
          <div>
            <h1 className="font-sans text-2xl font-bold uppercase tracking-wide text-poly-black md:text-3xl">
              Following
            </h1>
            <p className="mt-0.5 font-body text-sm text-muted-foreground">
              {traders.length} {traders.length === 1 ? "trader" : "traders"} ·
              All-time performance
            </p>
          </div>
        </div>

        {/* List */}
        {loadingTraders && traders.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 border border-border bg-poly-paper p-5"
              >
                <div className="h-12 w-12 bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-200" />
                  <div className="h-3 w-24 bg-gray-200" />
                </div>
              </div>
            ))}
          </div>
        ) : expectedCount === 0 ? (
          <div className="border border-border bg-poly-paper p-12 text-center">
            <h3 className="mb-2 font-sans text-lg font-bold uppercase tracking-wide text-muted-foreground">
              No Traders Followed
            </h3>
            <p className="mb-4 font-body text-sm text-muted-foreground">
              Discover traders to follow on the Discover page.
            </p>
            <Link
              href="/v2/discover"
              className="inline-block bg-poly-black px-6 py-3 font-sans text-sm font-bold uppercase tracking-wide text-poly-cream transition-colors hover:bg-poly-black/90"
            >
              Discover Traders
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {traders.map((trader, idx) => (
              <div
                key={trader.wallet}
                className="flex items-center gap-4 border border-border bg-poly-paper p-4 transition-colors hover:bg-poly-cream/50"
              >
                {/* Rank */}
                <span className="w-6 text-center font-sans text-sm font-bold text-muted-foreground">
                  {idx + 1}
                </span>

                {/* Avatar */}
                <Link href={`/v2/trader/${trader.wallet}`}>
                  <PolycopyAvatar
                    src={trader.profileImage || undefined}
                    alt={trader.displayName}
                    className="h-10 w-10 border border-border"
                  />
                </Link>

                {/* Name + wallet */}
                <Link
                  href={`/v2/trader/${trader.wallet}`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate font-sans text-sm font-bold text-poly-black">
                    {formatDisplayName(trader.displayName, trader.wallet)}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {truncateWallet(trader.wallet)}
                  </p>
                </Link>

                {/* Stats */}
                <div className="hidden gap-6 sm:flex">
                  <div className="text-right">
                    <p
                      className={`font-body text-sm font-semibold tabular-nums ${
                        trader.pnl >= 0
                          ? "text-profit-green"
                          : "text-loss-red"
                      }`}
                    >
                      {formatUSD(trader.pnl)}
                    </p>
                    <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                      PnL
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-body text-sm font-semibold tabular-nums text-poly-black">
                      {trader.winRate}%
                    </p>
                    <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                      Win Rate
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-body text-sm font-semibold tabular-nums text-poly-black">
                      {trader.totalTrades}
                    </p>
                    <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
                      Trades
                    </p>
                  </div>
                </div>

                {/* Unfollow */}
                <button
                  onClick={() => handleUnfollow(trader.wallet)}
                  disabled={unfollowingWallet === trader.wallet.toLowerCase()}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center border border-border bg-poly-paper text-muted-foreground transition-colors hover:border-loss-red hover:text-loss-red disabled:opacity-50"
                  title="Unfollow"
                >
                  {unfollowingWallet === trader.wallet.toLowerCase() ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                </button>
              </div>
            ))}

            {/* Skeleton for still-loading traders */}
            {traders.length < expectedCount &&
              Array.from({ length: expectedCount - traders.length }).map(
                (_, i) => (
                  <div
                    key={`skel-${i}`}
                    className="flex animate-pulse items-center gap-4 border border-border bg-poly-paper p-4"
                  >
                    <span className="w-6" />
                    <div className="h-10 w-10 bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 bg-gray-200" />
                      <div className="h-3 w-20 bg-gray-200" />
                    </div>
                  </div>
                )
              )}
          </div>
        )}
      </main>

      <V2Footer />
      <BottomNav />
    </div>
  )
}
