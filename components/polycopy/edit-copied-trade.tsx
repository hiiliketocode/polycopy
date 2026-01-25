"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface EditCopiedTradeProps {
  isOpen: boolean
  onClose: () => void
  trade: any | null
  onSave: (entryPrice: number, amountInvested: number | null) => void
}

export function EditCopiedTrade({ isOpen, onClose, trade, onSave }: EditCopiedTradeProps) {
  const [entryPrice, setEntryPrice] = useState("")
  const [amountInvested, setAmountInvested] = useState("")

  useEffect(() => {
    if (trade) {
      setEntryPrice(trade.entryPrice.toString())
      setAmountInvested(trade.amount?.toString() || "")
    }
  }, [trade])

  const handleSave = () => {
    const price = Number.parseFloat(entryPrice)
    const amount = amountInvested ? Number.parseFloat(amountInvested) : null

    if (!isNaN(price) && price > 0) {
      onSave(price, amount)
      setEntryPrice("")
      setAmountInvested("")
    }
  }

  if (!trade) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-white border-slate-200">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-6">
          <h2 className="text-2xl font-bold text-slate-900">Edit Copied Trade</h2>
          <p className="text-slate-800 text-sm mt-1">Update your entry price and investment amount.</p>
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
              <span className="text-slate-500">Outcome:</span>
              <span className="ml-2 font-medium text-slate-900">{trade.position}</span>
            </div>
          </div>

          {/* Entry price input */}
          <div className="space-y-2">
            <Label htmlFor="entry-price" className="text-sm font-medium text-slate-700">
              Entry Price <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <Input
                id="entry-price"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                step="0.01"
                placeholder="0.73"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="pl-7 border-slate-300 focus:border-purple-500 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Amount invested input */}
          <div className="space-y-2">
            <Label htmlFor="amount-invested" className="text-sm font-medium text-slate-700">
              Amount Invested (optional)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <Input
                id="amount-invested"
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                step="1"
                placeholder="10"
                value={amountInvested}
                onChange={(e) => setAmountInvested(e.target.value)}
                className="pl-7 border-slate-300 focus:border-purple-500 focus:ring-purple-500"
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
            onClick={handleSave}
            disabled={!entryPrice || Number.parseFloat(entryPrice) <= 0}
            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
          >
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
