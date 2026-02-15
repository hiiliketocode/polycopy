'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function BusinessPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=FINANCE&timePeriod=month')
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
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="mb-6 inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black">
              <Building2 className="h-4 w-4" />
              BUSINESS_FINANCE_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Business & Finance Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade IPOs, mergers, acquisitions, CEO changes, product launches, corporate events, and financial markets on Polymarket. Follow business and finance experts who profit from these outcomes.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW BUSINESS TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover?category=FINANCE"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE BUSINESS MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Top Business & Finance Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Business & Finance Traders (Last 30 Days)
            </h2>
            <p className="mx-auto max-w-2xl font-body text-sm leading-relaxed text-muted-foreground">
              These traders consistently profit from business and finance markets. See their strategies and follow them.
            </p>
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
                  className="group border border-border bg-card p-6 transition-all hover:border-poly-yellow hover:shadow-md"
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
            <div className="py-12 text-center">
              <p className="font-body text-sm text-muted-foreground">No business traders found.</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover?category=FINANCE"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL BUSINESS TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Trade Business & Finance Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Business & Finance Prediction Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Building2 className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Binary Corporate Events</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Will this merger get approved? Will the CEO step down? Will the IPO happen by Q4? Clean yes/no outcomes make business markets easier to trade.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Public Information</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                SEC filings, earnings reports, press releases - business data is transparent. If you can read financial news, you can find edges.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Follow Industry Insiders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Some traders have deep knowledge of specific industries (tech, pharma, finance). Follow them to see their plays and copy trades you understand.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Brain className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Predictable Timelines</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Earnings dates, merger deadlines, product launch windows - business events have known timelines, making it easier to plan your trades.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Business & Finance Markets */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Business & Finance Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">IPOs & Public Listings</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Company X go public by end of year? Will the IPO price above/below $50? Markets exist for major listings and SPAC deals.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> IPO timelines are trackable, and S-1 filings provide clear data points.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Mergers & Acquisitions</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the acquisition be approved by regulators? Will the deal close by the deadline? M&A events have clear resolutions.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Deal terms are public, regulatory approvals follow precedent, spreads are measurable.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">CEO Changes & Executive Moves</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the CEO step down? Will the founder return? Leadership changes create trading opportunities, especially at high-profile companies.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Insider reports often leak before official announcements, creating edges for informed traders.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Product Launches & Releases</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will Apple release a new product this year? Will Tesla hit production targets? Launch timelines and production metrics are trackable.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Supply chain reports, patent filings, and earnings calls provide early signals.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Bankruptcy & Restructuring</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Will the company file for Chapter 11? Will creditors approve the restructuring plan? Distressed situations create high-volatility markets.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Court filings are public, and restructuring timelines follow predictable legal processes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Business & Finance Trading Strategies */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Business & Finance Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Regulatory Precedent Analysis</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                FTC/SEC decisions follow patterns. Study how regulators have ruled on similar deals in the past. If the market hasn't priced in historical precedent, there's an edge.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> A proposed merger is similar to 5 past deals that all got approved. If the market is pricing it at 60% approval, buy.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Earnings Call Sentiment</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Listen to CEO tone on earnings calls. Are they confident about hitting guidance? Does leadership sound unstable? Markets might not have priced in subtle signals.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> Traders who can analyze earnings transcripts and act on qualitative signals before markets adjust.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Supply Chain Tracking</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Monitor production reports, shipping data, factory output. If early data suggests a product launch will be delayed, the market might not have caught up yet.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> A key supplier reports component shortages. The product launch market is still at 70% on-time. Short it.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Copy Industry Experts</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Some Polycopy traders specialize in specific industries (pharma, tech, energy). Follow them to see their trades and copy the ones you understand.
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

      {/* Tips for Business & Finance Market Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Business & Finance Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Follow Bloomberg & WSJ</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Business news breaks first on major financial outlets. Set up alerts for companies you're tracking to catch announcements early.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Read SEC Filings</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  S-1s, 8-Ks, 10-Qs - public filings contain material information. If you can read them before markets react, you have an edge.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Study Historical Deals</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  How have similar mergers been treated by regulators? How long did past IPOs take? Historical data predicts future outcomes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-poly-yellow bg-poly-yellow/5 p-5">
              <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-poly-yellow" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Don't Trade Based on Hype</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "This IPO will be huge!" is not a strategy. Trade fundamentals and timelines, not excitement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Common Mistakes in Business & Finance Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Business & Finance Markets
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Ignoring Regulatory Risk</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "The deal makes business sense, so it'll definitely close." Not if regulators block it. Always factor in antitrust and regulatory approval odds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Overweighting Rumors</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "I heard from a friend that..." is not due diligence. Verify business news with official sources before trading.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Assuming "Too Big to Fail"</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "This company is huge, so the deal will definitely happen." Size doesn't guarantee outcomes. Trade the probabilities, not assumptions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-poly-black">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-20">
          <h2 className="mb-6 font-sans text-3xl font-black uppercase tracking-tight text-white md:text-4xl">
            READY TO TRADE BUSINESS & FINANCE MARKETS?
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow industry experts, see their strategies live, and start copying profitable plays.
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
            Free to browse business traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Business and finance prediction market trading involves risk. Past outcomes do not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
