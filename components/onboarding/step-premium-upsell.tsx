"use client";

import { Check, Zap, ArrowRight } from "lucide-react";

interface StepPremiumUpsellProps {
  onUpgrade: () => void;
  onSkip?: () => void;
}

const PREMIUM_FEATURES = [
  {
    title: "Zero fees on all trades",
  },
  {
    title: "Unlock all copy bot strategies",
  },
  {
    title: "Auto-close positions when copied traders exit",
  },
  {
    title: "AI / ML trade recommendations on your feed",
  },
  {
    title: "Advanced portfolio analytics & risk metrics",
  },
];

export function StepPremiumUpsell({ onUpgrade, onSkip }: StepPremiumUpsellProps) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="badge-premium mx-auto mb-4 inline-flex items-center gap-2">
            <Zap className="h-3 w-3 fill-current" />
            PREMIUM
          </div>
          <h1 className="font-sans text-2xl font-black uppercase tracking-tight text-white md:text-3xl">
            WANT MORE?
          </h1>
          <p className="mt-2 font-body text-sm text-white/60">
            Upgrade to Polycopy Premium — $20/month
          </p>
        </div>

        {/* Features */}
        <div className="mb-6 space-y-2.5">
          {PREMIUM_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-3 border border-white/15 bg-white/5 p-3.5 transition-all hover:border-[#FDB022]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#FDB022]">
                <Check className="h-4 w-4 text-[#1A1A1A] stroke-[3]" />
              </div>
              <p className="font-sans text-xs font-bold uppercase tracking-wide text-white">
                {feature.title}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onUpgrade}
            className="flex w-full items-center justify-center gap-2 bg-[#FDB022] py-4 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[#1A1A1A] transition-all hover:bg-[#1A1A1A] hover:text-[#FDB022]"
          >
            GET PREMIUM <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-center font-sans text-[10px] font-bold uppercase tracking-widest text-white/40 transition-colors hover:text-white/70"
          >
            MAYBE LATER
          </button>
        </div>
      </div>
    </div>
  );
}
