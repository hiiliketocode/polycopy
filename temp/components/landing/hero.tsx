"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, TrendingUp, ExternalLink, ChevronDown } from "lucide-react"
import { useConfetti } from "@/hooks/use-confetti"

// Sample feed data matching the real Polycopy feed structure
const feedTrades = [
  {
    id: 1,
    trader: { name: "blockrunner", initials: "BR" },
    market: "Bitcoin $100k by June",
    outcome: "Yes",
    roi: "+20.6%",
    roiPositive: true,
  },
  {
    id: 2,
    trader: { name: "oddschaser", initials: "OC" },
    market: "Spread: Pistons (-7.5)",
    outcome: "Pistons",
    roi: "-29.4%",
    roiPositive: false,
  },
  {
    id: 3,
    trader: { name: "dctrader42", initials: "DT" },
    market: "Fed cuts by March?",
    outcome: "No",
    roi: "+40.0%",
    roiPositive: true,
  },
  {
    id: 4,
    trader: { name: "courtside_bets", initials: "CB" },
    market: "Spread: Celtics (-10.5)",
    outcome: "Pacers",
    roi: "+16.7%",
    roiPositive: true,
  },
  {
    id: 5,
    trader: { name: "siliconprophet", initials: "SP" },
    market: "Apple AI announcement Q2?",
    outcome: "Yes",
    roi: "+50.0%",
    roiPositive: true,
  },
  {
    id: 6,
    trader: { name: "chainwatcher", initials: "CW" },
    market: "ETH $5k by May?",
    outcome: "Yes",
    roi: "+10.9%",
    roiPositive: true,
  },
  {
    id: 7,
    trader: { name: "beltway_alpha", initials: "BA" },
    market: "Trump wins 2028?",
    outcome: "No",
    roi: "+33.2%",
    roiPositive: true,
  },
  {
    id: 8,
    trader: { name: "swishtrader", initials: "ST" },
    market: "Lakers make playoffs?",
    outcome: "Yes",
    roi: "+18.5%",
    roiPositive: true,
  },
  {
    id: 9,
    trader: { name: "blockrunner", initials: "BR" },
    market: "Solana flips ETH?",
    outcome: "No",
    roi: "+62.1%",
    roiPositive: true,
  },
  {
    id: 10,
    trader: { name: "dctrader42", initials: "DT" },
    market: "Newsom runs for President?",
    outcome: "Yes",
    roi: "-12.3%",
    roiPositive: false,
  },
  {
    id: 11,
    trader: { name: "siliconprophet", initials: "SP" },
    market: "Tesla $500 by Dec?",
    outcome: "Yes",
    roi: "+28.7%",
    roiPositive: true,
  },
  {
    id: 12,
    trader: { name: "chainwatcher", initials: "CW" },
    market: "Fed raises rates again?",
    outcome: "No",
    roi: "+45.0%",
    roiPositive: true,
  },
]

const floatingTraders = [
  { name: "blockrunner", roi: "+142%", color: "bg-orange-500", position: "top-8 -left-8 lg:top-12 lg:-left-20" },
  { name: "beltway_alpha", roi: "+89%", color: "bg-blue-500", position: "top-8 -right-8 lg:top-16 lg:-right-24" },
  { name: "dctrader42", roi: "+124%", color: "bg-violet-500", position: "bottom-24 -left-8 lg:bottom-32 lg:-left-16" },
  { name: "siliconprophet", roi: "+73%", color: "bg-emerald-500", position: "bottom-24 -right-8 lg:bottom-20 lg:-right-20" },
]

export function Hero() {
  const [feedScrollY, setFeedScrollY] = useState(0)
  const [isScrollLocked, setIsScrollLocked] = useState(true)
  const heroRef = useRef<HTMLDivElement>(null)
  const feedContainerRef = useRef<HTMLDivElement>(null)
  const { triggerConfetti } = useConfetti()
  
  const maxFeedScroll = 800

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!heroRef.current) return
      
      const heroRect = heroRef.current.getBoundingClientRect()
      const isInHero = heroRect.top <= 100 && heroRect.bottom > window.innerHeight * 0.5
      
      if (isInHero && isScrollLocked) {
        const newScrollY = feedScrollY + e.deltaY
        
        if (newScrollY <= 0) {
          setFeedScrollY(0)
          return
        }
        
        if (newScrollY >= maxFeedScroll) {
          setFeedScrollY(maxFeedScroll)
          setIsScrollLocked(false)
          return
        }
        
        e.preventDefault()
        setFeedScrollY(newScrollY)
      }
    }

    const handleScroll = () => {
      if (!heroRef.current) return
      const heroRect = heroRef.current.getBoundingClientRect()
      
      if (heroRect.top >= -50 && !isScrollLocked) {
        setIsScrollLocked(true)
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: false })
    window.addEventListener("scroll", handleScroll)
    
    return () => {
      window.removeEventListener("wheel", handleWheel)
      window.removeEventListener("scroll", handleScroll)
    }
  }, [feedScrollY, isScrollLocked])

  return (
    <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden pt-16 pb-8 lg:pt-20 lg:pb-0">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-polycopy-yellow/5 via-transparent to-transparent" />
      <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-polycopy-yellow/10 via-transparent to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Content */}
          <div className="max-w-xl text-center lg:text-left mx-auto lg:mx-0">
            {/* Dynamic Stats Banner */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 lg:px-4 lg:py-2 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-4 lg:mb-6">
              <TrendingUp className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-polycopy-yellow" />
              <span className="text-xs lg:text-sm font-medium text-foreground">
                <span className="text-polycopy-yellow font-bold">2,847</span> trades in Polycopy feeds in the last 24 hours
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-foreground leading-[1.1] tracking-tight mb-4 lg:mb-6">
              <span className="text-balance">Copy the </span>
              <span className="relative inline-block">
                <span className="relative z-10 text-polycopy-yellow">smart money</span>
                <svg className="absolute -bottom-1 lg:-bottom-2 left-0 w-full h-2 lg:h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
              <span className="text-balance"> on Polymarket.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-base lg:text-lg text-muted-foreground mb-5 lg:mb-8 leading-relaxed">
              Find top Polymarket traders. Follow their moves in real-time.<br className="hidden sm:inline" /> Copy in seconds.
            </p>

            {/* CTA */}
            <div className="mb-8 lg:mb-0">
              <Button size="lg" className="bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-sm lg:text-base px-6 lg:px-8 h-11 lg:h-12 shadow-lg shadow-polycopy-yellow/20">
                Start Copying For Free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {/* Scroll hint on mobile */}
            <div className="lg:hidden text-center mt-4 text-xs text-muted-foreground animate-pulse">
              Scroll to explore the feed
            </div>
          </div>

          {/* Right Content - iPhone with Feed */}
          <div className="relative lg:h-[700px]">
            {/* iPhone Frame Container */}
            <div 
              ref={feedContainerRef}
              className="lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 w-full max-w-[300px] mx-auto"
            >
              {/* iPhone Outer Shell */}
              <div className="relative bg-[#1a1a1a] rounded-[3rem] p-3 shadow-2xl shadow-black/30">
                {/* Side Buttons (visual only) */}
                <div className="absolute -left-1 top-28 w-1 h-8 bg-[#2a2a2a] rounded-l-sm" />
                <div className="absolute -left-1 top-44 w-1 h-12 bg-[#2a2a2a] rounded-l-sm" />
                <div className="absolute -left-1 top-60 w-1 h-12 bg-[#2a2a2a] rounded-l-sm" />
                <div className="absolute -right-1 top-36 w-1 h-16 bg-[#2a2a2a] rounded-r-sm" />
                
                {/* iPhone Screen Area */}
                <div className="relative bg-card rounded-[2.4rem] overflow-hidden">
                  {/* Dynamic Island */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-[#1a1a1a] w-24 h-6 rounded-full" />
                  
                  {/* Status Bar */}
                  <div className="flex items-center justify-between px-8 pt-3 pb-1 bg-card relative z-10">
                    <span className="text-[10px] font-semibold text-foreground">9:41</span>
                    <div className="flex items-center gap-1">
                      <div className="w-6 h-2.5 border border-foreground rounded-sm relative ml-0.5">
                        <div className="absolute top-0.5 left-0.5 bottom-0.5 bg-foreground rounded-sm" style={{ width: '70%' }} />
                        <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-1 bg-foreground rounded-r-sm" />
                      </div>
                    </div>
                  </div>

                  {/* App Header */}
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-polycopy-yellow" />
                      <span className="font-bold text-foreground text-sm">Polycopy</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Feed</span>
                      <span>Discover</span>
                    </div>
                  </div>

                  {/* Scrollable Feed */}
                  <div className="h-[480px] overflow-hidden relative">
                    <div 
                      className="transition-transform duration-100 ease-out"
                      style={{ transform: `translateY(-${feedScrollY}px)` }}
                    >
                      {feedTrades.map((trade) => (
                        <div key={trade.id} className="p-3 border-b border-border">
                          {/* Trader + Market */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                              {trade.trader.initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-foreground truncate">{trade.market}</div>
                              <div className="text-[10px] text-muted-foreground">by {trade.trader.name}</div>
                            </div>
                          </div>

                          {/* Simple Stats Row */}
                          <div className="flex items-center justify-between mb-2 text-[11px]">
                            <span className={trade.outcome === "Yes" || trade.outcome === "No" ? (trade.outcome === "Yes" ? "text-profit-green font-medium" : "text-loss-red font-medium") : "text-foreground font-medium"}>
                              {trade.outcome === "Yes" ? "Buy Yes" : trade.outcome === "No" ? "Buy No" : trade.outcome}
                            </span>
                            <span className={`font-bold ${trade.roiPositive ? "text-profit-green" : "text-loss-red"}`}>
                              {trade.roi}
                            </span>
                          </div>

                          {/* Copy Trade Button */}
                          <Button 
                            onClick={triggerConfetti}
                            className="w-full bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-xs h-8"
                          >
                            Copy Trade
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Scroll progress indicator */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                      <div 
                        className="h-full bg-polycopy-yellow transition-all duration-100"
                        style={{ width: `${(feedScrollY / maxFeedScroll) * 100}%` }}
                      />
                    </div>
                  </div>
                  
                  {/* Home Indicator */}
                  <div className="flex justify-center py-2 bg-card">
                    <div className="w-28 h-1 bg-foreground/20 rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Trader Cards */}
            {floatingTraders.map((trader, i) => (
              <div
                key={i}
                className={`hidden lg:block absolute ${trader.position} bg-card rounded-xl border border-border shadow-lg p-3 animate-float`}
                style={{ animationDelay: `${i * 0.5}s` }}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${trader.color} flex items-center justify-center text-white text-xs font-bold`}>
                    {trader.name[0]}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-foreground">{trader.name}</div>
                    <div className="text-xs font-semibold text-profit-green">{trader.roi}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll Down Arrow */}
        <div className="flex justify-center mt-8 lg:mt-12">
          <div className="flex flex-col items-center gap-2 text-muted-foreground animate-bounce">
            <span className="text-xs font-medium">Scroll to explore</span>
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </div>
    </section>
  )
}
