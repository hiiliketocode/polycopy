"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";

export function StepTradeExplainer() {
  return (
    <div className="flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 text-balance">
          How to copy trades
        </h1>
        <p className="text-muted-foreground">
          A simple and fast guide for trading on Polycopy.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex flex-col items-center">
        {/* Trade Card */}
        <div className="w-full max-w-md">
          <div className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
            {/* Card Header */}
            <div className="p-3 md:p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                  TC
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-card-foreground text-sm md:text-base">TopCaller92</p>
                  <p className="text-xs md:text-sm text-muted-foreground">Just now</p>
                </div>
              </div>
            </div>

            {/* Market Question */}
            <div className="p-3 md:p-4 border-b border-border">
              <p className="font-medium text-card-foreground text-sm md:text-base mb-1.5 md:mb-2">
                US strikes Iran by January 31, 2026?
              </p>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-polycopy-success/10 text-polycopy-success text-xs font-medium rounded">
                  Live
                </span>
                <span className="text-xs md:text-sm text-muted-foreground">
                  Yes: 10% | No: 91%
                </span>
              </div>
            </div>

            {/* Position Details - 3x2 Grid */}
            <div className="p-3 md:p-4 border-b border-border">
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-center text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Outcome</p>
                  <p className="font-semibold text-polycopy-error">No</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Invested</p>
                  <p className="font-semibold">$12,325</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Contracts</p>
                  <p className="font-semibold">13,849</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Entry</p>
                  <p className="font-semibold">$0.89</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Current</p>
                  <p className="font-semibold">$0.905</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">ROI</p>
                  <p className="font-semibold text-polycopy-success">+1.7%</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-3 md:p-4">
              <p className="text-center text-xs text-muted-foreground mb-2 md:mb-3">
                How to trade
              </p>
              <div className="grid grid-cols-2 gap-2 md:gap-3">
                <button
                  type="button"
                  className="py-2 md:py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-xs md:text-sm flex items-center justify-center gap-1 md:gap-1.5"
                >
                  <span className="w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-[10px] md:text-xs">
                    1
                  </span>
                  Copy trade
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  className="py-2 md:py-2.5 bg-card border-2 border-border text-card-foreground rounded-lg font-semibold text-xs md:text-sm flex items-center justify-center gap-1 md:gap-1.5"
                >
                  <span className="w-4 h-4 bg-muted rounded-full flex items-center justify-center text-[10px] md:text-xs">
                    2
                  </span>
                  Mark as copied
                </button>
              </div>
            </div>
          </div>

          {/* Step Annotations - Side by side */}
          <div className="grid grid-cols-2 gap-3 md:gap-4 mt-4">
            {/* Step 1 */}
            <div className="relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <svg
                  className="w-5 h-5 md:w-6 md:h-6 text-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4L4 12h6v8h4v-8h6L12 4z" />
                </svg>
              </div>
              <div className="bg-foreground text-background p-3 md:p-4 rounded-xl pt-4 md:pt-5">
                <p className="font-semibold text-sm mb-1">Step 1</p>
                <p className="text-background/80 text-xs md:text-sm leading-relaxed">
                  Click &quot;Copy trade&quot; to open Polymarket and execute your trade.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <svg
                  className="w-5 h-5 md:w-6 md:h-6 text-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4L4 12h6v8h4v-8h6L12 4z" />
                </svg>
              </div>
              <div className="bg-foreground text-background p-3 md:p-4 rounded-xl pt-4 md:pt-5">
                <p className="font-semibold text-sm mb-1">Step 2</p>
                <p className="text-background/80 text-xs md:text-sm leading-relaxed">
                  Return here, click &quot;Mark as copied&quot; and enter your trade details.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Learn More Link */}
        <div className="text-center mt-6">
          <Link
            href="https://polycopy.app/trading-setup"
            target="_blank"
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium text-sm"
          >
            Learn more about trading on Polycopy
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
