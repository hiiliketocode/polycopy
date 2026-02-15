"use client"

import React, { useRef, useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Bell,
  BellOff,
  ArrowRight,
  BookOpen,
  HelpCircle,
  LogOut,
  Wallet,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"
import { supabase, ensureProfile } from "@/lib/supabase"
import { useAuthState } from "@/lib/auth/useAuthState"
import { resolveFeatureTier, tierHasPremiumAccess } from "@/lib/feature-tier"
import { UpgradeModal } from "@/components/polycopy/upgrade-modal"
import { CancelSubscriptionModal } from "@/components/polycopy/cancel-subscription-modal"
import { triggerLoggedOut } from "@/lib/auth/logout-events"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const SLIPPAGE_PRESETS = [0, 1, 3, 5]

export default function V2SettingsPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [isPremium, setIsPremium] = useState(false)

  const { user, loading } = useAuthState({
    requireAuth: true,
    onAuthComplete: async (authUser) => {
      if (authUser) await ensureProfile(authUser.id, authUser.email!)
    },
  })

  const featureTier = resolveFeatureTier(Boolean(user), profile)
  const hasPremiumAccess = tierHasPremiumAccess(featureTier)
  const walletAddress = profile?.trading_wallet_address || null

  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [disconnectingWallet, setDisconnectingWallet] = useState(false)
  const [showDisconnectSuccess, setShowDisconnectSuccess] = useState(false)

  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [loadingNotificationPrefs, setLoadingNotificationPrefs] = useState(false)
  const [defaultBuySlippage, setDefaultBuySlippage] = useState<number>(3)
  const [defaultSellSlippage, setDefaultSellSlippage] = useState<number>(3)

  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const hasLoadedNotificationPrefsRef = useRef(false)

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    await fetch("/api/auth/admin-logout", { method: "POST" })
    triggerLoggedOut("signed_out")
    router.push("/login")
  }

  // Fetch profile
  useEffect(() => {
    if (!user) {
      setProfile(null)
      setIsPremium(false)
      return
    }
    let mounted = true
    const fetchProfile = async () => {
      try {
        const [profileRes, walletRes] = await Promise.all([
          supabase.from("profiles").select("is_premium, is_admin, profile_image_url").eq("id", user.id).single(),
          supabase.from("turnkey_wallets").select("polymarket_account_address, eoa_address").eq("user_id", user.id).maybeSingle(),
        ])
        if (!mounted) return
        if (profileRes.error) { setIsPremium(false); return }
        setIsPremium(Boolean(profileRes.data?.is_premium || profileRes.data?.is_admin))
        setProfile({
          ...profileRes.data,
          trading_wallet_address: walletRes.data?.polymarket_account_address || walletRes.data?.eoa_address || null,
        })
      } catch (err) {
        console.error("Error fetching profile:", err)
      }
    }
    fetchProfile()
    return () => { mounted = false }
  }, [user])

  // Fetch notification prefs
  useEffect(() => {
    if (!user || hasLoadedNotificationPrefsRef.current) return
    hasLoadedNotificationPrefsRef.current = true
    const fetchPrefs = async () => {
      setLoadingNotificationPrefs(true)
      try {
        const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle()
        if (data) {
          setNotificationsEnabled(data.trader_closes_position || false)
          setDefaultBuySlippage(data.default_buy_slippage ?? 3)
          setDefaultSellSlippage(data.default_sell_slippage ?? 3)
        }
      } catch (err) {
        console.error("Error fetching notification prefs:", err)
      } finally {
        setLoadingNotificationPrefs(false)
      }
    }
    fetchPrefs()
  }, [user])

  const handleToggleNotifications = async () => {
    if (!user) return
    const newValue = !notificationsEnabled
    setNotificationsEnabled(newValue)
    try {
      const { error } = await supabase.from("notification_preferences").upsert(
        { user_id: user.id, trader_closes_position: newValue, market_resolves: newValue },
        { onConflict: "user_id" },
      )
      if (error) throw error
      showToastMsg(`Notifications ${newValue ? "enabled" : "disabled"}`)
    } catch {
      setNotificationsEnabled(!newValue)
    }
  }

  const handleUpdateSlippage = async (type: "buy" | "sell", value: number) => {
    if (!user) return
    const validated = Math.max(0, Math.min(100, value))
    const prevBuy = defaultBuySlippage
    const prevSell = defaultSellSlippage
    if (type === "buy") setDefaultBuySlippage(validated)
    else setDefaultSellSlippage(validated)

    const payload = {
      userId: user.id,
      default_buy_slippage: type === "buy" ? validated : defaultBuySlippage,
      default_sell_slippage: type === "sell" ? validated : defaultSellSlippage,
    }
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Failed")
      const updated = await res.json()
      if (typeof updated?.default_buy_slippage === "number") setDefaultBuySlippage(updated.default_buy_slippage)
      if (typeof updated?.default_sell_slippage === "number") setDefaultSellSlippage(updated.default_sell_slippage)
      showToastMsg(`Default ${type} slippage: ${validated}%`)
    } catch {
      try {
        await supabase.from("notification_preferences").upsert(
          { user_id: user.id, default_buy_slippage: payload.default_buy_slippage, default_sell_slippage: payload.default_sell_slippage },
          { onConflict: "user_id" },
        )
        showToastMsg(`Default ${type} slippage: ${validated}%`)
      } catch {
        setDefaultBuySlippage(prevBuy)
        setDefaultSellSlippage(prevSell)
      }
    }
  }

  const handleWalletDisconnect = async () => {
    if (!user || !walletAddress) return
    setDisconnectingWallet(true)
    try {
      const { error } = await supabase.from("turnkey_wallets").delete().eq("user_id", user.id)
      if (error) throw error
      setProfile({ ...profile, trading_wallet_address: null })
      setShowDisconnectModal(false)
      setShowDisconnectSuccess(true)
    } catch (err) {
      console.error("Error disconnecting wallet:", err)
    } finally {
      setDisconnectingWallet(false)
    }
  }

  const showToastMsg = (msg: string) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-poly-cream">
        <TopNav />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin border-2 border-poly-yellow border-t-transparent" />
            <p className="font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground">LOADING...</p>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        {/* Page header */}
        <div className="mb-10">
          <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">ACCOUNT_SETTINGS</p>
          <h1 className="font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">SETTINGS</h1>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            Manage notifications, trading defaults, and membership in one place.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* ───────── Left column ───────── */}
          <div className="flex flex-col gap-6">

            {/* Notifications */}
            <section className="border border-border bg-card p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">NOTIFICATIONS</h2>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    Get a heads-up when traders close positions.
                  </p>
                </div>
                <button
                  onClick={handleToggleNotifications}
                  disabled={loadingNotificationPrefs}
                  className={cn(
                    "px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                    notificationsEnabled
                      ? "bg-poly-black text-white hover:bg-poly-black/80"
                      : "border border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {notificationsEnabled ? "ENABLED" : "DISABLED"}
                </button>
              </div>
              <div className="flex items-center gap-3 border border-border bg-poly-paper p-4">
                {notificationsEnabled ? (
                  <Bell className="h-5 w-5 text-foreground" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">EMAIL UPDATES</p>
                  <p className="font-body text-[11px] text-muted-foreground">Alerts for closes and resolved markets.</p>
                </div>
              </div>
            </section>

            {/* Trading Defaults */}
            <section className="border border-border bg-card p-6">
              <h2 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">TRADING DEFAULTS</h2>
              <p className="mt-1 mb-5 font-body text-xs text-muted-foreground">
                Tune your default slippage for faster fills.
              </p>

              {hasPremiumAccess ? (
                <div className="flex flex-col gap-4">
                  {/* Buy slippage */}
                  <div className="border border-border bg-poly-paper p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">BUY ORDERS</p>
                      <span className="font-sans text-xs font-bold tabular-nums text-poly-black">{defaultBuySlippage}%</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SLIPPAGE_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleUpdateSlippage("buy", v)}
                          className={cn(
                            "px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                            defaultBuySlippage === v
                              ? "bg-poly-black text-white"
                              : "border border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sell slippage */}
                  <div className="border border-border bg-poly-paper p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">SELL ORDERS</p>
                      <span className="font-sans text-xs font-bold tabular-nums text-poly-black">{defaultSellSlippage}%</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {SLIPPAGE_PRESETS.map((v) => (
                        <button
                          key={v}
                          onClick={() => handleUpdateSlippage("sell", v)}
                          className={cn(
                            "px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-widest transition-all",
                            defaultSellSlippage === v
                              ? "bg-poly-black text-white"
                              : "border border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="font-body text-[11px] text-muted-foreground">
                    Higher slippage increases fill rate but may result in worse prices.
                  </p>
                </div>
              ) : (
                <div className="border border-border bg-poly-paper p-5">
                  <p className="mb-4 font-body text-xs text-muted-foreground">
                    Upgrade to Premium to customize trading defaults and unlock zero-fee copy trading.
                  </p>
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="inline-flex items-center gap-2 bg-poly-yellow px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                  >
                    UPGRADE TO PREMIUM <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </section>

            {/* Membership & Wallet */}
            <section className="border border-border bg-card p-6">
              <h2 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">MEMBERSHIP & WALLET</h2>
              <p className="mt-1 mb-5 font-body text-xs text-muted-foreground">
                Keep your subscription and wallet details in sync.
              </p>

              {/* Membership status */}
              {hasPremiumAccess ? (
                <div className="mb-4 border border-poly-yellow bg-poly-yellow/10 p-4">
                  <div className="flex items-center gap-2">
                    <span className="badge-premium">PREMIUM</span>
                    <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">ACTIVE MEMBER</p>
                  </div>
                  <p className="mt-1 font-body text-xs text-muted-foreground">
                    You have access to all premium features including zero-fee copy trading.
                  </p>
                </div>
              ) : (
                <div className="mb-4 border border-border bg-poly-paper p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="badge-free">FREE</span>
                    <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">CURRENT PLAN</p>
                  </div>
                  <p className="mb-3 font-body text-xs text-muted-foreground">
                    Unlock all bot strategies, zero trading fees, and AI recommendations.
                  </p>
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="inline-flex items-center gap-2 bg-poly-yellow px-5 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
                  >
                    UPGRADE TO PREMIUM <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Wallet */}
              <div className="border border-border bg-poly-paper p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">WALLET CONNECTION</p>
                    <p className="mt-1 font-body text-xs text-muted-foreground">
                      {walletAddress ? `Connected: ${truncateAddress(walletAddress)}` : "No wallet connected yet."}
                    </p>
                  </div>
                  {walletAddress ? (
                    <button
                      onClick={() => setShowDisconnectModal(true)}
                      className="px-4 py-2 border border-loss-red/30 font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red transition-all hover:bg-loss-red hover:text-white"
                    >
                      REMOVE
                    </button>
                  ) : (
                    <Link
                      href="/portfolio/connect-wallet"
                      className="inline-flex items-center gap-1 bg-poly-black px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-poly-yellow hover:text-poly-black"
                    >
                      CONNECT <Wallet className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>

              {/* Cancel subscription */}
              {hasPremiumAccess && (
                <div className="mt-4 border border-border bg-poly-paper p-4">
                  <p className="mb-3 font-body text-xs text-muted-foreground">
                    Need to cancel? You&rsquo;ll keep access until the end of your billing period.
                  </p>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="px-4 py-2 border border-loss-red/30 font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red transition-all hover:bg-loss-red hover:text-white"
                  >
                    CANCEL SUBSCRIPTION
                  </button>
                </div>
              )}
            </section>
          </div>

          {/* ───────── Right column ───────── */}
          <div className="flex flex-col gap-6">
            {/* User card */}
            <div className="border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center bg-poly-yellow font-sans text-xs font-black text-poly-black">
                  {(user?.email || "U")[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SIGNED IN AS</p>
                  <p className="truncate font-sans text-sm font-bold text-poly-black">{user?.email || "User"}</p>
                </div>
              </div>
              <div className="mb-4 flex flex-col gap-2.5 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MEMBERSHIP</span>
                  <span className={hasPremiumAccess ? "badge-premium" : "badge-free"}>
                    {hasPremiumAccess ? "PREMIUM" : "FREE"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">WALLET</span>
                  <span className="font-sans text-[11px] font-bold uppercase tabular-nums text-poly-black">
                    {walletAddress ? truncateAddress(walletAddress) : "NOT CONNECTED"}
                  </span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 border border-loss-red/30 py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red transition-all hover:bg-loss-red hover:text-white"
              >
                <LogOut className="h-3 w-3" /> SIGN OUT
              </button>
            </div>

            {/* Help & Guides */}
            <div className="border border-border bg-card p-6">
              <h2 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">HELP & GUIDES</h2>
              <p className="mb-4 font-body text-xs text-muted-foreground">
                Quick answers and setup steps when you need them.
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href="/faq"
                  className="group flex items-center justify-between border border-border bg-poly-paper p-3 transition-all hover:border-poly-yellow"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    <div>
                      <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">FAQ</p>
                      <p className="font-body text-[10px] text-muted-foreground">Common questions answered.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
                <Link
                  href="/trading-setup"
                  className="group flex items-center justify-between border border-border bg-poly-paper p-3 transition-all hover:border-poly-yellow"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    <div>
                      <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">SETUP GUIDE</p>
                      <p className="font-body text-[10px] text-muted-foreground">Step-by-step trading setup.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ───── Modals ───── */}
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />

      <CancelSubscriptionModal
        open={showCancelModal}
        onOpenChange={setShowCancelModal}
        onConfirmCancel={async () => {
          const response = await fetch("/api/stripe/cancel-subscription", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          })
          const data = await response.json()
          if (response.ok) {
            const accessUntil = new Date(data.current_period_end * 1000).toLocaleDateString()
            alert(`Subscription canceled. Premium access until ${accessUntil}.`)
            window.location.reload()
          } else {
            throw new Error(data.error || "Failed to cancel subscription")
          }
        }}
      />

      {/* Disconnect wallet confirmation */}
      <Dialog open={showDisconnectModal} onOpenChange={setShowDisconnectModal}>
        <DialogContent className="max-w-[480px] gap-0 border-0 bg-poly-cream p-0 overflow-hidden">
          <DialogTitle className="sr-only">Remove wallet</DialogTitle>
          <div className="bg-loss-red px-8 py-6">
            <h2 className="font-sans text-xl font-black uppercase tracking-tight text-white">REMOVE WALLET?</h2>
            <p className="mt-1 font-body text-sm text-white/80">
              This will remove your connected Polymarket wallet from Polycopy.
            </p>
          </div>
          <div className="px-8 py-6">
            <div className="mb-5 border border-loss-red/20 bg-loss-red/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-loss-red" />
                <p className="font-sans text-xs font-bold uppercase tracking-wide text-loss-red">WARNING</p>
              </div>
              <ul className="flex flex-col gap-1 font-body text-xs text-muted-foreground">
                <li>You will lose access to automated trade execution</li>
                <li>Your private key will be removed from secure storage</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                className="flex-1 border border-border py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-foreground transition-all hover:bg-accent"
              >
                CANCEL
              </button>
              <button
                onClick={handleWalletDisconnect}
                disabled={disconnectingWallet}
                className="flex-1 bg-loss-red py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-loss-red/80 disabled:opacity-50"
              >
                {disconnectingWallet ? "REMOVING..." : "REMOVE WALLET"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disconnect success */}
      <Dialog open={showDisconnectSuccess} onOpenChange={setShowDisconnectSuccess}>
        <DialogContent className="max-w-[480px] gap-0 border-0 bg-poly-cream p-0 overflow-hidden">
          <DialogTitle className="sr-only">Wallet removed</DialogTitle>
          <div className="px-8 py-8 text-center">
            <h2 className="mb-2 font-sans text-xl font-black uppercase tracking-tight text-poly-black">WALLET REMOVED</h2>
            <p className="mb-6 font-body text-sm text-muted-foreground">
              Your Polymarket wallet is no longer connected. You can reconnect anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectSuccess(false)}
                className="flex-1 border border-border py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-foreground transition-all hover:bg-accent"
              >
                DONE
              </button>
              <Link
                href="/portfolio/connect-wallet"
                className="flex flex-1 items-center justify-center bg-poly-black py-2.5 font-sans text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                RECONNECT
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-poly-black px-5 py-3 font-sans text-[10px] font-bold uppercase tracking-widest text-white shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
