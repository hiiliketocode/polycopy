"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowUpRight, Check, ChevronDown, ChevronUp, Settings2 } from "lucide-react"
import { useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { ExecuteTradeModal } from "@/components/polycopy/execute-trade-modal"
import { MarkTradeCopiedModal } from "@/components/polycopy/mark-trade-copied-modal"
import { usePermissions } from "@/hooks/use-permissions"

// Mock data for demo
const mockTrader = {
  id: "trader-1",
  name: "AlphaTrader",
  address: "0x1234...5678",
  avatar: "https://polymarket-upload.s3.us-east-2.amazonaws.com/alpha-trader-profile.png",
  followers: 2847,
  following: 134,
  totalVolume: 1250000,
  roi: 156.8,
  winRate: 68.4,
  avgPositionSize: 5000,
  openPositions: 12,
  totalTrades: 89,
  bio: "Professional prediction market trader. Specializing in political and economic events. 5+ years of experience.",
  joinDate: "March 2021",
  isFollowing: false,
  stats: {
    roi: 156.8,
    profit: 12450,
    winRate: 68.4,
    volume: 1250000,
    activeMarkets: 8,
  },
  tradeHistory: [
    {
      id: "1",
      market: "Will Bitcoin reach $100k by end of 2024?",
      position: "YES",
      entryPrice: 0.62,
      size: 1200,
      outcome: "Won",
      profit: 456,
    },
    {
      id: "2",
      market: "Will the Fed cut rates in March 2024?",
      position: "NO",
      entryPrice: 0.35,
      size: 800,
      outcome: "Won",
      profit: 280,
    },
    {
      id: "3",
      market: "Trump wins 2024 Republican nomination?",
      position: "YES",
      entryPrice: 0.78,
      size: 2500,
      outcome: "Open",
      profit: null,
    },
    {
      id: "4",
      market: "S&P 500 above 5000 by Q2 2024?",
      position: "YES",
      entryPrice: 0.54,
      size: 1500,
      outcome: "Lost",
      profit: -350,
    },
  ],
  openPositions: [
    {
      id: "3",
      market: "Trump wins 2024 Republican nomination?",
      position: "YES",
      entryPrice: 0.78,
      size: 2500,
      currentPrice: 0.82,
      unrealizedPnL: 120,
    },
  ],
}

const roiChartData = [
  { date: "Jan", roi: 0 },
  { date: "Feb", roi: 12.3 },
  { date: "Mar", roi: 18.5 },
  { date: "Apr", roi: 25.2 },
  { date: "May", roi: 32.8 },
  { date: "Jun", roi: 38.4 },
  { date: "Jul", roi: 156.8 },
]

export default function TraderProfilePage({ params }: { params: { id: string } }) {
  const [isFollowing, setIsFollowing] = useState(mockTrader.isFollowing)
  const [activeTab, setActiveTab] = useState<"positions" | "performance">("positions")
  const [positionFilter, setPositionFilter] = useState<"all" | "open" | "closed" | "resolved">("all")
  const [showExecuteModal, setShowExecuteModal] = useState(false)
  const [selectedTradeForCopy, setSelectedTradeForCopy] = useState<{
    market: string
    traderName: string
    position: "YES" | "NO"
    traderPrice: number
  } | null>(null)
  const [expandedTradeIndex, setExpandedTradeIndex] = useState<number | null>(null)
  const [showCopiedModal, setShowCopiedModal] = useState(false)
  const { isPremium } = usePermissions()

  console.log("[v0] Trader page - isPremium:", isPremium)

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-6 space-y-4 sm:space-y-6">
        {/* Profile Header */}
        <Card className="bg-white border-slate-200 p-4 sm:p-8">
          <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
            <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-white shadow-md flex-shrink-0">
              <AvatarImage src={mockTrader.avatar || "/placeholder.svg"} alt={mockTrader.name} />
              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-xl font-semibold">
                {getInitials(mockTrader.name)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">{mockTrader.name}</h1>
              <p className="text-xs sm:text-sm font-mono text-slate-500 mb-2 sm:mb-3">{mockTrader.address}</p>

              <a
                href="https://polymarket.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline-flex items-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors"
              >
                View on Polymarket
                <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>

            {/* Follow Button */}
            <div className="flex-shrink-0">
              {isFollowing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFollowing(false)}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5 px-3"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Following</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setIsFollowing(true)}
                  className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-4"
                >
                  Follow
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">ROI</div>
              <div
                className={`text-lg sm:text-2xl font-bold ${mockTrader.stats.roi > 0 ? "text-emerald-600" : "text-red-500"}`}
              >
                {formatPercentage(mockTrader.stats.roi)}
              </div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Profit</div>
              <div
                className={`text-lg sm:text-2xl font-bold ${mockTrader.stats.profit > 0 ? "text-emerald-600" : "text-red-500"}`}
              >
                {formatCurrency(mockTrader.stats.profit)}
              </div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Win Rate</div>
              <div className="text-lg sm:text-2xl font-bold text-slate-900">{mockTrader.stats.winRate.toFixed(0)}%</div>
            </div>
            <div className="text-center p-2 sm:p-4 bg-slate-50 rounded-lg">
              <div className="text-xs font-medium text-slate-500 mb-1">Volume</div>
              <div className="text-lg sm:text-2xl font-bold text-slate-900">
                {formatCurrency(mockTrader.stats.volume)}
              </div>
            </div>
          </div>

          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="md:hidden flex items-center justify-center gap-1 text-sm text-slate-600 hover:text-yellow-600 transition-colors pt-4 mt-4 border-t border-slate-200"
          >
            View on Polymarket
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </Card>

        <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 p-2 rounded-lg">
          <button
            onClick={() => setActiveTab("positions")}
            className={`px-3 py-2.5 rounded-md font-medium text-sm transition-all ${
              activeTab === "positions"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Positions
          </button>
          <button
            onClick={() => setActiveTab("performance")}
            className={`px-3 py-2.5 rounded-md font-medium text-sm transition-all ${
              activeTab === "performance"
                ? "bg-slate-100 text-slate-900"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Performance
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "positions" && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={() => setPositionFilter("all")}
                  variant={positionFilter === "all" ? "default" : "outline"}
                  className={
                    positionFilter === "all"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                  }
                  size="sm"
                >
                  All
                </Button>
                <Button
                  onClick={() => setPositionFilter("open")}
                  variant={positionFilter === "open" ? "default" : "outline"}
                  className={
                    positionFilter === "open"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                  }
                  size="sm"
                >
                  Open
                </Button>
                <Button
                  onClick={() => setPositionFilter("closed")}
                  variant={positionFilter === "closed" ? "default" : "outline"}
                  className={
                    positionFilter === "closed"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                  }
                  size="sm"
                >
                  Closed
                </Button>
                <Button
                  onClick={() => setPositionFilter("resolved")}
                  variant={positionFilter === "resolved" ? "default" : "outline"}
                  className={
                    positionFilter === "resolved"
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50 transition-all"
                  }
                  size="sm"
                >
                  Resolved
                </Button>
              </div>

              {mockTrader.tradeHistory.map((trade) => (
                <Card key={trade.id} className="bg-white border-slate-200 p-5 hover:shadow-lg transition-all">
                  <h3 className="font-semibold text-slate-900 mb-4 leading-snug text-base">{trade.market}</h3>

                  <div className="bg-slate-50/50 border border-slate-200 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm relative">
                      {/* Position */}
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1.5 font-medium">Position</div>
                        <div
                          className={`font-semibold ${trade.position === "YES" ? "text-emerald-600" : "text-red-500"}`}
                        >
                          {trade.position}
                        </div>
                      </div>

                      {/* Vertical divider */}
                      <div className="hidden md:block absolute left-[20%] top-0 bottom-0 w-px bg-slate-200" />

                      {/* Entry */}
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1.5 font-medium">Entry</div>
                        <div className="font-mono font-semibold text-slate-900">{trade.entryPrice.toFixed(2)}</div>
                      </div>

                      {/* Vertical divider */}
                      <div className="hidden md:block absolute left-[40%] top-0 bottom-0 w-px bg-slate-200" />

                      {/* Size */}
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1.5 font-medium">Size</div>
                        <div className="font-semibold text-slate-900">{formatCurrency(trade.size)}</div>
                      </div>

                      {/* Vertical divider */}
                      <div className="hidden md:block absolute left-[60%] top-0 bottom-0 w-px bg-slate-200" />

                      {/* Total */}
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1.5 font-medium">Total</div>
                        <div className="font-semibold text-slate-900">
                          {formatCurrency(trade.size * trade.entryPrice)}
                        </div>
                      </div>

                      {/* Vertical divider */}
                      <div className="hidden md:block absolute left-[80%] top-0 bottom-0 w-px bg-slate-200" />

                      {/* ROI */}
                      <div className="text-center">
                        <div className="text-xs text-slate-500 mb-1.5 font-medium">ROI</div>
                        <div>
                          {trade.profit !== null ? (
                            <div
                              className={`font-semibold tabular-nums ${trade.profit > 0 ? "text-emerald-600" : trade.profit < 0 ? "text-red-500" : "text-slate-600"}`}
                            >
                              {trade.profit > 0 ? "+" : ""}
                              {((trade.profit / (trade.size * trade.entryPrice)) * 100).toFixed(1)}%
                            </div>
                          ) : (
                            <div className="font-semibold text-slate-600">-</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className={`flex gap-2 ${isPremium ? "justify-between items-center" : ""}`}>
                    <Button
                      size="sm"
                      className={`flex-1 min-w-0 font-semibold shadow-sm ${
                        isPremium
                          ? "bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900"
                          : "bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900"
                      }`}
                      onClick={() => {
                        setSelectedTradeForCopy({
                          market: trade.market,
                          traderName: mockTrader.name,
                          position: trade.position,
                          traderPrice: trade.entryPrice,
                        })
                        if (isPremium) {
                          const tradeIndex = mockTrader.tradeHistory.indexOf(trade)
                          setExpandedTradeIndex(expandedTradeIndex === tradeIndex ? null : tradeIndex)
                        } else {
                          setShowCopiedModal(true)
                        }
                      }}
                    >
                      Copy Trade
                    </Button>
                    {!isPremium && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 min-w-0 border-slate-300 text-slate-700 bg-transparent hover:bg-slate-50 transition-all"
                        onClick={() => {
                          setSelectedTradeForCopy({
                            market: trade.market,
                            traderName: mockTrader.name,
                            position: trade.position,
                            traderPrice: trade.entryPrice,
                          })
                          setShowCopiedModal(true)
                        }}
                      >
                        Mark as Copied
                      </Button>
                    )}
                    {isPremium && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2"
                        onClick={() => {
                          const tradeIndex = mockTrader.tradeHistory.indexOf(trade)
                          setExpandedTradeIndex(expandedTradeIndex === tradeIndex ? null : tradeIndex)
                        }}
                      >
                        {expandedTradeIndex === mockTrader.tradeHistory.indexOf(trade) ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </Button>
                    )}
                  </div>

                  {isPremium && expandedTradeIndex === mockTrader.tradeHistory.indexOf(trade) && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                      <h4 className="text-sm font-semibold text-slate-900">Quick Copy</h4>

                      {/* Amount Input */}
                      <div className="space-y-2">
                        <label htmlFor={`amount-${trade.id}`} className="text-xs font-medium text-slate-700">
                          Amount (USD)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                          <input
                            id={`amount-${trade.id}`}
                            type="number"
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Auto-close Checkbox */}
                      <div className="flex items-start space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <input
                          type="checkbox"
                          id={`auto-close-${trade.id}`}
                          defaultChecked
                          className="mt-0.5 rounded border-slate-300 text-yellow-500 focus:ring-yellow-400"
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={`auto-close-${trade.id}`}
                            className="text-sm font-medium text-slate-900 cursor-pointer leading-tight"
                          >
                            Auto-close when trader closes
                          </label>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Automatically close your position when {mockTrader.name} closes theirs
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold"
                        >
                          Execute Trade
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent"
                          onClick={() => {
                            setSelectedTradeForCopy({
                              market: trade.market,
                              traderName: mockTrader.name,
                              position: trade.position,
                              traderPrice: trade.entryPrice,
                            })
                            setShowExecuteModal(true)
                          }}
                        >
                          <Settings2 className="w-4 h-4 mr-1.5" />
                          Advanced
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {activeTab === "performance" && (
            <div className="space-y-6">
              {/* ROI Over Time Chart */}
              <Card className="bg-white border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">ROI Over Time</h3>
                <div className="h-64 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={roiChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: "12px" }} />
                      <YAxis stroke="#64748b" style={{ fontSize: "12px" }} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "14px",
                        }}
                        formatter={(value: number) => [`${value.toFixed(1)}%`, "ROI"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="roi"
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={{ fill: "#10B981", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Additional Performance Metrics */}
              <Card className="bg-white border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Performance Metrics</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Total Volume</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">
                      {formatCurrency(mockTrader.stats.volume)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Active Markets</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">{mockTrader.stats.activeMarkets}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Avg Trade Size</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">
                      {formatCurrency(mockTrader.stats.volume / mockTrader.tradeHistory.length)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Best Trade</p>
                    <p className="text-lg sm:text-xl font-bold text-emerald-600">+{formatCurrency(456)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Worst Trade</p>
                    <p className="text-lg sm:text-xl font-bold text-red-500">-{formatCurrency(350)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Total Trades</p>
                    <p className="text-lg sm:text-xl font-bold text-slate-900">{mockTrader.stats.totalTrades}</p>
                  </div>
                </div>
              </Card>

              {/* Trade Distribution */}
              <Card className="bg-white border-slate-200 p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Trade Distribution</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600">Won</span>
                      <span className="font-semibold text-slate-900">2 trades (50%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: "50%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600">Lost</span>
                      <span className="font-semibold text-slate-900">1 trade (25%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: "25%" }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-600">Open</span>
                      <span className="font-semibold text-slate-900">1 trade (25%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: "25%" }} />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {selectedTradeForCopy && !isPremium && (
        <MarkTradeCopiedModal
          open={showCopiedModal}
          onOpenChange={setShowCopiedModal}
          trade={selectedTradeForCopy}
          isPremium={false}
        />
      )}

      {selectedTradeForCopy && isPremium && (
        <ExecuteTradeModal
          open={showExecuteModal}
          onOpenChange={setShowExecuteModal}
          trade={{
            market: selectedTradeForCopy.market,
            traderName: selectedTradeForCopy.traderName,
            traderAddress: mockTrader.address,
            traderAvatar: mockTrader.avatar,
            traderId: "1",
            position: selectedTradeForCopy.position,
            traderPrice: selectedTradeForCopy.traderPrice,
            traderROI: mockTrader.roi,
          }}
        />
      )}
    </div>
  )
}
