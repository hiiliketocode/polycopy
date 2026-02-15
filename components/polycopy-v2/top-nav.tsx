"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo } from "./logo"

const navLinks = [
  { href: "/v2/feed", label: "FEED" },
  { href: "/v2/discover", label: "DISCOVER" },
  { href: "/v2/bots", label: "BOTS" },
  { href: "/v2/portfolio", label: "PORTFOLIO" },
]

export function TopNav() {
  const pathname = usePathname()

  return (
    <nav
      className="sticky top-0 z-50 hidden border-b border-border bg-card md:block"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Horizontal wordmark */}
        <Logo variant="horizontal" size="sm" href="/v2/feed" />

        {/* Primary nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(link.href + "/")
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 font-sans text-sm font-semibold uppercase tracking-wide transition-all duration-150",
                  isActive
                    ? "bg-poly-yellow text-poly-black"
                    : "text-foreground hover:bg-accent",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* Right: notifications + user avatar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
          <Link
            href="/v2/settings"
            className="flex h-8 w-8 items-center justify-center bg-poly-yellow font-sans text-xs font-black text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            aria-label="Settings"
          >
            P
          </Link>
        </div>
      </div>
    </nav>
  )
}
