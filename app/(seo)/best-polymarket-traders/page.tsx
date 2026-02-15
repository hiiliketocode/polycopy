'use client';

import Link from 'next/link';
import { ArrowRight, TrendingUp, Target, Brain, Eye, CheckCircle2, AlertCircle, Zap, Trophy } from 'lucide-react';
import { TopTraders } from '@/components/landing/top-traders';

export default function BestPolymarketTradersPage() {
  return (
    <div className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="border-b border-border bg-poly-paper">
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black mb-6">
              <Trophy className="w-4 h-4" />
              Live Leaderboard
            </div>
            <h1 className="font-sans font-black uppercase tracking-tight text-poly-black text-4xl md:text-5xl mb-6">
              Best Polymarket Traders
            </h1>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl mb-8 max-w-3xl mx-auto">
              Real-time rankings of the most profitable prediction market traders. See their strategies, track their performance, and learn from the best.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="https://polycopy.app"
                className="inline-flex items-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Start Following Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/copy-trading"
                className="inline-flex items-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                How Copy Trading Works
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live Leaderboard */}
      <section className="py-12 md:py-16 bg-poly-cream">
        <div className="max-w-7xl mx-auto px-4">
          <TopTraders />

          <div className="mt-8 text-center">
            <Link
              href="/top-traders"
              className="inline-flex items-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              View Full Leaderboard
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      {/* What Makes a Great Trader */}
      <section className="py-12 md:py-16 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            What Makes a Great Polymarket Trader?
          </h2>
          <div className="space-y-6">
            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">High ROI Over Volume</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    The best traders don't just trade a lot - they trade well. A 50% ROI on $100K volume beats 10% ROI on $1M volume. Look for traders who are selective and profitable, not just active.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Consistent Performance</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Anyone can get lucky on one big trade. Great traders are consistently profitable across multiple markets and time periods. Check their trend line - is it steadily up, or wildly volatile?
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Category Specialization</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    The best traders often specialize. Some dominate sports markets because they have deep knowledge of the leagues. Others excel in crypto or politics. Generalists exist, but specialists often have an edge.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 border-l-4 border-l-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow flex-shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Fast Reaction to News</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Great traders react quickly when new information emerges. They're often the first to adjust positions after breaking news, earning profits before the broader market catches up.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to Evaluate Traders */}
      <section className="py-12 md:py-16 bg-poly-cream">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            How to Evaluate Traders
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-profit-green">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg">Look For</h3>
              </div>
              <ul className="space-y-3 font-body text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>ROI above 20% over sustained periods</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Upward trending P&L chart (not just one spike)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Trade volume that shows they're active</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Specialization in 1-2 categories you understand</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-profit-green mt-1">•</span>
                  <span>Multiple profitable months (not just this week)</span>
                </li>
              </ul>
            </div>

            <div className="border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-loss-red">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg">Red Flags</h3>
              </div>
              <ul className="space-y-3 font-body text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Massive ROI on tiny volume ($100 traded, 500% ROI)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Wildly volatile P&L (huge wins, huge losses)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Only trades obscure, low-liquidity markets</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Recent performance tanking after initial spike</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-loss-red mt-1">•</span>
                  <span>Trading every single market with no focus</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Categories of Top Traders */}
      <section className="py-12 md:py-16 bg-poly-paper border-b border-border">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Top Traders by Category
          </h2>
          <p className="font-body text-sm leading-relaxed text-muted-foreground text-lg text-center mb-12 max-w-2xl mx-auto">
            Different markets reward different skills. Explore top performers in each category.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/sports-prediction-markets" className="border border-border bg-card p-6 transition-colors hover:bg-poly-paper">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Sports Traders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Traders who dominate NFL, NBA, soccer, and other sports markets with deep league knowledge.
              </p>
            </Link>

            <Link href="/politics-prediction-markets" className="border border-border bg-card p-6 transition-colors hover:bg-poly-paper">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Politics Traders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Election specialists who analyze polls, track candidates, and profit from political events.
              </p>
            </Link>

            <Link href="/crypto-prediction-markets" className="border border-border bg-card p-6 transition-colors hover:bg-poly-paper">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Crypto Traders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Traders focused on Bitcoin, Ethereum, altcoins, and crypto market predictions.
              </p>
            </Link>

            <Link href="/business-prediction-markets" className="border border-border bg-card p-6 transition-colors hover:bg-poly-paper">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Business Traders</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Finance and business specialists trading earnings, IPOs, M&A, and corporate events.
              </p>
            </Link>
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/polymarket-market-categories"
              className="inline-flex items-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
            >
              View All Categories
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Follow Top Traders */}
      <section className="py-12 md:py-16 bg-poly-cream">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-12 text-center">
            Why Follow the Best Traders?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mx-auto mb-4">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Learn Their Strategies</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                See what markets they trade, when they enter, when they exit, and how they manage risk.
              </p>
            </div>

            <div className="text-center">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mx-auto mb-4">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Copy Profitable Trades</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                When you see a trade that makes sense, you can copy it. Learn by doing.
              </p>
            </div>

            <div className="text-center">
              <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow mx-auto mb-4">
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">Improve Your Judgment</h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                Over time, you'll internalize what good trades look like and develop your own edge.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pro Tips */}
      <section className="py-16 md:py-20 bg-poly-paper border-y border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="border border-border bg-card p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="flex h-14 w-14 items-center justify-center border border-border bg-poly-yellow text-poly-black">
                  <Zap className="w-7 h-7" />
                </div>
              </div>
              <div className="flex-1 w-full">
                <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-2xl md:text-3xl mb-4 text-center md:text-left">Pro Tip: Don't Blindly Copy</h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground text-base md:text-lg mb-4">
                  Following top traders doesn't mean copying every trade automatically. The best approach:
                </p>
                <ol className="space-y-2 md:space-y-3 font-body text-sm text-muted-foreground ml-6 list-decimal mb-6 text-sm md:text-lg">
                  <li>See a trade from a trader you follow</li>
                  <li>Ask yourself: Do I understand this market?</li>
                  <li>Do I agree with their thesis?</li>
                  <li>If yes to both, consider copying. If not, skip it.</li>
                </ol>
                <p className="font-body text-sm leading-relaxed text-muted-foreground text-base md:text-lg mb-6">
                  You're not outsourcing your judgment - you're using their trades as high-quality signals to inform your own decisions.
                </p>
                <div className="border-l-4 border-l-poly-yellow bg-poly-paper p-4 md:p-6">
                  <p className="font-body text-sm text-muted-foreground mb-4 font-medium">
                    Want to learn the right way to copy trades? We've got a complete guide.
                  </p>
                  <Link
                    href="/copy-trading"
                    className="inline-flex items-center bg-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-poly-yellow hover:text-poly-black"
                  >
                    Learn How Copy Trading Works
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-20 bg-poly-black">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-white text-3xl md:text-4xl mb-6">
            Start Following Top Traders Today
          </h2>
          <p className="font-body text-sm leading-relaxed text-white/80 text-xl mb-8">
            See their trades in real-time, learn their strategies, and build your own edge.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="https://polycopy.app"
              className="inline-flex items-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              View Pricing
            </Link>
          </div>
          <p className="font-body text-sm text-white/60 mt-6">
            Free to browse and follow traders. No credit card required.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-poly-paper py-8 border-t border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="font-body text-sm text-muted-foreground leading-relaxed">
              <strong className="text-poly-black">Not Financial Advice:</strong> Past performance does not guarantee future results. Trading involves risk and you can lose money. Following successful traders does not ensure profitability. Always do your own research and only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
