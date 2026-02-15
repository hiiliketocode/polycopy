"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Users, Bot, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/v2/feed", icon: Activity, label: "FEED" },
  { href: "/v2/discover", icon: Users, label: "DISCOVER" },
  { href: "/v2/bots", icon: Bot, label: "BOTS" },
  { href: "/v2/portfolio", icon: Wallet, label: "PORTFOLIO" },
]

interface BottomNavProps {
  className?: string
}

export function BottomNav({ className }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
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
      </div>
    </nav>
  )
}
