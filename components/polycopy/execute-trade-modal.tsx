"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, ArrowUpRight, ArrowDownRight, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Link from "next/link"

interface ExecuteTradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade: {
    market: string
    traderName: string
    traderAvatar?: string
    traderAddress?: string
    traderId?: string
    position: "YES" | "NO"
    action: "Buy" | "Sell"
    traderPrice: number
    traderROI?: number
    marketStatus?: "open" | "closed"
  }
}

type ExecutionState = "confirming" | "executing" | "success"

export function ExecuteTradeModal({ open, onOpenChange, trade }: ExecuteTradeModalProps) {
  const [autoClose, setAutoClose] = useState(false)
  const [executionState, setExecutionState] = useState<ExecutionState>("confirming")
  const [executedPrice, setExecutedPrice] = useState<number>(0)
  const [slippage, setSlippage] = useState<number>(0)

  const [amountUSD, setAmountUSD] = useState<string>("100")
  const [slippageTolerance, setSlippageTolerance] = useState<string>("1")
  const [orderBehavior, setOrderBehavior] = useState<string>("immediate")
  const [customSlippage, setCustomSlippage] = useState<string>("")

  // Mock data
  const mockCashAvailable = 452.61
  const mockCurrentPrice = 0.054
  const mockPriceChange = 8.57

  if (!trade) return null

  const calculateContracts = (usd: string) => {
    const amount = Number.parseFloat(usd) || 0
    return (amount / mockCurrentPrice).toFixed(2)
  }

  const hasEnoughFunds = Number.parseFloat(amountUSD) <= mockCashAvailable

  const handleExecute = async () => {
    setExecutionState("executing")

    // Mock execution with delay
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Mock executed price with slight slippage
    const mockSlippage = Math.random() * 0.04 - 0.02 // -2% to +2%
    const finalPrice = trade.traderPrice * (1 + mockSlippage)
    setExecutedPrice(finalPrice)
    setSlippage(mockSlippage * 100)

    setExecutionState("success")
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset state after modal closes
    setTimeout(() => {
      setExecutionState("confirming")
      setAutoClose(false)
      setExecutedPrice(0)
      setSlippage(0)
      setAmountUSD("100")
      setSlippageTolerance("1")
      setOrderBehavior("immediate")
      setCustomSlippage("")
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[580px] p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 text-slate-900 p-6 pb-5 sticky top-0 z-10">
          <DialogTitle className="text-xl font-semibold">
            {executionState === "success" ? "Trade Executed Successfully" : "Copy Trade"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {executionState === "confirming" && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Trade You're Copying</h3>
                  {trade.marketStatus && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-semibold"
                    >
                      Market {trade.marketStatus === "open" ? "Open" : "Closed"}
                    </Badge>
                  )}
                </div>

                <div className="bg-white border-2 border-slate-200 rounded-xl p-5 space-y-4">
                  <Link
                    href={`/trader/${trade.traderId || "1"}`}
                    className="flex items-center gap-3 hover:opacity-70 transition-opacity"
                  >
                    <Avatar className="h-12 w-12 ring-2 ring-yellow-400">
                      <AvatarImage src={trade.traderAvatar || "/placeholder.svg"} alt={trade.traderName} />
                      <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-900 font-semibold">
                        {trade.traderName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900">{trade.traderName}</p>
                      {trade.traderAddress && (
                        <p className="text-xs text-slate-500 font-mono truncate">{trade.traderAddress}</p>
                      )}
                    </div>
                    {trade.traderROI !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-medium">Trader ROI</p>
                        <p
                          className={`text-sm font-bold ${trade.traderROI >= 0 ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {trade.traderROI >= 0 ? "+" : ""}
                          {trade.traderROI.toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </Link>

                  <div className="h-px bg-slate-200" />

                  {/* Market question */}
                  <p className="text-sm font-medium text-slate-900 leading-relaxed">{trade.market}</p>

                  <div className="h-px bg-slate-200" />

                  {/* Trade details grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium">Direction</p>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={`font-semibold text-xs ${
                            trade.position === "YES"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          {trade.position}
                        </Badge>
                        <div className="flex items-center gap-0.5 text-xs text-slate-600">
                          {trade.action === "Buy" ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          <span className="font-medium">{trade.action}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium">Trader Entry Price</p>
                      <p className="text-sm font-bold text-slate-900">${trade.traderPrice.toFixed(4)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Your Order</h3>
                  <p className="text-xs text-slate-600">
                    Cash Available: <span className="font-bold text-slate-900">${mockCashAvailable.toFixed(2)}</span>
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                  {/* Current Price */}
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-slate-600">Current Price / Contract:</p>
                    <p className="text-base font-bold text-slate-900">${mockCurrentPrice.toFixed(4)}</p>
                    <p className="text-xs font-semibold text-emerald-600">+{mockPriceChange}% since trade</p>
                  </div>

                  <div className="h-px bg-slate-200" />

                  {/* Amount Input */}
                  <div className="space-y-2">
                    <Label htmlFor="amount" className="text-sm font-medium text-slate-900">
                      Amount
                    </Label>
                    <div className="space-y-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 font-semibold">$</span>
                        <Input
                          id="amount"
                          type="number"
                          value={amountUSD}
                          onChange={(e) => setAmountUSD(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="pl-7 pr-24 h-11 border-slate-300 font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0.00"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-medium">
                          USD entry
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span>{Number.parseFloat(amountUSD || "0").toFixed(2)} USD</span>
                        <span>=</span>
                        <span className="font-semibold text-slate-900">
                          ≈ {calculateContracts(amountUSD)} contracts
                        </span>
                      </div>
                      {!hasEnoughFunds && (
                        <p className="text-xs font-semibold text-red-600">Not enough funds available.</p>
                      )}
                    </div>
                  </div>

                  {/* Slippage Tolerance */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-sm font-medium text-slate-900">Slippage Tolerance</Label>
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <div className="flex items-center gap-2">
                      {["0", "1", "3", "5"].map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant={slippageTolerance === value ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            setSlippageTolerance(value)
                            setCustomSlippage("")
                          }}
                          className={
                            slippageTolerance === value
                              ? "bg-slate-900 text-white hover:bg-slate-800 font-semibold"
                              : "border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                          }
                        >
                          {value}%
                        </Button>
                      ))}
                      <Input
                        type="number"
                        placeholder="Custom"
                        value={customSlippage}
                        onChange={(e) => {
                          setCustomSlippage(e.target.value)
                          setSlippageTolerance("custom")
                        }}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-20 h-8 text-xs border-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <p className="text-xs text-slate-600">
                      This order will only fill at $
                      {(
                        mockCurrentPrice *
                        (1 +
                          Number.parseFloat(slippageTolerance === "custom" ? customSlippage : slippageTolerance) / 100)
                      ).toFixed(4)}{" "}
                      per contract or less.
                    </p>
                  </div>

                  {/* Order Behavior */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-sm font-medium text-slate-900">Order Behavior</Label>
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <RadioGroup value={orderBehavior} onValueChange={setOrderBehavior} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="immediate" id="immediate" />
                        <Label htmlFor="immediate" className="text-sm font-medium text-slate-700 cursor-pointer">
                          Immediate or Cancel (recommended)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="good-til-canceled" id="gtc" />
                        <Label htmlFor="gtc" className="text-sm font-medium text-slate-700 cursor-pointer">
                          Good 'Til Canceled
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-xs text-slate-600">
                      This sends a limit order. It may fill immediately, partially, or not at all.
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto-close checkbox */}
              <div className="flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Checkbox id="auto-close" checked={autoClose} onCheckedChange={(checked) => setAutoClose(!!checked)} />
                <div className="flex-1">
                  <Label htmlFor="auto-close" className="text-sm font-medium text-slate-900 cursor-pointer">
                    Auto-close when trader closes position
                  </Label>
                  <p className="text-xs text-slate-600 mt-1">
                    Automatically close your position when {trade.traderName} closes theirs
                  </p>
                </div>
              </div>
            </>
          )}

          {executionState === "executing" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-amber-500" />
              <div className="text-center">
                <p className="font-semibold text-slate-900">Executing trade...</p>
                <p className="text-sm text-slate-600">Please wait while we process your order</p>
              </div>
            </div>
          )}

          {executionState === "success" && (
            <>
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="bg-emerald-100 rounded-full p-3">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-slate-900">Trade executed successfully!</p>
                  <p className="text-sm text-slate-600 mt-1">Your position is now open</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">Executed Price</span>
                  <span className="text-sm text-slate-900 font-bold">${executedPrice.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">Cost</span>
                  <span className="text-sm text-slate-900 font-bold">${Number.parseFloat(amountUSD).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">Amount</span>
                  <span className="text-sm text-slate-900 font-bold">
                    {(Number.parseFloat(amountUSD) / executedPrice).toFixed(2)} contracts
                  </span>
                </div>
              </div>
            </>
          )}

          <div className="flex items-center gap-3 pt-1">
            {executionState === "confirming" && (
              <>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1 h-11 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecute}
                  disabled={!hasEnoughFunds}
                  className="flex-1 h-11 bg-gradient-to-r from-yellow-400 via-amber-400 to-orange-400 hover:from-yellow-500 hover:via-amber-500 hover:to-orange-500 text-slate-900 font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send Order
                </Button>
              </>
            )}
            {executionState === "success" && (
              <Button
                onClick={handleClose}
                className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold"
              >
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
