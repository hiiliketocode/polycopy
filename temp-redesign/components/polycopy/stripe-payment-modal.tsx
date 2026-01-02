"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Crown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StripeEmbeddedForm } from "./stripe-embedded-form"

interface StripePaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StripePaymentModal({ open, onOpenChange }: StripePaymentModalProps) {
  const router = useRouter()
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const handlePaymentSuccess = () => {
    console.log('✅ Payment successful, showing confirmation')
    setPaymentComplete(true)
    
    // Refresh the page to update premium status
    setTimeout(() => {
      router.refresh()
    }, 100)
  }

  const handlePaymentError = (error: string) => {
    console.error('❌ Payment error:', error)
    setPaymentError(error)
  }

  const handleGetStarted = () => {
    onOpenChange(false)
    router.push('/feed')
    
    // Reset state after navigation
    setTimeout(() => {
      setPaymentComplete(false)
      setPaymentError(null)
    }, 500)
  }

  const handleClose = (open: boolean) => {
    if (paymentComplete) {
      // Allow closing if payment is complete
      onOpenChange(open)
      if (!open) {
        setTimeout(() => {
          setPaymentComplete(false)
          setPaymentError(null)
        }, 300)
      }
    } else {
      // Show confirmation dialog if payment not complete
      const shouldClose = window.confirm(
        'Are you sure you want to cancel? Your payment has not been completed.'
      )
      if (shouldClose) {
        onOpenChange(open)
        setTimeout(() => {
          setPaymentError(null)
        }, 300)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="sm:max-w-[500px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col"
        onInteractOutside={(e) => !paymentComplete && e.preventDefault()}
        onEscapeKeyDown={(e) => !paymentComplete && e.preventDefault()}
      >
        {!paymentComplete ? (
          <>
            {/* Payment Header */}
            <DialogHeader className="bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 p-6 pb-5 text-white flex-shrink-0 relative">
              <button
                onClick={() => handleClose(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-1.5">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-2">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <DialogTitle className="text-xl font-bold text-white">
                  Complete Your Purchase
                </DialogTitle>
              </div>
              <p className="text-yellow-50 text-sm">Secure checkout powered by Stripe</p>
            </DialogHeader>

            {/* Payment Form */}
            <div className="p-6 overflow-y-auto">
              <div className="mb-6">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-slate-900">$20</span>
                  <span className="text-base text-slate-600">/month</span>
                </div>
                <p className="text-sm text-slate-500">Billed monthly, cancel anytime</p>
              </div>

              <StripeEmbeddedForm 
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            </div>
          </>
        ) : (
          <>
            {/* Success Confirmation */}
            <div className="bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 p-8 text-center text-white flex-shrink-0">
              <div className="bg-white/20 backdrop-blur-sm rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Check className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Welcome to Premium!</h2>
              <p className="text-yellow-50 text-sm">Your payment was successful. You're now on Polycopy Premium.</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Success Details */}
              <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-yellow-400 rounded-xl p-5">
                <div className="flex items-start gap-4">
                  <div className="bg-yellow-100 rounded-full p-2 flex-shrink-0">
                    <Crown className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 mb-1">You're all set!</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      You now have access to all premium features including automated trade execution, advanced
                      analytics, real-time notifications, and priority support.
                    </p>
                  </div>
                </div>
              </div>

              {/* Get Started Button */}
              <Button
                onClick={handleGetStarted}
                className="w-full h-12 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all"
              >
                Get Started
              </Button>

              <p className="text-xs text-center text-slate-500">A confirmation email has been sent to your inbox</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
