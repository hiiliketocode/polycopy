"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface MarkTradeClosedProps {
  isOpen: boolean
  onClose: () => void
  trade: any | null
  onConfirm: (exitPrice: number) => void
}

export function MarkTradeClosed({ isOpen, onClose, trade, onConfirm }: MarkTradeClosedProps) {
  const [exitPrice, setExitPrice] = useState("")

  const handleConfirm = () => {
    const price = Number.parseFloat(exitPrice)
    if (!isNaN(price) && price > 0) {
      onConfirm(price)
      setExitPrice("")
    }
  }

  if (!trade) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white border-slate-200">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-6">
          <h2 className="text-2xl font-bold text-slate-900">Mark Trade as Closed</h2>
          <p className="text-slate-800 text-sm mt-1">Enter the price you sold at to calculate your final ROI.</p>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Trade details */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="text-sm">
              <span className="text-slate-500">Market:</span>
              <span className="ml-2 font-medium text-slate-900">{trade.market}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-500">Entry Price:</span>
              <span className="ml-2 font-medium text-slate-900">{trade.entryPrice}¢</span>
            </div>
          </div>

          {/* Exit price input */}
          <div className="space-y-2">
            <Label htmlFor="exit-price" className="text-sm font-medium text-slate-700">
              Exit Price (in cents) <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¢</span>
              <Input
                id="exit-price"
                type="number"
                step="0.01"
                placeholder="e.g. 65"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                className="pl-7 border-slate-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer with actions */}
        <div className="flex gap-3 px-6 pb-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-50 bg-transparent"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!exitPrice || Number.parseFloat(exitPrice) <= 0}
            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
