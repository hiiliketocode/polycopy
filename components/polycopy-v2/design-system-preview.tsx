import { Lock, ChevronRight, Sparkles, Star, Signal, Users, Bot, User } from "lucide-react"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-h2 mb-6 border-b border-poly-black pb-3">{children}</h2>
  )
}

function Swatch({
  name,
  color,
  textColor = "text-poly-black",
}: {
  name: string
  color: string
  textColor?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`w-16 h-16 border border-foreground/10 ${textColor}`}
        style={{ backgroundColor: color }}
      />
      <span className="text-caption text-center">{name}</span>
    </div>
  )
}

export function DesignSystemPreview() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <header className="bg-poly-black px-4 py-12 md:px-8 md:py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-baseline gap-0">
            <span className="text-display-xl text-poly-yellow">POLY</span>
            <span className="text-display-xl text-poly-paper">COPY</span>
          </div>
          <p className="text-body-lg mt-4 text-poly-paper/70">
            The Industrial Block Design System — v2.0
          </p>
          <p className="text-body mt-2 text-poly-paper/50">
            Precision Meets Performance
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 md:px-8">
        {/* === COLORS === */}
        <section className="mb-16">
          <SectionTitle>Color System</SectionTitle>

          <h3 className="text-h4 mb-4">Brand Foundation</h3>
          <div className="flex flex-wrap gap-6 mb-8">
            <Swatch name="Yellow" color="#FDB022" />
            <Swatch name="Black" color="#0F0F0F" textColor="text-poly-paper" />
            <Swatch name="Cream" color="#F9F8F1" />
            <Swatch name="Paper" color="#FFFFFF" />
          </div>

          <h3 className="text-h4 mb-4">Brand Accents</h3>
          <div className="flex flex-wrap gap-6 mb-8">
            <Swatch name="Indigo" color="#4F46E5" textColor="text-poly-paper" />
            <Swatch name="Teal" color="#0D9488" textColor="text-poly-paper" />
            <Swatch name="Coral" color="#E07A5F" />
          </div>

          <h3 className="text-h4 mb-4">Data Colors</h3>
          <div className="flex flex-wrap gap-6">
            <Swatch name="Profit" color="#10B981" />
            <Swatch name="Loss" color="#EF4444" />
            <Swatch name="Info" color="#3B82F6" />
          </div>
        </section>

        {/* === TYPOGRAPHY === */}
        <section className="mb-16">
          <SectionTitle>Typography</SectionTitle>

          <div className="mb-8">
            <h3 className="text-h4 mb-4">
              Display — Space Grotesk
            </h3>
            <div className="space-y-3 rounded-none border border-foreground/10 bg-card p-6">
              <p className="text-display-xl">Display XL</p>
              <p className="text-display-lg">Display LG</p>
              <p className="text-display">Display</p>
              <p className="text-h1">Heading 1</p>
              <p className="text-h2">Heading 2</p>
              <p className="text-h3">Heading 3</p>
              <p className="text-h4">Heading 4</p>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-h4 mb-4">
              Body — DM Sans
            </h3>
            <div className="space-y-3 rounded-none border border-foreground/10 bg-card p-6">
              <p className="text-body-xl">
                Body XL — The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-body-lg">
                Body LG — The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-body">
                Body — The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-body-sm">
                Body SM — The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-caption">
                Caption — The quick brown fox jumps over the lazy dog.
              </p>
              <p className="text-micro">
                Micro label text
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-h4 mb-4">Data Display</h3>
            <div className="flex gap-8 rounded-none border border-foreground/10 bg-card p-6">
              <div className="text-center">
                <p className="text-data text-3xl text-profit-green">
                  +$12,456
                </p>
                <p className="text-caption text-muted-foreground">Total PnL</p>
              </div>
              <div className="text-center">
                <p className="text-data text-3xl">67.3%</p>
                <p className="text-caption text-muted-foreground">Win Rate</p>
              </div>
              <div className="text-center">
                <p className="text-data text-3xl text-loss-red">-$2,340</p>
                <p className="text-caption text-muted-foreground">
                  Unrealized
                </p>
              </div>
              <div className="text-center">
                <p className="text-data text-3xl">3.2x</p>
                <p className="text-caption text-muted-foreground">ROI</p>
              </div>
            </div>
          </div>
        </section>

        {/* === BUTTONS === */}
        <section className="mb-16">
          <SectionTitle>Button System</SectionTitle>

          <div className="mb-8">
            <h3 className="text-h4 mb-4">Variants</h3>
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn-primary">Copy Trade</button>
              <button className="btn-secondary">Following</button>
              <button className="btn-ghost">View Profile</button>
              <button className="btn-primary" disabled>
                Disabled
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-h4 mb-4">Sizes</h3>
            <div className="flex flex-wrap items-center gap-4">
              <button className="btn-primary px-4 py-2 text-xs h-8">
                Small
              </button>
              <button className="btn-primary">Medium (Default)</button>
              <button className="btn-primary px-8 py-4 text-base h-12">
                Large
              </button>
            </div>
          </div>
        </section>

        {/* === CARDS === */}
        <section className="mb-16">
          <SectionTitle>Card System</SectionTitle>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Trade Card Preview */}
            <div className="card-technical">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center bg-poly-indigo font-sans text-xs font-bold text-poly-paper">
                    WB
                  </div>
                  <div>
                    <p className="text-body-sm font-semibold font-sans">
                      WhaleBot_42
                    </p>
                    <p className="text-caption text-muted-foreground">
                      @0x2b4f... &middot; 2h ago
                    </p>
                  </div>
                </div>
                <span className="badge-premium">
                  <Star className="h-3 w-3" />
                  PREMIUM
                </span>
              </div>

              <div className="mb-4">
                <h3 className="text-h4 mb-1 normal-case">
                  Will Trump Win 2024?
                </h3>
                <p className="text-body-sm font-medium text-poly-teal">
                  {'>'} YES
                </p>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-data text-2xl">63.5c</p>
                  <p className="text-caption text-muted-foreground">Entry</p>
                </div>
                <div className="text-center">
                  <p className="text-data text-2xl">$2.4K</p>
                  <p className="text-caption text-muted-foreground">Size</p>
                </div>
                <div className="text-center">
                  <p className="text-data text-2xl">2.8x</p>
                  <p className="text-caption text-muted-foreground">
                    Conviction
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="polyscore-badge border-profit-green bg-profit-green/10 text-profit-green">
                  <Sparkles className="h-4 w-4" />
                  <span>PolyScore: 78</span>
                </div>
                <button className="btn-primary px-4 py-2 text-xs">
                  Copy Trade
                </button>
              </div>
            </div>

            {/* Trader Card Preview */}
            <div className="card-technical text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center bg-poly-teal font-sans text-xl font-bold text-poly-paper">
                SM
              </div>
              <h3 className="text-h3 mb-1 normal-case">SmartMoney_Pro</h3>
              <p className="text-body-sm mb-6 text-muted-foreground">
                @0x8a3c2f1b...
              </p>

              <div className="mb-6 grid grid-cols-4 gap-2 bg-poly-cream p-4">
                <div>
                  <p className="text-data text-lg text-profit-green">+$5.2K</p>
                  <p className="text-caption text-muted-foreground">PnL</p>
                </div>
                <div>
                  <p className="text-data text-lg">67%</p>
                  <p className="text-caption text-muted-foreground">
                    Win Rate
                  </p>
                </div>
                <div>
                  <p className="text-data text-lg">234</p>
                  <p className="text-caption text-muted-foreground">Trades</p>
                </div>
                <div>
                  <p className="text-data text-lg">3.2x</p>
                  <p className="text-caption text-muted-foreground">ROI</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button className="btn-primary flex-1 px-4 py-2 text-xs">
                  Follow
                </button>
                <button className="btn-ghost flex-1 px-4 py-2 text-xs">
                  View Profile
                </button>
              </div>
            </div>

            {/* Bot Card Preview */}
            <div className="card-technical">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-6 w-6 text-poly-coral" />
                  <div>
                    <h3 className="text-h4 normal-case">Value Hunter</h3>
                    <span className="badge-premium text-[8px] px-2 py-0.5">
                      PRO
                    </span>
                  </div>
                </div>
                <Star className="h-5 w-5 fill-poly-yellow text-poly-yellow" />
              </div>

              <p className="text-body-sm mb-4 text-muted-foreground">
                Aggressive value hunting across markets
              </p>

              <div className="mb-4 bg-poly-cream p-3">
                <div className="mb-2 flex h-12 items-end justify-center gap-0.5">
                  {[40, 55, 45, 60, 70, 65, 80, 75, 85, 90, 82, 95].map(
                    (h, i) => (
                      <div
                        key={i}
                        className="w-2 bg-profit-green/60"
                        style={{ height: `${h}%` }}
                      />
                    )
                  )}
                </div>
                <p className="text-data mt-2 text-center text-2xl text-profit-green">
                  +24.5%
                </p>
                <p className="text-caption text-center text-muted-foreground">
                  30-Day Performance
                </p>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-data text-lg">67%</p>
                  <p className="text-caption text-muted-foreground">
                    Win Rate
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-data text-lg">234</p>
                  <p className="text-caption text-muted-foreground">Trades</p>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-loss-red/10 px-2 py-1 text-caption font-bold text-loss-red uppercase">
                    Aggressive
                  </span>
                </div>
              </div>

              <button className="btn-primary w-full">
                {'Activate Bot \u2022 $30/mo'}
              </button>
            </div>
          </div>
        </section>

        {/* === BADGES === */}
        <section className="mb-16">
          <SectionTitle>Badges</SectionTitle>
          <div className="flex flex-wrap items-center gap-4">
            <span className="badge-premium">
              <Star className="h-3 w-3" />
              Premium
            </span>

            <div className="polyscore-badge border-profit-green bg-profit-green/10 text-profit-green">
              <Sparkles className="h-4 w-4" />
              <span>PolyScore: 78</span>
            </div>

            <div className="polyscore-badge border-poly-yellow bg-poly-yellow/10 text-poly-yellow">
              <Sparkles className="h-4 w-4" />
              <span>PolyScore: 62</span>
            </div>

            <div className="polyscore-badge border-neutral-grey bg-neutral-grey/10 text-neutral-grey">
              <Sparkles className="h-4 w-4" />
              <span>PolyScore: 51</span>
            </div>

            <div className="polyscore-badge border-loss-red bg-loss-red/10 text-loss-red">
              <Sparkles className="h-4 w-4" />
              <span>PolyScore: 32</span>
            </div>

            <div className="locked-badge">
              <Lock className="h-4 w-4" />
              <span>PolyScore</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </section>

        {/* === FORM CONTROLS === */}
        <section className="mb-16">
          <SectionTitle>Form Controls</SectionTitle>
          <div className="max-w-md space-y-6">
            <div>
              <label className="form-label">Trade Amount</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter amount..."
              />
              <p className="mt-1 text-caption text-muted-foreground">
                Minimum $10
              </p>
            </div>
            <div>
              <label className="form-label">Search Traders</label>
              <input
                type="text"
                className="form-input"
                placeholder="Search by name or wallet..."
              />
            </div>
            <div>
              <label className="form-label">Disabled Input</label>
              <input
                type="text"
                className="form-input"
                disabled
                value="Not available"
              />
            </div>
          </div>
        </section>

        {/* === NAVIGATION PREVIEW === */}
        <section className="mb-16">
          <SectionTitle>Navigation</SectionTitle>

          <h3 className="text-h4 mb-4">Desktop Top Nav</h3>
          <div className="mb-8 border border-foreground/10 bg-card">
            <div className="flex h-16 items-center justify-between px-8">
              <div className="flex items-baseline gap-0">
                <span className="font-sans text-xl font-bold text-poly-yellow">
                  POLY
                </span>
                <span className="font-sans text-xl font-bold text-poly-black">
                  COPY
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="nav-link active">Feed</span>
                <span className="nav-link">Discover</span>
                <span className="nav-link">Bots</span>
                <span className="nav-link">Portfolio</span>
              </div>
              <div className="flex h-8 w-8 items-center justify-center bg-poly-yellow font-sans text-xs font-bold text-poly-black">
                JD
              </div>
            </div>
          </div>

          <h3 className="text-h4 mb-4">Mobile Bottom Nav</h3>
          <div className="mx-auto max-w-sm border border-foreground/10 bg-card">
            <div className="flex h-16 items-center justify-around border-t border-foreground/10">
              <div className="flex flex-col items-center gap-1 text-poly-yellow">
                <Signal className="h-6 w-6" />
                <span className="text-micro">Feed</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Users className="h-6 w-6" />
                <span className="text-micro">Discover</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Bot className="h-6 w-6" />
                <span className="text-micro">Bots</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <User className="h-6 w-6" />
                <span className="text-micro">Profile</span>
              </div>
            </div>
          </div>
        </section>

        {/* === SPACING & RADIUS === */}
        <section className="mb-16">
          <SectionTitle>Spacing Scale</SectionTitle>
          <div className="flex flex-wrap items-end gap-4">
            {[
              { label: "4px", size: "w-1 h-4" },
              { label: "8px", size: "w-2 h-8" },
              { label: "12px", size: "w-3 h-12" },
              { label: "16px", size: "w-4 h-16" },
              { label: "24px", size: "w-6 h-24" },
              { label: "32px", size: "w-8 h-32" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2">
                <div className={`${item.size} bg-poly-yellow`} />
                <span className="text-caption">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-foreground/10 pt-8 pb-16">
          <p className="text-caption text-muted-foreground">
            Polycopy 2.0 Design System &middot; The Industrial Block &middot;
            Built for precision copy trading
          </p>
        </footer>
      </main>
    </div>
  )
}
