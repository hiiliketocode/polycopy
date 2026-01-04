"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface MarkTradeCopiedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade: {
    market: string
    traderName: string
    position: "YES" | "NO"
    traderPrice: number
  }
  isPremium?: boolean
  onConfirm?: (entryPrice: number, amountInvested?: number) => Promise<void>
}

export function MarkTradeCopiedModal({ open, onOpenChange, trade, isPremium = false, onConfirm }: MarkTradeCopiedModalProps) {
  const [entryPrice, setEntryPrice] = useState("")
  const [amountInvested, setAmountInvested] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  if (!trade) return null

  const handleConfirm = async () => {
    if (!entryPrice) return;
    
    setIsSubmitting(true);
    
    try {
      const price = parseFloat(entryPrice);
      const amount = amountInvested ? parseFloat(amountInvested) : undefined;
      
      if (onConfirm) {
        await onConfirm(price, amount);
      }
      
      onOpenChange(false);
      // Reset form
      setEntryPrice("");
      setAmountInvested("");
    } catch (error) {
      console.error("Error confirming trade:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
    // Reset form
    setEntryPrice("")
    setAmountInvested("")
  }

  const handleUpgradeClick = () => {
    onOpenChange(false)
    router.push("/profile?upgrade=true")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="relative bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 p-6 pb-5">
          <DialogTitle className="text-xl font-semibold text-slate-900">Mark Trade as Copied</DialogTitle>
        </DialogHeader>

        {!isPremium && (
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-b border-yellow-200 px-6 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Upgrade to Premium</span> to track unlimited trades and get advanced
                  analytics
                </p>
              </div>
              <Button
                onClick={handleUpgradeClick}
                className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-semibold px-4 py-1.5 h-auto text-sm shadow-sm flex-shrink-0"
              >
                Upgrade
              </Button>
            </div>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Trade Context */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Market</span>
              <span className="text-sm text-slate-900 font-semibold text-right flex-1">{trade.market}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Trader</span>
              <span className="text-sm text-slate-900 font-semibold">{trade.traderName}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Position</span>
              <span className="text-sm font-semibold">
                <span className={trade.position === "YES" ? "text-emerald-700" : "text-red-700"}>{trade.position}</span>
                <span className="text-slate-500"> at </span>
                <span className="text-slate-900">${trade.traderPrice?.toFixed(2) ?? "0.00"}</span>
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entry-price" className="text-sm font-semibold text-slate-900">
                Your entry price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                <Input
                  id="entry-price"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="0.57"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="pl-7 h-11 border-slate-300 focus:border-[#FDB022] focus:ring-[#FDB022]"
                  required
                />
              </div>
              <p className="text-xs text-slate-500">
                The price you bought/sold at (trader&apos;s price: ${trade.traderPrice?.toFixed(2) ?? "0.00"})
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount-invested" className="text-sm font-semibold text-slate-900">
                Amount invested <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                <Input
                  id="amount-invested"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amountInvested}
                  onChange={(e) => setAmountInvested(e.target.value)}
                  className="pl-7 h-11 border-slate-300 focus:border-[#FDB022] focus:ring-[#FDB022]"
                />
              </div>
              <p className="text-xs text-slate-500">Track how much you invested to calculate your ROI later</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-11 border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!entryPrice || isSubmitting}
              className="flex-1 h-11 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmitting ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
