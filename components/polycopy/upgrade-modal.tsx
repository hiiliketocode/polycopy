"use client"

import { useState } from "react"
import { Check, Crown, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpgrade = async () => {
    console.log("[v0] Redirecting to Stripe hosted checkout")
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      // Redirect to Stripe checkout
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (err: any) {
      console.error('❌ Checkout error:', err)
      setError(err.message || 'Failed to start checkout')
      setLoading(false)
    }
  }

  const premiumFeatures = [
    "Track unlimited trades",
    "Advanced analytics and insights",
    "Real-time notifications",
    "Priority support",
    "Export trade history",
    "Custom alerts and filters",
    "Portfolio performance tracking",
    "Early access to new features",
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="relative bg-gradient-to-br from-yellow-400 via-amber-400 to-yellow-500 p-6 pb-5 text-white flex-shrink-0">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="bg-white/20 backdrop-blur-sm rounded-full p-2">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold text-white">Upgrade to Premium</DialogTitle>
            </div>
            <p className="text-yellow-50 text-sm">Unlock powerful features to maximize your trading success</p>
          </DialogHeader>

          <div className="p-6 space-y-5 overflow-y-auto">
            {/* Pricing */}
            <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-yellow-400 rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-2.5 right-2.5">
                <div className="bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  BEST VALUE
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-slate-900">$20</span>
                <span className="text-base text-slate-600">/month</span>
              </div>
              <p className="text-sm text-slate-500">Billed monthly, cancel anytime</p>
            </div>

            {/* Features List */}
            <div className="space-y-2.5">
              <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">What's Included</h3>
              <div className="grid grid-cols-1 gap-2">
                {premiumFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <div className="flex-shrink-0 bg-emerald-100 rounded-full p-0.5">
                      <Check className="h-4 w-4 text-emerald-700" />
                    </div>
                    <span className="text-sm text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* CTA Button */}
            <Button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Redirecting to checkout...
                </>
              ) : (
                <>
                  <Crown className="h-5 w-5 mr-2" />
                  Upgrade Now
                </>
              )}
            </Button>

            {/* Trust indicators */}
            <div className="pt-1 text-center space-y-0.5">
              <p className="text-xs text-slate-500">🔒 Secure payment by Stripe • Cancel anytime</p>
              <p className="text-xs text-slate-400">Join 1,000+ premium traders</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
