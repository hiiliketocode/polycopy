"use client"

import { Check, ArrowRight, Zap } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useUpgrade } from "@/hooks/useUpgrade"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PREMIUM_FEATURES = [
  { title: "EXECUTE TRADES DIRECTLY", desc: "Copy trades in seconds with pre-filled slippage" },
  { title: "AUTO-CLOSE POSITIONS", desc: "Set trades to close when copied trader exits" },
  { title: "ADVANCED TRADE CONTROLS", desc: "Limit orders, custom slippage, and more" },
  { title: "PORTFOLIO TRACKING", desc: "Monitor your copy trading performance" },
  { title: "EARLY ACCESS", desc: "Get new features before everyone else" },
]

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const { upgrade, loading } = useUpgrade()

  const handleUpgrade = async () => {
    await upgrade()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto rounded-none border border-white/10 bg-[#0F0F0F] p-0 text-white shadow-2xl sm:max-w-[480px] [&>button]:text-zinc-500 [&>button]:hover:text-white">
        <DialogTitle className="sr-only">Upgrade to Premium</DialogTitle>
        <div className="p-6 md:p-10">
          {/* Header */}
          <div className="mb-5 text-center md:mb-8">
            <div className="mb-3 inline-flex items-center gap-2 bg-[#FDB022] px-4 py-1 text-[10px] font-black uppercase tracking-widest text-black md:mb-4">
              <Zap size={14} fill="black" /> PREMIUM
            </div>
            <h2 className="mb-1 font-sans text-2xl font-black uppercase md:mb-2 md:text-3xl">
              UNLOCK ALL FEATURES
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              The complete trading toolkit for serious Polymarket traders
            </p>
          </div>

          {/* Pricing */}
          <div className="mb-5 border border-[#FDB022]/30 bg-white/5 p-5 text-center md:mb-8 md:p-8">
            <div className="font-sans text-4xl font-black md:text-5xl">
              $20<span className="text-sm text-zinc-500">/MONTH</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Billed monthly &bull; Cancel anytime
            </p>
          </div>

          {/* Features */}
          <div className="mb-5 space-y-3 md:mb-8 md:space-y-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 md:mb-4">
              WHAT&apos;S INCLUDED
            </p>
            {PREMIUM_FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3 md:gap-4">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-[#FDB022] text-black">
                  <Check size={12} strokeWidth={4} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-tight">{feature.title}</p>
                  <p className="text-[9px] text-zinc-500">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 bg-[#FDB022] text-xs font-black uppercase tracking-[0.2em] text-black transition-all hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50 md:h-14"
          >
            {loading ? "LOADING..." : (
              <>
                UPGRADE NOW <ArrowRight size={16} />
              </>
            )}
          </button>
          <p className="mt-3 text-center font-sans text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            SECURE PAYMENT VIA STRIPE
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
