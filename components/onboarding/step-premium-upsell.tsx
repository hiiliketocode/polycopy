"use client";

import { Check, Zap } from "lucide-react";

interface StepPremiumUpsellProps {
  onUpgrade: () => void;
  onSkip?: () => void;
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

export function StepPremiumUpsell({ onUpgrade, onSkip }: StepPremiumUpsellProps) {
  return (
    <div className="flex flex-col flex-1 items-center justify-center">
      {/* Content Container */}
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-5">
          {/* Premium Badge - Eye-catching gradient */}
          <div className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#FDB022] to-[#F59E0B] rounded-full text-xs font-bold text-[#0F172A] mb-3 shadow-[0_4px_12px_rgba(253,176,34,0.4)] uppercase tracking-wider">
            <Zap className="w-4 h-4 fill-current" />
            PREMIUM
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 text-balance">
            Want More?
          </h1>
          <p className="text-white/70 text-base">Upgrade to Polycopy Premium</p>
        </div>

        {/* Features List - Glass morphism style */}
        <div className="space-y-2.5 mb-5">
          {PREMIUM_FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-xl p-3.5 backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:border-[#FDB022] hover:-translate-y-0.5 cursor-default"
            >
              <div className="w-8 h-8 min-w-[32px] rounded-full bg-gradient-to-br from-[#FDB022] to-[#F59E0B] flex items-center justify-center flex-shrink-0 shadow-[0_4px_8px_rgba(253,176,34,0.3)]">
                <Check className="w-5 h-5 text-[#0F172A] stroke-[3]" />
              </div>
              <p className="text-white text-sm font-medium leading-snug">
                {feature.title}
              </p>
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onUpgrade}
            className="w-full py-3.5 bg-gradient-to-r from-[#FDB022] to-[#F59E0B] text-[#0F172A] rounded-xl font-bold text-base hover:from-[#F59E0B] hover:to-[#D97706] transition-all duration-200 shadow-[0_4px_12px_rgba(253,176,34,0.3)] hover:shadow-[0_6px_16px_rgba(253,176,34,0.4)] hover:-translate-y-0.5"
          >
            Get Premium
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-center text-white/50 text-sm hover:text-white/70 transition-colors cursor-pointer w-full py-2"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
