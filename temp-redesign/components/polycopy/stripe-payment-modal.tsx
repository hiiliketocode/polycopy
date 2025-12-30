"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Crown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface StripePaymentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StripePaymentModal({ open, onOpenChange }: StripePaymentModalProps) {
  const router = useRouter()
  const [paymentComplete, setPaymentComplete] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Simulate payment completion after 3 seconds (for demo purposes)
  // In production, this would be triggered by Stripe webhook/callback
  const handlePaymentIframeLoad = () => {
    console.log("[v0] Stripe iframe loaded")
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(true)
      setTimeout(() => {
        setPaymentComplete(true)
        setIsProcessing(false)
      }, 2000)
    }, 3000)
  }

  const handleGetStarted = () => {
    console.log("[v0] Redirecting to feed after premium upgrade")
    onOpenChange(false)
    router.push("/feed")
  }

  const handleClose = (open: boolean) => {
    if (!isProcessing) {
      onOpenChange(open)
      // Reset state when modal closes
      if (!open) {
        setTimeout(() => {
          setPaymentComplete(false)
          setIsProcessing(false)
        }, 300)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {!paymentComplete ? (
          <>
            {/* Payment Header */}
            <div className="bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 p-6 pb-5 text-white flex-shrink-0">
              <div className="flex items-center gap-3 mb-1.5">
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-2">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-white">Complete Your Purchase</h2>
              </div>
              <p className="text-yellow-50 text-sm">Secure checkout powered by Stripe</p>
            </div>

            {/* Payment Iframe Container */}
            <div className="p-6 relative">
              {isProcessing && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-yellow-500 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-700">Processing payment...</p>
                  </div>
                </div>
              )}

              {/* Stripe Iframe Placeholder */}
              <div className="bg-slate-50 rounded-lg border-2 border-slate-200 overflow-hidden">
                <iframe
                  src="about:blank"
                  className="w-full h-[400px] border-0"
                  title="Stripe Payment"
                  onLoad={handlePaymentIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              </div>

              <div className="mt-4 text-center">
                <p className="text-xs text-slate-500">🔒 Your payment information is secure and encrypted</p>
              </div>
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
