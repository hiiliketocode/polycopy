"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle, Wallet, ArrowRight } from 'lucide-react'

interface SubscriptionSuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnectWallet: () => void
}

export function SubscriptionSuccessModal({
  open,
  onOpenChange,
  onConnectWallet,
}: SubscriptionSuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(550px,calc(100vw-2rem))] gap-0 border-0 bg-poly-cream p-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="bg-poly-yellow px-8 pb-6 pt-8">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 bg-profit-green text-white text-sm font-sans font-bold">
                <CheckCircle className="h-5 w-5" />
              </div>
              <span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black/60">Payment Complete</span>
            </div>
            <div className="w-12 h-0.5 bg-poly-black/20"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 bg-poly-black text-poly-yellow text-sm font-sans font-bold">
                2
              </div>
              <span className="font-sans text-xs font-bold uppercase tracking-widest text-poly-black">Connect Wallet</span>
            </div>
          </div>

          <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-poly-black text-center leading-tight">
            Complete Setup to Start Copy Trading!
          </DialogTitle>
          <DialogDescription className="text-center font-body text-poly-black/60 mt-3 text-base px-4">
            Connect your wallet to automatically copy trades
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border bg-white px-8 py-6 space-y-4">
          <div className="p-5 bg-poly-yellow/10 border border-poly-yellow/30 text-center">
            <div className="flex justify-center mb-3">
              <div className="p-2 bg-poly-yellow/20">
                <Wallet className="h-5 w-5 text-poly-black" />
              </div>
            </div>
            <h3 className="font-sans font-bold text-poly-black mb-3 text-lg uppercase tracking-wide">
              Connect your Polymarket Wallet
            </h3>
            <p className="text-sm font-body text-poly-black/60 mb-2 leading-relaxed">
              Your premium subscription is active, but you need to connect your wallet to unlock Real Copy Trading.
            </p>
            <p className="text-sm font-sans font-bold text-poly-black uppercase tracking-wide">
              Without this step, you won&apos;t be able to automatically copy trades from top traders.
            </p>
          </div>

          <div className="p-3 bg-poly-cream border border-border">
            <p className="text-sm font-body text-poly-black/60 text-center flex items-center justify-center gap-2">
              <span className="font-sans font-bold text-poly-black">Secure connection via Turnkey</span>
              <span className="text-poly-black/30">&bull;</span>
              <span>Takes less than 2 minutes</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-8 py-6">
          <button
            onClick={onConnectWallet}
            className="w-full bg-poly-black py-4 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black flex items-center justify-center gap-2"
          >
            <Wallet className="h-5 w-5" />
            Connect Wallet & Complete Setup
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="font-body text-xs text-poly-black/40 hover:text-poly-black/60 underline"
          >
            Skip for now (you can connect later from your profile)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
