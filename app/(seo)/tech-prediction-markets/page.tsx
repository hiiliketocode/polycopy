'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Laptop, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
import { getTraderAvatarInitials } from '@/lib/trader-name';

interface Trader {
  wallet: string;
  displayName: string;
  pnl: number;
  volume: number;
  roi?: number;
  profileImage?: string | null;
}

function formatLargeNumber(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  else if (absNum >= 1000) return `$${(num / 1000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

function formatDisplayName(name: string | null | undefined): string {
  const candidate = (name ?? '').trim();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(candidate);
  if (!candidate || isAddress) return 'Trader';
  return candidate;
}

export default function TechPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=TECH&timePeriod=month')
      .then(res => res.json())
      .then(data => {
        const tradersWithROI = (data.traders || []).map((t: Trader) => ({
          ...t,
          roi: t.volume > 0 ? ((t.pnl / t.volume) * 100) : 0
        }));
        setTraders(tradersWithROI);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-poly-cream">
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Laptop className="h-4 w-4" />
              TECH_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Tech Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade AI breakthroughs, product launches, startup acquisitions, tech policy, and Silicon Valley events on Polymarket. Follow tech insiders who profit from industry moves.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW TECH TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover?category=TECH"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE TECH MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Tech Traders (Last 30 Days)
            </h2>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin border-4 border-solid border-poly-yellow border-r-transparent"></div>
              <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {traders.map((trader, i) => (
                <Link
                  key={trader.wallet}
                  href={`/v2/trader/${trader.wallet}`}
                  className="group border border-border bg-card p-6 transition-all hover:border-poly-yellow"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                        {getTraderAvatarInitials({ displayName: trader.displayName, wallet: trader.wallet })}
                      </div>
                      <div>
                        <p className="font-sans text-sm font-bold uppercase tracking-wide text-poly-black">
                          {formatDisplayName(trader.displayName)}
                        </p>
                        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RANK #{i + 1}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI</p>
                      <p className={`font-body text-lg font-semibold tabular-nums ${trader.roi && trader.roi > 0 ? 'text-profit-green' : 'text-poly-black'}`}>
                        {trader.roi && trader.roi > 0 ? '+' : ''}{trader.roi?.toFixed(1) || 0}%
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">P&L</p>
                      <p className={`font-body text-lg font-semibold tabular-nums ${trader.pnl > 0 ? 'text-profit-green' : 'text-poly-black'}`}>
                        {formatLargeNumber(trader.pnl)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VOLUME</p>
                      <p className="font-body text-lg font-semibold tabular-nums text-poly-black">
                        {formatLargeNumber(trader.volume)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center font-body text-sm text-muted-foreground">No tech traders found.</p>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover?category=TECH"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL TECH TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Tech Prediction Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Laptop className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Fast-Moving Industry</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                AI launches, startup pivots, policy shifts - tech moves fast. If you follow the industry, you can spot trends before the market catches up.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Public Announcements</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Product launches, earnings, keynotes - tech companies announce everything publicly. Follow the right sources and you&apos;ll see moves coming.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Follow Industry Insiders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Some traders work in tech or have deep expertise. Follow them to see how they&apos;re positioning and copy trades you understand.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Brain className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">High-Impact Events</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                GPT-5 release, Apple product announcements, antitrust rulings - tech markets resolve around events that dominate headlines.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Tech Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">AI Model Releases</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will OpenAI release GPT-5 by Q4? Will Google&apos;s next model beat GPT-4? AI launches are heavily traded, with clear resolution dates.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> AI development timelines leak via researchers, papers, and corporate earnings calls.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Big Tech Earnings & Guidance</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Apple beat revenue estimates? Will Meta raise guidance? Earnings markets track Wall Street expectations.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Analyst consensus provides a baseline. Options markets and sell-side research offer clues.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Product Launches (Apple, Tesla, etc.)</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Apple announce a new product at WWDC? Will Tesla launch FSD nationwide? Product rumors circulate for months before announcements.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Leaks from supply chains, patent filings, and insider reports provide early signals.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Antitrust & Regulation</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Google be broken up? Will TikTok be banned? Regulatory outcomes have major implications for Big Tech valuations.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Court filings and congressional hearings provide updates on regulatory timelines.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Startup Acquisitions</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Microsoft acquire this AI startup? Will the deal close? M&A markets in tech move on insider reports and deal announcements.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it&apos;s popular:</span> Tech M&A often leaks before official press releases, creating trading opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tech Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Developer Community Signals</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Track GitHub commits, API docs, beta releases. If OpenAI&apos;s API docs update with GPT-5 references, a launch is coming. Developer signals often leak before official announcements.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> GPT-5 API documentation appears. The &quot;GPT-5 by Q4&quot; market is at 40%. Buy before the market adjusts.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Supply Chain Tracking</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Monitor manufacturing reports, component orders, shipping data. If Apple&apos;s suppliers report increased orders, a product launch is likely. Supply chains move before announcements.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> Traders who follow tech supply chain news from Taiwan, China, and major component suppliers.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Conference & Earnings Call Analysis</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Listen to CEO tone on earnings calls. Are they confident about product timelines? Do they hedge on launch dates? Subtle language shifts predict delays or accelerations.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> Tim Cook says &quot;we&apos;re excited about what&apos;s coming.&quot; Product launch odds should increase.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Copy Tech Insiders</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Some Polycopy traders work in tech or have specialized knowledge of AI, semiconductors, or enterprise software. Follow them to see their bets.
              </p>
              <Link
                href="/copy-trading"
                className="inline-flex items-center gap-2 border border-poly-yellow px-4 py-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow transition-all hover:bg-poly-yellow hover:text-poly-black"
              >
                LEARN ABOUT COPY TRADING <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Tech Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Follow Tech Twitter & Substacks</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Tech news breaks first on Twitter. Follow insiders, journalists, and researchers who tweet leaks before press releases.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Track Patent Filings</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Apple, Google, and other Big Tech file patents months before product launches. Patent filings often reveal what&apos;s coming.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Monitor Developer Betas</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Beta releases hint at launch timelines. If iOS 18 beta 5 drops in August, the public release is coming in September.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-loss-red bg-loss-red/5 p-5">
              <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Don&apos;t Trust Every Rumor</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  &quot;I saw a leak on Reddit...&quot; is not research. Verify tech rumors with established journalists and sources before trading.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Tech Markets
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Overvaluing Hype Cycles</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  &quot;Everyone&apos;s talking about this AI launch, so it must happen!&quot; Hype doesn&apos;t equal certainty. Trade timelines and fundamentals, not excitement.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Ignoring Regulatory Risk</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  &quot;This product will definitely launch.&quot; Not if regulators block it. Factor in antitrust, privacy rules, and policy risk.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Assuming &quot;Elon Time&quot; Is Real Time</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Some CEOs are notoriously optimistic with timelines. If Elon says &quot;by year-end,&quot; factor in historical delays before betting yes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-poly-black">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            READY TO TRADE TECH MARKETS?
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow tech experts, see their strategies live, and start copying profitable plays.
          </p>
          <p className="mb-8 font-body text-sm text-white/40">
            Interested in other markets?{' '}
            <Link href="/polymarket-market-categories" className="font-semibold text-poly-yellow transition-colors hover:text-white">
              Explore all categories
            </Link>.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="https://polycopy.app"
              className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-white"
            >
              GET STARTED FREE <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/polymarket-trading-strategies"
              className="inline-flex items-center justify-center gap-2 border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              VIEW ALL STRATEGIES
            </Link>
          </div>
          <p className="mt-6 font-body text-xs text-white/30">
            Free to browse tech traders. No credit card required.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Tech prediction market trading involves risk. Past technology outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
