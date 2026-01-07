"use client"

import { Check, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useUpgrade } from "@/hooks/useUpgrade"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const { upgrade, loading } = useUpgrade()

  const handleUpgrade = async () => {
    await upgrade()
    // Modal will auto-close when user navigates to Stripe
  }

  const premiumFeatures = [
    "Automatically copy trades in Polycopy using your Polymarket wallet",
    "Advanced trade features, like limit orders, slippage, and more",
    "Receive copied trade status alerts via WhatsApp",
    "Copy portfolio performance tracking",
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
            <div className="bg-gradient-to-br from-slate-50 to-white border-2 border-yellow-400 rounded-xl p-5">
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

            {/* CTA Button */}
            <Button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-white font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Crown className="h-5 w-5 mr-2" />
              {loading ? "Loading..." : "Upgrade Now"}
            </Button>

            {/* Trust indicators */}
            <div className="pt-1 text-center space-y-0.5">
              <p className="text-xs text-slate-500">🔒 Secure payment • Cancel anytime</p>
              <p className="text-xs text-slate-400">Join 1,000+ premium traders</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
