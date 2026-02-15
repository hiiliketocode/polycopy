'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  X,
  TrendingUp,
  Users,
  Shield,
  ChevronDown,
  AlertCircle
} from 'lucide-react';

export default function ComparisonPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "Which prediction market has the most liquidity?",
      answer: "Polymarket has the highest liquidity of any prediction market, with billions in monthly volume. This means tighter spreads, better prices, and easier entry/exit on trades. Kalshi is second for US users, while PredictIt has much lower liquidity."
    },
    {
      question: "Can I copy trade on platforms other than Polymarket?",
      answer: "Currently, Polycopy only supports Polymarket. Other platforms don't have robust APIs or trader tracking infrastructure needed for copy trading. Polymarket's blockchain-based transparency makes it ideal for following and copying traders."
    },
    {
      question: "Is Polymarket legal in the US?",
      answer: "Polymarket is available globally but excludes US users from direct platform access. US users can legally access prediction markets through Kalshi (CFTC-regulated) or PredictIt (no-action letter from CFTC). Always check local regulations."
    },
    {
      question: "Which platform has the lowest fees?",
      answer: "Polymarket charges no platform fees - you only pay Polygon network gas fees (pennies). Kalshi charges 7% on winnings. PredictIt charges 10% on profits plus 5% withdrawal fees. Manifold uses play money (no real money trading)."
    }
  ];

  return (
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black mb-6">
              <TrendingUp className="w-4 h-4" />
              Platform comparison
            </div>

            <h1 className="font-sans font-black uppercase tracking-tight text-poly-black text-4xl sm:text-5xl md:text-6xl leading-tight mb-6">
              Polymarket vs{' '}
              <span className="text-poly-yellow">Other Platforms</span>
            </h1>

            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl mb-8">
              Honest comparison of Polymarket, Kalshi, PredictIt, and other prediction markets.<br className="hidden sm:inline" />
              Liquidity, fees, markets, and why Polymarket is best for copy trading.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Comparison Table */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Platform Comparison at a Glance
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border border-border bg-card">
              <thead>
                <tr className="bg-poly-paper font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="text-left py-4 px-4 border-b border-border">Feature</th>
                  <th className="text-center py-4 px-4 border-b border-border bg-poly-yellow/10 text-poly-black">Polymarket</th>
                  <th className="text-center py-4 px-4 border-b border-border">Kalshi</th>
                  <th className="text-center py-4 px-4 border-b border-border">PredictIt</th>
                  <th className="text-center py-4 px-4 border-b border-border">Manifold</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Monthly Volume</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">$100M+</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">$10-20M</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">~$5M</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">Play money</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Platform Fees</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">0%</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">7% on wins</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">10% + 5% w/d</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">0% (fake $)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">US Access</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-loss-red font-bold">No</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">Yes (CFTC)</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">Yes (limited)</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">Yes</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Copy Trading</td>
                  <td className="py-4 px-4 text-center">
                    <Check className="w-5 h-5 text-poly-yellow mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <X className="w-5 h-5 text-muted-foreground mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <X className="w-5 h-5 text-muted-foreground mx-auto" />
                  </td>
                  <td className="py-4 px-4 text-center">
                    <X className="w-5 h-5 text-muted-foreground mx-auto" />
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Active Markets</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">1000+</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">100+</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">~50</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">10,000+</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Min. Trade</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">$1</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">$1</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">$1</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">$0 (fake)</td>
                </tr>
                <tr>
                  <td className="py-4 px-4 font-body text-sm text-poly-black">Transparency</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-profit-green font-bold">Blockchain</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">Centralized</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">Centralized</td>
                  <td className="py-4 px-4 text-center font-body text-sm text-poly-black">Centralized</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-center font-body text-sm text-muted-foreground mt-6">
            Data as of January 2026. Volumes and market counts fluctuate.
          </p>
        </div>
      </section>

      {/* Detailed Comparisons */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Platform Deep Dives
            </h2>
          </div>

          <div className="space-y-8">
            {/* Polymarket */}
            <div className="border border-border bg-card p-8 border-l-4 border-l-poly-yellow">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                  #1
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl mb-2">Polymarket</h3>
                  <p className="font-body text-sm text-muted-foreground">The global leader in prediction markets</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-profit-green mb-3 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Strengths
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• Highest liquidity by far ($100M+ monthly volume)</li>
                    <li>• Zero platform fees (only gas, pennies per trade)</li>
                    <li>• 1000+ active markets across all categories</li>
                    <li>• Blockchain transparency (all trades public)</li>
                    <li>• <strong className="text-poly-black">Only platform with copy trading (Polycopy)</strong></li>
                    <li>• Largest trader community to follow and learn from</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red mb-3 flex items-center gap-2">
                    <X className="w-5 h-5" />
                    Weaknesses
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• Not available to US users (geo-blocked)</li>
                    <li>• Requires crypto wallet (small learning curve)</li>
                    <li>• Less regulatory clarity in some jurisdictions</li>
                  </ul>
                  <div className="mt-4 border border-border bg-poly-paper p-4">
                    <p className="font-body text-xs text-poly-black font-bold">
                      Best For: International traders, crypto-comfortable users, anyone wanting to copy trade
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Kalshi */}
            <div className="border border-border bg-card p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center border border-border bg-poly-paper font-sans text-sm font-bold text-poly-black">
                  #2
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl mb-2">Kalshi</h3>
                  <p className="font-body text-sm text-muted-foreground">US-regulated, CFTC-approved platform</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-profit-green mb-3 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Strengths
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• Legal for US users (CFTC regulated)</li>
                    <li>• No crypto needed (USD deposits via ACH/wire)</li>
                    <li>• Growing market selection (~100+ markets)</li>
                    <li>• Decent liquidity ($10-20M monthly volume)</li>
                    <li>• Easy onboarding (traditional banking)</li>
                    <li>• Mobile app available (iOS & Android)</li>
                    <li>• Tax reporting built-in (1099 forms)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red mb-3 flex items-center gap-2">
                    <X className="w-5 h-5" />
                    Weaknesses
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• 7% fee on all winnings (significantly higher than Polymarket)</li>
                    <li>• Lower liquidity than Polymarket (10-20x less)</li>
                    <li>• Fewer markets available (100 vs 1000+)</li>
                    <li>• No copy trading infrastructure or public trader data</li>
                    <li>• US-only (geo-blocked internationally)</li>
                    <li>• More conservative market approval (slower new markets)</li>
                    <li>• Limited to CFTC-approved event types</li>
                  </ul>
                  <div className="mt-4 border border-border bg-poly-paper p-4">
                    <p className="font-body text-xs text-poly-black font-bold">
                      <strong>Best For:</strong> US traders who want full regulatory compliance and traditional banking integration. Ideal if you're uncomfortable with crypto or want built-in tax reporting. Choose Kalshi if: (1) You're based in the US, (2) You prefer USD over stablecoins, (3) You want CFTC oversight, (4) You don't need copy trading features. However, expect to pay significantly more in fees (7% vs 0-2%) and accept lower liquidity and fewer markets compared to Polymarket.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PredictIt */}
            <div className="border border-border bg-card p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center border border-border bg-poly-paper font-sans text-sm font-bold text-poly-black">
                  #3
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl mb-2">PredictIt</h3>
                  <p className="font-body text-sm text-muted-foreground">Academic research platform with real money</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-profit-green mb-3 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Strengths
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• Available to US users</li>
                    <li>• Long operating history (since 2014)</li>
                    <li>• No crypto required</li>
                    <li>• Unique political markets</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red mb-3 flex items-center gap-2">
                    <X className="w-5 h-5" />
                    Weaknesses
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• <strong className="text-poly-black">10% fee on profits + 5% withdrawal fee</strong></li>
                    <li>• $850 max position per market (severely limited)</li>
                    <li>• Low liquidity (~$5M monthly)</li>
                    <li>• Very few active markets (~50)</li>
                    <li>• Clunky UX, outdated platform</li>
                    <li>• No copy trading</li>
                  </ul>
                  <div className="mt-4 border border-border bg-poly-paper p-4">
                    <p className="font-body text-xs text-poly-black font-bold">
                      Best For: US political junkies with small bankrolls. Hard to recommend for serious trading.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Manifold */}
            <div className="border border-border bg-card p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="flex h-12 w-12 items-center justify-center border border-border bg-poly-paper font-sans text-sm font-bold text-poly-black">
                  #4
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl mb-2">Manifold Markets</h3>
                  <p className="font-body text-sm text-muted-foreground">Play money prediction market</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-profit-green mb-3 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    Strengths
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• Completely free (play money)</li>
                    <li>• 10,000+ markets (anyone can create)</li>
                    <li>• Great for learning prediction markets</li>
                    <li>• No regulatory concerns</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-sans text-[10px] font-bold uppercase tracking-widest text-loss-red mb-3 flex items-center gap-2">
                    <X className="w-5 h-5" />
                    Weaknesses
                  </h4>
                  <ul className="space-y-2 font-body text-sm text-muted-foreground">
                    <li>• <strong className="text-poly-black">No real money - play money only</strong></li>
                    <li>• Less serious participants (gamified)</li>
                    <li>• Many low-quality markets</li>
                    <li>• Can't withdraw or profit financially</li>
                  </ul>
                  <div className="mt-4 border border-border bg-poly-paper p-4">
                    <p className="font-body text-xs text-poly-black font-bold">
                      Best For: Learning how prediction markets work before risking real money. Not for actual trading.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Polymarket for Copy Trading (Currently) */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Why Copy Trading Works Best on Polymarket (For Now)
            </h2>
            <p className="font-body text-sm text-muted-foreground text-xl">
              Current state of copy trading infrastructure across platforms
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Massive Liquidity</h3>
              <p className="font-body text-sm text-muted-foreground">
                With $100M+ monthly volume, there are actually successful traders worth copying. Lower volume platforms don't have enough proven traders yet.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Blockchain Transparency</h3>
              <p className="font-body text-sm text-muted-foreground">
                All Polymarket trades are on-chain. This makes trader tracking possible. Other platforms currently hide trader data, making copy trading impossible.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">500K+ Traders</h3>
              <p className="font-body text-sm text-muted-foreground">
                The largest prediction market community means more strategies to learn from, more traders to follow, better diversification options.
              </p>
            </div>
          </div>

          <div className="mt-8 border-l-4 border-l-poly-yellow border border-border bg-poly-paper p-6">
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              <strong className="text-poly-black">Current state:</strong> Polycopy currently only supports Polymarket due to its unique combination of liquidity, transparency, and trader diversity. We're monitoring other platforms as they grow. If Kalshi, PredictIt, or others develop the infrastructure needed for copy trading, we'll evaluate adding support.
            </p>
            <p className="font-body text-sm text-muted-foreground mt-3">
              Learn more: <Link href="/copy-trading" className="text-poly-yellow hover:underline font-bold">How copy trading works on Polycopy</Link> | <Link href="/pricing" className="text-poly-yellow hover:underline font-bold">Pricing & features</Link>
            </p>
          </div>

          <div className="mt-6 border border-border bg-poly-paper p-6">
            <h4 className="font-sans font-black uppercase tracking-tight text-poly-black mb-2">What Would Other Platforms Need?</h4>
            <ul className="space-y-2 font-body text-sm text-muted-foreground">
              <li>• <strong className="text-poly-black">Public trader data:</strong> Ability to track individual trader performance</li>
              <li>• <strong className="text-poly-black">API access:</strong> Programmatic trading and data retrieval</li>
              <li>• <strong className="text-poly-black">Sufficient liquidity:</strong> Enough volume to support copy trading without slippage</li>
              <li>• <strong className="text-poly-black">Diverse trader base:</strong> Multiple successful traders across categories</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Platform Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-border bg-card cursor-pointer hover:border-poly-yellow/30 transition-colors"
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg pr-4">{faq.question}</h3>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground flex-shrink-0 transition-transform ${
                        openFaqIndex === index ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  {openFaqIndex === index && (
                    <p className="mt-4 font-body text-sm text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 md:py-24 bg-poly-black">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-white text-3xl md:text-5xl mb-6">
            Ready to Start on Polymarket?
          </h2>
          <p className="font-body text-sm text-white/80 text-xl mb-8">
            Polycopy currently supports Polymarket. We're monitoring other platforms as they evolve.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Start Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/top-traders"
              className="inline-flex items-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              See Top Traders
            </Link>
          </div>
          <p className="font-body text-sm text-white/60 mt-6">
            Currently supports Polymarket • Highest liquidity • Blockchain transparent
          </p>
        </div>
      </section>
    </main>
  );
}
