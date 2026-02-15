'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Bitcoin, AlertCircle, TrendingUp, Target, Brain, CheckCircle2, X } from 'lucide-react';
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

export default function CryptoPredictionMarketsPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/polymarket/leaderboard?limit=10&orderBy=PNL&category=CRYPTO&timePeriod=month')
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
              <Bitcoin className="h-4 w-4" />
              CRYPTO_MARKETS
            </div>
            <h1 className="mb-6 font-sans text-4xl font-black uppercase tracking-tight text-poly-black md:text-5xl">
              Crypto Prediction Markets
            </h1>
            <p className="mx-auto mb-8 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              Trade Bitcoin, Ethereum, altcoins, DeFi, and crypto events on Polymarket. Follow top crypto traders and copy their strategies in real-time.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center justify-center gap-2 bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                FOLLOW CRYPTO TRADERS <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/v2/discover?category=CRYPTO"
                className="inline-flex items-center justify-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                BROWSE CRYPTO MARKETS
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Top Crypto Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-widest text-poly-yellow">POLYMARKET_LEADERBOARD</p>
            <h2 className="mb-4 font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
              Top Crypto Traders (Last 30 Days)
            </h2>
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin border-4 border-solid border-poly-yellow border-r-transparent"></div>
              <p className="mt-4 font-body text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : traders.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {traders.map((trader, index) => (
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
                        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RANK #{index + 1}</p>
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
              <p className="font-body text-sm text-muted-foreground">No crypto traders found.</p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/v2/discover?category=CRYPTO"
              className="inline-flex items-center gap-2 border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              VIEW ALL CRYPTO TRADERS <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Trade Crypto Prediction Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Why Trade Crypto Prediction Markets?
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Bitcoin className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Price Predictions</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Will Bitcoin hit $100K by year-end? Will ETH reach $5K? Trade your crypto price predictions and profit when you're right. Markets exist for major price milestones across BTC, ETH, and top altcoins.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <TrendingUp className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Crypto Events</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                ETF approvals, regulatory decisions, protocol upgrades, exchange listings, token launches, DeFi exploits, halving events - trade any major crypto catalyst before it happens.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Target className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Follow Crypto Experts</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                See what experienced crypto traders are betting on and copy their strategies. Learn from traders who have been profitable across multiple crypto cycles.
              </p>
            </div>
            <div className="border border-border bg-card p-6 transition-all hover:border-poly-yellow">
              <div className="mb-4 flex h-10 w-10 items-center justify-center border border-border">
                <Brain className="h-5 w-5 text-poly-yellow" />
              </div>
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Hedge Crypto Holdings</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Hold BTC or ETH? Hedge downside risk by trading bearish prediction markets. If prices drop, your prediction market gains offset portfolio losses.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Crypto Markets on Polymarket */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Popular Crypto Markets on Polymarket
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Bitcoin Price Milestones</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                "Will Bitcoin reach $100K by end of 2026?" "BTC above $80K by Q2?" These markets trade on whether Bitcoin hits specific price targets by certain dates.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Everyone has an opinion on Bitcoin. High liquidity, clear resolution criteria.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Ethereum & Layer 2s</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                ETH price predictions, L2 adoption metrics, merge/upgrade outcomes, staking milestones. Markets cover the entire Ethereum ecosystem.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Ethereum has multiple narratives (DeFi, L2s, staking) creating diverse trading opportunities.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Altcoin Events</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Solana outages, Cardano upgrades, meme coin milestones, token unlocks, major airdrops. If it's a significant altcoin event, there's probably a market.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Altcoins are volatile and news-driven, creating frequent mispricings for informed traders.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Regulatory & ETF Outcomes</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                SEC approvals, spot ETF launches, Gensler decisions, congressional crypto legislation. Regulatory outcomes significantly impact prices.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> Regulatory clarity often precedes major price movements. Informed traders profit from correctly predicting regulatory outcomes.
              </p>
            </div>

            <div className="border border-border bg-poly-paper p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Exchange & Protocol Events</h3>
              <p className="mb-3 font-body text-sm leading-relaxed text-muted-foreground">
                Major exchange listings (Coinbase, Binance), DeFi protocol exploits, stablecoin depegs, DAO governance outcomes.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Why it's popular:</span> These events move markets quickly. Traders who spot them early can profit significantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Crypto Trading Strategies */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Crypto Trading Strategies
          </h2>
          <div className="space-y-6">
            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">News-Based Trading</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Crypto markets react to news with a lag. Set up alerts for crypto news (SEC announcements, protocol exploits, major partnerships). When breaking news hits, check if related prediction markets have updated. If not, trade before the broader market catches up.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> SEC announces ETF approval. You see it on Twitter 30 seconds before the market moves. Buy "Yes" on related markets before the spike.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">On-Chain Data Edge</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Track on-chain metrics: whale movements, exchange flows, staking ratios. If on-chain data suggests BTC will hit $100K but the market is pricing it at 40%, that's a trading opportunity.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Best for:</span> Traders who understand blockchain analytics and can interpret on-chain signals.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Regulatory Arbitrage</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                Markets often misprice regulatory outcomes because most traders don't read congressional bills or SEC filings. If you do, you have an edge. Track regulatory timelines and bet accordingly.
              </p>
              <p className="font-body text-xs text-muted-foreground">
                <span className="font-sans font-bold uppercase tracking-wider text-poly-black">Example:</span> You read the draft bill and realize ETF approval is more likely than the market thinks. Buy "Yes" before the final vote.
              </p>
            </div>

            <div className="border-l-4 border-poly-yellow bg-card p-6">
              <h3 className="mb-3 font-sans text-base font-bold uppercase tracking-wide text-poly-black">Copy Experienced Crypto Traders</h3>
              <p className="mb-4 font-body text-sm leading-relaxed text-muted-foreground">
                The easiest strategy: follow profitable crypto traders on Polycopy. See their trades in real-time and copy the ones you understand and agree with. You learn while you trade.
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

      {/* Tips for Crypto Market Traders */}
      <section className="border-b border-border bg-poly-cream">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Tips for Crypto Market Traders
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Follow Crypto Twitter & Discord</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Crypto news breaks on Twitter and Discord first. Set up alerts for key accounts (SEC, Vitalik, major exchanges) to catch news before the market reacts.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Understand Market Psychology</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Crypto markets are emotional. When BTC pumps, prediction markets overvalue bullish outcomes. When it dumps, bearish markets get overpriced. Fade the extremes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-profit-green bg-profit-green/5 p-5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-profit-green" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Track Historical Patterns</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  How did similar events resolve in the past? If "BTC to $100K by EOY" markets historically underestimate or overestimate, factor that into your trades.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 border-l-4 border-loss-red bg-loss-red/5 p-5">
              <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-1 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Don't Trade Based on Your Bags</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  You hold SOL, so you buy "Yes" on "Solana to $500" even at 90¢? Bad idea. Trade what you think will happen, not what benefits your portfolio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Common Mistakes in Crypto Markets */}
      <section className="border-b border-border bg-poly-paper">
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-20">
          <h2 className="mb-12 text-center font-sans text-3xl font-black uppercase tracking-tight text-poly-black md:text-4xl">
            Common Mistakes in Crypto Markets
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Overestimating Altcoin Odds</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  "My favorite L2 will flip Ethereum" is hopium, not analysis. Most altcoins fail. Don't let tribalism cloud your judgment.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Ignoring Macro Conditions</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Crypto doesn't exist in a vacuum. Fed policy, inflation, stock market correlations - macro matters. A "BTC to $150K" bet might be mispriced if you're ignoring the macro backdrop.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 border-l-4 border-loss-red bg-card p-6">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-loss-red" />
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-poly-black">Trading Low-Liquidity Altcoin Markets</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Obscure altcoin markets with $500 volume are hard to exit. Stick to BTC, ETH, and major altcoins where liquidity ensures you can get in and out at reasonable prices.
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
            READY TO TRADE CRYPTO MARKETS?
          </h2>
          <p className="mx-auto mb-4 max-w-xl font-body text-base leading-relaxed text-white/60">
            Follow expert crypto traders, see their strategies live, and start copying profitable plays.
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
            Free to browse crypto traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-border bg-poly-paper py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              <span className="font-sans font-bold uppercase tracking-wider">Not Financial Advice:</span> Crypto prediction market trading involves significant risk. Cryptocurrency is volatile and past performance does not guarantee future results. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
