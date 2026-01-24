"use client"

import { Crown, TrendingUp, Zap, Shield, LineChart, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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
    {
      icon: TrendingUp,
      title: "Execute trades directly",
      description: "Copy trades in seconds with pre-filled slippage",
      note: "Requires existing Polymarket account"
    },
    {
      icon: Zap,
      title: "Auto-close positions",
      description: "Set trades to close when copied trader exits"
    },
    {
      icon: Shield,
      title: "Advanced trade controls",
      description: "Limit orders, custom slippage, and more"
    },
    {
      icon: LineChart,
      title: "Portfolio tracking",
      description: "Monitor your copy trading performance"
    },
    {
      icon: Sparkles,
      title: "Early access",
      description: "Get new features before everyone else"
    }
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 border-0 bg-gradient-to-b from-white to-slate-50 max-h-[90vh] overflow-y-auto">
        <div className="p-5 pb-4">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 mb-2 shadow-lg">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              Unlock All Features
            </h2>
            <p className="text-slate-600 text-sm">
              The complete trading toolkit for serious Polymarket traders
            </p>
          </div>

          {/* Pricing Card */}
          <div className="relative bg-white rounded-xl p-4 mb-4 shadow-xl overflow-hidden">
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-500 opacity-100" style={{ padding: '2px' }}>
              <div className="h-full w-full bg-white rounded-xl"></div>
            </div>
            
            {/* Content */}
            <div className="relative z-10">
              <div className="text-center">
                <div className="flex items-baseline justify-center gap-2 mb-1">
                  <span className="text-4xl font-bold text-slate-900">$20</span>
                  <span className="text-base text-slate-600 font-medium">/month</span>
                </div>
                <p className="text-xs text-slate-600">
                  Billed monthly • Cancel anytime
                </p>
              </div>

              {/* Features in Card */}
              <div className="mt-4 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  This plan includes:
                </p>
                {premiumFeatures.map((feature, index) => {
                  const Icon = feature.icon
                  return (
                    <div key={index} className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-100 to-amber-100 flex items-center justify-center">
                        <Icon className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 leading-tight">
                          {feature.title}
                        </p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                          {feature.description}
                        </p>
                        {feature.note && (
                          <p className="text-xs text-amber-700 mt-1 italic">
                            {feature.note}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <Button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full h-11 bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-500 hover:from-yellow-500 hover:via-amber-600 hover:to-yellow-600 text-slate-900 font-bold text-base shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
          >
            {loading ? (
              "Loading..."
            ) : (
              <>
                <Crown className="h-5 w-5 mr-2" />
                Upgrade Now
              </>
            )}
          </Button>

          {/* Trust indicators */}
          <div className="mt-3 text-center space-y-0.5">
            <p className="text-xs text-slate-500">🔒 Secure payment • Cancel anytime</p>
            <p className="text-xs text-slate-400">Join 1,000+ premium traders</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
