"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Settings, Shield, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "./logo"
import { UpgradeModal } from "./upgrade-modal"
import { supabase } from "@/lib/supabase"

const navLinks = [
  { href: "/v2/feed", label: "FEED" },
  { href: "/v2/discover", label: "DISCOVER" },
  { href: "/v2/bots", label: "BOTS" },
  { href: "/v2/portfolio", label: "PORTFOLIO" },
]

export function TopNav() {
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

  const allLinks = isAdmin
    ? [...navLinks, { href: "/v2/signals", label: "SIGNALS" }, { href: "/v2/admin", label: "ADMIN" }]
    : navLinks

  return (
    <>
      <nav
        className="sticky top-0 z-50 hidden border-b border-border bg-card md:block"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
          {/* Horizontal wordmark */}
          <Logo variant="horizontal" size="sm" href="/v2/feed" />

          {/* Primary nav links */}
          <div className="flex items-center gap-1">
            {allLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/")
              const isAdminLink = link.href === "/v2/admin"
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3 py-2 font-sans text-sm font-semibold uppercase tracking-wide transition-all duration-150",
                    isActive
                      ? isAdminLink
                        ? "bg-poly-black text-poly-yellow"
                        : "bg-poly-yellow text-poly-black"
                      : isAdminLink
                        ? "text-poly-yellow hover:bg-poly-black/10"
                        : "text-foreground hover:bg-accent",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isAdminLink && (
                    <Shield className="mr-1 inline-block h-3.5 w-3.5" />
                  )}
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right: premium badge / upgrade + notifications + user avatar */}
          <div className="flex items-center gap-3">
            {/* Premium upgrade button (free users) or premium badge */}
            {isLoggedIn && isPremium === false && (
              <button
                type="button"
                onClick={() => setUpgradeModalOpen(true)}
                className="group flex items-center gap-1.5 bg-poly-yellow px-3 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                <Zap className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
                UPGRADE
              </button>
            )}
            {isLoggedIn && isPremium === true && (
              <div className="flex items-center gap-1.5 border border-poly-yellow/40 bg-poly-yellow/10 px-3 py-2">
                <Zap className="h-3.5 w-3.5 text-poly-yellow" />
                <span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-yellow">
                  PRO
                </span>
              </div>
            )}

            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <Link
              href="/v2/settings"
              className="flex h-11 w-11 items-center justify-center bg-poly-yellow text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
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
