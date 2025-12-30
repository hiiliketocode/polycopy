"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
import { useState } from "react"

interface NavigationProps {
  user?: { id: string; email: string } | null
  isPremium?: boolean
}

const FeedIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="4" y="7" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.9" />
    <rect x="9" y="4" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.6" />
  </svg>
)

export function Navigation({ user, isPremium = false }: NavigationProps) {
  const pathname = usePathname()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  const isLoggedIn = user !== null && user !== undefined

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/polycopy-logo-icon.png" alt="Polycopy" width={32} height={32} className="w-8 h-8" />
            <span className="text-xl font-bold text-slate-900">Polycopy</span>
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
          </div>

          {/* Right Side - User Menu or Auth Buttons */}
          <div className="flex items-center gap-4">
            {isLoggedIn && isPremium ? (
              <div className="px-4 py-2 rounded-lg border-2 border-yellow-400 bg-white">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-500" />
                  <span className="font-bold text-yellow-500">Premium</span>
                </div>
              </div>
            ) : isLoggedIn ? (
              <Button
                onClick={() => setUpgradeModalOpen(true)}
                className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold shadow-lg shadow-yellow-400/30 border border-yellow-400/20 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <Crown className="w-4 h-4 mr-2 relative z-10" />
                <span className="relative z-10">Premium</span>
              </Button>
            ) : null}

            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <Avatar className="w-9 h-9 ring-2 ring-slate-200">
                      <AvatarImage src="/default-profile.jpg" />
                      <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-semibold">
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
                    <Link href="/profile" className="cursor-pointer">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="ghost" className="text-slate-700 hover:text-slate-900">
                  Log In
                </Button>
                <Button className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-medium">Sign Up</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Top Navigation Bar */}
      <nav className="md:hidden sticky top-0 z-50 bg-white border-b border-slate-200">
        <div className="flex items-center h-14 px-4">
          {/* Logo - Left side, non-clickable branding */}
          <div className="mr-auto">
            <Image src="/polycopy-logo-lockup.svg" alt="Polycopy" width={120} height={24} className="h-6 w-auto" />
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
          </div>
        </div>
      </nav>

      {/* Upgrade Modal for free users */}
      {isLoggedIn && !isPremium && <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} />}
    </>
  )
}
