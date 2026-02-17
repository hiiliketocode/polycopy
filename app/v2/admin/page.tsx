"use client"

import Link from "next/link"
import {
  Users,
  BarChart3,
  Bot,
  FileText,
  TrendingUp,
  Settings2,
  Activity,
  Shield,
} from "lucide-react"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { V2Footer } from "@/components/polycopy-v2/footer"

const adminTools = [
  {
    href: "/v2/admin/trading",
    icon: Bot,
    title: "TRADING DASHBOARD",
    description:
      "Manage FT/LT bot strategies, monitor live performance, and configure trading parameters.",
  },
  {
    href: "/v2/admin/users",
    icon: Users,
    title: "USER MANAGEMENT",
    description:
      "View user directory, trade activity, premium subscriptions, and platform analytics.",
  },
  {
    href: "/v2/admin/content-data",
    icon: FileText,
    title: "CONTENT DATA",
    description:
      "Content data analytics dashboard for monitoring platform engagement.",
  },
  {
    href: "/v2/admin/trades",
    icon: TrendingUp,
    title: "TRADE ANALYSIS",
    description:
      "Analyze high-signal trades for tweet candidates. Surfaces contrarian, high-ROI, and big-ticket moves.",
  },
  {
    href: "/v2/admin/paper-trading",
    icon: BarChart3,
    title: "PAPER TRADING",
    description:
      "Paper trading simulation tool for testing strategies without real capital.",
  },
]

export default function V2AdminDashboard() {
  return (
    <div className="min-h-screen bg-poly-cream pb-20 md:pb-0">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-4 w-4 text-poly-yellow" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              ADMIN_PANEL
            </span>
          </div>
          <h1 className="mb-3 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
            COMMAND
            <br />
            CENTER
          </h1>
          <p className="max-w-md font-body text-sm leading-relaxed text-muted-foreground">
            Admin-only tools for managing users, bots, content, and platform
            analytics.
          </p>
        </div>

        {/* Admin tools grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {adminTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group border border-border bg-poly-paper p-6 transition-all hover:border-poly-black"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center bg-poly-black">
                  <tool.icon className="h-5 w-5 text-poly-yellow" />
                </div>
                <h2 className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                  {tool.title}
                </h2>
              </div>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
              <div className="mt-4 flex items-center gap-1">
                <Activity className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-poly-black" />
                <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-poly-black">
                  Open Tool
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick links to detail pages */}
        <div className="mt-8 border border-border bg-poly-paper p-6">
          <h3 className="mb-4 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
            DIRECT_ACCESS
          </h3>
          <div className="flex flex-wrap gap-2">
            {[
              { href: "/v2/admin/ft", label: "FT Wallets" },
              { href: "/v2/admin/lt", label: "LT Strategies" },
              { href: "/v2/admin/lt/logs", label: "LT Logs" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border border-border px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:border-poly-black hover:text-poly-black"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </main>

      <V2Footer />
      <BottomNav />
    </div>
  )
}
