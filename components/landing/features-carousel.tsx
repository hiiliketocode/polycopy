"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Users, LineChart, Zap, Bell, Shield } from "lucide-react"

const features = [
  {
    icon: Users,
    title: "Follow Top Traders",
    description: "Discover and follow the most successful Polymarket traders. See their real-time performance, win rates, and complete trading history before you decide to follow.",
    stat: "500K+",
    statLabel: "Polymarket traders you can copy",
  },
  {
    icon: LineChart,
    title: "Performance Analytics",
    description: "Every trader comes with detailed stats: ROI, win rate, trade history, and category expertise. Make informed decisions about who to copy.",
    stat: "50+",
    statLabel: "Data points per trader",
  },
  {
    icon: Zap,
    title: "Quick Copy Trades",
    description: "See a trade you like? Copy it in seconds. Premium users get automated execution directly on Polymarket - no manual work required.",
    stat: "3 taps",
    statLabel: "To copy any trade",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get notified when traders you follow open or close positions. Premium users can auto-close copied trades when the original trader exits.",
    stat: "Instant",
    statLabel: "Trade alerts",
  },
  {
    icon: Shield,
    title: "Your Keys, Your Control",
    description: "Non-custodial and secure. We never see your unencrypted keys. You maintain full control of your wallet and funds at all times.",
    stat: "100%",
    statLabel: "Non-custodial",
  },
]

export function FeaturesCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)

  const next = () => {
    setCurrentIndex((prev) => (prev + 1) % features.length)
  }

  const prev = () => {
    setCurrentIndex((prev) => (prev - 1 + features.length) % features.length)
  }

  const feature = features[currentIndex]
  const Icon = feature.icon

  return (
    <section className="py-12 lg:pt-24 lg:pb-12 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-6 lg:mb-9">
          <h2 className="text-xl lg:text-4xl font-bold text-foreground mb-2 lg:mb-3">
            Everything you need to copy trade
          </h2>
          <p className="text-sm lg:text-base text-muted-foreground max-w-xl mx-auto">
            Powerful features that make copy trading on Polymarket simple and effective
          </p>
        </div>

        {/* Carousel */}
        <div className="max-w-4xl mx-auto">
          {/* Feature Content */}
          <div className="relative">
            <div className="px-2 lg:px-20 py-4 lg:py-12">
              
              {/* Mobile Layout - Centered card */}
              <div className="lg:hidden">
                <div className="bg-card rounded-2xl border border-border p-6 mx-2 relative">
                  {/* Navigation Arrows */}
                  <button
                    onClick={prev}
                    className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10 shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4 text-foreground" />
                  </button>
                  <button
                    onClick={next}
                    className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10 shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4 text-foreground" />
                  </button>
                  
                  {/* Stat - Hero element */}
                  <div className="text-center mb-4">
                    <div className="text-5xl font-bold text-polycopy-yellow mb-1">
                      {feature.stat}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {feature.statLabel}
                    </div>
                  </div>
                  
                  {/* Divider */}
                  <div className="w-12 h-0.5 bg-polycopy-yellow/30 mx-auto mb-4" />
                  
                  {/* Feature info - centered, no icon */}
                  <div className="text-center">
                    <h3 className="font-semibold text-foreground mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Desktop Layout - Contained card like mobile */}
              <div className="hidden lg:block relative">
                {/* Navigation Arrows */}
                <button
                  onClick={prev}
                  className="absolute -left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center hover:border-polycopy-yellow/50 hover:bg-polycopy-yellow/5 transition-colors z-10 shadow-sm"
                >
                  <ChevronLeft className="w-5 h-5 text-foreground" />
                </button>
                <button
                  onClick={next}
                  className="absolute -right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center hover:border-polycopy-yellow/50 hover:bg-polycopy-yellow/5 transition-colors z-10 shadow-sm"
                >
                  <ChevronRight className="w-5 h-5 text-foreground" />
                </button>

                {/* Card container */}
                <div className="bg-card rounded-3xl border border-border p-12 mx-8">
                  <div className="text-center">
                    {/* Stat - Hero element */}
                    <div className="text-8xl font-bold text-polycopy-yellow mb-2">
                      {feature.stat}
                    </div>
                    <div className="text-lg text-muted-foreground mb-8">
                      {feature.statLabel}
                    </div>
                    
                    {/* Divider */}
                    <div className="w-16 h-0.5 bg-polycopy-yellow/30 mx-auto mb-8" />
                    
                    {/* Feature info */}
                    <h3 className="text-2xl font-bold text-foreground mb-3">
                      {feature.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-4 lg:mt-4">
            {features.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === currentIndex 
                    ? "w-8 bg-polycopy-yellow" 
                    : "w-2 bg-border hover:bg-muted-foreground"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
