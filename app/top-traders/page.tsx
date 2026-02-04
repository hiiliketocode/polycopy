'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TopTraders } from '@/components/landing/top-traders';
import { 
  ArrowRight, 
  TrendingUp, 
  Trophy,
  Target,
  BarChart3,
  Users,
  CheckCircle2,
  Filter,
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
    <>
      <Navigation />
      
      <main className="min-h-screen bg-slate-50">
        {/* Hero Section */}
        <section className="relative bg-gradient-to-b from-white to-slate-50 pt-20 pb-16 md:pt-32 md:pb-24">
          <div className="absolute inset-0 bg-gradient-to-br from-polycopy-yellow/5 via-transparent to-transparent" />
          
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <Trophy className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  500,000+ traders ranked
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                Best Polymarket Traders,{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Ranked & Ready</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                See who's winning in prediction markets. Filter by ROI, category, or win rate.<br className="hidden sm:inline" />
                Follow the best, see their trades, pick what to copy.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
                <Link href="/discover">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg shadow-polycopy-yellow/20">
                    Browse All Traders
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/login?mode=signup">
                  <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                    Start Following Free
                  </Button>
                </Link>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center justify-center gap-8 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Real-time updates</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>Follow unlimited</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span>100% transparent</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Top Performers Section */}
        <TopTraders />

        {/* Why Rankings Matter */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Why Follow Top Traders?
              </h2>
              <p className="text-xl text-slate-600">
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
                  <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="w-14 h-14 bg-polycopy-yellow/10 rounded-full flex items-center justify-center mb-4">
                      <Icon className="w-7 h-7 text-polycopy-yellow" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{benefit.title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{benefit.description}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How to Use Rankings */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                How to Find Your Traders
              </h2>
              <p className="text-xl text-slate-600">
                Smart filtering beats random following
              </p>
            </div>

            <div className="space-y-6">
              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-slate-900 flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Filter by Category</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Start with markets you understand. If you follow NBA closely, look for traders with high sports ROI. If you're into politics, filter for that. Category expertise matters more than overall rank.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-slate-900 flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Check Consistency</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Don't just look at total P&L. Check their trading history. Do they have consistent wins over months? Or one lucky streak? Look for steady performance, not lottery tickets.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-slate-900 flex-shrink-0">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Start Small</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Follow 3-5 traders initially. Watch their trades for a week or two. See if their decision-making makes sense to you. Then expand. Quality over quantity.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:p-8 hover:border-polycopy-yellow/30 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-slate-900 flex-shrink-0">
                    4
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">Pick & Choose</h3>
                    <p className="text-slate-600 leading-relaxed">
                      Even the best traders make moves you won't understand or be comfortable with. That's fine. Copy what aligns with your thesis and skip the rest. Curation over automation.
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Metrics Explanation */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Understanding Trader Metrics
              </h2>
              <p className="text-xl text-slate-600">
                What each stat means and why it matters
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  ROI (Return on Investment)
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-2">
                  Percentage return relative to capital deployed. A trader with +50% ROI turned $1,000 into $1,500.
                </p>
                <p className="text-slate-500 text-xs italic">
                  Best for: Finding efficient traders who maximize returns per dollar risked.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                  </div>
                  P&L (Profit & Loss)
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-2">
                  Total dollar amount won or lost. High P&L shows scale and experience, but compare to volume.
                </p>
                <p className="text-slate-500 text-xs italic">
                  Best for: Finding established traders with significant market activity.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Target className="w-4 h-4 text-purple-600" />
                  </div>
                  Win Rate
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-2">
                  Percentage of trades that ended profitably. 65% win rate means they win 65 out of 100 trades.
                </p>
                <p className="text-slate-500 text-xs italic">
                  Best for: Finding consistent performers, though high win rate doesn't always mean high profits.
                </p>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-orange-600" />
                  </div>
                  Volume
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-2">
                  Total dollar amount traded. Shows experience level and how active they are in markets.
                </p>
                <p className="text-slate-500 text-xs italic">
                  Best for: Verifying traders have meaningful experience, not just lucky one-off bets.
                </p>
              </Card>
            </div>

            <div className="mt-8 bg-slate-100 border-l-4 border-polycopy-yellow p-6 rounded-lg">
              <p className="text-slate-700 leading-relaxed">
                <strong className="text-slate-900">Pro tip:</strong> Don't optimize for a single metric. The best traders balance ROI, consistency, and volume. A 200% ROI on $50 traded is less meaningful than 30% ROI on $50,000 traded.
              </p>
            </div>
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Avoid These Mistakes
              </h2>
              <p className="text-xl text-slate-600">
                What not to do when following top traders
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="p-6 bg-red-50/50 border-red-200">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-red-600">❌</span>
                  Following only #1 ranked
                </h3>
                <p className="text-slate-700 text-sm">
                  Rankings change. Today's #1 might be riding a lucky streak. Follow multiple traders across categories for diversification.
                </p>
              </Card>

              <Card className="p-6 bg-red-50/50 border-red-200">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-red-600">❌</span>
                  Copying every trade
                </h3>
                <p className="text-slate-700 text-sm">
                  Even great traders make moves you won't understand. Use your judgment. Copy what makes sense, skip what doesn't.
                </p>
              </Card>

              <Card className="p-6 bg-red-50/50 border-red-200">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-red-600">❌</span>
                  Ignoring category fit
                </h3>
                <p className="text-slate-700 text-sm">
                  A crypto expert won't necessarily excel at sports markets. Match traders to categories where you have knowledge.
                </p>
              </Card>

              <Card className="p-6 bg-red-50/50 border-red-200">
                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-red-600">❌</span>
                  Expecting guarantees
                </h3>
                <p className="text-slate-700 text-sm">
                  Past performance doesn't guarantee future results. Top traders have edge, not certainty. Manage your risk accordingly.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Copy Trading Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 md:p-12 text-white">
              <div className="max-w-3xl mx-auto text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/20 border border-polycopy-yellow/30 mb-6">
                  <Sparkles className="w-4 h-4 text-polycopy-yellow" />
                  <span className="text-sm font-medium text-polycopy-yellow">
                    Next step
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  Found Great Traders? Now What?
                </h2>
                <p className="text-xl text-slate-300 leading-relaxed">
                  Polycopy turns your followed traders into a curated feed of opportunities. See their trades in real-time, pick what to copy, execute with one click.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                  <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-polycopy-yellow" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Follow Your Picks</h3>
                  <p className="text-slate-300 text-sm">
                    Use the rankings to find traders that match your strategy, then follow them on Polycopy.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                  <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                    <BarChart3 className="w-6 h-6 text-polycopy-yellow" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Get Your Feed</h3>
                  <p className="text-slate-300 text-sm">
                    See all their trades in one clean, chronological feed as they happen in real-time.
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/20">
                  <div className="w-12 h-12 bg-polycopy-yellow/20 rounded-lg flex items-center justify-center mb-4">
                    <Target className="w-6 h-6 text-polycopy-yellow" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">Pick & Copy</h3>
                  <p className="text-slate-300 text-sm">
                    Review each trade, decide what aligns with your thesis, copy manually or with one click.
                  </p>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="text-3xl">💡</div>
                  <div className="flex-1">
                    <h4 className="font-bold text-white mb-2">Curation over automation</h4>
                    <p className="text-slate-300 text-sm leading-relaxed">
                      Unlike other copy trading tools that blindly copy everything, Polycopy gives you a curated feed where <strong className="text-white">you maintain control</strong>. See what top traders are doing, learn their patterns, copy what makes sense. It's the difference between "copy everything trader X does" and "show me opportunities so I can make better decisions."
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Link href="/copy-trading">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                    Learn About Copy Trading on Polycopy
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Common Questions
              </h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <Card 
                  key={index} 
                  className="overflow-hidden cursor-pointer hover:border-polycopy-yellow/30 transition-colors"
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-slate-900 pr-4">{faq.question}</h3>
                      <ChevronDown 
                        className={`w-5 h-5 text-slate-500 flex-shrink-0 transition-transform ${
                          openFaqIndex === index ? 'rotate-180' : ''
                        }`} 
                      />
                    </div>
                    {openFaqIndex === index && (
                      <p className="mt-4 text-slate-600 leading-relaxed">
                        {faq.answer}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Start Following Top Traders Today
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Browse 500K+ traders, filter by performance, follow the best, see their trades in real-time.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/discover">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Browse All Traders
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/login?mode=signup">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 bg-transparent border-white text-white hover:bg-white/10">
                  Sign Up Free
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              No credit card required • Follow unlimited traders • 100% transparent stats
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
