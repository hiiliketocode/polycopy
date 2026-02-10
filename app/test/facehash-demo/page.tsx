"use client"

import { TraderAvatar, UserAvatar, MarketAvatar, PolycopyAvatar } from "@/components/ui/polycopy-avatar"
import { Card } from "@/components/ui/card"

/**
 * FaceHash Avatar Demo Page
 * 
 * Showcases the new FaceHash avatar integration with Polycopy branding.
 * Visit: /test/facehash-demo
 */

export default function FaceHashDemoPage() {
  // Sample data
  const sampleTraders = [
    { name: "Alice Trader", wallet: "0x1234567890abcdef", avatar: null },
    { name: "Bob Smith", wallet: "0xabcdef1234567890", avatar: null },
    { name: "Charlie", wallet: "0x9876543210fedcba", avatar: null },
    { name: null, wallet: "0xfedcba0987654321", avatar: null },
  ]

  const sampleUsers = [
    { email: "alice@example.com", avatar: null },
    { email: "bob@polycopy.app", avatar: null },
    { email: "charlie@trader.com", avatar: null },
    { email: "diana@market.com", avatar: null },
  ]

  const sampleMarkets = [
    "Will Trump win 2024?",
    "Will Bitcoin reach $100k in 2026?",
    "Will SpaceX land on Mars by 2030?",
    "Will the Fed cut rates in Q1 2026?",
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-slate-900">
            FaceHash Avatar Demo
          </h1>
          <p className="text-lg text-slate-600">
            Unique, deterministic avatars with Polycopy brand colors
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span>Powered by</span>
            <a 
              href="https://www.facehash.dev/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-semibold text-yellow-600 hover:text-yellow-700 underline"
            >
              FaceHash
            </a>
          </div>
        </div>

        {/* Trader Avatars */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Trader Avatars
            </h2>
            <p className="text-sm text-slate-600">
              For trader profiles, discovery cards, and leaderboards
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sampleTraders.map((trader, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <TraderAvatar
                  displayName={trader.name}
                  wallet={trader.wallet}
                  src={trader.avatar}
                  size={64}
                  className="ring-2 ring-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {trader.name || `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}`}
                  </div>
                  <div className="text-sm text-slate-500 font-mono truncate">
                    {trader.wallet}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Same wallet = same face, always
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* User Avatars */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              User Avatars
            </h2>
            <p className="text-sm text-slate-600">
              For navigation, profile pages, and user accounts
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sampleUsers.map((user, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <UserAvatar
                  identifier={user.email}
                  src={user.avatar}
                  size={64}
                  className="ring-2 ring-slate-200"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {user.email.split('@')[0]}
                  </div>
                  <div className="text-sm text-slate-500 truncate">
                    {user.email}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Same email = same face, always
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Market Avatars */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Market Avatars (No FaceHash)
            </h2>
            <p className="text-sm text-slate-600">
              Markets use Polymarket's official images only - no FaceHash fallback
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sampleMarkets.map((market, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <MarketAvatar
                  marketName={market}
                  src={null}
                  size={64}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 line-clamp-2">
                    {market}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Falls back to initials (no FaceHash)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Size Variations */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              Size Variations
            </h2>
            <p className="text-sm text-slate-600">
              Avatars work at any size from 24px to 128px
            </p>
          </div>

          <div className="flex items-end gap-6 flex-wrap">
            {[24, 32, 40, 48, 64, 80, 96, 128].map(size => (
              <div key={size} className="flex flex-col items-center gap-2">
                <TraderAvatar
                  displayName="Alice"
                  wallet="0x1234567890abcdef"
                  src={null}
                  size={size}
                  className="ring-2 ring-slate-200"
                />
                <span className="text-xs text-slate-500 font-mono">
                  {size}px
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* API Route Demo */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              API Route (PNG Images)
            </h2>
            <p className="text-sm text-slate-600">
              Generate avatar images for emails, Open Graph, and external use
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
              <img 
                src="/api/avatar?name=alice@example.com" 
                alt="Alice"
                width={64}
                height={64}
                className="rounded-full ring-2 ring-slate-200"
              />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-700 break-all">
                  /api/avatar?name=alice@example.com
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Use in emails, meta tags, and external embeds
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
              <img 
                src="/api/avatar?name=0x1234567890abcdef&size=80" 
                alt="Trader"
                width={80}
                height={80}
                className="rounded-full ring-2 ring-slate-200"
              />
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-700 break-all">
                  /api/avatar?name=0x1234567890abcdef&size=80
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Works with wallet addresses too
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Benefits */}
        <Card className="p-6 space-y-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
          <h2 className="text-2xl font-bold text-slate-900">
            Why FaceHashes?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Deterministic</div>
                  <div className="text-sm text-slate-600">Same input always produces same avatar</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Zero Dependencies</div>
                  <div className="text-sm text-slate-600">No API calls, no external services</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Consistent Color</div>
                  <div className="text-sm text-slate-600">All avatars use same lighter yellow (#FBBF24)</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Unique & Fun</div>
                  <div className="text-sm text-slate-600">Each face is unique and friendly</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Performant</div>
                  <div className="text-sm text-slate-600">Fast SVG generation, works offline</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="font-semibold text-slate-900">Living UI</div>
                  <div className="text-sm text-slate-600">No more dead circles everywhere!</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500 pb-8">
          <p>
            See{" "}
            <code className="px-2 py-1 bg-slate-200 rounded text-xs font-mono">
              FACEHASH_INTEGRATION.md
            </code>{" "}
            for full documentation
          </p>
        </div>
      </div>
    </div>
  )
}
