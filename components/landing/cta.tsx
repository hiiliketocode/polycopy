"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export function CTA() {
  return (
    <section className="py-16 lg:py-32 bg-neutral-black relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(253,176,34,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Headline */}
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6 text-balance">
          Start building your copy trade feed
        </h2>

        {/* Subheadline */}
        <p className="text-lg text-white/70 mb-10 max-w-2xl mx-auto">
          Discover top traders, curate your feed, and copy your favorite trades all in one place.
        </p>

        {/* CTA Button */}
        <Link href="/login?mode=signup">
          <Button
            size="lg"
            className="bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-sm lg:text-base px-6 lg:px-8 h-12 lg:h-14 shadow-lg shadow-polycopy-yellow/20"
          >
            <span className="hidden sm:inline">Sign Up Free - No Credit Card Required</span>
            <span className="sm:hidden">Sign Up Free</span>
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5 ml-2" />
          </Button>
        </Link>
      </div>
    </section>
  )
}
