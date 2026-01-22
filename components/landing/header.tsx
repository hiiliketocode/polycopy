"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image 
              src="/logos/polycopy-logo-primary.svg" 
              alt="Polycopy" 
              width={120} 
              height={32}
              className="h-7 lg:h-8 w-auto"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
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
              <Button variant="ghost" className="text-slate-700 hover:text-slate-900">
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
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-slate-900" />
            ) : (
              <Menu className="w-6 h-6 text-slate-900" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-200">
            <nav className="flex flex-col gap-4">
              <Link href="#features" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                Features
              </Link>
              <Link href="#how-it-works" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                How It Works
              </Link>
              <Link href="#pricing" className="px-4 py-2 rounded-lg font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                Pricing
              </Link>
              <div className="flex flex-col gap-2 pt-4 px-4">
                <Link href="/login" className="w-full">
                  <Button variant="ghost" className="w-full justify-center text-slate-700 hover:text-slate-900">
                    Sign In
                  </Button>
                </Link>
                <Link href="/login?mode=signup" className="w-full">
                  <Button className="w-full bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-medium">
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
