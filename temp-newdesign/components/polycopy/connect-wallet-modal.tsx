"use client"

import type React from "react"

import { useState } from "react"
import { Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

interface ConnectWalletModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: (walletAddress: string) => void
}

export function ConnectWalletModal({ open, onOpenChange, onConnect }: ConnectWalletModalProps) {
  const [walletAddress, setWalletAddress] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    console.log("[v0] Connecting wallet:", walletAddress)

    await new Promise((resolve) => setTimeout(resolve, 1000))

    if (onConnect) {
      onConnect(walletAddress)
    }

    setIsSubmitting(false)
    onOpenChange(false)
    setWalletAddress("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="relative bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 p-6 pb-5">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="bg-slate-100 rounded-full p-2">
              <Wallet className="h-5 w-5 text-slate-700" />
            </div>
            <DialogTitle className="text-xl font-semibold text-slate-900">Connect Polymarket Wallet</DialogTitle>
          </div>
          <p className="text-slate-600 text-sm">
            Input your Polymarket wallet address to sync the trades you've made on Polymarket.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Steps */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm">Steps:</h3>
            <ol className="space-y-2.5 list-decimal list-inside text-sm text-slate-700">
              <li>Go to your profile on Polymarket.com</li>
              <li>
                To the right of your username, click the icon that looks like a head in a box to copy your wallet
                address
              </li>
              <li>Paste that address in the box below</li>
            </ol>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label htmlFor="wallet-address" className="text-sm font-medium text-slate-900">
              Wallet Address
            </label>
            <Input
              id="wallet-address"
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="w-full"
              required
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting || !walletAddress}
            className="w-full h-11 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-900 font-semibold text-base shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Connecting..." : "Connect Wallet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
