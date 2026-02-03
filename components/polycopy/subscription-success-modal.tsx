"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
      <DialogContent className="sm:max-w-[550px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white text-sm font-semibold">
                <CheckCircle className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-slate-600">Payment Complete</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500 text-white text-sm font-semibold">
                2
              </div>
              <span className="text-sm font-medium text-slate-900">Connect Wallet</span>
            </div>
          </div>

          <DialogTitle className="text-3xl font-bold text-center text-slate-900 leading-tight">
            Complete Setup to Start Copy Trading!
          </DialogTitle>
          <DialogDescription className="text-center text-slate-600 mt-3 text-base px-4">
            Connect your wallet to automatically copy trades
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-6">
          <div className="p-5 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 rounded-xl border-2 border-amber-300 shadow-sm text-center">
            <div className="flex justify-center mb-3">
              <div className="p-2 bg-amber-200 rounded-lg">
                <Wallet className="h-5 w-5 text-amber-800" />
              </div>
            </div>
            <h3 className="font-bold text-amber-900 mb-3 text-lg">
              Connect your Polymarket Wallet
            </h3>
            <p className="text-sm text-amber-800 mb-2 leading-relaxed">
              Your premium subscription is active, but you need to connect your wallet to unlock Real Copy Trading.
            </p>
            <p className="text-sm text-amber-900 font-semibold">
              Without this step, you won't be able to automatically copy trades from top traders.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-sm text-slate-600 text-center flex items-center justify-center gap-2">
              <span className="text-green-600">🔒</span>
              <span className="font-medium">Secure connection via Turnkey</span>
              <span className="text-slate-400">•</span>
              <span>Takes less than 2 minutes</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={onConnectWallet}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            size="lg"
          >
            <Wallet className="mr-2 h-5 w-5" />
            Connect Wallet & Complete Setup
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Skip for now (you can connect later from your profile)
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
