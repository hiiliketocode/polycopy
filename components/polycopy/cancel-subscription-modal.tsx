"use client"

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertCircle, CheckCircle, Crown, Zap, TrendingUp, Lock } from 'lucide-react'

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
      <DialogContent className="sm:max-w-[600px]">
        {step === 1 ? (
          // Step 1: Reasons not to cancel
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <AlertCircle className="h-6 w-6" />
                Cancel Premium Subscription?
              </DialogTitle>
              <DialogDescription className="text-slate-600 mt-2">
                Before you go, here's what you'll be missing out on:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 my-6">
              <div className="flex gap-3 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200">
                <Zap className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">
                    Real Copy Trading
                  </h4>
                  <p className="text-sm text-slate-600">
                    Automatically execute trades on Polymarket when your favorite traders place orders. No manual copying required.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                <Lock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">
                    Auto-Close Positions
                  </h4>
                  <p className="text-sm text-slate-600">
                    Automatically close your copied positions when the original trader closes theirs. Never miss an exit.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-lg border border-emerald-200">
                <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">
                    Advanced Trading Tools
                  </h4>
                  <p className="text-sm text-slate-600">
                    Access sophisticated order management, position tracking, and trading analytics to maximize your profits.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <h4 className="font-semibold text-red-900">
                    Important: What Happens Next
                  </h4>
                </div>
                <ul className="text-sm text-red-700 space-y-1 ml-7">
                  <li>• Your subscription will end at the end of your billing period</li>
                  <li>• Your connected Polymarket wallet will be automatically disconnected</li>
                  <li>• All premium features will be disabled</li>
                  <li>• You can resubscribe anytime to regain access</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleDontCancel}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <Crown className="mr-2 h-4 w-4" />
                Keep Premium
              </Button>
              <Button
                onClick={handleProceedToConfirm}
                variant="outline"
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
              >
                Continue to Cancel
              </Button>
            </div>
          </>
        ) : (
          // Step 2: Confirmation
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600">
                Final Confirmation Required
              </DialogTitle>
              <DialogDescription className="text-slate-600 mt-2">
                This action cannot be undone. Type <span className="font-bold text-red-600">CANCEL</span> below to confirm.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 my-6">
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-700 font-medium mb-3">
                  By canceling, you confirm that:
                </p>
                <ul className="text-sm text-red-700 space-y-1 ml-4">
                  <li>✓ Your Premium subscription will end at the end of your billing period</li>
                  <li>✓ Your Polymarket wallet will be disconnected automatically</li>
                  <li>✓ You will lose access to all premium features</li>
                  <li>✓ Your manual trade history will be preserved</li>
                </ul>
              </div>

              <div>
                <label htmlFor="cancel-confirm" className="block text-sm font-medium text-slate-700 mb-2">
                  Type <span className="font-bold text-red-600">CANCEL</span> to confirm:
                </label>
                <Input
                  id="cancel-confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type CANCEL here"
                  className="text-center font-mono text-lg"
                  disabled={isCanceling}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep(1)}
                variant="outline"
                className="flex-1"
                disabled={isCanceling}
              >
                Go Back
              </Button>
              <Button
                onClick={handleFinalCancel}
                disabled={confirmText !== 'CANCEL' || isCanceling}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                {isCanceling ? 'Canceling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
