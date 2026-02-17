"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Users, Bot, Wallet, Shield, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { UpgradeModal } from "./upgrade-modal"
import { supabase } from "@/lib/supabase"

const navItems = [
  { href: "/v2/feed", icon: Activity, label: "FEED" },
  { href: "/v2/discover", icon: Users, label: "DISCOVER" },
  { href: "/v2/bots", icon: Bot, label: "BOTS" },
  { href: "/v2/portfolio", icon: Wallet, label: "PORTFOLIO" },
]

const adminItem = { href: "/v2/admin", icon: Shield, label: "ADMIN" }

interface BottomNavProps {
  className?: string
}

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [isPremium, setIsPremium] = useState<boolean | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const checkProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || cancelled) return
        setIsLoggedIn(true)
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin, is_premium")
          .eq("id", user.id)
          .maybeSingle()
        if (cancelled) return
        if (profile?.is_admin) setIsAdmin(true)
        setIsPremium(Boolean(profile?.is_premium || profile?.is_admin))
      } catch {
        // Ignore errors
      }
    }
    checkProfile()
    return () => {
      cancelled = true
    }
  }, [])

  const allItems = isAdmin ? [...navItems, adminItem] : navItems

  return (
    <>
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden",
          className,
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-around">
          {allItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-2 transition-colors duration-150",
                  isActive ? "text-poly-yellow" : "text-muted-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon
                  className="h-5 w-5"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wide">
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* Premium upgrade button (free users) or premium badge */}
          {isLoggedIn && isPremium === false && (
            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              className="flex flex-col items-center gap-1 px-3 py-2 text-poly-yellow transition-colors duration-150"
            >
              <Zap className="h-5 w-5" strokeWidth={2.5} />
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wide">
                UPGRADE
              </span>
            </button>
          )}
          {isLoggedIn && isPremium === true && (
            <div className="flex flex-col items-center gap-1 px-3 py-2 text-poly-yellow">
              <Zap className="h-5 w-5" strokeWidth={2.5} />
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wide">
                PRO
              </span>
            </div>
          )}
        </div>
      </nav>

      {/* Upgrade Modal for free users */}
      {isLoggedIn && isPremium === false && (
        <UpgradeModal
          open={upgradeModalOpen}
          onOpenChange={setUpgradeModalOpen}
        />
      )}
    </>
  )
}
