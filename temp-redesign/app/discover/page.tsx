"use client"

import { TraderDiscoveryCard } from "@/components/polycopy/trader-discovery-card"
import { Button } from "@/components/ui/button"
import { Search, X } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

const mockFeaturedTraders = [
  {
    id: "f1",
    name: "SmartMoney",
    handle: "0xuv1w...2x3y",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/smart-money-profile.png",
    roi: 51.8,
    profit: 24600,
    volume: 98000,
    winRate: 72,
    isFollowing: false,
  },
  {
    id: "f2",
    name: "PredictionPro",
    handle: "0x9i0j...1k2l",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/prediction-pro-profile.png",
    roi: 42.1,
    profit: 18750,
    volume: 125000,
    winRate: 68,
    isFollowing: false,
  },
  {
    id: "f3",
    name: "GamblingIsAllYouNeed",
    handle: "0x1a2b...3c4d",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/gambling-all-you-need.png",
    roi: 34.2,
    profit: 12450,
    volume: 89000,
    winRate: 65,
    isFollowing: false,
  },
]

const mockTop50Traders = [
  {
    id: "1",
    name: "SmartMoney",
    handle: "0xuv1w...2x3y",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/smart-money-profile.png",
    roi: 51.8,
    profit: 24600,
    volume: 98000,
    winRate: 72,
    isFollowing: false,
  },
  {
    id: "2",
    name: "PredictionPro",
    handle: "0x9i0j...1k2l",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/prediction-pro-profile.png",
    roi: 42.1,
    profit: 18750,
    volume: 125000,
    winRate: 68,
    isFollowing: false,
  },
  {
    id: "3",
    name: "GamblingIsAllYouNeed",
    handle: "0x1a2b...3c4d",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/gambling-all-you-need.png",
    roi: 34.2,
    profit: 12450,
    volume: 89000,
    winRate: 65,
    isFollowing: true,
  },
  {
    id: "4",
    name: "MarketMaven",
    handle: "0x5e6f...7g8h",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/market-maven-profile.png",
    roi: 28.7,
    profit: 8920,
    volume: 45000,
    winRate: 61,
    isFollowing: false,
  },
  {
    id: "5",
    name: "AlphaSeeker",
    handle: "0x7q8r...9s0t",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/alpha-seeker-profile.png",
    roi: 19.4,
    profit: 6300,
    volume: 52000,
    winRate: 58,
    isFollowing: true,
  },
  {
    id: "6",
    name: "DegenKing",
    handle: "0x3m4n...5o6p",
    avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/degen-king-profile.png",
    roi: -5.3,
    profit: -2100,
    volume: 32000,
    winRate: 43,
    isFollowing: false,
  },
]

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortPeriod, setSortPeriod] = useState<"30d" | "7d" | "all">("30d")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const sortOptions: Array<{ value: "30d" | "7d" | "all"; label: string }> = [
    { value: "30d", label: "30 Days" },
    { value: "7d", label: "7 Days" },
    { value: "all", label: "All Time" },
  ]

  const categories = ["All", "Politics", "Sports", "Crypto", "Pop Culture", "Business", "Economics", "Tech", "Weather"]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white md:pt-0 pb-20 md:pb-8">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-3 sm:pt-10 sm:pb-5">
          <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-2 sm:mb-4 tracking-tight">
              Discover Top Traders
            </h1>
            <p className="text-sm sm:text-lg text-slate-600 mb-4 sm:mb-6">
              Follow the best prediction market traders on Polymarket
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="Enter wallet address or trader name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-12 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Featured Traders Section */}
      <div className="border-b border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-7">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Featured Traders</h2>
          </div>

          {/* Mobile Featured Traders horizontal scroll */}
          <div className="sm:hidden overflow-x-auto -mx-3 px-3 pb-4">
            <div className="flex gap-3" style={{ width: "max-content" }}>
              {mockFeaturedTraders.map((trader) => (
                <div
                  key={trader.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg transition-shadow"
                  style={{ width: "280px" }}
                >
                  <Link href={`/trader/${trader.id}`} className="block">
                    <div className="flex items-center gap-3 mb-5">
                      <Avatar className="h-14 w-14 border-2 border-white shadow-sm">
                        <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
                        <AvatarFallback className="bg-slate-100 text-slate-700 font-medium text-base">
                          {trader.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 text-base truncate">{trader.name}</h3>
                        <p className="text-xs text-slate-500 font-mono truncate">{trader.handle}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-5">
                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                          ROI
                        </span>
                        <span className={`text-lg font-bold ${trader.roi > 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {trader.roi > 0 ? "+" : ""}
                          {trader.roi}%
                        </span>
                      </div>

                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                          P&L
                        </span>
                        <span
                          className={`text-lg font-bold ${trader.profit > 0 ? "text-emerald-600" : "text-red-500"}`}
                        >
                          ${trader.profit.toLocaleString()}
                        </span>
                      </div>

                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                          Win Rate
                        </span>
                        <span className="text-lg font-bold text-slate-900">{trader.winRate}%</span>
                      </div>

                      <div>
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                          Volume
                        </span>
                        <span className="text-lg font-bold text-slate-900">${trader.volume.toLocaleString()}</span>
                      </div>
                    </div>

                    <Button
                      className="w-full bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm"
                      onClick={(e) => {
                        e.preventDefault()
                        console.log("Follow", trader.id)
                      }}
                    >
                      Follow
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop grid */}
          <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            {mockFeaturedTraders.map((trader) => (
              <div
                key={trader.id}
                className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
              >
                <Link href={`/trader/${trader.id}`} className="block">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                      <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
                      <AvatarFallback className="bg-slate-100 text-slate-700 font-medium text-lg">
                        {trader.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 text-lg truncate">{trader.name}</h3>
                      <p className="text-sm text-slate-500 font-mono truncate">{trader.handle}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">ROI</span>
                      <span className={`text-xl font-bold ${trader.roi > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {trader.roi > 0 ? "+" : ""}
                        {trader.roi}%
                      </span>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">P&L</span>
                      <span className={`text-xl font-bold ${trader.profit > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        ${trader.profit.toLocaleString()}
                      </span>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                        Win Rate
                      </span>
                      <span className="text-xl font-bold text-slate-900">{trader.winRate}%</span>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">
                        Volume
                      </span>
                      <span className="text-xl font-bold text-slate-900">${trader.volume.toLocaleString()}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm"
                    onClick={(e) => {
                      e.preventDefault()
                      console.log("Follow", trader.id)
                    }}
                  >
                    Follow
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top 50 Traders Section */}
      <div className="bg-slate-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-14">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Top 50 Traders by ROI</h2>

              <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setSortPeriod(option.value)}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      sortPeriod === option.value
                        ? "bg-slate-900 text-white shadow-sm"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category.toLowerCase())}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                    selectedCategory === category.toLowerCase()
                      ? "bg-[#FDB022] text-slate-900 shadow-sm"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {mockTop50Traders.map((trader, index) => (
              <div key={trader.id} className="flex items-start sm:items-center gap-2 sm:gap-4">
                <div className="flex-shrink-0 w-6 sm:w-8 text-center pt-4 sm:pt-0">
                  <span className="text-base sm:text-lg font-bold text-slate-400">{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <TraderDiscoveryCard trader={trader} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
