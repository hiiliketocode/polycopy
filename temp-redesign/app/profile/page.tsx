"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import {
  TrendingUp,
  Percent,
  DollarSign,
  Crown,
  Wallet,
  Copy,
  Check,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { UpgradeModal } from "@/components/polycopy/upgrade-modal"
import { ConnectWalletModal } from "@/components/polycopy/connect-wallet-modal"
import { MarkTradeClosed } from "@/components/polycopy/mark-trade-closed"
import { EditCopiedTrade } from "@/components/polycopy/edit-copied-trade"

export default function ProfilePage() {
  const [isConnected, setIsConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState("")
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [expandedTrade, setExpandedTrade] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<"copied-trades" | "performance" | "settings">("copied-trades")
  const isPremium = false // Toggle for demo
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [isMarkClosedModalOpen, setIsMarkClosedModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null)

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletAddress)
    setTimeout(() => {}, 2000)
  }

  const formatCompactNumber = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (absValue >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  const copiedTrades = [
    {
      id: 1,
      trader: "CryptoWhale",
      traderAvatar: "/crypto-trader-avatar.png",
      market: "Will Bitcoin reach $100k by end of 2024?",
      position: "YES" as const,
      entryPrice: 0.65,
      currentPrice: 0.72,
      shares: 1000,
      amount: 650,
      status: "open",
      pnl: 70,
      pnlPercent: 10.77,
      createdAt: new Date("2024-11-15T14:30:00"),
    },
    {
      id: 2,
      trader: "PolyPro",
      traderAvatar: "/crypto-trader-avatar.png",
      market: "Will Trump win the 2024 election?",
      position: "NO" as const,
      entryPrice: 0.45,
      currentPrice: 0.38,
      shares: 500,
      amount: 225,
      status: "open",
      pnl: -35,
      pnlPercent: -15.56,
      createdAt: new Date("2024-10-22T09:15:00"),
    },
  ]

  const openPositions = [
    {
      market: "Will Bitcoin reach $100k by end of 2024?",
      prediction: "Market resolves YES if Bitcoin trades above $100,000 on any exchange",
      position: "YES" as const,
      shares: 1000,
      avgPrice: 0.65,
      currentPrice: 0.72,
      pnl: 70,
      pnlPercent: 10.77,
    },
    {
      market: "Will Trump win the 2024 election?",
      prediction: "Market resolves based on electoral college results",
      position: "NO" as const,
      shares: 500,
      avgPrice: 0.45,
      currentPrice: 0.38,
      pnl: -35,
      pnlPercent: -15.56,
    },
  ]

  const userStats = {
    totalPnl: copiedTrades.reduce((sum, trade) => sum + trade.pnl, 0),
    roi: 5.8,
    totalVolume: copiedTrades.reduce((sum, trade) => sum + trade.amount, 0),
    winRate: 60,
    followingCount: 12, // Added followingCount for dynamic display
  }

  const roiChartData = [
    { date: "Jan", roi: 0 },
    { date: "Feb", roi: 2.1 },
    { date: "Mar", roi: 3.8 },
    { date: "Apr", roi: 4.2 },
    { date: "May", roi: 5.1 },
    { date: "Jun", roi: 5.8 },
  ]

  const handleWalletConnect = (address: string) => {
    setWalletAddress(address)
    setIsConnected(true)
  }

  const handleWalletDisconnect = () => {
    setIsConnected(false)
    setWalletAddress("")
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pt-4 md:pt-0 pb-20 md:pb-8">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 space-y-6 py-8">
        {/* Mobile-only Upgrade to Premium button */}
        <div className="lg:hidden">
          <Button
            onClick={() => setShowUpgradeModal(true)}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <Crown className="mr-2 h-4 w-4" />
            Upgrade to Premium
          </Button>
        </div>

        {/* User Profile Card */}
        <Card className="bg-white border-slate-200 p-4 sm:p-8 lg:mt-6">
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Left side - Profile info */}
            <div className="flex flex-col items-center lg:flex-row lg:items-start gap-4 flex-1">
              <Avatar className="h-20 w-20 bg-gradient-to-br from-yellow-400 to-orange-500">
                <AvatarFallback className="text-2xl font-bold text-white bg-transparent">U</AvatarFallback>
              </Avatar>

              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">You</h2>
                <div className="flex items-center gap-2 text-sm text-slate-600 justify-center lg:justify-start">
                  <Avatar className="h-9 w-9 ring-2 ring-slate-100">
                    <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-xs font-semibold">
                      U
                    </AvatarFallback>
                  </Avatar>
                  <span>Following {userStats.followingCount} traders</span>
                </div>

                {isConnected && (
                  <div className="flex items-center gap-2 flex-wrap mt-3 justify-center lg:justify-start">
                    <code className="text-sm font-mono text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
                      {truncateAddress(walletAddress)}
                    </code>
                    <Button
                      onClick={handleCopyAddress}
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-slate-500 hover:text-slate-900"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop: 2x2 grid with icons */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-4 md:gap-6 lg:min-w-[400px]">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Total P&L</p>
                </div>
                <p
                  className={`text-xl sm:text-2xl font-bold ${userStats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {userStats.totalPnl >= 0 ? "+" : ""}
                  {formatCompactNumber(userStats.totalPnl)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Percent className="h-4 w-4 text-slate-500" />
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">ROI</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-emerald-600">+{userStats.roi}%</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-4 w-4 text-slate-500" />
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Volume</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {formatCompactNumber(userStats.totalVolume)}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Win Rate</p>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">{userStats.winRate}%</p>
              </div>
            </div>

            {/* Mobile: Trade card style with background box */}
            <div className="lg:hidden bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">Total P&L</p>
                  <p className={`text-xl font-bold ${userStats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {userStats.totalPnl >= 0 ? "+" : ""}
                    {formatCompactNumber(userStats.totalPnl)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">ROI</p>
                  <p className="text-xl font-bold text-emerald-600">+{userStats.roi}%</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">Volume</p>
                  <p className="text-xl font-bold text-slate-900">{formatCompactNumber(userStats.totalVolume)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1.5">Win Rate</p>
                  <p className="text-xl font-bold text-slate-900">{userStats.winRate}%</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Polymarket Wallet Connection */}
        <Card className="bg-white border-slate-200 p-6 sm:p-8">
          {!isConnected ? (
            <div className="flex flex-col gap-6">
              {/* Top section: Icon + Heading */}
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex-shrink-0">
                  <Wallet className="h-6 w-6 text-slate-700" />
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900">Connect Polymarket Wallet</h3>
              </div>

              {/* Bottom section: Button and text */}
              <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
                {/* Button */}
                <div className="lg:flex-shrink-0">
                  <Button
                    onClick={() => setIsConnectModalOpen(true)}
                    className="w-full lg:w-auto bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-slate-900 font-semibold shadow-sm hover:shadow-md transition-all px-8"
                  >
                    Connect Wallet
                  </Button>
                </div>

                {/* Explainer text - hidden on mobile, shown on desktop */}
                <div className="flex-1 hidden lg:block">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Input your Polymarket wallet address to sync the trades you've made on Polymarket.
                  </p>
                </div>

                {/* Explainer text - shown on mobile below button */}
                <div className="lg:hidden">
                  <p className="text-sm text-slate-600 leading-relaxed text-center">
                    Input your Polymarket wallet address to sync the trades you've made on Polymarket.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Top section: Green Icon + "Wallet Tracked" Heading */}
              <div className="flex items-center gap-3 lg:gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl border border-emerald-200 flex-shrink-0">
                  <Wallet className="h-6 w-6 text-emerald-700" />
                </div>
                <h3 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900">Wallet Tracked</h3>
              </div>

              {/* Wallet address and disconnect button */}
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-600 break-all font-mono bg-slate-50 px-4 py-3 rounded-lg border border-slate-200">
                  {walletAddress}
                </p>

                <Button
                  onClick={handleWalletDisconnect}
                  variant="outline"
                  size="sm"
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 w-full lg:w-auto bg-transparent"
                >
                  Stop Tracking
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <Button
            onClick={() => setActiveTab("copied-trades")}
            variant="ghost"
            className={`flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap ${
              activeTab === "copied-trades"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
            }`}
          >
            Copied Trades
          </Button>
          <Button
            onClick={() => setActiveTab("performance")}
            variant="ghost"
            className={`flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap ${
              activeTab === "performance"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
            }`}
          >
            Performance
          </Button>
          <Button
            onClick={() => setActiveTab("settings")}
            variant="ghost"
            className={`flex-1 px-3 py-3 rounded-md font-medium text-sm transition-all whitespace-nowrap ${
              activeTab === "settings"
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-300"
            }`}
          >
            Settings
          </Button>
        </div>

        {/* Tab Content */}
        <div>
          {/* Copied Trades Tab */}
          {activeTab === "copied-trades" && (
            <div className="space-y-4 mt-6">
              <div className="mb-6">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                    size="sm"
                  >
                    All
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                    size="sm"
                  >
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                    size="sm"
                  >
                    Closed
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                    size="sm"
                  >
                    Resolved
                  </Button>
                </div>
              </div>

              {copiedTrades.map((trade) => (
                <Card
                  key={trade.id}
                  className="bg-white border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all"
                >
                  {/* Trader name and timestamp row */}
                  <div className="flex items-center justify-between mb-3">
                    <Link
                      href={`/trader/${trade.trader.toLowerCase()}`}
                      className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={trade.traderAvatar || "/placeholder.svg"} alt={trade.trader} />
                        <AvatarFallback className="bg-amber-500 text-white font-semibold">
                          {trade.trader.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-slate-900">{trade.trader}</p>
                        <p className="text-xs text-slate-500">Original trader</p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {trade.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <button
                        onClick={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {expandedTrade === trade.id ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Market question */}
                  <h3 className="font-semibold text-slate-900 text-base leading-snug mb-4">{trade.market}</h3>

                  <div className="bg-slate-50 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-4 divide-x divide-slate-200">
                      <div className="px-4 py-3 text-center">
                        <p className="text-xs text-slate-500 mb-2">Position</p>
                        <p
                          className={`font-semibold ${trade.position === "YES" ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {trade.position}
                        </p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-xs text-slate-500 mb-2">Entry</p>
                        <p className="font-semibold text-slate-900">{trade.entryPrice.toFixed(2)}</p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-xs text-slate-500 mb-2">ROI</p>
                        <p className={`font-semibold ${trade.pnlPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {trade.pnlPercent >= 0 ? "+" : ""}
                          {trade.pnlPercent.toFixed(1)}%
                        </p>
                      </div>
                      <div className="px-4 py-3 text-center">
                        <p className="text-xs text-slate-500 mb-2">Status</p>
                        <Badge
                          variant="outline"
                          className={
                            trade.status === "open"
                              ? "border-blue-200 text-blue-700 bg-blue-50"
                              : "border-slate-200 text-slate-600 bg-slate-50"
                          }
                        >
                          {trade.status}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mt-3">
                    Opened{" "}
                    {trade.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
                    at {trade.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>

                  {/* Expanded details */}
                  {expandedTrade === trade.id && (
                    <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Current Price</p>
                          <p className="font-semibold text-slate-900">${trade.currentPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Shares</p>
                          <p className="font-semibold text-slate-900">{trade.shares}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Amount Invested</p>
                          <p className="font-semibold text-slate-900">{formatCompactNumber(trade.amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">P&L</p>
                          <p className={`font-semibold ${trade.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {trade.pnl >= 0 ? "+" : ""}${Math.abs(trade.pnl)}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50 bg-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTrade(trade)
                            setIsMarkClosedModalOpen(true)
                          }}
                        >
                          <Check className="h-4 w-4 mr-1.5" />
                          Mark as Closed
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 bg-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedTrade(trade)
                            setIsEditModalOpen(true)
                          }}
                        >
                          <Edit2 className="h-4 w-4 mr-1.5" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="px-3 border-red-300 text-red-600 hover:bg-red-50 bg-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log("Delete trade:", trade.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === "performance" && (
            <div className="text-center py-12 text-slate-500">Performance metrics coming soon...</div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="text-center py-12 text-slate-500">Settings options coming soon...</div>
          )}
        </div>
      </div>
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} />
      <ConnectWalletModal
        open={isConnectModalOpen}
        onOpenChange={setIsConnectModalOpen}
        onConnect={handleWalletConnect}
      />
      <MarkTradeClosed
        isOpen={isMarkClosedModalOpen}
        onClose={() => setIsMarkClosedModalOpen(false)}
        trade={selectedTrade}
        onConfirm={(exitPrice) => {
          console.log("Trade closed at:", exitPrice)
          setIsMarkClosedModalOpen(false)
        }}
      />
      <EditCopiedTrade
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        trade={selectedTrade}
        onSave={(entryPrice, amountInvested) => {
          console.log("Trade updated:", { entryPrice, amountInvested })
          setIsEditModalOpen(false)
        }}
      />
    </div>
  )
}
