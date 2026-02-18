"use client"

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AlertCircle, Zap, TrendingUp, Lock } from 'lucide-react'

interface CancelSubscriptionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmCancel: () => Promise<void>
}

export function CancelSubscriptionModal({
  open,
  onOpenChange,
  onConfirmCancel,
}: CancelSubscriptionModalProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmText, setConfirmText] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)

  const handleClose = () => {
    setStep(1)
    setConfirmText('')
    setIsCanceling(false)
    onOpenChange(false)
  }

  const handleDontCancel = () => {
    handleClose()
  }

  const handleProceedToConfirm = () => {
    setStep(2)
  }

  const handleFinalCancel = async () => {
    if (confirmText !== 'CANCEL') return

    setIsCanceling(true)
    try {
      await onConfirmCancel()
      handleClose()
    } catch (error) {
      console.error('Cancellation failed:', error)
      setIsCanceling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[min(600px,calc(100vw-2rem))] gap-0 border-0 bg-poly-cream p-0 overflow-hidden">
        {step === 1 ? (
          <>
            <DialogHeader className="bg-loss-red/10 px-8 pb-6 pt-8">
              <div className="font-sans text-xs font-bold uppercase tracking-widest text-loss-red/60">
                ARE YOU SURE?
              </div>
              <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-loss-red flex items-center gap-2 mt-1">
                <AlertCircle className="h-6 w-6" />
                Cancel Premium Subscription?
              </DialogTitle>
              <DialogDescription className="font-body text-poly-black/60 mt-2">
                Before you go, here&apos;s what you&apos;ll be missing out on:
              </DialogDescription>
            </DialogHeader>

            <div className="border-b border-border bg-white px-8 py-6 space-y-4">
              <div className="flex gap-3 p-4 bg-poly-yellow/10 border border-poly-yellow/30">
                <Zap className="h-5 w-5 text-poly-yellow shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-sans font-bold text-poly-black mb-1 uppercase tracking-wide text-sm">
                    Real Copy Trading
                  </h4>
                  <p className="text-sm font-body text-poly-black/60">
                    Automatically execute trades on Polymarket when your favorite traders place orders. No manual copying required.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4 bg-info-blue/10 border border-info-blue/30">
                <Lock className="h-5 w-5 text-info-blue shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-sans font-bold text-poly-black mb-1 uppercase tracking-wide text-sm">
                    Auto-Close Positions
                  </h4>
                  <p className="text-sm font-body text-poly-black/60">
                    Automatically close your copied positions when the original trader closes theirs. Never miss an exit.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4 bg-profit-green/10 border border-profit-green/30">
                <TrendingUp className="h-5 w-5 text-profit-green shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-sans font-bold text-poly-black mb-1 uppercase tracking-wide text-sm">
                    Advanced Trading Tools
                  </h4>
                  <p className="text-sm font-body text-poly-black/60">
                    Access sophisticated order management, position tracking, and trading analytics to maximize your profits.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-loss-red/10 border border-loss-red/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-loss-red" />
                  <h4 className="font-sans font-bold text-loss-red uppercase tracking-wide text-sm">
                    Important: What Happens Next
                  </h4>
                </div>
                <ul className="text-sm font-body text-poly-black/60 space-y-1 ml-7">
                  <li>Your subscription will end at the end of your billing period</li>
                  <li>Your connected Polymarket wallet will be automatically disconnected</li>
                  <li>All premium features will be disabled</li>
                  <li>You can resubscribe anytime to regain access</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 px-8 py-6">
              <button
                onClick={handleDontCancel}
                className="flex-1 bg-poly-yellow py-3 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow flex items-center justify-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Keep Premium
              </button>
              <button
                onClick={handleProceedToConfirm}
                className="flex-1 border border-loss-red/30 py-3 font-sans text-xs font-bold uppercase tracking-[0.2em] text-loss-red transition-all hover:bg-loss-red/10"
              >
                Continue to Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="bg-loss-red/10 px-8 pb-6 pt-8">
              <div className="font-sans text-xs font-bold uppercase tracking-widest text-loss-red/60">
                FINAL STEP
              </div>
              <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight text-loss-red mt-1">
                Final Confirmation Required
              </DialogTitle>
              <DialogDescription className="font-body text-poly-black/60 mt-2">
                This action cannot be undone. Type <span className="font-sans font-bold text-loss-red">CANCEL</span> below to confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="border-b border-border bg-white px-8 py-6 space-y-6">
              <div className="p-4 bg-loss-red/10 border border-loss-red/30">
                <p className="text-sm font-sans font-bold text-loss-red mb-3 uppercase tracking-wide">
                  By canceling, you confirm that:
                </p>
                <ul className="text-sm font-body text-poly-black/60 space-y-1 ml-4">
                  <li>Your Premium subscription will end at the end of your billing period</li>
                  <li>Your Polymarket wallet will be disconnected automatically</li>
                  <li>You will lose access to all premium features</li>
                  <li>Your manual trade history will be preserved</li>
                </ul>
              </div>

              <div>
                <label htmlFor="cancel-confirm" className="block font-sans text-xs font-bold uppercase tracking-widest text-poly-black/50 mb-2">
                  Type <span className="text-loss-red">CANCEL</span> to confirm:
                </label>
                <Input
                  id="cancel-confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CANCEL here"
                  className="text-center font-mono text-lg border-border"
                  disabled={isCanceling}
                />
              </div>
            </div>

            <div className="flex gap-3 px-8 py-6">
              <button
                onClick={() => setStep(1)}
                disabled={isCanceling}
                className="flex-1 border border-border py-3 font-sans text-xs font-bold uppercase tracking-[0.2em] text-poly-black transition-all hover:bg-poly-black/5 disabled:opacity-50"
              >
                Go Back
              </button>
              <button
                onClick={handleFinalCancel}
                disabled={confirmText !== 'CANCEL' || isCanceling}
                className="flex-1 bg-loss-red py-3 font-sans text-xs font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-loss-red/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCanceling ? 'Canceling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
