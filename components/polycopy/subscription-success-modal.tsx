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
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <DialogTitle className="text-2xl font-bold text-center text-slate-900">
            Welcome to Polycopy Premium! 🎉
          </DialogTitle>
          <DialogDescription className="text-center text-slate-600 mt-2">
            Your subscription is now active. Let's get you set up!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 my-6">
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Next Step: Connect Your Polymarket Wallet
            </h3>
            <p className="text-sm text-yellow-700 mb-3">
              To start using Real Copy Trading, you'll need to connect your Polymarket wallet to Polycopy.
            </p>
            <div className="space-y-2 text-sm text-yellow-700">
              <p className="flex items-start gap-2">
                <span className="font-bold shrink-0">1.</span>
                <span>Look for the <span className="font-semibold">"Connect Wallet"</span> button at the top of your profile page</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="font-bold shrink-0">2.</span>
                <span>Click it to securely link your Polymarket wallet</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="font-bold shrink-0">3.</span>
                <span>Once connected, you can start copying trades automatically!</span>
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-700">
              <strong className="font-semibold">Quick tip:</strong> You can also connect your wallet by clicking the button below. Make sure you have your Polymarket account ready!
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={onConnectWallet}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
            size="lg"
          >
            <Wallet className="mr-2 h-5 w-5" />
            Connect Polymarket Account
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="w-full"
          >
            I'll Do This Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
