"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image 
              src="/logos/polycopy-logo-primary.svg" 
              alt="Polycopy" 
              width={120} 
              height={32}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            <Link href="#features" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              How It Works
            </Link>
            <Link href="#pricing" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              Pricing
            </Link>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-700 hover:text-slate-900 hover:bg-transparent">
                Sign In
              </Button>
            </Link>
            <Link href="/login?mode=signup">
              <Button className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-medium">
                Start Free
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="md:hidden p-3 -mr-3 min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-slate-900" aria-hidden="true" />
            ) : (
              <Menu className="w-6 h-6 text-slate-900" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-200">
            <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
              <Link href="#features" className="px-4 py-3 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors min-h-[44px] flex items-center">
                Features
              </Link>
              <Link href="#how-it-works" className="px-4 py-3 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors min-h-[44px] flex items-center">
                How It Works
              </Link>
              <Link href="#pricing" className="px-4 py-3 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors min-h-[44px] flex items-center">
                Pricing
              </Link>
              <div className="flex flex-col gap-3 pt-4 px-4">
                <Link href="/login" className="w-full">
                  <Button variant="ghost" className="w-full justify-center text-slate-700 hover:text-slate-900 hover:bg-transparent min-h-[44px]">
                    Sign In
                  </Button>
                </Link>
                <Link href="/login?mode=signup" className="w-full">
                  <Button className="w-full bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-medium min-h-[44px]">
                    Start Free
                  </Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
