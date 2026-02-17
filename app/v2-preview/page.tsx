"use client"

import { TradeCard, type TradeData } from "@/components/polycopy-v2/trade-card"
import { TraderCard } from "@/components/polycopy-v2/trader-card"
import { BotCard, type BotData } from "@/components/polycopy-v2/bot-card"
import { TopNav } from "@/components/polycopy-v2/top-nav"
import { BottomNav } from "@/components/polycopy-v2/bottom-nav"
import { Logo } from "@/components/polycopy-v2/logo"

// Mock data for preview
const mockTrade: TradeData = {
  id: "1",
  trader: {
    name: "swisstony",
    wallet: "0x204f3e8a9c1d7f6e5b0a",
    isPremium: true,
  },
  market: {
    title: "Will Bitcoin exceed $150K by July 2026?",
    token: "YES",
    condition_id: "cond_btc_150k",
  },
  side: "BUY",
  entry_price: 0.635,
  size_usd: 24000,
  conviction: 2.8,
  timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  polyscore: 82,
}

const mockTrader = {
  wallet: "0x204f3e8a9c1d7f6e5b0a3d2c",
  name: "swisstony",
  stats: {
    pnl: 3320000,
    win_rate: 50.3,
    total_trades: 1247,
    roi: 4.2,
  },
  isFollowed: false,
}

const mockBot: BotData = {
  id: "bot-1",
  name: "Conservative Alpha",
  description: "Low-risk strategy focused on high-probability markets.",
  performance: {
    return_pct: 12.4,
    win_rate: 72,
    total_trades: 156,
    sparkline_data: Array.from({ length: 30 }, (_, i) => 100 + i * 1.2 + (Math.random() - 0.5) * 5),
  },
  volume: "$250K",
  risk_level: "LOW",
  is_premium: false,
  is_active: false,
}

export default function V2PreviewPage() {
  return (
    <div className="min-h-screen bg-poly-cream">
      <TopNav />

      <main className="container mx-auto max-w-6xl px-4 py-12">
        <div className="mb-12 text-center">
          <Logo variant="horizontal" size="lg" className="mx-auto mb-6" />
          <h1 className="text-display-lg mb-4">Polycopy 2.0 Preview</h1>
          <p className="text-body-lg text-gray-600">
            The Industrial Block Design System
          </p>
        </div>

        {/* Typography Preview */}
        <section className="mb-12">
          <h2 className="text-h2 mb-6 border-b-2 border-poly-yellow pb-2">Typography</h2>
          <div className="space-y-4 card-technical">
            <div>
              <p className="text-display-xl">DISPLAY XL</p>
              <p className="text-caption text-gray-500">Space Grotesk, 64px, Bold, Uppercase</p>
            </div>
            <div>
              <p className="text-h1">HEADING 1</p>
              <p className="text-caption text-gray-500">Space Grotesk, 36px, Bold, Uppercase</p>
            </div>
            <div>
              <p className="text-body">This is body text using DM Sans at 16px regular weight.</p>
              <p className="text-caption text-gray-500">DM Sans, 16px, Regular</p>
            </div>
          </div>
        </section>

        {/* Color System */}
        <section className="mb-12">
          <h2 className="text-h2 mb-6 border-b-2 border-poly-yellow pb-2">Color System</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-technical text-center">
              <div className="w-full h-24 bg-poly-yellow mb-3"></div>
              <p className="text-body-sm font-bold">Poly Yellow</p>
              <p className="text-caption text-gray-500">#FDB022</p>
            </div>
            <div className="card-technical text-center">
              <div className="w-full h-24 bg-poly-indigo mb-3"></div>
              <p className="text-body-sm font-bold">Poly Indigo</p>
              <p className="text-caption text-gray-500">#4F46E5</p>
            </div>
            <div className="card-technical text-center">
              <div className="w-full h-24 bg-poly-teal mb-3"></div>
              <p className="text-body-sm font-bold">Poly Teal</p>
              <p className="text-caption text-gray-500">#0D9488</p>
            </div>
            <div className="card-technical text-center">
              <div className="w-full h-24 bg-poly-coral mb-3"></div>
              <p className="text-body-sm font-bold">Poly Coral</p>
              <p className="text-caption text-gray-500">#E07A5F</p>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section className="mb-12">
          <h2 className="text-h2 mb-6 border-b-2 border-poly-yellow pb-2">Buttons</h2>
          <div className="card-technical flex flex-wrap gap-4">
            <button className="btn-primary">PRIMARY BUTTON</button>
            <button className="btn-secondary">SECONDARY BUTTON</button>
            <button className="btn-ghost">GHOST BUTTON</button>
            <button className="btn-primary" disabled>DISABLED</button>
          </div>
        </section>

        {/* Components */}
        <section className="mb-12">
          <h2 className="text-h2 mb-6 border-b-2 border-poly-yellow pb-2">Components</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-h3 mb-4">Trade Card</h3>
              <TradeCard
                trade={mockTrade}
                onCopy={() => alert("Copy Trade clicked!")}
                isPremiumUser={true}
              />
            </div>

            <div>
              <h3 className="text-h3 mb-4">Trader Card</h3>
              <div className="max-w-sm">
                <TraderCard
                  trader={mockTrader}
                  onFollow={() => alert("Follow clicked!")}
                  onViewProfile={() => alert("View Profile clicked!")}
                />
              </div>
            </div>

            <div>
              <h3 className="text-h3 mb-4">Bot Card</h3>
              <div className="max-w-sm">
                <BotCard
                  bot={mockBot}
                  onCopyBot={() => alert("Copy Bot clicked!")}
                  isPremiumUser={false}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="mb-12">
          <h2 className="text-h2 mb-6 border-b-2 border-poly-yellow pb-2">Badges</h2>
          <div className="card-technical flex flex-wrap gap-4 items-center">
            <span className="badge-premium">PREMIUM</span>
            <span className="polyscore-badge border-profit-green text-profit-green bg-profit-green/10">
              PolyScore: 82
            </span>
            <span className="locked-badge">🔒 LOCKED FEATURE</span>
          </div>
        </section>

      </main>

      <BottomNav />
    </div>
  )
}
