"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface EditCopiedTradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trade?: {
    market: string
    outcome: string
    entryPrice: number
    totalInvested?: number
  }
  onSave: (entryPrice: number, amountInvested?: number) => void
}

export function EditCopiedTradeModal({ open, onOpenChange, trade, onSave }: EditCopiedTradeModalProps) {
  const [entryPrice, setEntryPrice] = useState("")
  const [amountInvested, setAmountInvested] = useState("")

  useEffect(() => {
    if (trade && open) {
      setEntryPrice(trade.entryPrice.toFixed(2))
      setAmountInvested(trade.totalInvested ? trade.totalInvested.toFixed(2) : "")
    }
  }, [trade, open])

  if (!trade) return null

  const handleSave = () => {
    const price = Number.parseFloat(entryPrice)
    const amount = amountInvested ? Number.parseFloat(amountInvested) : undefined
    if (!isNaN(price) && price > 0) {
      onSave(price, amount)
      setEntryPrice("")
      setAmountInvested("")
    }
  }

  const handleCancel = () => {
    onOpenChange(false)
    setEntryPrice("")
    setAmountInvested("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="relative bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 p-6 pb-5">
          <DialogTitle className="text-xl font-semibold text-slate-900">Edit Copied Trade</DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600">Update your entry price and investment amount.</p>

          {/* Trade Context */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Market</span>
              <span className="text-sm text-slate-900 font-semibold text-right flex-1">{trade.market}</span>
            </div>
            <div className="h-px bg-slate-200" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 font-medium">Outcome</span>
              <span className="text-sm text-slate-900 font-semibold">{trade.outcome}</span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="entry-price" className="text-sm font-semibold text-slate-900">
                Entry Price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                <Input
                  id="entry-price"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  placeholder="0.73"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="pl-7 h-11 border-slate-300 focus:border-[#FDB022] focus:ring-[#FDB022]"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount-invested" className="text-sm font-semibold text-slate-900">
                Amount Invested <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                <Input
                  id="amount-invested"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="10"
                  value={amountInvested}
                  onChange={(e) => setAmountInvested(e.target.value)}
                  className="pl-7 h-11 border-slate-300 focus:border-[#FDB022] focus:ring-[#FDB022]"
                />
              </div>
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
              onClick={handleSave}
              disabled={!entryPrice}
              className="flex-1 h-11 bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
