"use client"

import { useState } from "react"
import { PortfolioCard, type CardTheme } from "@/components/portfolio-card"
import { Check } from "lucide-react"

const themes: { id: CardTheme; label: string; preview: string }[] = [
  { id: "cream", label: "Cream", preview: "bg-gradient-to-br from-amber-100 to-orange-50" },
  { id: "dark", label: "Dark", preview: "bg-slate-800" },
  { id: "profit", label: "Profit", preview: "bg-gradient-to-br from-emerald-200 to-teal-100" },
  { id: "fire", label: "Fire", preview: "bg-gradient-to-br from-rose-200 to-orange-100" },
]

export default function PortfolioCardDemo() {
  const [selectedTheme, setSelectedTheme] = useState<CardTheme>("cream")
  const [showProfit, setShowProfit] = useState(true)

  const profitExample = {
    username: "cryptowizard",
    memberSince: "Mar 2024",
    totalPnL: 47832.50,
    roi: 127.4,
    winRate: 68.5,
    totalVolume: 892450,
    numberOfTrades: 342,
    followingCount: 12,
  }

  const lossExample = {
    username: "degen_trader",
    memberSince: "Nov 2024",
    totalPnL: -3842.75,
    roi: -18.2,
    winRate: 42.3,
    totalVolume: 125680,
    numberOfTrades: 89,
    followingCount: 3,
  }

  const currentData = showProfit ? profitExample : lossExample

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-8">
      {/* Theme picker */}
      <div className="mb-8 bg-white rounded-xl p-6 shadow-sm border border-zinc-200 w-full max-w-md">
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Share Your Stats</h2>
        <p className="text-sm text-zinc-500 mb-4">Choose a theme and share your Polycopy performance on social media</p>
        
        <p className="text-sm font-medium text-zinc-700 mb-3">Choose Theme</p>
        <div className="flex gap-2">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setSelectedTheme(theme.id)}
              className={`flex-1 flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all ${
                selectedTheme === theme.id 
                  ? "border-amber-400 bg-amber-50" 
                  : "border-transparent hover:border-zinc-200"
              }`}
            >
              <div className={`w-full aspect-[4/3] rounded-md ${theme.preview} flex items-center justify-center`}>
                {selectedTheme === theme.id && (
                  <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <span className="text-xs font-medium text-zinc-600">{theme.label}</span>
            </button>
          ))}
        </div>

        {/* P&L Toggle */}
        <div className="mt-4 pt-4 border-t border-zinc-100">
          <p className="text-sm font-medium text-zinc-700 mb-3">Example Data</p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowProfit(true)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                showProfit 
                  ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-300" 
                  : "bg-zinc-100 text-zinc-600 border-2 border-transparent hover:border-zinc-200"
              }`}
            >
              Profit
            </button>
            <button
              onClick={() => setShowProfit(false)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                !showProfit 
                  ? "bg-rose-100 text-rose-700 border-2 border-rose-300" 
                  : "bg-zinc-100 text-zinc-600 border-2 border-transparent hover:border-zinc-200"
              }`}
            >
              Loss
            </button>
          </div>
        </div>
      </div>

      {/* Card */}
      <PortfolioCard {...currentData} theme={selectedTheme} />

      {/* Info text */}
      <p className="mt-8 text-zinc-500 text-sm text-center max-w-md">
        P&L values always show green for profit and red for loss, regardless of theme.
      </p>
    </div>
  )
}
