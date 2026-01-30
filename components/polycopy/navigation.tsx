"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Compass, User, LogOut, Settings, Home, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"
import { UpgradeModal } from "@/components/polycopy/upgrade-modal"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { triggerLoggedOut } from "@/lib/auth/logout-events"

interface NavigationProps {
  user?: { id: string; email: string } | null
  isPremium?: boolean
  walletAddress?: string | null
  profileImageUrl?: string | null
}

const FeedIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="7" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.9" />
    <rect x="9" y="4" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.6" />
  </svg>
)

const LOW_BALANCE_TOOLTIP =
  "Quick trades use your Polymarket USDC balance. Add funds before retrying this order."

const usdFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatUsd = (value: number) => `$${usdFormatter.format(value)}`

export function Navigation({ user, isPremium = false, walletAddress = null, profileImageUrl = null }: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null)
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [initialBalanceLoad, setInitialBalanceLoad] = useState(true)
  const [showUI, setShowUI] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [premiumStatus, setPremiumStatus] = useState<boolean | null>(isPremium ? true : null)
  const [resolvedUser, setResolvedUser] = useState<NavigationProps["user"]>(user)
  
  const activeUser = user === undefined ? resolvedUser : user

  // Track previous prop values to detect when they've stabilized
  const prevPropsRef = useRef({ user: activeUser, isPremium, walletAddress, profileImageUrl })
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null)

  const isLoggedIn = activeUser !== null && activeUser !== undefined
  const hasWalletConnected = Boolean(walletAddress)
  const hasPremiumAccess = premiumStatus ?? isPremium
  const premiumCacheKey = activeUser?.id ? `polycopy:premium-status:${activeUser.id}` : null
  const showLowBalanceCallout =
    hasPremiumAccess &&
    hasWalletConnected &&
    !initialBalanceLoad &&
    typeof cashBalance === "number" &&
    cashBalance < 1

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await fetch('/api/auth/admin-logout', { method: 'POST' })
    triggerLoggedOut('signed_out')
    router.push('/login')
  }

  useEffect(() => {
    if (user !== undefined) {
      setResolvedUser(user)
    }
  }, [user])

  useEffect(() => {
    if (user !== undefined) return

    let mounted = true

    const loadUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (mounted) {
          setResolvedUser(authUser ? { id: authUser.id, email: authUser.email || "" } : null)
        }
      } catch {
        if (mounted) {
          setResolvedUser(null)
        }
      }
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const sessionUser = session?.user
      setResolvedUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email || "" } : null)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [user])

  // Wait for props to stabilize before showing UI
  useEffect(() => {
    if (!activeUser) {
      setShowUI(false)
      return
    }

    // Check if props have changed
    const propsChanged = 
      prevPropsRef.current.user?.id !== activeUser?.id ||
      prevPropsRef.current.isPremium !== isPremium ||
      prevPropsRef.current.walletAddress !== walletAddress ||
      prevPropsRef.current.profileImageUrl !== profileImageUrl

    // Update ref with current props
    prevPropsRef.current = { user: activeUser, isPremium, walletAddress, profileImageUrl }

    // Clear any existing timer
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current)
    }

    // If props changed, hide UI and wait for stability
    if (propsChanged) {
      setShowUI(false)
      
      // Show UI after props have been stable for 150ms
      stabilityTimerRef.current = setTimeout(() => {
        setShowUI(true)
      }, 150)
    } else if (!showUI) {
      // Props are already stable, show immediately
      setShowUI(true)
    }

    return () => {
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current)
      }
    }
  }, [activeUser, isPremium, walletAddress, profileImageUrl, showUI])

  // Resolve admin status so we can show admin links on desktop nav
  useEffect(() => {
    if (!activeUser) {
      setIsAdmin(false)
      return
    }

    let mounted = true

    const fetchAdminFlag = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", activeUser.id)
          .maybeSingle()

        if (!mounted) return
        setIsAdmin(Boolean(profile?.is_admin && !error))
      } catch (err) {
        console.error("[Navigation] failed to load admin flag", err)
        if (mounted) {
          setIsAdmin(false)
        }
      }
    }

    fetchAdminFlag()

    return () => {
      mounted = false
    }
  }, [activeUser])

  // Resolve premium status to prevent upsell flashes for premium users
  useEffect(() => {
    if (!activeUser) {
      setPremiumStatus(null)
      return
    }

    setPremiumStatus(isPremium ? true : null)

    if (isPremium) {
      setPremiumStatus(true)
      if (premiumCacheKey) {
        try {
          localStorage.setItem(premiumCacheKey, "true")
        } catch {
          // Ignore storage errors in restricted environments
        }
      }
      return
    }

    if (premiumCacheKey) {
      try {
        const cached = localStorage.getItem(premiumCacheKey)
        if (cached === "true") {
          setPremiumStatus(true)
        }
      } catch {
        // Ignore storage errors in restricted environments
      }
    }

    let mounted = true

    const fetchPremiumFlag = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("is_premium, is_admin")
          .eq("id", activeUser.id)
          .maybeSingle()

        if (!mounted) return
        const resolvedPremium = Boolean((profile?.is_premium || profile?.is_admin) && !error)
        setPremiumStatus(resolvedPremium)
        if (premiumCacheKey) {
          try {
            localStorage.setItem(premiumCacheKey, resolvedPremium ? "true" : "false")
          } catch {
            // Ignore storage errors in restricted environments
          }
        }
      } catch (err) {
        if (mounted) {
          console.error("[Navigation] failed to load premium status", err)
          setPremiumStatus(false)
        }
      }
    }

    fetchPremiumFlag()

    return () => {
      mounted = false
    }
  }, [activeUser, isPremium, premiumCacheKey])

  // Fetch wallet balance for premium users with connected wallets
  useEffect(() => {
    if (!hasPremiumAccess || !walletAddress || !activeUser) return

    const fetchBalance = async () => {
      try {
        if (!walletAddress?.trim()) return
        // Use the public Polymarket API endpoint
        const response = await fetch(`/api/polymarket/wallet/${walletAddress}`)

        if (response.ok) {
          const data = await response.json()
          console.log('Wallet data received:', data)

          setCashBalance(data.cashBalance || 0)
          setPortfolioValue(data.portfolioValue || 0)
        } else {
          console.warn('Failed to fetch wallet balance:', response.status)
          const errorData = await response.json().catch(() => ({}))
          console.warn('Error details:', errorData)
        }
      } catch {
        console.warn('Wallet balance unavailable (network error).')
      } finally {
        // Only set initialBalanceLoad to false after the first load
        if (initialBalanceLoad) {
          setInitialBalanceLoad(false)
        }
      }
    }

    fetchBalance()
    // Refresh balance every minute
    const interval = setInterval(() => fetchBalance(), 60000)
    return () => clearInterval(interval)
  }, [hasPremiumAccess, walletAddress, activeUser, initialBalanceLoad])

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/logos/polycopy-logo-primary.svg" alt="Polycopy" width={120} height={32} priority className="h-8 w-auto" style={{ width: 'auto' }} />
          </Link>

          {/* Center Navigation Links */}
          <div className="flex items-center gap-1">
            <Link
              href="/feed"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive("/feed")
                  ? "text-slate-900 bg-slate-100"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Feed
            </Link>
            <Link
              href="/discover"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive("/discover")
                  ? "text-slate-900 bg-slate-100"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Discover
            </Link>
            <Link
              href="/portfolio"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive("/portfolio")
                  ? "text-slate-900 bg-slate-100"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Portfolio
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/admin/auto-copy"
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive("/admin/auto-copy")
                      ? "text-slate-900 bg-slate-100"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  Auto Copy
                </Link>
                <Link
                  href="/admin/users"
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isActive("/admin/users")
                      ? "text-slate-900 bg-slate-100"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  Admin
                </Link>
              </>
            )}
          </div>

          {/* Right Side - User Menu or Auth Buttons */}
          <div className="flex items-center gap-4">
            {!isLoggedIn || !showUI ? null : hasPremiumAccess && hasWalletConnected ? (
              /* Show wallet balance for premium users with connected wallet */
              <a
                href="https://polymarket.com/portfolio"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 rounded-full bg-slate-100 px-3 py-2 transition-colors hover:bg-slate-200"
              >
                <span className="text-xs font-semibold leading-tight text-slate-600">
                  <span className="block">Polymarket</span>
                  <span className="block">Account</span>
                </span>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-sm font-semibold text-slate-900">
                      Portfolio
                    </div>
                    <div className="text-xs font-medium text-emerald-600">
                      {initialBalanceLoad ? "..." : portfolioValue !== null ? formatUsd(portfolioValue) : "$0.00"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-sm font-semibold text-slate-900">
                      <span>Cash</span>
                      {showLowBalanceCallout && (
                        <TooltipProvider>
                          <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-600"
                              aria-label="Low cash balance"
                            >
                              !
                            </span>
                          </TooltipTrigger>
                            <TooltipContent className="max-w-[220px]">
                              <p>{LOW_BALANCE_TOOLTIP}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <div className="text-xs font-medium text-slate-600">
                      {initialBalanceLoad ? "..." : cashBalance !== null ? formatUsd(cashBalance) : "$0.00"}
                    </div>
                  </div>
                </div>
              </a>
            ) : hasPremiumAccess ? (
              /* Show Premium badge for premium users without wallet */
              <div className="px-4 py-2 rounded-lg border-2 border-yellow-400 bg-white">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold text-yellow-500">Premium</span>
                </div>
              </div>
            ) : premiumStatus === false ? (
              /* Show upgrade button for non-premium users */
              <Button
                onClick={() => setUpgradeModalOpen(true)}
                className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold shadow-lg shadow-yellow-400/30 border border-yellow-400/20 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Crown className="w-4 h-4 mr-2 relative z-10" />
                <span className="relative z-10">Get Premium</span>
              </Button>
            ) : (
              <div className="h-10 w-[164px]" aria-hidden />
            )}

            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity" aria-label="Open account menu">
                    <Avatar className="w-9 h-9 ring-2 ring-slate-200">
                      {profileImageUrl ? (
                        <AvatarImage src={profileImageUrl} alt="Account" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-semibold relative">
                        {hasPremiumAccess && (
                          <Crown className="absolute -top-1 -right-1 w-3 h-3 text-yellow-600" />
                        )}
                        {activeUser?.email?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="flex items-center gap-3 px-3 py-3">
                    <Avatar className="h-9 w-9 ring-2 ring-slate-100">
                      {profileImageUrl ? (
                        <AvatarImage src={profileImageUrl} alt="Account" />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-semibold relative">
                        {hasPremiumAccess && (
                          <Crown className="absolute -top-1 -right-1 w-3 h-3 text-yellow-600" />
                        )}
                        {activeUser?.email?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-slate-600">Account</p>
                      <p className="text-sm font-medium text-slate-900">{activeUser?.email || "User"}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-700 hover:text-slate-900" asChild>
                  <Link href="/login">Log In</Link>
                </Button>
                <Button className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-medium" asChild>
                  <Link href="/login?mode=signup">Sign Up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Top Navigation Bar - Only show on login/signup pages, otherwise use BottomNav */}
      {(pathname === '/login' || pathname?.startsWith('/login?')) && (
        <nav className="md:hidden sticky top-0 z-50 bg-white border-b border-slate-200">
          <div className="flex items-center h-14 px-4">
          {/* Logo - Left side, non-clickable branding */}
          <div className="mr-auto">
            <Image src="/logos/polycopy-logo-primary.svg" alt="Polycopy" width={105} height={28} className="h-7 w-auto" />
          </div>

          {/* Navigation Buttons - Right side with button-like styling */}
          <div className="flex items-center gap-1">
            <Link
              href="/feed"
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] ${
                isActive("/feed") ? "bg-slate-100 text-[#FDB022]" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Home className={`w-5 h-5 ${isActive("/feed") ? "stroke-[2.5]" : "stroke-2"}`} />
              <span className={`text-[10px] ${isActive("/feed") ? "font-semibold" : "font-medium"}`}>Feed</span>
            </Link>

            <Link
              href="/discover"
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] ${
                isActive("/discover") ? "bg-slate-100 text-[#FDB022]" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Compass className={`w-5 h-5 ${isActive("/discover") ? "stroke-[2.5]" : "stroke-2"}`} />
              <span className={`text-[10px] ${isActive("/discover") ? "font-semibold" : "font-medium"}`}>Discover</span>
            </Link>

            <Link
              href="/portfolio"
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] ${
                isActive("/portfolio") ? "bg-slate-100 text-[#FDB022]" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <User className={`w-5 h-5 ${isActive("/portfolio") ? "stroke-[2.5]" : "stroke-2"}`} />
              <span className={`text-[10px] ${isActive("/portfolio") ? "font-semibold" : "font-medium"}`}>Portfolio</span>
            </Link>
            {isAdmin && (
              <Link
                href="/admin/auto-copy"
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] ${
                  isActive("/admin/auto-copy") ? "bg-slate-100 text-[#FDB022]" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Settings className={`w-5 h-5 ${isActive("/admin/auto-copy") ? "stroke-[2.5]" : "stroke-2"}`} />
                <span className={`text-[10px] ${isActive("/admin/auto-copy") ? "font-semibold" : "font-medium"}`}>Auto Copy</span>
              </Link>
            )}
          </div>
        </div>
      </nav>
      )}

      {/* Upgrade Modal for free users */}
      {isLoggedIn && premiumStatus === false && <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />}
    </>
  )
}
