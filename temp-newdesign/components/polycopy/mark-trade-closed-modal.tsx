"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface MarkTradeClosedModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade?: {
    market: string
    position: "YES" | "NO"
    entryPrice: number
  }
  onConfirm: (exitPrice: number) => void
}

export function MarkTradeClosedModal({ open, onOpenChange, trade, onConfirm }: MarkTradeClosedModalProps) {
  const [exitPrice, setExitPrice] = useState("")

  if (!trade) return null

  const handleConfirm = () => {
    const price = Number.parseFloat(exitPrice)
    if (!isNaN(price) && price > 0) {
      onConfirm(price)
      setExitPrice("")
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
    setExitPrice("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="relative bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 p-6 pb-5">
          <DialogTitle className="text-xl font-semibold text-slate-900">Mark Trade as Closed</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600">Enter the price you sold at to calculate your final ROI.</p>

          {/* Trade Context */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Market</span>
              <span className="text-sm text-slate-900 font-semibold text-right flex-1">{trade.market}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Entry Price</span>
              <span className="text-sm text-slate-900 font-semibold">${(trade.entryPrice * 100).toFixed(0)}¢</span>
            </div>
          </div>

          {/* Form Field */}
          <div className="space-y-2">
            <Label htmlFor="exit-price" className="text-sm font-semibold text-slate-900">
              Exit Price (in cents)
            </Label>
            <div className="relative">
              <Input
                id="exit-price"
                type="number"
                step="1"
                min="0"
                max="100"
                placeholder="e.g. 65"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="pr-8 h-11 border-slate-300 focus:border-[#FDB022] focus:ring-[#FDB022]"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">¢</span>
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
              disabled={!exitPrice}
              className="flex-1 h-11 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
