'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TopTraders } from '@/components/landing/top-traders';
import {
  ArrowRight,
  TrendingUp,
  Trophy,
  Target,
  BarChart3,
  Users,
  CheckCircle2,
  ChevronDown,
  Sparkles
} from 'lucide-react';

export default function TopTradersPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "How do you rank the best Polymarket traders?",
      answer: "We rank traders by multiple metrics: ROI (return on investment), total P&L (profit and loss), win rate, trading volume, and category-specific performance. You can filter and sort by any of these metrics to find traders that match your strategy and interests."
    },
    {
      question: "What makes a top Polymarket trader?",
      answer: "Top traders consistently demonstrate: positive ROI over time, strong win rates (typically 60%+), significant trading volume showing experience, category expertise in specific markets (sports, politics, crypto, etc.), and sustainable performance across multiple market types."
    },
    {
      question: "Can I follow top Polymarket traders for free?",
      answer: "Yes! Polycopy's free tier lets you follow unlimited traders, see their trades in a real-time feed, and manually copy any trades you want. You get full access to trader stats, performance history, and market activity without any payment required."
    },
    {
      question: "How do I choose which traders to follow?",
      answer: "Start by filtering traders by category (sports, politics, crypto) that match your interests. Look for consistent ROI over time, not just high one-time gains. Check their trading history and volume to ensure experience. Follow 3-5 traders initially and observe their decision patterns before expanding."
    },
    {
      question: "Do top traders always win?",
      answer: "No. Even the best traders have losing trades and bad weeks. That's why Polycopy gives you a curated feed where you pick and choose - not blind automation. Top traders have edge over time, but individual trades can still lose. You maintain judgment on every trade you copy."
    },
    {
      question: "How often is the leaderboard updated?",
      answer: "Trader stats and rankings update in real-time as trades are executed on Polymarket. You'll see new trades in your feed within seconds, and performance metrics (ROI, P&L, win rate) reflect the latest data from the blockchain."
    }
  ];

  return (
    <main className="min-h-screen bg-poly-cream">
      {/* Hero Section */}
      <section className="relative border-b border-border bg-poly-cream pt-20 pb-16 md:pt-32 md:pb-24">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black mb-6">
              <Trophy className="w-4 h-4" />
              500,000+ traders ranked
            </div>

            {/* Headline */}
            <h1 className="font-sans font-black uppercase tracking-tight text-poly-black text-4xl sm:text-5xl md:text-6xl leading-tight mb-6">
              Best Polymarket Traders,{' '}
              <span className="text-poly-yellow">Ranked & Ready</span>
            </h1>

            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl mb-8">
              See who's winning in prediction markets. Filter by ROI, category, or win rate.<br className="hidden sm:inline" />
              Follow the best, see their trades, pick what to copy.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link
                href="/discover"
                className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Browse All Traders
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center justify-center border border-poly-black px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:border-poly-yellow hover:bg-poly-yellow"
              >
                Start Following Free
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-8 font-body text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-profit-green" />
                <span>Real-time updates</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-profit-green" />
                <span>Follow unlimited</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-profit-green" />
                <span>100% transparent</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top Performers Section */}
      <TopTraders traderLinkBase="/v2" />

      {/* Why Rankings Matter */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Why Follow Top Traders?
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl">
              Learn from proven performers, not random noise
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Target,
                title: "Pattern Recognition",
                description: "See what successful traders consistently bet on (and skip). Learn their strategies by observing their decision patterns over time."
              },
              {
                icon: BarChart3,
                title: "Market Discovery",
                description: "Top traders often spot opportunities early. Following them surfaces markets and angles you wouldn't have found on your own."
              },
              {
                icon: TrendingUp,
                title: "Better Edge",
                description: "Combine your judgment with insights from proven performers. You still decide what to copy - but with better information."
              }
            ].map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <div key={index} className="border border-border bg-card p-6">
                  <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-2">{benefit.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How to Use Rankings */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              How to Find Your Traders
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl">
              Smart filtering beats random following
            </p>
          </div>

          <div className="space-y-6">
            <div className="border border-border bg-card p-6 md:p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Filter by Category</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Start with markets you understand. If you follow NBA closely, look for traders with high sports ROI. If you're into politics, filter for that. Category expertise matters more than overall rank.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Check Consistency</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Don't just look at total P&L. Check their trading history. Do they have consistent wins over months? Or one lucky streak? Look for steady performance, not lottery tickets.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Start Small</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Follow 3-5 traders initially. Watch their trades for a week or two. See if their decision-making makes sense to you. Then expand. Quality over quantity.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border bg-card p-6 md:p-8 transition-all hover:border-poly-yellow">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-poly-yellow font-sans text-sm font-bold text-poly-black">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-xl mb-2">Pick & Choose</h3>
                  <p className="font-body text-sm leading-relaxed text-muted-foreground">
                    Even the best traders make moves you won't understand or be comfortable with. That's fine. Copy what aligns with your thesis and skip the rest. Curation over automation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Explanation */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Understanding Trader Metrics
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl">
              What each stat means and why it matters
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-profit-green">
                  <TrendingUp className="w-4 h-4" />
                </div>
                ROI (Return on Investment)
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-2">
                Percentage return relative to capital deployed. A trader with +50% ROI turned $1,000 into $1,500.
              </p>
              <p className="font-body text-xs italic text-muted-foreground">
                Best for: Finding efficient traders who maximize returns per dollar risked.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <BarChart3 className="w-4 h-4" />
                </div>
                P&L (Profit & Loss)
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-2">
                Total dollar amount won or lost. High P&L shows scale and experience, but compare to volume.
              </p>
              <p className="font-body text-xs italic text-muted-foreground">
                Best for: Finding established traders with significant market activity.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <Target className="w-4 h-4" />
                </div>
                Win Rate
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-2">
                Percentage of trades that ended profitably. 65% win rate means they win 65 out of 100 trades.
              </p>
              <p className="font-body text-xs italic text-muted-foreground">
                Best for: Finding consistent performers, though high win rate doesn't always mean high profits.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center border border-border text-poly-yellow">
                  <BarChart3 className="w-4 h-4" />
                </div>
                Volume
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground mb-2">
                Total dollar amount traded. Shows experience level and how active they are in markets.
              </p>
              <p className="font-body text-xs italic text-muted-foreground">
                Best for: Verifying traders have meaningful experience, not just lucky one-off bets.
              </p>
            </div>
          </div>

          <div className="mt-8 border-l-4 border-poly-yellow bg-poly-paper p-6">
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              <strong className="text-poly-black">Pro tip:</strong> Don't optimize for a single metric. The best traders balance ROI, consistency, and volume. A 200% ROI on $50 traded is less meaningful than 30% ROI on $50,000 traded.
            </p>
            <p className="font-body text-sm text-muted-foreground mt-3">
              Once you find great traders: <Link href="/copy-trading" className="text-poly-yellow hover:underline font-medium">Learn how copy trading works</Link>
            </p>
          </div>
        </div>
      </section>

      {/* Common Mistakes */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl mb-4">
              Avoid These Mistakes
            </h2>
            <p className="font-body text-sm leading-relaxed text-muted-foreground text-xl">
              What not to do when following top traders
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <span className="text-loss-red">❌</span>
                Following only #1 ranked
              </h3>
              <p className="font-body text-sm text-muted-foreground">
                Rankings change. Today's #1 might be riding a lucky streak. Follow multiple traders across categories for diversification.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <span className="text-loss-red">❌</span>
                Copying every trade
              </h3>
              <p className="font-body text-sm text-muted-foreground">
                Even great traders make moves you won't understand. Use your judgment. Copy what makes sense, skip what doesn't.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <span className="text-loss-red">❌</span>
                Ignoring category fit
              </h3>
              <p className="font-body text-sm text-muted-foreground">
                A crypto expert won't necessarily excel at sports markets. Match traders to categories where you have knowledge.
              </p>
            </div>

            <div className="border border-border bg-card p-6">
              <h3 className="font-sans font-black uppercase tracking-tight text-poly-black text-lg mb-3 flex items-center gap-2">
                <span className="text-loss-red">❌</span>
                Expecting guarantees
              </h3>
              <p className="font-body text-sm text-muted-foreground">
                Past performance doesn't guarantee future results. Top traders have edge, not certainty. Manage your risk accordingly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Copy Trading Section */}
      <section className="py-16 md:py-24 bg-poly-paper border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-poly-black p-8 md:p-12 text-white">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-poly-yellow px-4 py-2 font-sans text-xs font-bold uppercase tracking-widest text-poly-black mb-6">
                <Sparkles className="w-4 h-4" />
                Next step
              </div>
              <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-4xl mb-4">
                Found Great Traders? Now What?
              </h2>
              <p className="font-body text-sm leading-relaxed text-white/80 text-xl">
                Polycopy turns your followed traders into a curated feed of opportunities. See their trades in real-time, pick what to copy, execute with one click.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="border border-white/20 p-6">
                <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-lg mb-2">Follow Your Picks</h3>
                <p className="font-body text-sm text-white/80">
                  Use the rankings to find traders that match your strategy, then follow them on Polycopy.
                </p>
              </div>

              <div className="border border-white/20 p-6">
                <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-lg mb-2">Get Your Feed</h3>
                <p className="font-body text-sm text-white/80">
                  See all their trades in one clean, chronological feed as they happen in real-time.
                </p>
              </div>

              <div className="border border-white/20 p-6">
                <div className="flex h-10 w-10 items-center justify-center border border-border mb-4 text-poly-yellow">
                  <Target className="w-5 h-5" />
                </div>
                <h3 className="font-sans font-black uppercase tracking-tight text-lg mb-2">Pick & Copy</h3>
                <p className="font-body text-sm text-white/80">
                  Review each trade, decide what aligns with your thesis, copy manually or with one click.
                </p>
              </div>
            </div>

            <div className="border border-white/20 p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="text-3xl">💡</div>
                <div className="flex-1">
                  <h4 className="font-sans font-black uppercase tracking-tight text-white mb-2">Curation over automation</h4>
                  <p className="font-body text-sm leading-relaxed text-white/80">
                    Unlike other copy trading tools that blindly copy everything, Polycopy gives you a curated feed where <strong className="text-white">you maintain control</strong>. See what top traders are doing, learn their patterns, copy what makes sense. It's the difference between "copy everything trader X does" and "show me opportunities so I can make better decisions."
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/copy-trading"
                className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
              >
                Learn About Copy Trading on Polycopy
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-poly-cream border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="font-sans font-black uppercase tracking-tight text-poly-black text-3xl md:text-4xl">
              Common Questions
            </h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="border border-border bg-card overflow-hidden cursor-pointer transition-all hover:border-poly-yellow"
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
                    <p className="mt-4 font-body text-sm leading-relaxed text-muted-foreground">
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
      <section className="py-16 md:py-24 bg-poly-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-sans font-black uppercase tracking-tight text-3xl md:text-5xl mb-6">
            Start Following Top Traders Today
          </h2>
          <p className="font-body text-sm leading-relaxed text-white/80 text-xl mb-8">
            Browse 500K+ traders, filter by performance, follow the best, see their trades in real-time.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/discover"
              className="inline-flex items-center justify-center bg-poly-yellow px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-poly-black transition-all hover:bg-poly-black hover:text-poly-yellow"
            >
              Browse All Traders
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center justify-center border border-white px-8 py-3.5 font-sans text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-poly-yellow hover:bg-poly-yellow hover:text-poly-black"
            >
              Sign Up Free
            </Link>
          </div>
          <p className="mt-6 font-body text-sm text-white/80">
            No credit card required • Follow unlimited traders • 100% transparent stats
          </p>
        </div>
      </section>
    </main>
  );
}
