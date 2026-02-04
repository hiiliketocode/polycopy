'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/polycopy/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ArrowRight, 
  CheckCircle2,
  Users,
  Eye,
  Target,
  Zap,
  BookOpen,
  AlertCircle,
  TrendingUp,
  Shield,
  Clock,
  ChevronDown,
  Sparkles
} from 'lucide-react';

export default function HowToCopyTradePage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const faqs = [
    {
      question: "Is copy trading on Polymarket legal?",
      answer: "Yes, copy trading on Polymarket is legal. You're making your own trading decisions based on information from other traders. Polycopy shows you what others are doing, but you decide what to copy. You maintain full control of your funds at all times."
    },
    {
      question: "Do I need a connected wallet to copy trade?",
      answer: "No. On the free tier, you can see all trades and copy them manually on Polymarket. For one-click execution with auto-close (Premium), you'll need to connect your wallet. Start free to learn the system before connecting anything."
    },
    {
      question: "How much money do I need to start?",
      answer: "You can start with any amount on Polymarket (even $10-20 to test). Most traders recommend starting small to learn the system. Once comfortable, many users trade with $100-500. The platform works the same regardless of your bankroll size."
    },
    {
      question: "Can I lose more than I invest?",
      answer: "No. On Polymarket, you can only lose what you put into each trade. There's no margin or leverage, so your maximum loss per trade is the amount you invested. You can't go into debt or lose more than your position size."
    },
    {
      question: "How do I know which traders to follow?",
      answer: "Start by filtering traders by category (sports, politics, crypto) that match your interests. Look for consistent positive ROI over time, not just one big win. Check their trading history and volume. Follow 3-5 traders initially and observe their patterns before expanding."
    },
    {
      question: "Should I copy every trade from my followed traders?",
      answer: "No. Even the best traders make moves you won't understand or be comfortable with. Polycopy shows you a curated feed where you pick and choose. Copy trades that align with your thesis and risk tolerance. Curation over automation."
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
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-polycopy-yellow/10 border border-polycopy-yellow/20 mb-6">
                <BookOpen className="w-4 h-4 text-polycopy-yellow" />
                <span className="text-sm font-medium text-slate-900">
                  Complete guide
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
                How to Copy Trade on{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-polycopy-yellow">Polymarket</span>
                  <svg className="absolute -bottom-2 left-0 w-full h-3 text-polycopy-yellow/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                    <path d="M0,8 Q50,0 100,8 T200,8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-8 leading-relaxed">
                Complete beginner-friendly guide to copy trading on Polymarket.<br className="hidden sm:inline" />
                From finding traders to executing your first trade in 6 simple steps.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/login?mode=signup">
                  <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg shadow-polycopy-yellow/20">
                    Start Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/discover">
                  <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12">
                    Browse Traders
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Overview */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Copy Trading in 30 Seconds
              </h2>
              <p className="text-xl text-slate-600">
                Here's what you need to know before diving in
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">What It Is</h3>
                <p className="text-slate-600 text-sm">
                  Follow successful traders, see their moves in a feed, decide what to copy. You stay in control.
                </p>
              </Card>

              <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Time to Start</h3>
                <p className="text-slate-600 text-sm">
                  5-10 minutes to set up. Find traders, follow them, start seeing trades immediately.
                </p>
              </Card>

              <Card className="p-6 text-center hover:shadow-lg transition-shadow">
                <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-7 h-7 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Risk Level</h3>
                <p className="text-slate-600 text-sm">
                  Only risk what you invest per trade. No leverage, no margin, no hidden costs.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Step-by-Step Guide */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                6 Steps to Your First Copy Trade
              </h2>
              <p className="text-xl text-slate-600">
                Follow this exact process for best results
              </p>
            </div>

            <div className="space-y-8">
              {/* Step 1 */}
              <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Sign Up for Polycopy (Free)</h3>
                    <p className="text-slate-600 mb-4 leading-relaxed">
                      Go to <Link href="/login?mode=signup" className="text-polycopy-yellow hover:underline font-medium">polycopy.app/signup</Link> and create an account. No credit card required. Takes 30 seconds.
                    </p>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Use your real email so you can get notifications when traders you follow make moves. You can adjust notification settings later.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 2 */}
              <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-3">Find Top Traders</h3>
                <p className="text-slate-600 mb-4 leading-relaxed">
                  Click "Discover" in the navigation. You'll see 500K+ traders ranked by performance. Use filters to narrow down:
                </p>
                <p className="text-sm text-slate-600 mb-4">
                  Not sure how to evaluate traders? Read our <Link href="/top-traders" className="text-polycopy-yellow hover:underline font-medium">complete guide to finding top Polymarket traders</Link>.
                </p>
                    <ul className="space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700"><strong>Category:</strong> Sports, Politics, Crypto (pick what you understand)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700"><strong>ROI:</strong> Look for 20%+ consistently, not one-time lucky streaks</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700"><strong>Volume:</strong> Higher volume = more experience (look for $10K+ traded)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700"><strong>Win Rate:</strong> 60%+ is solid, but check this with ROI</span>
                      </li>
                    </ul>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Don't just follow #1 ranked. Rankings change. Follow 3-5 traders across different categories for diversification.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 3 */}
              <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Follow Traders You Trust</h3>
                    <p className="text-slate-600 mb-4 leading-relaxed">
                      Click into a trader's profile. Review their history, categories, and recent trades. If they look good, click the "Follow" button. That's it.
                    </p>
                    <div className="bg-slate-100 p-4 rounded-lg mb-4">
                      <p className="text-sm text-slate-700 mb-2"><strong>What to check on profiles:</strong></p>
                      <ul className="space-y-1 text-sm text-slate-700">
                        <li>• Consistent wins over 3+ months (not just recent)</li>
                        <li>• Trading in categories you understand</li>
                        <li>• Reasonable position sizes (not all-in every trade)</li>
                        <li>• Recent activity (actively trading, not dormant)</li>
                      </ul>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Start with 3 traders. Watch them for a week. If their decision-making makes sense to you, add more. Quality over quantity.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 4 */}
              <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    4
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Watch Your Feed</h3>
                    <p className="text-slate-600 mb-4 leading-relaxed">
                      Click "Feed" in the navigation. You'll see trades from your followed traders in real-time, chronologically, like a Twitter feed. Each trade shows:
                    </p>
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-100 p-4 rounded-lg">
                        <p className="text-sm font-semibold text-slate-900 mb-2">Trade Details</p>
                        <ul className="space-y-1 text-sm text-slate-700">
                          <li>• Market question</li>
                          <li>• Buy Yes or Buy No</li>
                          <li>• Price they paid</li>
                          <li>• Amount invested</li>
                        </ul>
                      </div>
                      <div className="bg-slate-100 p-4 rounded-lg">
                        <p className="text-sm font-semibold text-slate-900 mb-2">Trader Context</p>
                        <ul className="space-y-1 text-sm text-slate-700">
                          <li>• Who made the trade</li>
                          <li>• Their ROI/win rate</li>
                          <li>• When they traded</li>
                          <li>• Their category expertise</li>
                        </ul>
                      </div>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Don't feel pressure to copy everything. Observe for a few days first. Learn what patterns emerge. Copy when you have conviction.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 5 */}
              <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    5
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Pick Trades to Copy</h3>
                    <p className="text-slate-600 mb-4 leading-relaxed">
                      When you see a trade that makes sense, ask yourself:
                    </p>
                    <div className="space-y-3 mb-4">
                      <div className="flex items-start gap-3 bg-green-50 p-3 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Do I understand this market?</p>
                          <p className="text-xs text-slate-600">If it's NBA and you follow basketball, great. If it's a crypto event you've never heard of, skip.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-green-50 p-3 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Does the reasoning make sense?</p>
                          <p className="text-xs text-slate-600">Can you articulate why this trade might work? If not, wait for one you can explain.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-green-50 p-3 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Am I comfortable with this risk?</p>
                          <p className="text-xs text-slate-600">Size your position appropriately. Never bet more than you can afford to lose on one trade.</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Start by copying 20-30% of what you see. As you learn patterns and build confidence, increase. It's okay to be selective.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Step 6 */}
                <Card className="p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 bg-polycopy-yellow rounded-full flex items-center justify-center font-bold text-2xl text-slate-900 flex-shrink-0">
                    6
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Execute the Trade</h3>
                    <p className="text-slate-600 mb-4 leading-relaxed">
                      Two ways to execute:
                    </p>
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-slate-100 p-4 rounded-lg border-2 border-slate-200">
                        <p className="text-sm font-semibold text-slate-900 mb-2">Free Tier: Manual</p>
                        <ol className="space-y-2 text-sm text-slate-700">
                          <li>1. Click the trade in your feed</li>
                          <li>2. Opens Polymarket to that exact market</li>
                          <li>3. Enter your position size</li>
                          <li>4. Confirm the trade</li>
                        </ol>
                        <p className="text-xs text-slate-600 mt-3 italic">Takes 30-60 seconds per trade</p>
                      </div>
                      <div className="bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-lg border-2 border-polycopy-yellow">
                        <p className="text-sm font-semibold text-slate-900 mb-2">Premium: One-Click</p>
                        <ol className="space-y-2 text-sm text-slate-700">
                          <li>1. Click "Copy Trade" in the feed</li>
                          <li>2. Confirm your position size</li>
                          <li>3. Done - trade executes instantly</li>
                          <li>4. Auto-closes when trader exits</li>
                        </ol>
                        <p className="text-xs text-slate-600 mt-3 italic">Takes 5 seconds per trade</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded mb-4">
                      <p className="text-sm text-slate-700">
                        <strong className="text-slate-900">Pro tip:</strong> Start on free tier to learn the system. Upgrade to Premium when you're copying 5+ trades per week and want to save time.
                      </p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <p className="text-sm text-green-900">
                        <strong>Need help setting up?</strong> Check our <Link href="/trading-setup" className="text-polycopy-yellow hover:underline font-semibold">complete trading setup guide</Link> for wallet connection, funding, and Premium features.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Common Mistakes */}
        <section className="py-16 md:py-24 bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Avoid These Beginner Mistakes
              </h2>
              <p className="text-xl text-slate-600">
                Learn from others' errors before making your own
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Copying everything blindly",
                  description: "Even top traders make moves you won't understand. Use your judgment. Copy what makes sense, skip what doesn't.",
                  icon: AlertCircle
                },
                {
                  title: "Following only rank #1",
                  description: "Today's #1 might be riding luck. Diversify across 3-5 traders in different categories for stability.",
                  icon: Users
                },
                {
                  title: "Ignoring position sizing",
                  description: "Never put more than 2-5% of your bankroll on a single trade. Size down when learning, size up when confident.",
                  icon: Target
                },
                {
                  title: "Trading categories you don't understand",
                  description: "If a trader is great at crypto but you know nothing about it, skip those trades. Stick to markets you can evaluate.",
                  icon: Eye
                },
                {
                  title: "Expecting instant results",
                  description: "Copy trading is about learning patterns over time. Give it 2-3 weeks before judging if it works for you.",
                  icon: Clock
                },
                {
                  title: "Not tracking your own performance",
                  description: "Use the portfolio tracker to see what's working. Double down on successful patterns, cut losing strategies.",
                  icon: TrendingUp
                }
              ].map((mistake, index) => {
                const Icon = mistake.icon;
                return (
                  <Card key={index} className="p-6 bg-red-50/50 border-red-200 hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">{mistake.title}</h3>
                        <p className="text-slate-700 text-sm">{mistake.description}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Tips for Success */}
        <section className="py-16 md:py-24 bg-slate-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Tips for Long-Term Success
              </h2>
              <p className="text-xl text-slate-600">
                How to improve over time
              </p>
            </div>

            <div className="space-y-6">
              <Card className="p-6 md:p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  Start Small, Scale Up
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Begin with $10-20 per trade while learning. Once you've made 10+ trades and understand what works, increase your position sizes gradually. Many successful copy traders started with less than $100 total bankroll.
                </p>
              </Card>

              <Card className="p-6 md:p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  Learn the "Why" Behind Each Trade
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Don't just copy mechanically. For each trade, try to understand why the trader took that position. Over time, you'll recognize patterns and develop your own market sense. The goal is to eventually think like a top trader, not just follow them.
                </p>
              </Card>

              <Card className="p-6 md:p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Target className="w-5 h-5 text-purple-600" />
                  </div>
                  Track What Works (and What Doesn't)
                </h3>
              <p className="text-slate-600 leading-relaxed">
                Use Polycopy's portfolio tracker to monitor performance by trader and by category. If a trader consistently loses in sports but wins in politics, only copy their politics trades. Data beats gut feelings.
              </p>
              <p className="text-sm text-slate-600 mt-3">
                Learn more: <Link href="/polymarket-trading-strategies" className="text-polycopy-yellow hover:underline font-medium">Polymarket trading strategies guide</Link>
              </p>
              </Card>

              <Card className="p-6 md:p-8">
                <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-orange-600" />
                  </div>
                  Regularly Refresh Your Follows
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  Check your followed traders' performance monthly. Unfollow those who are no longer performing. Add new top traders. The leaderboard changes - your follows should too. It's not personal, it's business.
                </p>
              </Card>
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

        {/* Disclaimer */}
        <section className="py-12 bg-slate-50 border-t border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white border-l-4 border-slate-400 p-6 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Not Financial Advice</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    This guide is for educational purposes only and does not constitute financial advice. Trading prediction markets involves risk, and you can lose money. Past performance does not guarantee future results. Always do your own research and only trade with capital you can afford to lose. All trading decisions are your own responsibility.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Ready to Start Copy Trading?
            </h2>
            <p className="text-xl text-slate-300 mb-8">
              Sign up free, find traders, and make your first copy trade in 10 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login?mode=signup">
                <Button size="lg" className="bg-polycopy-yellow text-slate-900 hover:bg-polycopy-yellow-hover font-semibold text-base px-8 h-12 shadow-lg">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/top-traders">
                <Button size="lg" variant="outline" className="font-semibold text-base px-8 h-12 bg-transparent border-white text-white hover:bg-white/10">
                  See Top Traders
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-400">
              No credit card required • 500K+ traders to follow • Start in minutes
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
