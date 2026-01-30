"use client";

import { ExternalLink, Info } from "lucide-react";
import Link from "next/link";

export function StepTradeExplainer() {
  return (
    <div className="flex flex-col items-center justify-between h-full">
      {/* Top Section */}
      <div className="w-full">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-xl md:text-2xl font-bold text-foreground mb-1 text-balance">
            How to copy trades
          </h1>
          <p className="text-sm text-muted-foreground">
            A simple and fast guide for trading on Polycopy.
          </p>
        </div>

        {/* Trade Card - Extra Compact Version */}
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3.5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-xs">
                  TW
                </div>
                <span className="text-gray-900 text-sm font-medium">TraderWiz92</span>
              </div>
              <span className="text-gray-400 text-xs">1h ago</span>
            </div>

            {/* Game Info */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-white">
                <img 
                  src="/nba-basketball.png" 
                  alt="NBA" 
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Kings vs. Celtics</h2>
            </div>

            {/* Stats Grid */}
            <div className="bg-gray-50 rounded-xl p-2.5 mb-2.5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {/* Outcome */}
                <div>
                  <div className="text-gray-500 text-[11px] mb-0.5">Outcome</div>
                  <div className="text-gray-900 font-semibold text-sm">Kings</div>
                </div>

                {/* Invested */}
                <div className="text-right">
                  <div className="text-gray-500 text-[11px] mb-0.5">Invested</div>
                  <div className="text-gray-900 font-semibold text-sm">$1,678.27</div>
                </div>

                {/* Contracts */}
                <div>
                  <div className="text-gray-500 text-[11px] mb-0.5">Contracts</div>
                  <div className="text-gray-900 font-semibold text-sm">8,833.0</div>
                </div>

                {/* Entry */}
                <div className="text-right">
                  <div className="text-gray-500 text-[11px] mb-0.5">Entry</div>
                  <div className="text-gray-900 font-semibold text-sm">$0.19</div>
                </div>

                {/* Current */}
                <div>
                  <div className="text-gray-500 text-[11px] mb-0.5">Current</div>
                  <div className="text-gray-900 font-semibold text-sm">$0.195</div>
                </div>

                {/* ROI */}
                <div className="text-right">
                  <div className="text-gray-500 text-[11px] mb-0.5">ROI</div>
                  <div className="text-teal-500 font-semibold text-sm">+2.6%</div>
                </div>
              </div>
            </div>

            {/* How to trade link */}
            <button className="flex items-center justify-center gap-1.5 w-full text-gray-500 text-[11px] py-1 mb-2.5 hover:text-gray-700 transition-colors">
              <Info className="w-3 h-3" />
              <span>How to trade</span>
            </button>

            {/* Action Buttons */}
            <div className="flex gap-2.5">
              <button className="flex-1 bg-yellow-500 hover:bg-yellow-600 font-semibold py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-colors text-xs">
                <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center text-yellow-500 text-xs font-bold">
                  1
                </span>
                <span className="text-black">Copy trade</span>
                <ExternalLink className="w-3 h-3 text-black" />
              </button>
              <button className="flex-1 bg-white hover:bg-gray-50 text-gray-900 font-semibold py-2 px-2.5 rounded-xl border border-gray-300 flex items-center justify-center gap-1.5 transition-colors text-xs">
                <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center text-white text-xs font-bold">
                  2
                </span>
                <span>Mark as copied</span>
              </button>
            </div>
          </div>

          {/* Step Annotations */}
          <div className="grid grid-cols-2 gap-2.5 mt-3">
            {/* Step 1 */}
            <div className="relative">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                <svg
                  className="w-4 h-4 text-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4L4 12h6v8h4v-8h6L12 4z" />
                </svg>
              </div>
              <div className="bg-foreground text-background p-2.5 rounded-lg pt-3.5">
                <p className="font-semibold text-xs mb-0.5">Step 1</p>
                <p className="text-background/80 text-[11px] leading-tight">
                  Click &quot;Copy trade&quot; to open Polymarket and execute your trade.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                <svg
                  className="w-4 h-4 text-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4L4 12h6v8h4v-8h6L12 4z" />
                </svg>
              </div>
              <div className="bg-foreground text-background p-2.5 rounded-lg pt-3.5">
                <p className="font-semibold text-xs mb-0.5">Step 2</p>
                <p className="text-background/80 text-[11px] leading-tight">
                  Return here, click &quot;Mark as copied&quot; and enter your trade details.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Learn More Link - At bottom */}
      <div className="text-center w-full">
        <Link
          href="https://polycopy.app/trading-setup"
          target="_blank"
          className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium text-xs"
        >
          Learn more about trading on Polycopy
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
