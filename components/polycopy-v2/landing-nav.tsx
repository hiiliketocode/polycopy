"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { Logo } from "./logo"

const navLinks = [
  { href: "#features", label: "FEATURES" },
  { href: "#how-it-works", label: "HOW IT WORKS" },
  { href: "#pricing", label: "PRICING" },
]

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav
      className="sticky top-0 z-50 border-b border-border bg-card"
      role="navigation"
      aria-label="Landing navigation"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Logo variant="horizontal" size="sm" href="/v2/landing" />

        {/* Desktop center links */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2 font-sans text-sm font-semibold uppercase tracking-wide text-foreground transition-all duration-150 hover:bg-accent"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop right CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/v2/login"
            className="px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:text-poly-yellow"
          >
            SIGN IN
          </Link>
          <Link
            href="/v2/login?mode=signup"
            className="bg-poly-yellow px-5 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
          >
            START FREE
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="h-6 w-6 text-foreground" />
          ) : (
            <Menu className="h-6 w-6 text-foreground" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border bg-card px-4 pb-6 pt-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-3 font-sans text-sm font-semibold uppercase tracking-wide text-foreground transition-colors hover:text-poly-yellow"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/v2/login"
              className="py-3 text-center font-sans text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:text-poly-yellow"
            >
              SIGN IN
            </Link>
            <Link
              href="/v2/login?mode=signup"
              className="bg-poly-yellow py-3 text-center font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              START FREE
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
