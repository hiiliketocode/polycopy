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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import Image from "next/image"
import { UpgradeModal } from "@/components/polycopy/upgrade-modal"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

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

export function Navigation({ user, isPremium = false, walletAddress = null, profileImageUrl = null }: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null)
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [showUI, setShowUI] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Track previous prop values to detect when they've stabilized
  const prevPropsRef = useRef({ user, isPremium, walletAddress, profileImageUrl })
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null)

  const isLoggedIn = user !== null && user !== undefined
  const hasWalletConnected = Boolean(walletAddress)

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    await fetch('/api/auth/admin-logout', { method: 'POST' })
    router.push('/login')
  }

  // Wait for props to stabilize before showing UI
  useEffect(() => {
    if (!user) {
      setShowUI(false)
      return
    }

    // Check if props have changed
    const propsChanged = 
      prevPropsRef.current.user?.id !== user?.id ||
      prevPropsRef.current.isPremium !== isPremium ||
      prevPropsRef.current.walletAddress !== walletAddress ||
      prevPropsRef.current.profileImageUrl !== profileImageUrl

    // Update ref with current props
    prevPropsRef.current = { user, isPremium, walletAddress, profileImageUrl }

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
  }, [user, isPremium, walletAddress, profileImageUrl, showUI])

  // Resolve admin status so we can show admin links on desktop nav
  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      return
    }

    let mounted = true

    const fetchAdminFlag = async () => {
      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", user.id)
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
  }, [user])

  // Fetch wallet balance for premium users with connected wallets
  useEffect(() => {
    if (!isPremium || !walletAddress || !user) return

    const fetchBalance = async () => {
      setLoadingBalance(true)
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
        setLoadingBalance(false)
      }
    }

    fetchBalance()
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000)
    return () => clearInterval(interval)
  }, [isPremium, walletAddress, user])

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/logos/polycopy-logo-primary.svg" alt="Polycopy" width={120} height={32} className="h-8 w-auto" />
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
              href="/profile"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive("/profile")
                  ? "text-slate-900 bg-slate-100"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Profile
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
            {!isLoggedIn || !showUI ? null : isPremium && hasWalletConnected ? (
              /* Show wallet balance for premium users with connected wallet */
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    Portfolio
                  </div>
                  <div className="text-xs font-medium text-emerald-600">
                    {loadingBalance ? '...' : portfolioValue !== null ? `$${portfolioValue.toFixed(2)}` : '$0.00'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-900">
                    Cash
                  </div>
                  <div className="text-xs font-medium text-slate-600">
                    {loadingBalance ? '...' : cashBalance !== null ? `$${cashBalance.toFixed(2)}` : '$0.00'}
                  </div>
                </div>
              </div>
            ) : isPremium ? (
              /* Show Premium badge for premium users without wallet */
              <div className="px-4 py-2 rounded-lg border-2 border-yellow-400 bg-white">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold text-yellow-500">Premium</span>
                </div>
              </div>
            ) : (
              /* Show upgrade button for non-premium users */
              <Button
                onClick={() => setUpgradeModalOpen(true)}
                className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold shadow-lg shadow-yellow-400/30 border border-yellow-400/20 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Crown className="w-4 h-4 mr-2 relative z-10" />
                <span className="relative z-10">Get Premium</span>
              </Button>
            )}

            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <Avatar className="w-9 h-9 ring-2 ring-slate-200">
                      {profileImageUrl ? (
                        <AvatarImage src={profileImageUrl} alt="Profile" />
                      ) : null}
                      <AvatarFallback className={`bg-gradient-to-br ${isPremium ? 'from-yellow-400 to-yellow-500' : 'from-yellow-400 to-yellow-500'} text-slate-900 font-semibold relative`}>
                        {isPremium && (
                          <Crown className="absolute -top-1 -right-1 w-3 h-3 text-yellow-600" />
                        )}
                        {user?.email?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-2">
                    <p className="text-sm font-medium text-slate-900">{user?.email || "User"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile?tab=settings" className="cursor-pointer">
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
            <Image src="/logos/polycopy-logo-primary.svg" alt="Polycopy" width={24} height={24} className="h-6 w-6" />
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
              href="/profile"
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[64px] ${
                isActive("/profile") ? "bg-slate-100 text-[#FDB022]" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <User className={`w-5 h-5 ${isActive("/profile") ? "stroke-[2.5]" : "stroke-2"}`} />
              <span className={`text-[10px] ${isActive("/profile") ? "font-semibold" : "font-medium"}`}>Profile</span>
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
      {isLoggedIn && !isPremium && <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />}
    </>
  )
}
