"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check, Sparkles } from "lucide-react"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      "Manual copy trades",
      "Unlimited following",
      "Curated feed",
      "Portfolio tracking",
      "Filter & search"
    ],
    cta: "Start For Free",
    popular: false
  },
  {
    name: "Premium",
    price: "$20",
    period: "/month",
    description: "Everything in Free, plus:",
    features: [
      "Quick copy trades",
      "Auto-close positions",
      "Advanced controls",
      "Connected wallet",
      "Priority support"
    ],
    cta: "Upgrade to Premium",
    popular: true
  }
]

export function Pricing() {
  return (
    <section id="pricing" className="py-16 lg:py-32 bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 text-balance">
            Start free, upgrade when ready
          </h2>
          <p className="text-lg text-slate-300">
            Get full access to the curated feed for free. Upgrade to Premium for quick trade execution.
          </p>
        </div>

        {/* Pricing Cards - Side by side on all screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl lg:rounded-2xl border p-6 lg:p-8 flex flex-col ${
                plan.popular
                  ? "bg-gradient-to-br from-[#FDB022] to-[#F59E0B] border-[#FDB022]"
                  : "bg-white border-slate-200"
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 lg:px-4 py-1 lg:py-1.5 rounded-full bg-white text-neutral-black text-xs lg:text-sm font-semibold">
                  <Sparkles className="w-3 h-3 lg:w-4 lg:h-4" />
                  <span>POPULAR</span>
                </div>
              )}

              {/* Plan Name */}
              <h3 className={`text-xl lg:text-2xl font-bold mb-3 mt-2 lg:mt-0 ${plan.popular ? "text-neutral-black" : "text-foreground"}`}>
                {plan.name}
              </h3>

              {/* Price */}
              <div className="flex items-baseline gap-1 mb-4">
                <span className={`text-4xl lg:text-5xl font-bold ${plan.popular ? "text-neutral-black" : "text-foreground"}`}>
                  {plan.price}
                </span>
                <span className={`text-base lg:text-lg ${plan.popular ? "text-neutral-black/70" : "text-muted-foreground"}`}>
                  {plan.period}
                </span>
              </div>

              {/* Description */}
              <p className={`text-sm lg:text-base mb-6 ${plan.popular ? "text-neutral-black/80" : "text-muted-foreground"}`}>
                {plan.description}
              </p>

              {/* Features */}
              <ul className="space-y-3 lg:space-y-4 mb-6 lg:mb-8 flex-1">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start lg:items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 lg:mt-0 ${
                      plan.popular ? "bg-neutral-black/20" : "bg-profit-green/10"
                    }`}>
                      <Check className={`w-3 h-3 ${plan.popular ? "text-neutral-black" : "text-profit-green"}`} />
                    </div>
                    <span className={`text-sm lg:text-base leading-tight ${plan.popular ? "text-neutral-black" : "text-foreground"}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link href={plan.popular ? "/login?mode=signup" : "/login?mode=signup"} className="block mt-auto">
                <Button
                  className={`w-full font-semibold h-12 text-base ${
                    plan.popular
                      ? "bg-white text-neutral-black hover:bg-slate-100"
                      : "bg-neutral-black text-white hover:bg-neutral-black/90"
                  }`}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>

        {/* Money Back Guarantee */}
        <p className="text-center text-sm text-slate-400 mt-8">
          No credit card required for free plan. Cancel premium anytime.
        </p>
      </div>
    </section>
  )
}
