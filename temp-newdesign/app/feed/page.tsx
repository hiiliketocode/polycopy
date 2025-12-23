"use client"

import { useState } from "react"
import { TradeCard } from "@/components/polycopy/trade-card"
import { MarkTradeCopiedModal } from "@/components/polycopy/mark-trade-copied-modal"
import { EmptyState } from "@/components/polycopy/empty-state"
import { Button } from "@/components/ui/button"
import { RefreshCw, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

type FilterTab = "all" | "buys" | "sells"
type Category = "all" | "politics" | "sports" | "crypto" | "pop-culture" | "business" | "tech" | "weather"

export default function ActivityFeed() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all")
  const [activeCategory, setActiveCategory] = useState<Category>("all")
  const [showCopiedModal, setShowCopiedModal] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<(typeof trades)[0] | null>(null)

  // Sample data - replace with real data
  const trades = [
    {
      trader: {
        id: "1",
        name: "AlphaTrader",
        avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/alpha-trader-profile.png",
        address: "0x1234...5678",
      },
      market: "Will Bitcoin reach $150,000 by end of 2024?",
      position: "YES" as const,
      action: "Buy" as const,
      price: 0.68,
      size: 1500,
      total: 1020,
      timestamp: "2m ago",
      category: "crypto",
    },
    {
      trader: {
        id: "2",
        name: "GamblingIsAllYouNeed",
        avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/gambling-all-you-need.png",
        address: "0xabcd...efgh",
      },
      market: "Will the Democrats win the 2024 Presidential Election?",
      position: "NO" as const,
      action: "Sell" as const,
      price: 0.45,
      size: 2000,
      total: 900,
      timestamp: "15m ago",
      category: "politics",
    },
    {
      trader: {
        id: "3",
        name: "SmartMoney",
        avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/smart-money-profile.png",
        address: "0x9876...4321",
      },
      market: "Will Ethereum ETF be approved in Q1 2024?",
      position: "YES" as const,
      action: "Buy" as const,
      price: 0.72,
      size: 3000,
      total: 2160,
      timestamp: "1h ago",
      category: "crypto",
    },
  ]

  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All Trades" },
    { value: "buys", label: "Buys Only" },
    { value: "sells", label: "Sells Only" },
  ]

  const categories: { value: Category; label: string }[] = [
    { value: "all", label: "All" },
    { value: "politics", label: "Politics" },
    { value: "sports", label: "Sports" },
    { value: "crypto", label: "Crypto" },
    { value: "pop-culture", label: "Pop Culture" },
    { value: "business", label: "Business" },
    { value: "tech", label: "Tech" },
    { value: "weather", label: "Weather" },
  ]

  // Filter trades based on active filters
  const filteredTrades = trades.filter((trade) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "buys" && trade.action === "Buy") ||
      (activeFilter === "sells" && trade.action === "Sell")

    const matchesCategory = activeCategory === "all" || trade.category === activeCategory

    return matchesFilter && matchesCategory
  })

  return (
    <div className="min-h-screen bg-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
      {/* Page Header - Sticky on mobile */}
      <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[800px] mx-auto px-4 md:px-6 pb-3 md:py-8">
          {/* Title Row */}
          <div className="flex items-start justify-between mb-3 md:mb-4">
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-slate-900 mb-0.5 md:mb-1">Activity Feed</h1>
              <p className="text-xs md:text-base text-slate-500">Recent trades from traders you follow</p>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent flex-shrink-0 transition-all"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter Tabs - Updated styling for better visibility on desktop */}
          <div className="grid grid-cols-3 gap-2 mb-2.5 md:mb-3">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveFilter(tab.value)}
                className={cn(
                  "px-3 py-2.5 rounded-lg font-medium text-xs sm:text-sm whitespace-nowrap transition-all",
                  activeFilter === tab.value
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 md:pb-2">
            {categories.map((category) => (
              <button
                key={category.value}
                onClick={() => setActiveCategory(category.value)}
                className={cn(
                  "px-4 py-2 rounded-full font-medium text-sm whitespace-nowrap transition-all flex-shrink-0",
                  activeCategory === category.value
                    ? "bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-900 shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feed Content */}
      <div className="max-w-[800px] mx-auto px-4 md:px-6 py-4 md:py-8">
        {filteredTrades.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No trades yet"
            description="Follow traders to see their activity here. Start discovering top performers today!"
            actionLabel="Discover Traders"
            onAction={() => console.log("Navigate to discover traders")}
          />
        ) : (
          <div className="space-y-4">
            {filteredTrades.map((trade, index) => (
              <TradeCard
                key={index}
                trader={trade.trader}
                market={trade.market}
                position={trade.position}
                action={trade.action}
                price={trade.price}
                size={trade.size}
                total={trade.total}
                timestamp={trade.timestamp}
                onCopyTrade={() => console.log("Copy trade:", trade.market)}
                onMarkAsCopied={() => {
                  setSelectedTrade(trade)
                  setShowCopiedModal(true)
                }}
              />
            ))}

            {/* Load More Button */}
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="lg"
                className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium bg-transparent transition-all"
              >
                Load More Trades
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedTrade && (
        <MarkTradeCopiedModal
          open={showCopiedModal}
          onOpenChange={setShowCopiedModal}
          trade={{
            market: selectedTrade.market,
            traderName: selectedTrade.trader.name,
            position: selectedTrade.position,
            traderPrice: selectedTrade.price,
          }}
          isPremium={false}
        />
      )}
    </div>
  )
}
