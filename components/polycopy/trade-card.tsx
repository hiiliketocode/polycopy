"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Settings2, Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

interface TradeCardProps {
  trader: {
    name: string
    avatar?: string
    address: string
    id?: string
    roi?: number
  }
  market: string
  marketAvatar?: string
  position: "YES" | "NO"
  action: "Buy" | "Sell"
  price: number
  size: number
  total: number
  timestamp: string
  onCopyTrade?: () => void
  onMarkAsCopied?: () => void
  onAdvancedCopy?: () => void
  isPremium?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  isCopied?: boolean
  // Trade execution data
  conditionId?: string
  tokenId?: string
  marketSlug?: string
  // Live data
  currentMarketPrice?: number
  liveScore?: string
  category?: string
  marketStatus?: "open" | "closed"
}

export function TradeCard({
  trader,
  market,
  marketAvatar,
  position,
  action,
  price,
  size,
  total,
  timestamp,
  onCopyTrade,
  onMarkAsCopied,
  onAdvancedCopy,
  isPremium = false,
  isExpanded = false,
  onToggleExpand,
  isCopied = false,
  conditionId,
  tokenId,
  marketSlug,
  currentMarketPrice,
  liveScore,
  category,
  marketStatus,
}: TradeCardProps) {
  const [usdAmount, setUsdAmount] = useState<string>("")
  const [autoClose, setAutoClose] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [localCopied, setLocalCopied] = useState(isCopied)
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (isCopied && !localCopied) {
      setLocalCopied(true)
    }
  }, [isCopied, localCopied])

  const formatWallet = (value: string) => {
    const trimmed = value?.trim() || ""
    if (trimmed.length <= 10) return trimmed
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
  }

  const isUuid = (value?: string | null) =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

  const displayAddress = formatWallet(trader.address || "")
  const copiedTraderId = isUuid(trader.id) ? trader.id! : null

  const currentPrice = currentMarketPrice || (price * (0.98 + Math.random() * 0.04)) // Use live price or simulate
  const priceChange = currentMarketPrice ? ((currentMarketPrice - price) / price) * 100 : 0
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral'
  const isClosed = marketStatus === 'closed'

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value)
  }

  const calculateContracts = () => {
    const amount = Number.parseFloat(usdAmount)
    if (isNaN(amount) || amount <= 0) return 0
    return Math.floor(amount / currentPrice)
  }

  const refreshOrders = async () => {
    setRefreshStatus('refreshing')
    try {
      await fetch('/api/polymarket/orders/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setRefreshStatus('done')
    } catch (error) {
      console.warn('Order refresh failed', error)
      setRefreshStatus('error')
    } finally {
      setTimeout(() => setRefreshStatus('idle'), 3000)
    }
  }

  const handleQuickCopy = async () => {
    if (isClosed) return
    if (!isPremium) {
      // Non-premium users: just open Polymarket
      onCopyTrade?.()
      return
    }

    setIsSubmitting(true)
    
    try {
      const amount = Number.parseFloat(usdAmount)
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount')
        setIsSubmitting(false)
        return
      }

      // Calculate contracts from USD amount
      const contracts = calculateContracts()
      if (contracts <= 0) {
        alert('Amount is too small to purchase any contracts')
        setIsSubmitting(false)
        return
      }

      // If we don't have tokenId, we need to fetch it from conditionId + outcome
      let finalTokenId = tokenId
      if (!finalTokenId && conditionId) {
        try {
          // Fetch market data to get tokenId
          const marketResponse = await fetch(`/api/polymarket/market?conditionId=${conditionId}`)
          if (marketResponse.ok) {
            const marketData = await marketResponse.json()
            // Find the token matching the outcome
            const tokens = marketData.tokens || []
            const matchingToken = tokens.find((t: any) => 
              t.outcome?.toUpperCase() === position.toUpperCase()
            )
            if (matchingToken?.token_id) {
              finalTokenId = matchingToken.token_id
            }
          }
        } catch (error) {
          console.error('Failed to fetch market data:', error)
        }
      }

      if (!finalTokenId) {
        alert('Unable to determine token ID. Please use Advanced mode.')
        setIsSubmitting(false)
        return
      }

      // Execute the trade via API
      const response = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId: finalTokenId,
          price: currentPrice,
          amount: contracts,
          side: action === 'Buy' ? 'BUY' : 'SELL',
          orderType: 'IOC',
          confirm: true,
          copiedTraderId,
          copiedTraderWallet: trader.address,
          copiedTraderUsername: trader.name,
          marketId: conditionId || (finalTokenId ? finalTokenId.slice(0, 66) : undefined),
          outcome: position,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || data?.message || 'Failed to execute trade')
      }

      // Success!
      setIsSubmitting(false)
      setIsSuccess(true)
      setLocalCopied(true)
      refreshOrders().catch(() => {
        /* handled in refreshOrders */
      })

      setTimeout(() => {
        setIsSuccess(false)
        onToggleExpand?.() // Collapse the dropdown
      }, 3000)

    } catch (error: any) {
      console.error('Trade execution error:', error)
      alert(error?.message || 'Failed to execute trade. Please try again.')
      setIsSubmitting(false)
    }
  }

  const handleCopyTradeClick = () => {
    if (isClosed) return
    if (isPremium && onToggleExpand && !localCopied) {
      onToggleExpand()
    } else if (!isPremium) {
      onCopyTrade?.()
    }
  }

  return (
    <div className="group bg-white border border-slate-200 rounded-xl overflow-hidden transition-all hover:shadow-lg">
      <div className="p-5 md:p-6">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <Link
            href={`/trader/${trader.id || "1"}`}
            className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity"
          >
            <Avatar className="h-10 w-10 ring-2 ring-slate-100 transition-all">
              <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-sm font-semibold">
                {trader.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-slate-900 text-sm">{trader.name}</p>
              <p className="text-xs text-slate-500 font-mono truncate">{displayAddress}</p>
            </div>
          </Link>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {/* Live Price & Odds Display (Always visible for all users) */}
              <div className="flex flex-col md:flex-row items-end md:items-center gap-1">
                {isClosed && (
                  <div className="flex items-center gap-1.5 px-2 py-1 h-7 rounded bg-rose-50 border border-rose-200 shadow-sm">
                    <span className="text-[10px] font-semibold text-rose-700 uppercase tracking-wide">Market Closed</span>
                  </div>
                )}
                {currentMarketPrice && (
                  <div className="flex items-center gap-1.5 px-2 py-1 h-7 rounded bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Price:</span>
                    <span className="text-xs font-bold text-slate-900">${currentMarketPrice.toFixed(2)}</span>
                    {priceDirection !== 'neutral' && (
                    <span className={`text-xs font-semibold flex items-center ${priceDirection === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {priceDirection === 'up' ? '↑' : '↓'}{Math.abs(priceChange).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
              {liveScore && (
                <div className="px-2 py-1 h-7 rounded bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-sm flex items-center">
                  <span className="text-[10px] font-semibold text-blue-900">{liveScore}</span>
                </div>
              )}
            </div>
            {/* Timestamp & Expand */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{timestamp}</span>
              {isPremium && onToggleExpand && !localCopied && !isClosed && (
                <button onClick={onToggleExpand} className="text-slate-400 hover:text-slate-600 transition-colors">
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
            <AvatarImage src={marketAvatar || "/placeholder.svg"} alt={market} />
            <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
              {market.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <h3 className="flex-1 text-base md:text-lg font-medium text-slate-900 leading-snug">{market}</h3>
        </div>

        <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1 font-medium">Position</p>
              <div className="flex flex-wrap md:flex-row md:items-center md:justify-center items-center justify-center gap-1">
                <Badge
                  variant="secondary"
                  className={`font-semibold text-xs ${
                    position === "YES"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {position}
                </Badge>
                <div className="flex items-center gap-0.5 text-xs text-slate-600">
                  {action === "Buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span className="font-medium">{action}</span>
                </div>
              </div>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Entry</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(price)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Size</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatNumber(size)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Total</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(total)}</p>
            </div>
          </div>
        </div>

        <div className={isPremium ? "w-full" : "grid grid-cols-2 gap-2"}>
          <Button
            onClick={handleCopyTradeClick}
            disabled={localCopied || isClosed}
            className={`font-semibold shadow-sm text-sm ${
              localCopied
                ? "w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                : isClosed
                  ? "w-full bg-slate-200 text-slate-500 cursor-not-allowed"
                  : isPremium
                    ? "w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900"
                    : "bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900"
            }`}
            size="lg"
          >
            {localCopied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Trade Copied
              </>
            ) : isClosed ? (
              "Market Closed"
            ) : (
              "Copy Trade"
            )}
          </Button>
          {!isPremium && (
            <Button
              onClick={onMarkAsCopied}
              variant="outline"
              disabled={isClosed}
              className={`font-medium text-sm transition-all ${
                isClosed
                  ? "border-slate-200 text-slate-400 cursor-not-allowed"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent"
              }`}
              size="lg"
            >
              {isClosed ? "Market Closed" : "Mark as Copied"}
            </Button>
          )}
        </div>
      </div>

      {isPremium && isExpanded && !localCopied && !isClosed && (
        <div className="border-t border-slate-200 bg-slate-50 p-6 space-y-5">
          {!isSuccess ? (
            <>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-4">Quick Copy</h4>

                {/* Amount Input */}
                <div className="space-y-2 mb-4">
                  <label htmlFor="amount" className="text-xs font-medium text-slate-700">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    <input
                      id="amount"
                      type="number"
                      value={usdAmount}
                      onChange={(e) => setUsdAmount(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0.00"
                      disabled={isSubmitting}
                      className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  {usdAmount && Number.parseFloat(usdAmount) > 0 && (
                    <p className="text-xs text-slate-500">≈ {calculateContracts().toLocaleString()} contracts</p>
                  )}
                </div>

                {/* Auto-close Checkbox */}
                <div className="flex items-start space-x-3 p-2.5 bg-white rounded-lg border border-slate-200 mb-4">
                  <Checkbox
                    id="auto-close"
                    checked={autoClose}
                    onCheckedChange={(checked) => setAutoClose(!!checked)}
                    disabled={isSubmitting}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="auto-close"
                      className="text-sm font-medium text-slate-900 cursor-pointer leading-tight"
                    >
                      Auto-close when trader closes
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Automatically close your position when {trader.name} closes theirs
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleQuickCopy}
                    disabled={!usdAmount || Number.parseFloat(usdAmount) <= 0 || isSubmitting}
                    className="flex-1 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing Trade...
                      </>
                    ) : (
                      "Execute Trade"
                    )}
                  </Button>
                  <Button
                    onClick={onAdvancedCopy}
                    variant="outline"
                    disabled={isSubmitting}
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent disabled:opacity-50"
                    size="lg"
                  >
                    <Settings2 className="w-4 h-4 mr-2" />
                    Advanced
                  </Button>
                </div>
                {refreshStatus === 'refreshing' && (
                  <p className="text-xs text-slate-600 mt-2">Refreshing order status…</p>
                )}
                {refreshStatus === 'done' && (
                  <p className="text-xs text-emerald-600 mt-2">Order submitted. Latest status will appear in Orders shortly.</p>
                )}
                {refreshStatus === 'error' && (
                  <p className="text-xs text-rose-600 mt-2">
                    Order sent, but status refresh failed. Check the Orders page for updates.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">Trade Executed Successfully!</h4>
              <p className="text-sm text-slate-600">
                Your copy trade of {formatCurrency(Number.parseFloat(usdAmount))} has been submitted to Polymarket
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
