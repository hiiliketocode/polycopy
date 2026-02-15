"use client"

import { Check, ArrowRight, Bot, Zap, Shield, LineChart, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useUpgrade } from "@/hooks/useUpgrade"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const { upgrade, loading } = useUpgrade()

  const handleUpgrade = async () => {
    await upgrade()
  }

  const premiumFeatures = [
    {
      icon: Zap,
      label: "ZERO FEES ON ALL TRADES",
      description: "No trading fees on any copy trade you execute",
    },
    {
      icon: Bot,
      label: "ALL COPY BOT STRATEGIES",
      description: "Unlock every proprietary algorithm and ML strategy",
    },
    {
      icon: Shield,
      label: "AUTO-CLOSE POSITIONS",
      description: "Automatically exit when the trader you copied exits",
    },
    {
      icon: Sparkles,
      label: "AI / ML TRADE RECOMMENDATIONS",
      description: "Machine learning powered trade signals on your feed",
    },
    {
      icon: LineChart,
      label: "ADVANCED PORTFOLIO ANALYTICS",
      description: "Deep performance insights and risk metrics",
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 border-0 bg-poly-cream p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Upgrade to Premium</DialogTitle>

        {/* Header — yellow block */}
        <div className="bg-poly-yellow px-8 pb-6 pt-8">
          <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-black/50">
            PREMIUM_ACCESS
          </p>
          <h2 className="mb-2 font-sans text-2xl font-black uppercase tracking-tight text-poly-black">
            UPGRADE TO PREMIUM
          </h2>
          <p className="font-body text-sm leading-relaxed text-poly-black/70">
            Unlock the full Polycopy arsenal. Zero fees, every bot, and AI-powered recommendations.
          </p>
        </div>

        {/* Price block */}
        <div className="border-b border-border bg-white px-8 py-6">
          <div className="flex items-baseline gap-2">
            <span className="font-sans text-5xl font-black text-poly-black">$20</span>
            <span className="font-body text-sm text-muted-foreground">/ MONTH</span>
          </div>
          <p className="mt-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            BILLED MONTHLY &middot; CANCEL ANYTIME
          </p>
        </div>

        {/* Features list */}
        <div className="px-8 py-6">
          <p className="mb-4 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            WHAT&rsquo;S INCLUDED
          </p>
          <div className="flex flex-col gap-4">
            {premiumFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.label} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-white">
                    <Icon className="h-4 w-4 text-poly-yellow" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-sans text-xs font-bold uppercase tracking-wide text-poly-black">
                      {feature.label}
                    </p>
                    <p className="mt-0.5 font-body text-xs leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="border-t border-border bg-white px-8 py-6 pb-24 sm:pb-6">
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 bg-poly-black py-4 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              "PROCESSING..."
            ) : (
              <>
                UPGRADE NOW <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
          <p className="mt-3 text-center font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            SECURE PAYMENT VIA STRIPE
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
