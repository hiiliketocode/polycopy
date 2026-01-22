"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, TrendingUp, Trophy } from "lucide-react"

// Top 10 Traders by ROI (Last 30 Days) - This data should come from the Discover page API
const traders = [
  {
    rank: 1,
    name: "CryptoWhale",
    handle: "@cryptowhale",
    avatar: "bg-orange-500",
    roi: "+142%",
    winRate: "68%",
    volume: "$2.4M",
    followers: "1.2K",
    specialty: "Crypto"
  },
  {
    rank: 2,
    name: "PoliPredictor",
    handle: "@polipredictor",
    avatar: "bg-violet-500",
    roi: "+124%",
    winRate: "72%",
    volume: "$1.8M",
    followers: "890",
    specialty: "Politics"
  },
  {
    rank: 3,
    name: "TechOracle",
    handle: "@techoracle",
    avatar: "bg-emerald-500",
    roi: "+98%",
    winRate: "65%",
    volume: "$3.1M",
    followers: "2.1K",
    specialty: "Tech"
  },
  {
    rank: 4,
    name: "SportsKing",
    handle: "@sportsking",
    avatar: "bg-blue-500",
    roi: "+87%",
    winRate: "61%",
    volume: "$890K",
    followers: "650",
    specialty: "Sports"
  },
  {
    rank: 5,
    name: "MarketMaven",
    handle: "@marketmaven",
    avatar: "bg-pink-500",
    roi: "+82%",
    winRate: "59%",
    volume: "$1.2M",
    followers: "780",
    specialty: "Crypto"
  },
  {
    rank: 6,
    name: "DataDriven",
    handle: "@datadriven",
    avatar: "bg-cyan-500",
    roi: "+76%",
    winRate: "64%",
    volume: "$950K",
    followers: "540",
    specialty: "Politics"
  },
  {
    rank: 7,
    name: "AlphaHunter",
    handle: "@alphahunter",
    avatar: "bg-amber-500",
    roi: "+71%",
    winRate: "58%",
    volume: "$2.1M",
    followers: "920",
    specialty: "Crypto"
  },
  {
    rank: 8,
    name: "TrendSpotter",
    handle: "@trendspotter",
    avatar: "bg-indigo-500",
    roi: "+68%",
    winRate: "62%",
    volume: "$680K",
    followers: "430",
    specialty: "Tech"
  },
  {
    rank: 9,
    name: "PredictPro",
    handle: "@predictpro",
    avatar: "bg-rose-500",
    roi: "+65%",
    winRate: "57%",
    volume: "$750K",
    followers: "380",
    specialty: "Sports"
  },
  {
    rank: 10,
    name: "WinStreak",
    handle: "@winstreak",
    avatar: "bg-teal-500",
    roi: "+61%",
    winRate: "55%",
    volume: "$520K",
    followers: "290",
    specialty: "Politics"
  }
]

export function TopTraders() {
  return (
    <section className="py-16 lg:py-32 bg-secondary/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 text-sm font-medium text-foreground mb-4">
            <Trophy className="w-4 h-4 text-polycopy-yellow" />
            Top Performers
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-4 text-balance">
            See who you could be following
          </h2>
          <p className="text-lg text-muted-foreground">
            Top Traders by ROI (Last 30 Days)
          </p>
        </div>

        {/* Traders Grid - 6 on mobile (2x3), 8 on desktop (2x4) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6 mb-8 lg:mb-12">
          {traders.slice(0, 8).map((trader, index) => (
            <div
              key={trader.rank}
              className={`group relative bg-card rounded-xl lg:rounded-2xl border border-border p-3 lg:p-6 hover:border-polycopy-yellow/30 hover:shadow-lg transition-all duration-300 ${index >= 6 ? 'hidden lg:block' : ''}`}
            >
              {/* Rank Badge */}
              <div className="absolute -top-2 -right-2 lg:-top-3 lg:-right-3 w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-neutral-black text-white flex items-center justify-center text-xs lg:text-sm font-bold">
                #{trader.rank}
              </div>

              {/* Avatar & Name */}
              <div className="flex items-center gap-2 lg:gap-3 mb-2 lg:mb-4">
                <div className={`w-10 h-10 lg:w-14 lg:h-14 rounded-lg lg:rounded-xl ${trader.avatar} flex items-center justify-center text-white text-sm lg:text-xl font-bold`}>
                  {trader.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-foreground text-sm lg:text-base truncate">{trader.name}</div>
                  <div className="text-xs lg:text-sm text-muted-foreground truncate">{trader.handle}</div>
                </div>
              </div>

              {/* Specialty Tag - hidden on mobile */}
              <div className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary text-xs font-medium text-muted-foreground mb-4">
                <TrendingUp className="w-3 h-3" />
                {trader.specialty}
              </div>

              {/* Stats - Simplified on mobile */}
              <div className="flex items-center justify-between lg:grid lg:grid-cols-3 gap-2 mb-3 lg:mb-4">
                <div className="text-center p-1.5 lg:p-2 bg-secondary/50 rounded-lg flex-1">
                  <div className="text-[10px] lg:text-xs text-muted-foreground">ROI</div>
                  <div className="text-xs lg:text-sm font-bold text-profit-green">{trader.roi}</div>
                </div>
                <div className="hidden lg:block text-center p-2 bg-secondary/50 rounded-lg">
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                  <div className="text-sm font-bold text-foreground">{trader.winRate}</div>
                </div>
                <div className="text-center p-1.5 lg:p-2 bg-secondary/50 rounded-lg flex-1">
                  <div className="text-[10px] lg:text-xs text-muted-foreground">Win</div>
                  <div className="text-xs lg:text-sm font-bold text-foreground lg:hidden">{trader.winRate}</div>
                  <div className="hidden lg:block text-sm font-bold text-foreground">{trader.volume}</div>
                </div>
              </div>

              {/* CTA */}
              <Button className="w-full bg-polycopy-yellow text-neutral-black hover:bg-polycopy-yellow-hover font-semibold text-xs lg:text-sm h-8 lg:h-10">
                View Profile
              </Button>

              {/* Hover Glow */}
              <div className="absolute inset-0 rounded-xl lg:rounded-2xl bg-gradient-to-br from-polycopy-yellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
          ))}
        </div>

        {/* Explore All CTA */}
        <div className="text-center">
          <Button
            variant="outline"
            size="lg"
            asChild
            className="font-semibold border-polycopy-yellow text-polycopy-yellow hover:bg-polycopy-yellow hover:text-neutral-black bg-transparent"
          >
            <a href="https://polycopy.app/discover">
              Explore All Traders
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
