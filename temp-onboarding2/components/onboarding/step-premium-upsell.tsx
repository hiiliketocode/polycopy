"use client";

import { Check, Zap } from "lucide-react";

interface StepPremiumUpsellProps {
  onUpgrade: () => void;
}

const PREMIUM_FEATURES = [
  {
    title: "Execute Polymarket copy trades directly in the Polycopy platform",
  },
  {
    title: "Set trades to automatically close when the copied trader does",
  },
  {
    title: "Advanced trade features, like limit orders, slippage, and more",
  },
  {
    title: "Copy portfolio performance tracking",
  },
  {
    title: "Early access to new features",
  },
];

export function StepPremiumUpsell({ onUpgrade }: StepPremiumUpsellProps) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      {/* Content Container */}
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          {/* Premium Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/20 rounded-full text-sm font-semibold text-primary mb-4">
            <Zap className="w-4 h-4 fill-current" />
            PREMIUM
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 text-balance">
            Want More?
          </h1>
          <p className="text-white/70">Upgrade to Polycopy Premium</p>
        </div>

        {/* Features List */}
        <div className="space-y-3 mb-8">
          {PREMIUM_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-3 bg-white rounded-xl p-4"
            >
              <div className="w-6 h-6 rounded-full bg-polycopy-success flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-white" />
              </div>
              <p className="text-foreground text-sm font-medium leading-snug">
                {feature.title}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:bg-primary/90 transition-colors"
          >
            Get Premium
          </button>
          <p className="text-center text-white/50 text-sm">
            Maybe Later
          </p>
        </div>
      </div>
    </div>
  );
}
